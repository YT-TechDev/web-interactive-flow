import assert from "node:assert/strict";
import test from "node:test";

function createRuntime({
  phases = ["A", "B", "C"],
  initial = "A",
} = {}) {
  let index = phases.indexOf(initial);
  if (index < 0) throw new Error("invalid initial phase");

  const calls = [];

  return {
    calls,
    get selected() {
      return phases[index];
    },
    next() {
      calls.push("next");
      if (index >= phases.length - 1) return "rejected";
      index += 1;
      return "accepted";
    },
    previous() {
      calls.push("previous");
      if (index <= 0) return "rejected";
      index -= 1;
      return "accepted";
    },
  };
}

function request(runtime, intent) {
  if (intent === "next") return runtime.next();
  if (intent === "previous") return runtime.previous();
  throw new Error("invalid intent");
}

function createFirstObserverGlobalArbiter() {
  const seen = new WeakSet();
  return {
    process({ event, runtime, resolve }) {
      if (seen.has(event)) return { status: "suppressed" };
      seen.add(event);

      const intent = resolve(event);
      if (intent == null) return { status: "declined" };

      const disposition = request(runtime, intent);
      return { status: disposition, intent };
    },
  };
}

function createFirstIntentGlobalArbiter() {
  const claimed = new WeakSet();
  return {
    process({ event, runtime, resolve }) {
      if (claimed.has(event)) return { status: "suppressed" };

      const intent = resolve(event);
      if (intent == null) return { status: "declined" };

      claimed.add(event);
      const disposition = request(runtime, intent);
      return { status: disposition, intent };
    },
  };
}

function createFirstAcceptedGlobalArbiter() {
  const accepted = new WeakSet();
  return {
    process({ event, runtime, resolve }) {
      if (accepted.has(event)) return { status: "suppressed" };

      const intent = resolve(event);
      if (intent == null) return { status: "declined" };

      const disposition = request(runtime, intent);
      if (disposition === "accepted") accepted.add(event);
      return { status: disposition, intent };
    },
  };
}

function createPerRuntimeAcceptedArbiter() {
  const acceptedByEvent = new WeakMap();

  return {
    process({ event, runtime, resolve }) {
      const acceptedRuntimes = acceptedByEvent.get(event);
      if (acceptedRuntimes?.has(runtime)) {
        return { status: "suppressed" };
      }

      const intent = resolve(event);
      if (intent == null) return { status: "declined" };

      const disposition = request(runtime, intent);

      if (disposition === "accepted") {
        const set = acceptedRuntimes ?? new Set();
        set.add(runtime);
        if (acceptedRuntimes === undefined) {
          acceptedByEvent.set(event, set);
        }
      }

      return { status: disposition, intent };
    },
  };
}

function runBinding(arbiter, { event, runtime, intent }) {
  return arbiter.process({
    event,
    runtime,
    resolve: () => intent,
  });
}

test("OA-H2: first-observer global claim suppresses ancestor fallback after inner decline", () => {
  const arbiter = createFirstObserverGlobalArbiter();
  const event = {};
  const runtime = createRuntime();

  const inner = runBinding(arbiter, {
    event,
    runtime,
    intent: null,
  });
  const outer = runBinding(arbiter, {
    event,
    runtime,
    intent: "next",
  });

  assert.equal(inner.status, "declined");
  assert.equal(outer.status, "suppressed");
  assert.equal(runtime.selected, "A");
  assert.deepEqual(runtime.calls, []);
});

test("OA-H3: first-produced-intent global claim suppresses later acceptance after rejection", () => {
  const arbiter = createFirstIntentGlobalArbiter();
  const event = {};
  const runtime = createRuntime({ initial: "A" });

  const inner = runBinding(arbiter, {
    event,
    runtime,
    intent: "previous",
  });
  const outer = runBinding(arbiter, {
    event,
    runtime,
    intent: "next",
  });

  assert.equal(inner.status, "rejected");
  assert.equal(outer.status, "suppressed");
  assert.equal(runtime.selected, "A");
  assert.deepEqual(runtime.calls, ["previous"]);
});

test("OA-H4: first-accepted global claim couples independent Runtimes", () => {
  const arbiter = createFirstAcceptedGlobalArbiter();
  const event = {};
  const first = createRuntime();
  const second = createRuntime();

  const firstResult = runBinding(arbiter, {
    event,
    runtime: first,
    intent: "next",
  });
  const secondResult = runBinding(arbiter, {
    event,
    runtime: second,
    intent: "next",
  });

  assert.equal(firstResult.status, "accepted");
  assert.equal(secondResult.status, "suppressed");
  assert.equal(first.selected, "B");
  assert.equal(second.selected, "A");
});

test("OA-H5: per-Runtime accepted claim suppresses duplicate accepted navigation", () => {
  const arbiter = createPerRuntimeAcceptedArbiter();
  const event = {};
  const runtime = createRuntime();

  const inner = runBinding(arbiter, {
    event,
    runtime,
    intent: "next",
  });
  const outer = runBinding(arbiter, {
    event,
    runtime,
    intent: "next",
  });

  assert.equal(inner.status, "accepted");
  assert.equal(outer.status, "suppressed");
  assert.equal(runtime.selected, "B");
  assert.deepEqual(runtime.calls, ["next"]);
});

test("OA-H5: per-Runtime accepted claim permits fallback after first semantic rejection", () => {
  const arbiter = createPerRuntimeAcceptedArbiter();
  const event = {};
  const runtime = createRuntime({ initial: "A" });

  const inner = runBinding(arbiter, {
    event,
    runtime,
    intent: "previous",
  });
  const outer = runBinding(arbiter, {
    event,
    runtime,
    intent: "next",
  });

  assert.equal(inner.status, "rejected");
  assert.equal(outer.status, "accepted");
  assert.equal(runtime.selected, "B");
  assert.deepEqual(runtime.calls, ["previous", "next"]);
});

test("OA-H5: per-Runtime accepted winner changes with same-target registration order", () => {
  function runOrder(intents) {
    const arbiter = createPerRuntimeAcceptedArbiter();
    const event = {};
    const runtime = createRuntime({ initial: "B" });
    const results = intents.map((intent) =>
      runBinding(arbiter, { event, runtime, intent }),
    );
    return {
      selected: runtime.selected,
      results: results.map((result) => result.status),
      calls: [...runtime.calls],
    };
  }

  assert.deepEqual(runOrder(["next", "previous"]), {
    selected: "C",
    results: ["accepted", "suppressed"],
    calls: ["next"],
  });

  assert.deepEqual(runOrder(["previous", "next"]), {
    selected: "A",
    results: ["accepted", "suppressed"],
    calls: ["previous"],
  });
});

test("OA-H5: persistent event identity incorrectly suppresses a later synthetic redispatch", () => {
  const arbiter = createPerRuntimeAcceptedArbiter();
  const reusableEvent = {};
  const runtime = createRuntime();

  const firstDispatch = runBinding(arbiter, {
    event: reusableEvent,
    runtime,
    intent: "next",
  });

  const secondDispatch = runBinding(arbiter, {
    event: reusableEvent,
    runtime,
    intent: "next",
  });

  assert.equal(firstDispatch.status, "accepted");
  assert.equal(secondDispatch.status, "suppressed");
  assert.equal(runtime.selected, "B");
  assert.deepEqual(runtime.calls, ["next"]);
});

test("OA-H6: nearest bound target cannot choose between two bindings on the same target", () => {
  const target = {};
  const path = [target, {}, {}];
  const bindings = [
    { id: "first", target },
    { id: "second", target },
  ];

  const nearestIndex = Math.min(
    ...bindings.map((binding) => path.indexOf(binding.target)),
  );
  const nearest = bindings.filter(
    (binding) => path.indexOf(binding.target) === nearestIndex,
  );

  assert.deepEqual(
    nearest.map((binding) => binding.id),
    ["first", "second"],
  );
});

test("OA-H6: nearest-target preselection can suppress useful ancestor fallback after decline", () => {
  const innerTarget = {};
  const outerTarget = {};
  const path = [innerTarget, outerTarget];
  const runtime = createRuntime();

  const bindings = [
    {
      id: "inner",
      target: innerTarget,
      resolve: () => null,
    },
    {
      id: "outer",
      target: outerTarget,
      resolve: () => "next",
    },
  ];

  const nearest = bindings
    .filter((binding) => path.includes(binding.target))
    .sort(
      (a, b) =>
        path.indexOf(a.target) - path.indexOf(b.target),
    )[0];

  const intent = nearest.resolve();
  assert.equal(nearest.id, "inner");
  assert.equal(intent, null);
  assert.equal(runtime.selected, "A");
  assert.deepEqual(runtime.calls, []);
});

test("OA-H10: explicit independent arbitration scopes do not couple each other", () => {
  const firstGroup = createPerRuntimeAcceptedArbiter();
  const secondGroup = createPerRuntimeAcceptedArbiter();
  const event = {};
  const first = createRuntime();
  const second = createRuntime();

  const firstResult = runBinding(firstGroup, {
    event,
    runtime: first,
    intent: "next",
  });
  const secondResult = runBinding(secondGroup, {
    event,
    runtime: second,
    intent: "next",
  });

  assert.equal(firstResult.status, "accepted");
  assert.equal(secondResult.status, "accepted");
  assert.equal(first.selected, "B");
  assert.equal(second.selected, "B");
});

test("OA-H2/OA-H3/OA-H4: implicit global claims differ only in which valid fallback they erase", () => {
  const event = {};

  {
    const runtime = createRuntime();
    const arbiter = createFirstObserverGlobalArbiter();
    runBinding(arbiter, { event, runtime, intent: null });
    const fallback = runBinding(arbiter, {
      event,
      runtime,
      intent: "next",
    });
    assert.equal(fallback.status, "suppressed");
  }

  {
    const runtime = createRuntime();
    const arbiter = createFirstIntentGlobalArbiter();
    runBinding(arbiter, {
      event,
      runtime,
      intent: "previous",
    });
    const fallback = runBinding(arbiter, {
      event,
      runtime,
      intent: "next",
    });
    assert.equal(fallback.status, "suppressed");
  }

  {
    const first = createRuntime();
    const second = createRuntime();
    const arbiter = createFirstAcceptedGlobalArbiter();
    runBinding(arbiter, {
      event,
      runtime: first,
      intent: "next",
    });
    const independent = runBinding(arbiter, {
      event,
      runtime: second,
      intent: "next",
    });
    assert.equal(independent.status, "suppressed");
  }
});
