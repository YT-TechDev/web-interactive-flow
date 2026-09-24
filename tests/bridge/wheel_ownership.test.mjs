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
