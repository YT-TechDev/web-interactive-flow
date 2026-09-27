import assert from "node:assert/strict";
import test from "node:test";

import { bindPointerNavigation } from "../../adapters/dom/pointer_listener.mjs";

class RecordingTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    );
  }

  dispatch(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener.call(this, event);
    }
  }
}

function pointerEvent(
  type,
  {
    pointerId = 1,
    clientY = 0,
  } = {},
) {
  return {
    type,
    pointerId,
    clientY,
  };
}

function strictMagnitudeCrossed(delta, threshold) {
  return Math.abs(delta) > threshold;
}

function inclusiveMagnitudeCrossed(delta, threshold) {
  return Math.abs(delta) >= threshold;
}

function directionalStrictCrossing(
  delta,
  {
    positiveThreshold,
    negativeThreshold,
  },
) {
  if (delta > positiveThreshold) return "positive";
  if (delta < -negativeThreshold) return "negative";
  return null;
}

function startRelativeDelta(startProjected, currentProjected) {
  const delta = startProjected - currentProjected;
  return Number.isFinite(delta) ? delta : null;
}

function createRecordingRuntime(disposition = "accepted") {
  const calls = [];

  return {
    calls,
    runtime: {
      next(...args) {
        calls.push({
          intent: "next",
          args,
          disposition,
        });
        return disposition;
      },

      previous(...args) {
        calls.push({
          intent: "previous",
          args,
          disposition,
        });
        return disposition;
      },

      getSnapshot() {
        throw new Error(
          "pointer threshold research must not inspect Runtime snapshots",
        );
      },
    },
  };
}

/*
 * This is only a production-listener composition witness.
 *
 * It intentionally fixes one simple single-pointer sequence, one projected
 * coordinate, one threshold comparator, and one sign mapping so threshold
 * miss/crossing can be observed at the listener/Runtime boundary.
 *
 * Those choices are not proposed as reusable WIF policy.
 */
function createThresholdProbePolicy({
  threshold,
  crosses = strictMagnitudeCrossed,
}) {
  let trackedPointerId = null;
  let startProjected = null;
  let aborts = 0;

  function reset() {
    trackedPointerId = null;
    startProjected = null;
  }

  return {
    handle(event) {
      if (
        event.type === "pointerdown" &&
        trackedPointerId === null &&
        Number.isFinite(event.clientY)
      ) {
        trackedPointerId = event.pointerId;
        startProjected = event.clientY;
        return null;
      }

      if (event.pointerId !== trackedPointerId) {
        return null;
      }

      if (
        event.type === "pointercancel" ||
        event.type === "pointerup"
      ) {
        reset();
        return null;
      }

      if (
        event.type !== "pointermove" ||
        startProjected === null ||
        !Number.isFinite(event.clientY)
      ) {
        return null;
      }

      const delta = startRelativeDelta(
        startProjected,
        event.clientY,
      );

      if (
        delta === null ||
        !crosses(delta, threshold)
      ) {
        return null;
      }

      // Test-only sign mapping. PTH-H8 and ADR-0021 keep mapping policy
      // separate from threshold semantics.
      return delta > 0 ? "next" : "previous";
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        startProjected,
        aborts,
      };
    },
  };
}

function bindPolicy(policy, runtime) {
  const target = new RecordingTarget();
  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  return {
    target,
    cleanup,
  };
}

test("PTH-H1: one numeric threshold is not invariant across stable projection scales", () => {
  const threshold = 40;
  const rawDelta = 30;
  const scaledDelta = rawDelta * 2;

  assert.equal(
    strictMagnitudeCrossed(rawDelta, threshold),
    false,
  );
  assert.equal(
    strictMagnitudeCrossed(scaledDelta, threshold),
    true,
  );
});

test("PTH-H2: coherently scaling displacement and threshold preserves one candidate crossing relation", () => {
  const scale = 2;

  for (const {
    delta,
    threshold,
  } of [
    { delta: 30, threshold: 40 },
    { delta: 50, threshold: 40 },
    { delta: -30, threshold: 40 },
    { delta: -50, threshold: 40 },
  ]) {
    assert.equal(
      strictMagnitudeCrossed(delta, threshold),
      strictMagnitudeCrossed(
        delta * scale,
        threshold * scale,
      ),
    );
  }
});

test("PTH-H3: stable host normalization can represent a relative threshold without Runtime ownership", () => {
  const stableExtent = 400;
  const rawThreshold = 60;
  const normalizedThreshold =
    rawThreshold / stableExtent;

  for (const {
    rawStart,
    rawCurrent,
  } of [
    { rawStart: 400, rawCurrent: 320 },
    { rawStart: 400, rawCurrent: 360 },
  ]) {
    const rawDelta =
      rawStart - rawCurrent;
    const normalizedDelta =
      rawStart / stableExtent -
      rawCurrent / stableExtent;

    assert.equal(
      strictMagnitudeCrossed(
        rawDelta,
        rawThreshold,
      ),
      strictMagnitudeCrossed(
        normalizedDelta,
        normalizedThreshold,
      ),
    );
  }
});

test("PTH-H4: changing only threshold can change qualification with unchanged displacement", () => {
  const delta = 40;

  assert.equal(
    strictMagnitudeCrossed(delta, 50),
    false,
  );
  assert.equal(
    strictMagnitudeCrossed(delta, 30),
    true,
  );
});

test("PTH-H5: strict and inclusive threshold comparisons diverge at exact equality", () => {
  const delta = 50;
  const threshold = 50;

  assert.equal(
    strictMagnitudeCrossed(delta, threshold),
    false,
  );
  assert.equal(
    inclusiveMagnitudeCrossed(
      delta,
      threshold,
    ),
    true,
  );
});

test("PTH-H6: zero-threshold behavior depends on the selected equality comparator", () => {
  const delta = 0;
  const threshold = 0;

  assert.equal(
    strictMagnitudeCrossed(delta, threshold),
    false,
  );
  assert.equal(
    inclusiveMagnitudeCrossed(
      delta,
      threshold,
    ),
    true,
  );

  assert.equal(
    strictMagnitudeCrossed(1, threshold),
    true,
  );
});

test("PTH-H7: negative and non-finite values do not behave like one ordinary minimum-distance bound", () => {
  const cases = [
    {
      threshold: Number.NaN,
      stationary: false,
      moved: false,
    },
    {
      threshold: Infinity,
      stationary: false,
      moved: false,
    },
    {
      threshold: -Infinity,
      stationary: true,
      moved: true,
    },
    {
      threshold: -1,
      stationary: true,
      moved: true,
    },
  ];

  for (const {
    threshold,
    stationary,
    moved,
  } of cases) {
    assert.equal(
      strictMagnitudeCrossed(0, threshold),
      stationary,
    );
    assert.equal(
      strictMagnitudeCrossed(100, threshold),
      moved,
    );
  }
});

test("PTH-H8: asymmetric directional bounds falsify one universal symmetric magnitude threshold", () => {
  const directionalBounds = {
    positiveThreshold: 50,
    negativeThreshold: 100,
  };

  assert.equal(
    directionalStrictCrossing(
      60,
      directionalBounds,
    ),
    "positive",
  );
  assert.equal(
    directionalStrictCrossing(
      -60,
      directionalBounds,
    ),
    null,
  );

  assert.equal(
    strictMagnitudeCrossed(60, 50),
    true,
  );
  assert.equal(
    strictMagnitudeCrossed(-60, 50),
    true,
  );
});

test("PTH-H9: threshold miss produces no normalized request and no Runtime rejection", () => {
  const policy =
    createThresholdProbePolicy({
      threshold: 40,
    });
  const { runtime, calls } =
    createRecordingRuntime("rejected");
  const { target, cleanup } =
    bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 9,
        clientY: 200,
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 9,
        clientY: 180,
      }),
    );

    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("PTH-H10: threshold crossing can still receive Runtime rejected and does not commit by itself", () => {
  const policy =
    createThresholdProbePolicy({
      threshold: 40,
    });
  const { runtime, calls } =
    createRecordingRuntime("rejected");
  const { target, cleanup } =
    bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 10,
        clientY: 200,
      }),
    );

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 10,
        clientY: 140,
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 10,
        clientY: 130,
      }),
    );

    assert.deepEqual(calls, [
      {
        intent: "next",
        args: [],
        disposition: "rejected",
      },
      {
        intent: "next",
        args: [],
        disposition: "rejected",
      },
    ]);
  } finally {
    cleanup();
  }
});

test("PTH-H11: threshold evaluation remains policy-local and Runtime sees only normalized intent", () => {
  const policy =
    createThresholdProbePolicy({
      threshold: 40,
    });
  const { runtime, calls } =
    createRecordingRuntime("accepted");
  const { target, cleanup } =
    bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 11,
        clientY: 200,
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 11,
        clientY: 140,
      }),
    );

    assert.deepEqual(calls, [
      {
        intent: "next",
        args: [],
        disposition: "accepted",
      },
    ]);
  } finally {
    cleanup();
  }
});

test("PTH-H12: candidate numeric thresholds are observably different without supplying a universal default", () => {
  const delta = 45;

  assert.equal(
    strictMagnitudeCrossed(delta, 40),
    true,
  );
  assert.equal(
    strictMagnitudeCrossed(delta, 50),
    false,
  );
});
