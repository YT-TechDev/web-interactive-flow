import assert from "node:assert/strict";
import test from "node:test";

function signOnlyY(event) {
  if (event.deltaY > 0) return "next";
  if (event.deltaY < 0) return "previous";
  return null;
}

function signOnlyX(event) {
  if (event.deltaX > 0) return "next";
  if (event.deltaX < 0) return "previous";
  return null;
}

function dominantAxis(event) {
  const x = Math.abs(event.deltaX);
  const y = Math.abs(event.deltaY);

  if (x === y) return null;
  if (y > x) return signOnlyY(event);
  return signOnlyX(event);
}

function referenceNormalizedDelta(event, axis = "y") {
  const multiplier =
    event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? 800
        : 1;
  const delta = axis === "x" ? event.deltaX : event.deltaY;
  return delta * multiplier;
}

function referenceThresholdDecision(event, {
  axis = "y",
  threshold = 40,
} = {}) {
  const delta = referenceNormalizedDelta(event, axis);

  if (delta > threshold) return "next";
  if (delta < -threshold) return "previous";
  return null;
}

test("H1 counterexample: sign-only emits one intent for every tiny same-sign event", () => {
  const trace = [
    { deltaX: 0, deltaY: 0.01, deltaMode: 0 },
    { deltaX: 0, deltaY: 0.02, deltaMode: 0 },
    { deltaX: 0, deltaY: 0.03, deltaMode: 0 },
  ];

  assert.deepEqual(trace.map(signOnlyY), ["next", "next", "next"]);
});

test("H1 counterexample: sign-only cannot distinguish repeated events from one gesture", () => {
  const sameGestureLikeTrace = Array.from({ length: 5 }, () => ({
    deltaX: 0,
    deltaY: 1,
    deltaMode: 0,
  }));

  assert.deepEqual(
    sameGestureLikeTrace.map(signOnlyY),
    ["next", "next", "next", "next", "next"],
  );
});

test("H2 evidence: reference fixed multipliers encode arbitrary cross-unit equivalences", () => {
  assert.equal(
    referenceNormalizedDelta({ deltaX: 0, deltaY: 16, deltaMode: 0 }),
    16,
  );
  assert.equal(
    referenceNormalizedDelta({ deltaX: 0, deltaY: 1, deltaMode: 1 }),
    16,
  );
  assert.equal(
    referenceNormalizedDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }),
    800,
  );
});

test("H2/H3 evidence: one threshold means different raw quantities per deltaMode", () => {
  assert.equal(
    referenceThresholdDecision({ deltaX: 0, deltaY: 40, deltaMode: 0 }),
    null,
  );
  assert.equal(
    referenceThresholdDecision({ deltaX: 0, deltaY: 41, deltaMode: 0 }),
    "next",
  );

  assert.equal(
    referenceThresholdDecision({ deltaX: 0, deltaY: 2, deltaMode: 1 }),
    null,
  );
  assert.equal(
    referenceThresholdDecision({ deltaX: 0, deltaY: 3, deltaMode: 1 }),
    "next",
  );

  assert.equal(
    referenceThresholdDecision({ deltaX: 0, deltaY: 1, deltaMode: 2 }),
    "next",
  );
});

test("H4 counterexample: y-only ignores orthogonal input while sign-only x accepts it", () => {
  const event = { deltaX: 25, deltaY: 0, deltaMode: 0 };

  assert.equal(signOnlyY(event), null);
  assert.equal(signOnlyX(event), "next");
});

test("H4 counterexample: dominant-axis policy declines equal diagonal input by choice", () => {
  const event = { deltaX: 10, deltaY: 10, deltaMode: 0 };

  assert.equal(dominantAxis(event), null);
  assert.equal(signOnlyY(event), "next");
  assert.equal(signOnlyX(event), "next");
});

test("H4 evidence: dominant-axis policy can choose a different intent from configured y", () => {
  const event = { deltaX: -20, deltaY: 5, deltaMode: 0 };

  assert.equal(dominantAxis(event), "previous");
  assert.equal(signOnlyY(event), "next");
});

test("H5 counterexample: direction reversal requires state to discard prior accumulation", () => {
  const trace = [
    { deltaX: 0, deltaY: 30, deltaMode: 0 },
    { deltaX: 0, deltaY: -41, deltaMode: 0 },
  ];

  assert.deepEqual(trace.map(signOnlyY), ["next", "previous"]);
});

test("H6 evidence: a delta-only resolver cannot distinguish modifier-bearing wheel input", () => {
  const ordinary = { deltaX: 0, deltaY: 50, deltaMode: 0, ctrlKey: false };
  const modified = { deltaX: 0, deltaY: 50, deltaMode: 0, ctrlKey: true };

  assert.equal(signOnlyY(ordinary), "next");
  assert.equal(signOnlyY(modified), "next");
});

test("large accelerated-looking deltas do not provide gesture cardinality", () => {
  const small = { deltaX: 0, deltaY: 1, deltaMode: 0 };
  const large = { deltaX: 0, deltaY: 5000, deltaMode: 0 };

  assert.equal(signOnlyY(small), "next");
  assert.equal(signOnlyY(large), "next");
});
