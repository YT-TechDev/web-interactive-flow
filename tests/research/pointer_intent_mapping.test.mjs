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
  } = {},
) {
  return {
    type,
    pointerId,
    clientX,
    clientY,
  };
}

function projectX(event) {
  return event.clientX;
}

function projectY(event) {
  return event.clientY;
}

function invertProjection(project) {
  return (event) => -project(event);
}

function startRelativeDelta(startEvent, currentEvent, project) {
  const startProjected = project(startEvent);
  const currentProjected = project(currentEvent);
  const delta = startProjected - currentProjected;

  return Number.isFinite(delta) ? delta : null;
}

function createSignMapper({
  positiveIntent,
  negativeIntent,
}) {
  return (delta) => {
    if (!Number.isFinite(delta) || delta === 0) {
      return null;
    }

    return delta > 0
      ? positiveIntent
      : negativeIntent;
  };
}

function strictMagnitudeQualifier(delta, threshold) {
  return Number.isFinite(delta) &&
    Math.abs(delta) > threshold;
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
          "pointer intent mapping research must not inspect Runtime snapshots",
        );
      },
    },
  };
}

/*
 * Research-only composition witness.
 *
 * Projection, qualification, and sign mapping are all mandatory inputs.
 * This helper intentionally supplies no axis, threshold, comparator, or
 * positive/negative intent default.
 *
 * It is not a complete reusable single-pointer recognizer.
 */
function createMappingProbePolicy({
  project,
  qualifies,
  mapDirection,
  onMap = () => {},
}) {
  let trackedPointerId = null;
  let startEvent = null;
  let aborts = 0;

  function reset() {
    trackedPointerId = null;
    startEvent = null;
  }

  return {
    handle(event) {
      if (
        event.type === "pointerdown" &&
        trackedPointerId === null
      ) {
        trackedPointerId = event.pointerId;
        startEvent = event;
        return null;
      }

      if (event.pointerId !== trackedPointerId) {
        return null;
      }

      if (
        event.type === "pointerup" ||
        event.type === "pointercancel"
      ) {
        reset();
        return null;
      }

      if (
        event.type !== "pointermove" ||
        startEvent === null
      ) {
        return null;
      }

      const delta = startRelativeDelta(
        startEvent,
        event,
        project,
      );

      if (
        delta === null ||
        !qualifies(delta)
      ) {
        return null;
      }

      onMap(delta);
      return mapDirection(delta);
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        startEvent,
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

test("PIM-H1: unchanged sign mapping reverses proposal under opposite projector orientation", () => {
  const start = pointerEvent("pointerdown", {
    clientY: 200,
  });
  const current = pointerEvent("pointermove", {
    clientY: 140,
  });
  const invertedY = invertProjection(projectY);
  const mapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });

  const normalDelta = startRelativeDelta(
    start,
    current,
    projectY,
  );
  const invertedDelta = startRelativeDelta(
    start,
    current,
    invertedY,
  );

  assert.equal(normalDelta, 60);
  assert.equal(invertedDelta, -60);
  assert.equal(mapper(normalDelta), "next");
  assert.equal(mapper(invertedDelta), "previous");
});

test("PIM-H2: jointly inverting projector and sign mapping preserves tested normalized intent", () => {
  const start = pointerEvent("pointerdown", {
    clientY: 200,
  });
  const movements = [
    pointerEvent("pointermove", { clientY: 140 }),
    pointerEvent("pointermove", { clientY: 270 }),
  ];

  const normalMapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });
  const invertedMapper = createSignMapper({
    positiveIntent: "previous",
    negativeIntent: "next",
  });
  const invertedY = invertProjection(projectY);

  for (const current of movements) {
    const normalDelta = startRelativeDelta(
      start,
      current,
      projectY,
    );
    const invertedDelta = startRelativeDelta(
      start,
      current,
      invertedY,
    );

    assert.equal(
      normalMapper(normalDelta),
      invertedMapper(invertedDelta),
    );
  }
});

test("PIM-H3: one measured displacement can feed independent sign mappers", () => {
  const delta = 60;
  const normalMapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });
  const invertedMapper = createSignMapper({
    positiveIntent: "previous",
    negativeIntent: "next",
  });

  assert.equal(normalMapper(delta), "next");
  assert.equal(invertedMapper(delta), "previous");
  assert.equal(delta, 60);
});

test("PIM-H4: threshold miss bypasses mapping while qualified displacement can map independently", () => {
  let mapCalls = 0;
  const mapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });
  const mapQualified = (delta, threshold) => {
    if (!strictMagnitudeQualifier(delta, threshold)) {
      return null;
    }

    mapCalls += 1;
    return mapper(delta);
  };

  assert.equal(mapQualified(30, 40), null);
  assert.equal(mapCalls, 0);

  assert.equal(mapQualified(60, 40), "next");
  assert.equal(mapQualified(60, 50), "next");
  assert.equal(mapCalls, 2);
});

test("PIM-H5: zero is explicit and never falls through to one sign branch", () => {
  const normalMapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });
  const invertedMapper = createSignMapper({
    positiveIntent: "previous",
    negativeIntent: "next",
  });

  assert.equal(normalMapper(0), null);
  assert.equal(invertedMapper(0), null);
});

test("PIM-H6: changing only mapping changes proposal for unchanged qualified displacement", () => {
  const delta = 60;
  const mapperA = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });
  const mapperB = createSignMapper({
    positiveIntent: "previous",
    negativeIntent: "next",
  });

  assert.equal(
    strictMagnitudeQualifier(delta, 40),
    true,
  );
  assert.equal(mapperA(delta), "next");
  assert.equal(mapperB(delta), "previous");
});

test("PIM-H7: displacement reversal changes current mapped proposal without mapping-level commitment", () => {
  const mapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });

  assert.equal(mapper(60), "next");
  assert.equal(mapper(-70), "previous");
  assert.equal(mapper(60), "next");
});

test("PIM-H8: the same mapped intent is forwarded without Runtime snapshot prediction", () => {
  const policy = createMappingProbePolicy({
    project: projectY,
    qualifies: (delta) =>
      strictMagnitudeQualifier(delta, 40),
    mapDirection: createSignMapper({
      positiveIntent: "next",
      negativeIntent: "previous",
    }),
  });

  for (const disposition of [
    "accepted",
    "rejected",
  ]) {
    const { runtime, calls } =
      createRecordingRuntime(disposition);
    const { target, cleanup } =
      bindPolicy(policy, runtime);

    try {
      target.dispatch(
        "pointerdown",
        pointerEvent("pointerdown", {
          pointerId: 8,
          clientY: 200,
        }),
      );
      target.dispatch(
        "pointermove",
        pointerEvent("pointermove", {
          pointerId: 8,
          clientY: 140,
        }),
      );

      assert.deepEqual(calls, [
        {
          intent: "next",
          args: [],
          disposition,
        },
      ]);
    } finally {
      cleanup();
    }
  }
});

test("PIM-H9: production listener receives only the normalized intent selected by host mapping", () => {
  const mappingInputs = [];
  const policy = createMappingProbePolicy({
    project: projectY,
    qualifies: (delta) =>
      strictMagnitudeQualifier(delta, 40),
    mapDirection: createSignMapper({
      positiveIntent: "previous",
      negativeIntent: "next",
    }),
    onMap(delta) {
      mappingInputs.push(delta);
    },
  });
  const { runtime, calls } =
    createRecordingRuntime("accepted");
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
        clientY: 140,
      }),
    );

    assert.deepEqual(mappingInputs, [60]);
    assert.deepEqual(calls, [
      {
        intent: "previous",
        args: [],
        disposition: "accepted",
      },
    ]);
  } finally {
    cleanup();
  }
});

test("PIM-H10: Runtime receives no sign, displacement, mapper, axis, or threshold arguments", () => {
  const policy = createMappingProbePolicy({
    project: projectY,
    qualifies: (delta) =>
      strictMagnitudeQualifier(delta, 40),
    mapDirection: createSignMapper({
      positiveIntent: "next",
      negativeIntent: "previous",
    }),
  });
  const { runtime, calls } =
    createRecordingRuntime("accepted");
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

test("PIM-H11: partial mappers falsify universal total or symmetric mapping", () => {
  const positiveOnly = createSignMapper({
    positiveIntent: "next",
    negativeIntent: null,
  });
  const negativeOnly = createSignMapper({
    positiveIntent: null,
    negativeIntent: "previous",
  });

  assert.equal(positiveOnly(60), "next");
  assert.equal(positiveOnly(-60), null);
  assert.equal(negativeOnly(60), null);
  assert.equal(negativeOnly(-60), "previous");
});

test("PIM-H12: equivalent scalar deltas from X-like and Y-like projectors use the same mapper without axis identity", () => {
  const mapper = createSignMapper({
    positiveIntent: "next",
    negativeIntent: "previous",
  });

  const xStart = pointerEvent("pointerdown", {
    clientX: 300,
    clientY: 900,
  });
  const xCurrent = pointerEvent("pointermove", {
    clientX: 240,
    clientY: 900,
  });

  const yStart = pointerEvent("pointerdown", {
    clientX: 900,
    clientY: 300,
  });
  const yCurrent = pointerEvent("pointermove", {
    clientX: 900,
    clientY: 240,
  });

  const xDelta = startRelativeDelta(
    xStart,
    xCurrent,
    projectX,
  );
  const yDelta = startRelativeDelta(
    yStart,
    yCurrent,
    projectY,
  );

  assert.equal(xDelta, 60);
  assert.equal(yDelta, 60);
  assert.equal(mapper(xDelta), "next");
  assert.equal(mapper(yDelta), "next");
});
