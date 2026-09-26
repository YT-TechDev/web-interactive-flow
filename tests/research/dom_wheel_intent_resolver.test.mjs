import assert from "node:assert/strict";
import test from "node:test";

import { applyWheelNavigationIntent } from "../../bridge/wheel_ownership.mjs";

// Research-only composition model. This is intentionally not production API.
function researchDispatchWheelEvent({
  runtime,
  event,
  resolveIntent,
  preventDefault = true,
}) {
  if (typeof resolveIntent !== "function") {
    throw new Error("invalid research intent resolver");
  }

  const intent = resolveIntent(event);

  if (intent === null || intent === undefined) {
    return undefined;
  }

  return applyWheelNavigationIntent({
    runtime,
    event,
    intent,
    preventDefault,
  });
}

function makeEvent({ defaultPrevented = false, cancelable = true, order = [] } = {}) {
  let prevented = defaultPrevented;
  let preventCount = 0;

  return {
    event: {
      cancelable,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        order.push("preventDefault");
        preventCount += 1;
        if (cancelable) prevented = true;
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
        order.push("request:next");
        calls.next += 1;
        return nextDisposition;
      },
      previous() {
        order.push("request:previous");
        calls.previous += 1;
        return previousDisposition;
      },
    },
    calls,
  };
}

test("D6: resolver decline has no semantic or prevention side effect", () => {
  for (const declined of [null, undefined]) {
    const order = [];
    const wheel = makeEvent({ order });
    const { runtime, calls } = makeRuntime({ order });
    let resolverCalls = 0;

    const result = researchDispatchWheelEvent({
      runtime,
      event: wheel.event,
      resolveIntent(event) {
        assert.equal(event, wheel.event);
        resolverCalls += 1;
        order.push("resolve:decline");
        return declined;
      },
    });

    assert.equal(result, undefined);
    assert.equal(resolverCalls, 1);
    assert.deepEqual(calls, { next: 0, previous: 0 });
    assert.equal(wheel.preventCount, 0);
    assert.deepEqual(order, ["resolve:decline"]);
  }
});

test("D6: resolver failure propagates before semantic request or prevention", () => {
  const order = [];
  const failure = new Error("resolver failed");
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });

  assert.throws(
    () =>
      researchDispatchWheelEvent({
        runtime,
        event: wheel.event,
        resolveIntent() {
          order.push("resolve:throw");
          throw failure;
        },
      }),
    (error) => error === failure,
  );

  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["resolve:throw"]);
});

test("D6: invalid produced intent fails before semantic request or prevention", () => {
  const order = [];
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });

  assert.throws(() =>
    researchDispatchWheelEvent({
      runtime,
      event: wheel.event,
      resolveIntent() {
        order.push("resolve:invalid");
        return "forward";
      },
    }),
  );

  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["resolve:invalid"]);
});

test("D6: produced intent delegates exactly once before accepted-only prevention", () => {
  const order = [];
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({ order });
  let resolverCalls = 0;

  const disposition = researchDispatchWheelEvent({
    runtime,
    event: wheel.event,
    resolveIntent(event) {
      assert.equal(event, wheel.event);
      resolverCalls += 1;
      order.push("resolve:next");
      return "next";
    },
    preventDefault: true,
  });

  assert.equal(disposition, "accepted");
  assert.equal(resolverCalls, 1);
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 1);
  assert.deepEqual(order, ["resolve:next", "request:next", "preventDefault"]);
});

test("D6: rejected produced intent remains unprevented", () => {
  const order = [];
  const wheel = makeEvent({ order });
  const { runtime, calls } = makeRuntime({
    nextDisposition: "rejected",
    order,
  });

  const disposition = researchDispatchWheelEvent({
    runtime,
    event: wheel.event,
    resolveIntent() {
      order.push("resolve:next");
      return "next";
    },
  });

  assert.equal(disposition, "rejected");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["resolve:next", "request:next"]);
});

test("D4/D6: existing defaultPrevented may remain resolver policy instead of semantic truth", () => {
  const order = [];
  const wheel = makeEvent({ defaultPrevented: true, order });
  const { runtime, calls } = makeRuntime({ order });

  const result = researchDispatchWheelEvent({
    runtime,
    event: wheel.event,
    resolveIntent(event) {
      order.push("resolve");
      return event.defaultPrevented ? null : "next";
    },
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(wheel.preventCount, 0);
  assert.deepEqual(order, ["resolve"]);
});
