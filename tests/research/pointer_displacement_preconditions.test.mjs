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

function projectY(event) {
  return event.clientY;
}

function createRawStartRelativeMeasurement(project) {
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

function createFiniteStartRelativeMeasurement(project) {
  let startProjected = null;

  return {
    begin(event) {
      const projected = project(event);

      if (!Number.isFinite(projected)) {
        startProjected = null;
        return false;
      }

      startProjected = projected;
      return true;
    },

    sample(event) {
      if (startProjected === null) return null;

      const projected = project(event);

      if (!Number.isFinite(projected)) {
        return null;
      }

      const delta = startProjected - projected;
      return Number.isFinite(delta) ? delta : null;
    },

    reset() {
      startProjected = null;
    },

    snapshot() {
      return { startProjected };
    },
  };
}

function researchGate(delta, threshold = 40) {
  if (delta > threshold) return "next";
  if (delta < -threshold) return "previous";
  return null;
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
        throw new Error(
          "pointer displacement preconditions must not inspect Runtime snapshots",
        );
      },
    },
  };
}

function createNaiveMeasurementOnlyPolicy({
  project = projectY,
  threshold = 40,
} = {}) {
  const measurement = createFiniteStartRelativeMeasurement(project);
  let trackedPointerId = null;

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

      if (event.type === "pointerup") {
        reset();
        return null;
      }

      if (event.type !== "pointermove") {
        return null;
      }

      const delta = measurement.sample(event);
      return delta === null ? null : researchGate(delta, threshold);
    },

    abort() {
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        ...measurement.snapshot(),
      };
    },
  };
}

function createAdr20ComposedMeasuredPolicy({
  project = projectY,
  threshold = 40,
  mapDisplacement = researchGate,
} = {}) {
  const activeIds = new Set();
  const measurement = createFiniteStartRelativeMeasurement(project);
  let trackedPointerId = null;
  let contaminated = false;
  let measurementValid = false;
  let aborts = 0;

  function reset() {
    activeIds.clear();
    trackedPointerId = null;
    contaminated = false;
    measurementValid = false;
    measurement.reset();
  }

  return {
    handle(event) {
      if (event.type === "pointerdown") {
        if (activeIds.has(event.pointerId)) {
          contaminated = true;
          measurementValid = false;
          measurement.reset();
          return null;
        }

        const startsFreshSequence = activeIds.size === 0;
        activeIds.add(event.pointerId);

        if (startsFreshSequence) {
          trackedPointerId = event.pointerId;
          contaminated = false;
          measurementValid = measurement.begin(event);
        } else {
          contaminated = true;
          measurementValid = false;
          measurement.reset();
        }

        return null;
      }

      if (event.type === "pointermove") {
        if (
          contaminated ||
          !measurementValid ||
          event.pointerId !== trackedPointerId ||
          !activeIds.has(event.pointerId)
        ) {
          return null;
        }

        const delta = measurement.sample(event);
        return delta === null
          ? null
          : mapDisplacement(delta, threshold, event);
      }

      if (event.type === "pointerup" || event.type === "pointercancel") {
        if (!activeIds.has(event.pointerId)) {
          return null;
        }

        activeIds.delete(event.pointerId);

        if (event.type === "pointercancel") {
          contaminated = true;
          measurementValid = false;
          measurement.reset();
        }

        if (event.pointerId === trackedPointerId) {
          trackedPointerId = null;
          measurementValid = false;
          measurement.reset();

          if (activeIds.size > 0) {
            contaminated = true;
          }
        }

        if (activeIds.size === 0) {
          reset();
        }

        return null;
      }

      return null;
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        activeIds: [...activeIds],
        trackedPointerId,
        contaminated,
        measurementValid,
        aborts,
        ...measurement.snapshot(),
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

  return { target, cleanup };
}

test("PDP-H1: measurement-only policy can reintroduce stale proposal after multi-pointer contamination", () => {
  const policy = createNaiveMeasurementOnlyPolicy();
  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 1, clientY: 200 }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 180 }),
    );

    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 2, clientY: 180 }),
    );
    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", { pointerId: 2, clientY: 180 }),
    );

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 120 }),
    );

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
      "ignoring the second pointer allowed the original measurement baseline to produce a stale proposal",
    );
  } finally {
    cleanup();
  }
});

test("PDP-H1: ADR-0020 composition suppresses contaminated measurement until zero-active reset and fresh down", () => {
  const policy = createAdr20ComposedMeasuredPolicy();
  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 1, clientY: 200 }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 180 }),
    );

    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 2, clientY: 180 }),
    );

    assert.equal(policy.snapshot().contaminated, true);
    assert.equal(policy.snapshot().measurementValid, false);
    assert.equal(policy.snapshot().startProjected, null);

    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", { pointerId: 2, clientY: 180 }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 100 }),
    );

    assert.deepEqual(calls, []);
    assert.deepEqual(policy.snapshot().activeIds, [1]);
    assert.equal(policy.snapshot().contaminated, true);

    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", { pointerId: 1, clientY: 100 }),
    );

    assert.deepEqual(policy.snapshot().activeIds, []);

    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 3, clientY: 200 }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 3, clientY: 120 }),
    );

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("PDP-H2: changing projection origin can manufacture displacement from a stationary pointer", () => {
  let offset = 0;
  const project = (event) => event.clientY - offset;
  const measurement = createRawStartRelativeMeasurement(project);

  measurement.begin(pointerEvent("pointerdown", { clientY: 200 }));

  offset = 50;

  assert.equal(
    measurement.sample(pointerEvent("pointermove", { clientY: 200 })),
    50,
  );
});

test("PDP-H3: changing scale or orientation mid-sequence can distort or manufacture displacement", () => {
  let scale = 1;
  let orientation = 1;
  const project = (event) => orientation * scale * event.clientY;
  const measurement = createRawStartRelativeMeasurement(project);

  measurement.begin(pointerEvent("pointerdown", { clientY: 200 }));

  scale = 2;
  assert.equal(
    measurement.sample(pointerEvent("pointermove", { clientY: 200 })),
    -200,
  );

  scale = 1;
  orientation = -1;
  assert.equal(
    measurement.sample(pointerEvent("pointermove", { clientY: 200 })),
    400,
  );
});

test("PDP-H4: NaN and infinite baseline projections do not establish finite measurement state", () => {
  for (const nonFinite of [Number.NaN, Infinity, -Infinity]) {
    const measurement = createFiniteStartRelativeMeasurement(
      () => nonFinite,
    );

    assert.equal(
      measurement.begin(pointerEvent("pointerdown", { clientY: 200 })),
      false,
    );
    assert.equal(measurement.snapshot().startProjected, null);
    assert.equal(
      measurement.sample(pointerEvent("pointermove", { clientY: 100 })),
      null,
    );
  }
});

test("PDP-H4 boundary: non-finite baseline makes measurement unavailable without inventing ADR-0020 contamination", () => {
  const policy = createAdr20ComposedMeasuredPolicy({
    project: () => Infinity,
  });
  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 6, clientY: 200 }),
    );

    assert.deepEqual(policy.snapshot(), {
      activeIds: [6],
      trackedPointerId: 6,
      contaminated: false,
      measurementValid: false,
      aborts: 0,
      startProjected: null,
    });

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 6, clientY: 100 }),
    );

    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("PDP-H5: finite baseline followed by non-finite sample does not produce valid displacement or reach the gate", () => {
  let projected = 200;
  let gateCalls = 0;
  const project = () => projected;
  const measurement = createFiniteStartRelativeMeasurement(project);

  assert.equal(
    measurement.begin(pointerEvent("pointerdown", { clientY: 200 })),
    true,
  );

  for (const nonFinite of [Number.NaN, Infinity, -Infinity]) {
    projected = nonFinite;
    const delta = measurement.sample(
      pointerEvent("pointermove", { clientY: 100 }),
    );

    assert.equal(delta, null);

    if (delta !== null) {
      gateCalls += 1;
      researchGate(delta, 40);
    }
  }

  assert.equal(gateCalls, 0);
});

test("PDP-H4/H5 counterexample: naive arithmetic may silently decline NaN and treat infinity as directional movement", () => {
  assert.equal(researchGate(Number.NaN, 40), null);
  assert.equal(researchGate(Infinity, 40), "next");
  assert.equal(researchGate(-Infinity, 40), "previous");
});

test("PDP-H5 boundary: finite endpoints may still overflow to a non-finite displacement", () => {
  let projected = Number.MAX_VALUE;
  const measurement = createFiniteStartRelativeMeasurement(
    () => projected,
  );

  assert.equal(
    measurement.begin(pointerEvent("pointerdown", { clientY: 0 })),
    true,
  );

  projected = -Number.MAX_VALUE;

  assert.equal(
    Number.isFinite(Number.MAX_VALUE - -Number.MAX_VALUE),
    false,
  );
  assert.equal(
    measurement.sample(pointerEvent("pointermove", { clientY: 0 })),
    null,
  );
});

test("PDP-H6: displacement sign does not universally define next/previous independent of projector orientation", () => {
  const start = pointerEvent("pointerdown", { clientY: 200 });
  const current = pointerEvent("pointermove", { clientY: 120 });

  const normal = createFiniteStartRelativeMeasurement(
    (event) => event.clientY,
  );
  const inverted = createFiniteStartRelativeMeasurement(
    (event) => -event.clientY,
  );

  assert.equal(normal.begin(start), true);
  assert.equal(inverted.begin(start), true);

  const normalDelta = normal.sample(current);
  const invertedDelta = inverted.sample(current);

  assert.equal(normalDelta, 80);
  assert.equal(invertedDelta, -80);
  assert.equal(researchGate(normalDelta, 40), "next");
  assert.equal(researchGate(invertedDelta, 40), "previous");
});

test("PDP-H7: stable constant translation cancels out of start-relative displacement", () => {
  const start = pointerEvent("pointerdown", { clientY: 200 });
  const current = pointerEvent("pointermove", { clientY: 140 });

  const base = createFiniteStartRelativeMeasurement(
    (event) => event.clientY,
  );
  const translated = createFiniteStartRelativeMeasurement(
    (event) => event.clientY + 1000,
  );

  assert.equal(base.begin(start), true);
  assert.equal(translated.begin(start), true);

  assert.equal(base.sample(current), 60);
  assert.equal(translated.sample(current), 60);
});

test("PDP-H8: stable alternate scale and orientation remain deterministic in projected units", () => {
  const start = pointerEvent("pointerdown", { clientY: 200 });
  const current = pointerEvent("pointermove", { clientY: 150 });

  const scaled = createFiniteStartRelativeMeasurement(
    (event) => event.clientY * 2,
  );
  const invertedScaled = createFiniteStartRelativeMeasurement(
    (event) => -event.clientY * 2,
  );

  assert.equal(scaled.begin(start), true);
  assert.equal(invertedScaled.begin(start), true);

  assert.equal(scaled.sample(current), 100);
  assert.equal(invertedScaled.sample(current), -100);
});

test("PDP-H9: finite projection validation remains in host policy and Runtime receives only normalized intent", () => {
  let gateCalls = 0;

  const policy = createAdr20ComposedMeasuredPolicy({
    project: projectY,
    threshold: 40,
    mapDisplacement(delta, threshold) {
      assert.equal(Number.isFinite(delta), true);
      gateCalls += 1;
      return researchGate(delta, threshold);
    },
  });

  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 9, clientY: 200 }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 9, clientY: 120 }),
    );

    assert.equal(gateCalls, 1);
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

test("PDP-H9: non-finite projected sample is declined before normalized intent or Runtime request", () => {
  let currentProjection = 200;
  let gateCalls = 0;

  const policy = createAdr20ComposedMeasuredPolicy({
    project: () => currentProjection,
    mapDisplacement(delta, threshold) {
      gateCalls += 1;
      return researchGate(delta, threshold);
    },
  });

  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 10, clientY: 200 }),
    );

    currentProjection = Infinity;

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 10, clientY: 100 }),
    );

    assert.equal(gateCalls, 0);
    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("PDP-H10: pointercancel clears stored projection baseline", () => {
  const policy = createAdr20ComposedMeasuredPolicy();
  const { runtime, calls } = createRecordingRuntime();
  const { target, cleanup } = bindPolicy(policy, runtime);

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 20, clientY: 250 }),
    );

    assert.equal(policy.snapshot().startProjected, 250);

    target.dispatch(
      "pointercancel",
      pointerEvent("pointercancel", { pointerId: 20, clientY: 220 }),
    );

    assert.deepEqual(policy.snapshot(), {
      activeIds: [],
      trackedPointerId: null,
      contaminated: false,
      measurementValid: false,
      aborts: 0,
      startProjected: null,
    });

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 20, clientY: 100 }),
    );

    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("PDP-H10: application abort clears baseline and a fresh binding may establish a new stable projection convention", () => {
  let scale = 1;

  const policy = createAdr20ComposedMeasuredPolicy({
    project: (event) => event.clientY * scale,
    threshold: 40,
  });
  const { runtime, calls } = createRecordingRuntime();
  const first = bindPolicy(policy, runtime);

  first.target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", { pointerId: 30, clientY: 200 }),
  );

  assert.equal(policy.snapshot().startProjected, 200);

  first.cleanup();

  assert.deepEqual(policy.snapshot(), {
    activeIds: [],
    trackedPointerId: null,
    contaminated: false,
    measurementValid: false,
    aborts: 1,
    startProjected: null,
  });

  scale = 2;

  const second = bindPolicy(policy, runtime);

  try {
    second.target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", { pointerId: 31, clientY: 200 }),
    );
    second.target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 31, clientY: 160 }),
    );

    assert.equal(policy.snapshot().startProjected, 400);
    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    second.cleanup();
  }
});
