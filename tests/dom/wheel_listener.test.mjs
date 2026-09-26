import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { bindWheelNavigation } from "../../adapters/dom/wheel_listener.mjs";
import { createFlowRuntime } from "../../bridge/runtime.mjs";

const adapterSourceUrl = new URL(
  "../../adapters/dom/wheel_listener.mjs",
  import.meta.url,
);
const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

class RecordingTarget {
  constructor() {
    this.listeners = [];
    this.addCalls = [];
    this.removeCalls = [];
  }

  addEventListener(type, listener, options) {
    this.addCalls.push({ type, listener, options });
    this.listeners.push({ type, listener, options });
  }

  removeEventListener(type, listener, options) {
    this.removeCalls.push({ type, listener, options });
    const index = this.listeners.findIndex(
      (entry) => entry.type === type && entry.listener === listener,
    );
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  dispatch(type, event) {
    for (const entry of [...this.listeners]) {
      if (entry.type === type) {
        entry.listener.call(this, event);
      }
    }
  }

  listenerCount(type) {
    return this.listeners.filter((entry) => entry.type === type).length;
  }
}

function makeEvent({
  cancelable = true,
  order = [],
  intent = undefined,
} = {}) {
  let preventCount = 0;

  return {
    event: {
      cancelable,
      intent,
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
  const calls = { next: 0, previous: 0 };

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

test("E01: setup requires an explicit listener target and resolver", () => {
  assert.throws(() =>
    bindWheelNavigation({
      target: null,
      runtime: {},
      resolveIntent: () => null,
    }),
  );

  const target = new RecordingTarget();

  assert.throws(() =>
    bindWheelNavigation({
      target,
      runtime: {},
      resolveIntent: null,
    }),
  );
  assert.equal(target.addCalls.length, 0);

  assert.throws(() =>
    bindWheelNavigation({
      target,
      runtime: {},
      resolveIntent: () => null,
      preventDefault: "yes",
    }),
  );
  assert.equal(target.addCalls.length, 0);
});

test("E01/E04: binding installs one explicit non-passive wheel listener when prevention is enabled", () => {
  const target = new RecordingTarget();
  const cleanup = bindWheelNavigation({
    target,
    runtime: makeRuntime().runtime,
    resolveIntent: () => null,
    preventDefault: true,
  });

  try {
    assert.equal(target.addCalls.length, 1);
    assert.equal(target.addCalls[0].type, "wheel");
    assert.deepEqual(target.addCalls[0].options, { passive: false });
    assert.equal(target.listenerCount("wheel"), 1);
  } finally {
    cleanup();
  }
});

test("E04: prevention-disabled binding does not require a non-passive registration", () => {
  const order = [];
  const target = new RecordingTarget();
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });
  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent() {
      order.push("resolve:next");
      return "next";
    },
    preventDefault: false,
  });

  try {
    assert.equal(target.addCalls.length, 1);
    assert.equal(target.addCalls[0].options, undefined);

    target.dispatch("wheel", wheel.event);

    assert.deepEqual(calls, { next: 1, previous: 0 });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, ["resolve:next", "request:next"]);
  } finally {
    cleanup();
  }
});

test("E02/E03: cleanup is isolated and repeat-safe", () => {
  const target = new RecordingTarget();
  let unrelatedCount = 0;
  const unrelated = () => {
    unrelatedCount += 1;
  };
  target.addEventListener("wheel", unrelated);

  const { runtime, calls } = makeRuntime();
  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent: () => "next",
    preventDefault: false,
  });

  assert.equal(target.listenerCount("wheel"), 2);

  cleanup();
  cleanup();

  assert.equal(target.removeCalls.length, 1);
  assert.equal(target.listenerCount("wheel"), 1);

  target.dispatch("wheel", makeEvent().event);

  assert.equal(unrelatedCount, 1);
  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(target.listenerCount("wheel"), 1);
});

test("E05: resolver decline performs no semantic request or prevention", () => {
  for (const declined of [null, undefined]) {
    const order = [];
    const target = new RecordingTarget();
    const wheel = makeEvent({ order });
    const { runtime, calls } = makeRuntime({ order });
    let resolverCalls = 0;

    const cleanup = bindWheelNavigation({
      target,
      runtime,
      resolveIntent(event) {
        assert.equal(event, wheel.event);
        resolverCalls += 1;
        order.push("resolve:decline");
        return declined;
      },
    });

    try {
      target.dispatch("wheel", wheel.event);

      assert.equal(resolverCalls, 1);
      assert.deepEqual(calls, { next: 0, previous: 0 });
      assert.equal(wheel.preventCount, 0);
      assert.deepEqual(order, ["resolve:decline"]);
    } finally {
      cleanup();
    }
  }
});

test("E06: resolver failure occurs before semantic request or prevention", () => {
  const order = [];
  const failure = new Error("resolver failed");
  const target = new RecordingTarget();
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });
  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent() {
      order.push("resolve:throw");
      throw failure;
    },
  });

  try {
    assert.throws(
      () => target.dispatch("wheel", wheel.event),
      (error) => error === failure,
    );

    assert.deepEqual(calls, { next: 0, previous: 0 });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, ["resolve:throw"]);
  } finally {
    cleanup();
  }
});

test("E06: invalid produced intent fails before semantic request or prevention", () => {
  const order = [];
  const target = new RecordingTarget();
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });
  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent() {
      order.push("resolve:invalid");
      return "forward";
    },
  });

  try {
    assert.throws(() => target.dispatch("wheel", wheel.event));

    assert.deepEqual(calls, { next: 0, previous: 0 });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, ["resolve:invalid"]);
  } finally {
    cleanup();
  }
});

test("E07: one produced intent delegates exactly once before accepted-only prevention", () => {
  const order = [];
  const target = new RecordingTarget();
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });
  let resolverCalls = 0;

  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent(event) {
      assert.equal(event, wheel.event);
      resolverCalls += 1;
      order.push("resolve:next");
      return "next";
    },
  });

  try {
    target.dispatch("wheel", wheel.event);

    assert.equal(resolverCalls, 1);
    assert.deepEqual(calls, { next: 1, previous: 0 });
    assert.equal(wheel.preventCount, 1);
    assert.deepEqual(order, [
      "resolve:next",
      "request:next",
      "preventDefault",
    ]);
  } finally {
    cleanup();
  }
});

test("E07: rejected semantic request remains unprevented", () => {
  const order = [];
  const target = new RecordingTarget();
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({
    nextDisposition: "rejected",
    order,
  });

  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent() {
      order.push("resolve:next");
      return "next";
    },
  });

  try {
    target.dispatch("wheel", wheel.event);

    assert.deepEqual(calls, { next: 1, previous: 0 });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, ["resolve:next", "request:next"]);
  } finally {
    cleanup();
  }
});

test("E08-E10: production listener stays semantic-prediction, propagation, and gesture-policy free", async () => {
  const source = await readFile(adapterSourceUrl, "utf8");

  for (const forbidden of [
    /\bwindow\b/,
    /\bdocument\b/,
    /getSnapshot/,
    /\.(?:selected|locked|transition|cooldownActive)\b/,
    /defaultPrevented/,
    /stopPropagation/,
    /stopImmediatePropagation/,
    /\bcapture\b/,
    /deltaX/,
    /deltaY/,
    /deltaMode/,
    /threshold/i,
    /burst/i,
    /cooldown/i,
    /setTimeout/,
    /setInterval/,
    /performance\.now/,
    /Date\.now/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  assert.match(
    source,
    /applyWheelNavigationIntent\(\{[\s\S]*runtime,[\s\S]*event,[\s\S]*intent,[\s\S]*preventDefault,[\s\S]*\}\)/,
  );
});

test("actual Runtime composition keeps semantic acceptance in the Runtime", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
  });
  const target = new RecordingTarget();

  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent(event) {
      return event.intent ?? null;
    },
    preventDefault: true,
  });

  try {
    const previous = makeEvent({ intent: "previous" });
    target.dispatch("wheel", previous.event);
    assert.equal(previous.preventCount, 0);
    assert.equal(runtime.getSnapshot().selected, "A");

    const next = makeEvent({ intent: "next" });
    target.dispatch("wheel", next.event);
    assert.equal(next.preventCount, 1);
    assert.equal(runtime.getSnapshot().selected, "B");

    const active = makeEvent({ intent: "next" });
    target.dispatch("wheel", active.event);
    assert.equal(active.preventCount, 0);
    assert.equal(runtime.getSnapshot().selected, "B");
  } finally {
    cleanup();
    runtime.dispose();
  }
});
