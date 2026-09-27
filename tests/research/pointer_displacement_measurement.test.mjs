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
    clientX = 0,
    clientY = 0,
    pointerType = "touch",
    isPrimary = true,
  } = {},
) {
  return {
    type,
    pointerId,
    clientX,
    clientY,
    pointerType,
    isPrimary,
  };
}

function projectX(event) {
  return event.clientX;
}

function projectY(event) {
  return event.clientY;
}

function createStartRelativeMeasurement(project) {
  let startProjected = null;

  return {
    begin(event) {
      startProjected = project(event);
    },

    sample(event) {
      if (startProjected === null) return null;
      return startProjected - project(event);
    },

    reset() {
      startProjected = null;
    },

    snapshot() {
      return { startProjected };
    },
  };
}

function stepThresholdCrossed(values, threshold) {
  for (let index = 1; index < values.length; index += 1) {
    const step = Math.abs(values[index - 1] - values[index]);
    if (step > threshold) return true;
  }

  return false;
}

function cumulativeAbsolutePath(values) {
  let total = 0;

  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs(values[index - 1] - values[index]);
  }

  return total;
}

function startRelativeDelta(values) {
  if (values.length < 2) return 0;
  return values[0] - values[values.length - 1];
}

function strictGate(delta, threshold) {
  if (delta > threshold) return "next";
  if (delta < -threshold) return "previous";
  return null;
}

function inclusiveGate(delta, threshold) {
  if (delta >= threshold) return "next";
  if (delta <= -threshold) return "previous";
  return null;
}

function createMeasuredPolicy({
  project,
  evaluateOn,
  threshold,
  gate = strictGate,
}) {
  const measurement = createStartRelativeMeasurement(project);
  let trackedPointerId = null;
  let proposals = 0;
  let aborts = 0;

  function reset() {
    trackedPointerId = null;
    measurement.reset();
  }

  return {
    handle(event) {
      if (event.type === "pointerdown" && trackedPointerId === null) {
        trackedPointerId = event.pointerId;
        measurement.begin(event);
        return null;
      }

      if (event.pointerId !== trackedPointerId) {
        return null;
      }

      if (event.type === "pointercancel") {
        reset();
        return null;
      }

      const shouldEvaluate =
        (evaluateOn === "move" && event.type === "pointermove") ||
        (evaluateOn === "up" && event.type === "pointerup");

      if (!shouldEvaluate) {
        if (event.type === "pointerup") reset();
        return null;
      }

      const delta = measurement.sample(event);
      const intent = delta === null ? null : gate(delta, threshold);

      if (event.type === "pointerup") {
        reset();
      }

      if (intent !== null) {
        proposals += 1;
      }

      return intent;
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        ...measurement.snapshot(),
        proposals,
        aborts,
      };
    },
  };
}

function createRecordingRuntime(disposition = "accepted") {
  const calls = [];

  return {
    calls,
    runtime: {
      next(...args) {
        calls.push({ intent: "next", args, disposition });
        return disposition;
      },

      previous(...args) {
        calls.push({ intent: "previous", args, disposition });
        return disposition;
      },

      getSnapshot() {
        throw new Error("pointer displacement measurement must not inspect Runtime snapshots");
      },
    },
  };
}

test("PDM-H1: per-event step thresholding is not equivalent to start-relative displacement", () => {
  const threshold = 40;
  const trace = [200, 185, 170, 155, 140];

  assert.equal(stepThresholdCrossed(trace, threshold), false);
  assert.equal(startRelativeDelta(trace), 60);
  assert.equal(strictGate(startRelativeDelta(trace), threshold), "next");
});

test("PDM-H2: cumulative absolute path length is not equivalent to directional displacement", () => {
  const trace = [200, 120, 200];

  assert.equal(cumulativeAbsolutePath(trace), 160);
  assert.equal(startRelativeDelta(trace), 0);
  assert.equal(strictGate(startRelativeDelta(trace), 40), null);
});

test("PDM-H3: sparse and dense traces with equal endpoints have identical start-relative displacement", () => {
  const sparse = [200, 120];
  const dense = [200, 180, 160, 140, 120];

  assert.equal(startRelativeDelta(sparse), 80);
  assert.equal(startRelativeDelta(dense), 80);
});

test("PDM-H4: X and Y projectors reuse the same start-relative measurement algebra", () => {
  const start = pointerEvent("pointerdown", {
    clientX: 300,
    clientY: 500,
  });
  const current = pointerEvent("pointermove", {
    clientX: 220,
    clientY: 420,
  });

  const x = createStartRelativeMeasurement(projectX);
  const y = createStartRelativeMeasurement(projectY);

  x.begin(start);
  y.begin(start);

  assert.equal(x.sample(current), 80);
  assert.equal(y.sample(current), 80);
});

test("PDM-H5: Euclidean magnitude loses directional sign", () => {
  const right = { dx: 60, dy: 0 };
  const left = { dx: -60, dy: 0 };

  const rightMagnitude = Math.hypot(right.dx, right.dy);
  const leftMagnitude = Math.hypot(left.dx, left.dy);

  assert.equal(rightMagnitude, leftMagnitude);
  assert.notEqual(right.dx, left.dx);
});

test("PDM-H5: diagonal movement leaves axis interpretation as separate host policy", () => {
  const start = pointerEvent("pointerdown", {
    clientX: 100,
    clientY: 100,
  });
  const diagonal = pointerEvent("pointermove", {
    clientX: 40,
    clientY: 180,
  });

  const x = createStartRelativeMeasurement(projectX);
  const y = createStartRelativeMeasurement(projectY);

  x.begin(start);
  y.begin(start);

  assert.equal(x.sample(diagonal), 60);
  assert.equal(y.sample(diagonal), -80);
  assert.equal(Math.hypot(60, -80), 100);
  assert.equal(strictGate(x.sample(diagonal), 50), "next");
  assert.equal(strictGate(y.sample(diagonal), 50), "previous");
});

test("PDM-H6: threshold crossing does not commit measurement direction", () => {
  const measurement = createStartRelativeMeasurement(projectY);

  measurement.begin(
    pointerEvent("pointerdown", {
      clientY: 100,
    }),
  );

  const forward = measurement.sample(
    pointerEvent("pointermove", {
      clientY: 40,
    }),
  );
  const reversed = measurement.sample(
    pointerEvent("pointermove", {
      clientY: 130,
    }),
  );

  assert.equal(forward, 60);
  assert.equal(strictGate(forward, 50), "next");
  assert.equal(reversed, -30);
  assert.equal(strictGate(reversed, 20), "previous");
});

test("PDM-H7: move-time and pointerup-only policies can consume the same measurement definition", () => {
  const start = pointerEvent("pointerdown", {
    clientY: 200,
  });
  const sampled = pointerEvent("pointermove", {
    clientY: 120,
  });
  const terminal = pointerEvent("pointerup", {
    clientY: 120,
  });

  const moveMeasurement = createStartRelativeMeasurement(projectY);
  const upMeasurement = createStartRelativeMeasurement(projectY);

  moveMeasurement.begin(start);
  upMeasurement.begin(start);

  assert.equal(moveMeasurement.sample(sampled), 80);
  assert.equal(upMeasurement.sample(terminal), 80);
});

test("PDM-H8: exact threshold equality does not have one implied comparator", () => {
  const threshold = 50;
  const delta = 50;

  assert.equal(strictGate(delta, threshold), null);
  assert.equal(inclusiveGate(delta, threshold), "next");
});

test("PDM-H9: production listener receives normalized intent without Runtime snapshot or coordinate arguments", () => {
  const target = new RecordingTarget();
  const policy = createMeasuredPolicy({
    project: projectY,
    evaluateOn: "move",
    threshold: 40,
  });
  const { runtime, calls } = createRecordingRuntime();

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 7,
        clientY: 200,
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 7,
        clientY: 120,
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

test("PDM-H10: projector, threshold parameter, and evaluation timing compose independently of measurement", () => {
  const moveTarget = new RecordingTarget();
  const upTarget = new RecordingTarget();

  const movePolicy = createMeasuredPolicy({
    project: projectY,
    evaluateOn: "move",
    threshold: 40,
  });
  const upPolicy = createMeasuredPolicy({
    project: projectX,
    evaluateOn: "up",
    threshold: 30,
  });

  const moveRuntime = createRecordingRuntime();
  const upRuntime = createRecordingRuntime();

  const cleanupMove = bindPointerNavigation({
    target: moveTarget,
    runtime: moveRuntime.runtime,
    policy: movePolicy,
  });
  const cleanupUp = bindPointerNavigation({
    target: upTarget,
    runtime: upRuntime.runtime,
    policy: upPolicy,
  });

  try {
    moveTarget.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 500,
        clientY: 200,
      }),
    );
    moveTarget.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 1,
        clientX: 500,
        clientY: 140,
      }),
    );

    upTarget.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 2,
        clientX: 100,
        clientY: 500,
      }),
    );
    upTarget.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 2,
        clientX: 40,
        clientY: 500,
      }),
    );

    assert.equal(upRuntime.calls.length, 0);

    upTarget.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 2,
        clientX: 40,
        clientY: 500,
      }),
    );

    assert.deepEqual(
      moveRuntime.calls.map(({ intent }) => intent),
      ["next"],
    );
    assert.deepEqual(
      upRuntime.calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanupMove();
    cleanupUp();
  }
});

test("PDM lifecycle: pointercancel clears the measurement baseline", () => {
  const target = new RecordingTarget();
  const policy = createMeasuredPolicy({
    project: projectY,
    evaluateOn: "move",
    threshold: 40,
  });
  const { runtime, calls } = createRecordingRuntime();

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 3,
        clientY: 200,
      }),
    );

    assert.equal(policy.snapshot().startProjected, 200);

    target.dispatch(
      "pointercancel",
      pointerEvent("pointercancel", {
        pointerId: 3,
        clientY: 170,
      }),
    );

    assert.deepEqual(policy.snapshot(), {
      trackedPointerId: null,
      startProjected: null,
      proposals: 0,
      aborts: 0,
    });

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 3,
        clientY: 100,
      }),
    );

    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("PDM lifecycle: application cleanup/abort clears the measurement baseline", () => {
  const target = new RecordingTarget();
  const policy = createMeasuredPolicy({
    project: projectY,
    evaluateOn: "move",
    threshold: 40,
  });
  const { runtime } = createRecordingRuntime();

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId: 4,
      clientY: 250,
    }),
  );

  assert.equal(policy.snapshot().startProjected, 250);

  cleanup();

  assert.deepEqual(policy.snapshot(), {
    trackedPointerId: null,
    startProjected: null,
    proposals: 0,
    aborts: 1,
  });
});
