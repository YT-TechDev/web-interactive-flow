import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFlowRuntime } from "../../bridge/runtime.mjs";
import { applyWheelNavigationIntent } from "../../bridge/wheel_ownership.mjs";

const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const ownershipSourceUrl = new URL(
  "../../bridge/wheel_ownership.mjs",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

function makeEvent({ cancelable = true, order = [] } = {}) {
  let preventCount = 0;

  return {
    event: {
      cancelable,
      preventDefault() {
        preventCount += 1;
        order.push("preventDefault");
      },
    },
    get preventCount() {
      return preventCount;
    },
  };
}

function makeRuntime({
  nextDisposition = "accepted",
  previousDisposition = "accepted",
  order = [],
} = {}) {
  const calls = {
    next: 0,
    previous: 0,
  };

  return {
    runtime: {
      next() {
        calls.next += 1;
        order.push("request:next");
        return nextDisposition;
      },
      previous() {
        calls.previous += 1;
        order.push("request:previous");
        return previousDisposition;
      },
    },
    calls,
  };
}

test("W01: accepted cancelable intent prevents only after semantic disposition", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const wheel = makeEvent({ cancelable: true, order });

  const disposition = applyWheelNavigationIntent({
    runtime,
    event: wheel.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 1);
  assert.deepEqual(order, ["request:next", "preventDefault"]);
});

test("W02: rejected intent preserves native default behavior", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({
    nextDisposition: "rejected",
    order,
  });
  const wheel = makeEvent({ cancelable: true, order });

  const disposition = applyWheelNavigationIntent({
    runtime,
    event: wheel.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "rejected");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("W03: non-cancelable event does not control semantic acceptance", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const wheel = makeEvent({ cancelable: false, order });

  const disposition = applyWheelNavigationIntent({
    runtime,
    event: wheel.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("W04: accepted intent remains unprevented when prevention is disabled", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const wheel = makeEvent({ cancelable: true, order });

  const disposition = applyWheelNavigationIntent({
    runtime,
    event: wheel.event,
    intent: "next",
    preventDefault: false,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("W05: one normalized intent issues exactly one corresponding semantic request", () => {
  const next = makeRuntime();
  const nextWheel = makeEvent();

  assert.equal(
    applyWheelNavigationIntent({
      runtime: next.runtime,
      event: nextWheel.event,
      intent: "next",
      preventDefault: false,
    }),
    "accepted",
  );
  assert.deepEqual(next.calls, { next: 1, previous: 0 });

  const previous = makeRuntime();
  const previousWheel = makeEvent();

  assert.equal(
    applyWheelNavigationIntent({
      runtime: previous.runtime,
      event: previousWheel.event,
      intent: "previous",
      preventDefault: false,
    }),
    "accepted",
  );
  assert.deepEqual(previous.calls, { next: 0, previous: 1 });
});

test("W06: ownership delegates without snapshot-based eligibility prediction", async () => {
  const source = await readFile(ownershipSourceUrl, "utf8");

  assert.doesNotMatch(source, /getSnapshot/);
  assert.doesNotMatch(
    source,
    /\.(?:selected|locked|transition|cooldownActive)\b/,
  );
});

test("W07: ownership remains stateless and free of raw wheel policy", async () => {
  const source = await readFile(ownershipSourceUrl, "utf8");

  for (const forbidden of [
    /deltaX/,
    /deltaY/,
    /deltaMode/,
    /threshold/i,
    /burst/i,
    /cooldown/i,
    /Date\.now/,
    /performance\.now/,
    /setTimeout/,
    /setInterval/,
    /addEventListener/,
    /removeEventListener/,
    /\bwindow\b/,
    /\bdocument\b/,
    /defaultPrevented/,
    /stopPropagation/,
    /stopImmediatePropagation/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("W08: semantic request failure propagates without prevention", () => {
  const order = [];
  const failure = new Error("semantic request failed");
  const wheel = makeEvent({ cancelable: true, order });
  const runtime = {
    next() {
      order.push("request:next");
      throw failure;
    },
    previous() {
      throw new Error("unexpected previous call");
    },
  };

  assert.throws(
    () =>
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: true,
      }),
    (error) => error === failure,
  );

  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("unsupported normalized intent fails before request or prevention", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const wheel = makeEvent({ cancelable: true, order });

  assert.throws(() =>
    applyWheelNavigationIntent({
      runtime,
      event: wheel.event,
      intent: "forward",
      preventDefault: true,
    }),
  );

  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, []);
});

test("actual semantic Runtime composition preserves rejection and accepted-only prevention", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
  });

  try {
    const boundaryWheel = makeEvent();
    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: boundaryWheel.event,
        intent: "previous",
        preventDefault: true,
      }),
      "rejected",
    );
    assert.equal(boundaryWheel.preventCount, 0);

    const acceptedWheel = makeEvent();
    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: acceptedWheel.event,
        intent: "next",
        preventDefault: true,
      }),
      "accepted",
    );
    assert.equal(acceptedWheel.preventCount, 1);

    const activeWheel = makeEvent();
    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: activeWheel.event,
        intent: "next",
        preventDefault: true,
      }),
      "rejected",
    );
    assert.equal(activeWheel.preventCount, 0);
  } finally {
    runtime.dispose();
  }
});

function makeTargetRuntime({
  disposition = "accepted",
  order = [],
  failure = null,
} = {}) {
  const calls = { next: 0, previous: 0, goTo: [] };

  return {
    runtime: {
      next() {
        calls.next += 1;
        order.push("request:next");
        return "accepted";
      },
      previous() {
        calls.previous += 1;
        order.push("request:previous");
        return "accepted";
      },
      goTo(...args) {
        calls.goTo.push(args);
        order.push("request:goTo");
        if (failure !== null) throw failure;
        return disposition;
      },
    },
    calls,
  };
}

test("T01: tagged target issues exactly one goTo and no adjacent request", () => {
  const order = [];
  const { runtime, calls } = makeTargetRuntime({ order });
  const wheel = makeEvent({ order });

  const disposition = applyWheelNavigationIntent({
    runtime,
    event: wheel.event,
    intent: { type: "target", target: "C" },
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 0, previous: 0, goTo: [["C"]] });
  assert.equal(wheel.preventCount, 1);
  assert.deepEqual(order, ["request:goTo", "preventDefault"]);
});

test("T02: adjacent intents never call goTo", () => {
  for (const intent of ["next", "previous"]) {
    const { runtime, calls } = makeTargetRuntime();
    const wheel = makeEvent();

    applyWheelNavigationIntent({ runtime, event: wheel.event, intent });

    assert.equal(calls.goTo.length, 0);
    assert.equal(calls.next + calls.previous, 1);
    assert.equal(calls[intent], 1);
  }
});

test("T03: reserved phase identities stay distinct from adjacent intents", () => {
  for (const reserved of ["next", "previous"]) {
    const { runtime, calls } = makeTargetRuntime();
    const wheel = makeEvent();

    applyWheelNavigationIntent({
      runtime,
      event: wheel.event,
      intent: { type: "target", target: reserved },
    });

    assert.deepEqual(calls, { next: 0, previous: 0, goTo: [[reserved]] });
  }

  const { runtime, calls } = makeTargetRuntime();
  applyWheelNavigationIntent({
    runtime,
    event: makeEvent().event,
    intent: "next",
  });
  assert.deepEqual(calls, { next: 1, previous: 0, goTo: [] });
});

test("T04: rejected tagged target returns rejected without prevention", () => {
  const order = [];
  const { runtime, calls } = makeTargetRuntime({
    disposition: "rejected",
    order,
  });
  const wheel = makeEvent({ order });

  assert.equal(
    applyWheelNavigationIntent({
      runtime,
      event: wheel.event,
      intent: { type: "target", target: "A" },
    }),
    "rejected",
  );
  assert.equal(calls.goTo.length, 1);
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["request:goTo"]);
});

test("T05: accepted tagged target respects cancelability and prevention policy", () => {
  const nonCancelable = makeEvent({ cancelable: false });
  assert.equal(
    applyWheelNavigationIntent({
      runtime: makeTargetRuntime().runtime,
      event: nonCancelable.event,
      intent: { type: "target", target: "C" },
    }),
    "accepted",
  );
  assert.equal(nonCancelable.preventCount, 0);

  const disabled = makeEvent();
  assert.equal(
    applyWheelNavigationIntent({
      runtime: makeTargetRuntime().runtime,
      event: disabled.event,
      intent: { type: "target", target: "C" },
      preventDefault: false,
    }),
    "accepted",
  );
  assert.equal(disabled.preventCount, 0);
});

test("T06: goTo failure propagates without prevention or retry", () => {
  const failure = new Error("unknown phase identity");
  const { runtime, calls } = makeTargetRuntime({ failure });
  const wheel = makeEvent();

  assert.throws(
    () =>
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: { type: "target", target: "not-configured" },
      }),
    (error) => error === failure,
  );
  assert.deepEqual(calls, {
    next: 0,
    previous: 0,
    goTo: [["not-configured"]],
  });
  assert.equal(wheel.preventCount, 0);
});

test("T07: preventDefault failure after acceptance propagates without a second request", () => {
  const order = [];
  const failure = new Error("preventDefault failed");
  const { runtime, calls } = makeTargetRuntime({ order });
  const event = {
    cancelable: true,
    preventDefault() {
      order.push("preventDefault");
      throw failure;
    },
  };

  assert.throws(
    () =>
      applyWheelNavigationIntent({
        runtime,
        event,
        intent: { type: "target", target: "C" },
      }),
    (error) => error === failure,
  );
  assert.deepEqual(calls, { next: 0, previous: 0, goTo: [["C"]] });
  assert.deepEqual(order, ["request:goTo", "preventDefault"]);
});

test("T08: malformed intents fail before any request or prevention", () => {
  for (const intent of [
    null,
    undefined,
    {},
    { type: "target" },
    { type: "unknown", target: "A" },
    "A",
    "C",
    ["target", "A"],
  ]) {
    const order = [];
    const { runtime, calls } = makeTargetRuntime({ order });
    const wheel = makeEvent({ order });

    assert.throws(() =>
      applyWheelNavigationIntent({ runtime, event: wheel.event, intent }),
    );
    assert.deepEqual(calls, { next: 0, previous: 0, goTo: [] });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, []);
  }
});

test("T09: tagged target requires a callable goTo and never falls back", () => {
  const { runtime, calls } = makeRuntime();
  const wheel = makeEvent();

  assert.throws(() =>
    applyWheelNavigationIntent({
      runtime,
      event: wheel.event,
      intent: { type: "target", target: "C" },
    }),
  );
  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(wheel.preventCount, 0);

  assert.throws(() =>
    applyWheelNavigationIntent({
      runtime: { ...runtime, goTo: "not callable" },
      event: wheel.event,
      intent: { type: "target", target: "C" },
    }),
  );
});

test("T10: actual Runtime composition keeps direct targets direct and disposition-first", async () => {
  const module = await modulePromise;
  const config = {
    phases: ["A", "B", "C", "next"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
  };
  const target = (name) => ({ type: "target", target: name });
  const apply = (runtime, intent, wheel) =>
    applyWheelNavigationIntent({
      runtime,
      event: wheel.event,
      intent,
      preventDefault: true,
    });

  const runtime = createFlowRuntime(module, config);
  try {
    const same = makeEvent();
    assert.equal(apply(runtime, target("A"), same), "rejected");
    assert.equal(same.preventCount, 0);

    const unknown = makeEvent();
    assert.throws(() => apply(runtime, target("not-configured"), unknown));
    assert.equal(unknown.preventCount, 0);
    assert.equal(runtime.getSnapshot().selected, "A");

    const direct = makeEvent();
    assert.equal(apply(runtime, target("C"), direct), "accepted");
    assert.equal(direct.preventCount, 1);
    assert.equal(runtime.getSnapshot().selected, "C");

    const active = makeEvent();
    assert.equal(apply(runtime, target("B"), active), "rejected");
    assert.equal(active.preventCount, 0);
    assert.equal(runtime.getSnapshot().selected, "C");

    runtime.tick(100);
    const cooling = makeEvent();
    assert.equal(apply(runtime, target("B"), cooling), "rejected");
    assert.equal(cooling.preventCount, 0);

    runtime.tick(20);
    runtime.lock();
    const locked = makeEvent();
    assert.equal(apply(runtime, target("B"), locked), "rejected");
    assert.equal(locked.preventCount, 0);
    runtime.unlock();

    // "next" is a configured phase identity here: tagged target selects it,
    // while bare "next" would have meant the adjacent operation.
    const reserved = makeEvent();
    assert.equal(apply(runtime, target("next"), reserved), "accepted");
    assert.equal(runtime.getSnapshot().selected, "next");
  } finally {
    runtime.dispose();
  }

  const failing = createFlowRuntime(module, config);
  try {
    const event = {
      cancelable: true,
      preventDefault() {
        throw new Error("preventDefault failed");
      },
    };
    assert.throws(() =>
      applyWheelNavigationIntent({
        runtime: failing,
        event,
        intent: target("C"),
      }),
    );
    assert.equal(failing.getSnapshot().selected, "C");
  } finally {
    failing.dispose();
  }
});
