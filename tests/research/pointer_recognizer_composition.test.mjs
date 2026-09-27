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

  dispatch(event) {
    for (const listener of [
      ...(this.listeners.get(event.type) ?? []),
    ]) {
      listener.call(this, event);
    }
  }
}

function pointerEvent(
  type,
  {
    pointerId = 1,
    pointerType = "touch",
    clientX = 0,
    clientY = 0,
  } = {},
) {
  return {
    type,
    pointerId,
    pointerType,
    clientX,
    clientY,
  };
}

function createRecordingRuntime({
  dispositions = ["accepted"],
} = {}) {
  const calls = [];
  let requestIndex = 0;

  function nextDisposition() {
    const index = Math.min(
      requestIndex,
      dispositions.length - 1,
    );
    requestIndex += 1;
    return dispositions[index];
  }

  function record(intent, args) {
    const disposition = nextDisposition();
    calls.push({
      intent,
      args,
      disposition,
    });
    return disposition;
  }

  return {
    calls,
    runtime: {
      next(...args) {
        return record("next", args);
      },

      previous(...args) {
        return record("previous", args);
      },

      getSnapshot() {
        throw new Error(
          "recognizer composition research must not inspect Runtime snapshots",
        );
      },
    },
  };
}

/*
 * Research-only composition witness.
 *
 * The shape is intentionally local to this test. It is not a proposed public
 * constructor/configuration API. Every deferred host choice needed by the
 * witness is supplied explicitly so the test can ask whether those choices
 * must be standardized before reusable composition is possible.
 */
function createComposedPolicy({
  participates,
  project,
  qualifies,
  map,
  shouldPropose,
}) {
  const activeIds = new Set();
  const dispositions = [];

  let trackedPointerId = null;
  let invalid = false;
  let baseline = null;
  let committed = false;
  let aborts = 0;

  function reset() {
    activeIds.clear();
    trackedPointerId = null;
    invalid = false;
    baseline = null;
    committed = false;
  }

  function invalidate() {
    invalid = true;
    baseline = null;
  }

  function evaluate(event) {
    if (
      invalid ||
      committed ||
      event.pointerId !== trackedPointerId
    ) {
      return null;
    }

    const current = project(event);

    if (
      !Number.isFinite(baseline) ||
      !Number.isFinite(current)
    ) {
      return null;
    }

    const delta = baseline - current;

    if (
      !Number.isFinite(delta) ||
      !qualifies(delta)
    ) {
      return null;
    }

    return map(delta);
  }

  return {
    dispositions,

    handle(event) {
      if (event.type === "pointerdown") {
        if (!participates(event)) {
          return null;
        }

        if (activeIds.has(event.pointerId)) {
          invalidate();
          return null;
        }

        const startsFreshSequence =
          activeIds.size === 0;

        activeIds.add(event.pointerId);

        if (
          startsFreshSequence &&
          trackedPointerId === null &&
          !invalid
        ) {
          const projected = project(event);

          if (!Number.isFinite(projected)) {
            invalidate();
            return null;
          }

          trackedPointerId = event.pointerId;
          baseline = projected;
          committed = false;
        } else {
          invalidate();
        }

        return null;
      }

      if (!activeIds.has(event.pointerId)) {
        return null;
      }

      if (event.type === "pointercancel") {
        activeIds.delete(event.pointerId);
        invalidate();

        if (event.pointerId === trackedPointerId) {
          trackedPointerId = null;
        }

        if (activeIds.size === 0) {
          reset();
        }

        return null;
      }

      if (event.type === "pointermove") {
        if (!shouldPropose(event)) {
          return null;
        }

        return evaluate(event);
      }

      if (event.type === "pointerup") {
        const intent = shouldPropose(event)
          ? evaluate(event)
          : null;

        activeIds.delete(event.pointerId);

        if (activeIds.size === 0) {
          reset();
        } else if (
          event.pointerId === trackedPointerId
        ) {
          trackedPointerId = null;
          invalidate();
        }

        return intent;
      }

      return null;
    },

    onDisposition(intent, disposition) {
      dispositions.push({
        intent,
        disposition,
      });

      if (
        disposition === "accepted" &&
        activeIds.size > 0 &&
        trackedPointerId !== null &&
        !invalid
      ) {
        committed = true;
      }
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        activeIds: [...activeIds],
        trackedPointerId,
        invalid,
        baseline,
        committed,
        aborts,
      };
    },
  };
}

function strictMagnitude(threshold) {
  return (delta) =>
    Number.isFinite(delta) &&
    Math.abs(delta) > threshold;
}

function positiveNext(delta) {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  return delta > 0 ? "next" : "previous";
}

function positivePrevious(delta) {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  return delta > 0 ? "previous" : "next";
}

const moveTime = (event) =>
  event.type === "pointermove";

const pointerupTime = (event) =>
  event.type === "pointerup";

const admitAll = () => true;
const projectY = (event) => event.clientY;
const invertY = (event) => -event.clientY;

function bind(policy, runtime) {
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

function dispatch(target, events) {
  for (const event of events) {
    target.dispatch(event);
  }
}

test("PRC-H1/H2: composed host policy uses production listener and Runtime receives only normalized requests", () => {
  const policy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const { runtime, calls } =
    createRecordingRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
    ]);

    assert.deepEqual(calls, [
      {
        intent: "next",
        args: [],
        disposition: "accepted",
      },
    ]);
    assert.equal(
      policy.snapshot().committed,
      true,
    );
  } finally {
    cleanup();
  }
});

test("PRC-H3/H5: projector and mapper can vary together without changing listener or Runtime shape", () => {
  const cases = [
    {
      project: projectY,
      map: positiveNext,
    },
    {
      project: invertY,
      map: positivePrevious,
    },
  ];

  for (const candidate of cases) {
    const policy = createComposedPolicy({
      participates: admitAll,
      project: candidate.project,
      qualifies: strictMagnitude(40),
      map: candidate.map,
      shouldPropose: moveTime,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
      ]);

      assert.deepEqual(
        calls.map(({ intent }) => intent),
        ["next"],
      );
    } finally {
      cleanup();
    }
  }
});

test("PRC-H3: independent scalar projectors reuse the same composition machinery", () => {
  const candidates = [
    {
      project: (event) => event.clientY,
      down: pointerEvent(
        "pointerdown",
        {
          clientX: 200,
          clientY: 200,
        },
      ),
      move: pointerEvent(
        "pointermove",
        {
          clientX: 200,
          clientY: 140,
        },
      ),
    },
    {
      project: (event) => event.clientX,
      down: pointerEvent(
        "pointerdown",
        {
          clientX: 200,
          clientY: 200,
        },
      ),
      move: pointerEvent(
        "pointermove",
        {
          clientX: 140,
          clientY: 200,
        },
      ),
    },
  ];

  for (const candidate of candidates) {
    const policy = createComposedPolicy({
      participates: admitAll,
      project: candidate.project,
      qualifies: strictMagnitude(40),
      map: positiveNext,
      shouldPropose: moveTime,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        candidate.down,
        candidate.move,
      ]);

      assert.deepEqual(
        calls.map(({ intent }) => intent),
        ["next"],
      );
    } finally {
      cleanup();
    }
  }
});

test("PRC-H4: qualification policy can change without changing recognizer composition", () => {
  const observed = [];

  for (const threshold of [40, 80]) {
    const policy = createComposedPolicy({
      participates: admitAll,
      project: projectY,
      qualifies: strictMagnitude(threshold),
      map: positiveNext,
      shouldPropose: moveTime,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
      ]);

      observed.push(
        calls.map(({ intent }) => intent),
      );
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(observed, [
    ["next"],
    [],
  ]);
});

test("PRC-H5: mapping policy can change without changing recognizer composition", () => {
  const observed = [];

  for (const map of [
    positiveNext,
    positivePrevious,
  ]) {
    const policy = createComposedPolicy({
      participates: admitAll,
      project: projectY,
      qualifies: strictMagnitude(40),
      map,
      shouldPropose: moveTime,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
      ]);

      observed.push(
        calls.map(({ intent }) => intent),
      );
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(observed, [
    ["next"],
    ["previous"],
  ]);
});

test("PRC-H6: move-time and pointerup-time reuse the same composition machinery", () => {
  const movePolicy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const upPolicy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: pointerupTime,
  });
  const moveRuntime = createRecordingRuntime({
    dispositions: ["rejected"],
  });
  const upRuntime = createRecordingRuntime({
    dispositions: ["rejected"],
  });
  const moveBinding = bind(
    movePolicy,
    moveRuntime.runtime,
  );
  const upBinding = bind(
    upPolicy,
    upRuntime.runtime,
  );

  try {
    const down = pointerEvent(
      "pointerdown",
      { clientY: 200 },
    );
    const crossed = pointerEvent(
      "pointermove",
      { clientY: 140 },
    );
    const up = pointerEvent(
      "pointerup",
      { clientY: 140 },
    );

    moveBinding.target.dispatch(down);
    upBinding.target.dispatch(down);
    moveBinding.target.dispatch(crossed);
    upBinding.target.dispatch(crossed);

    assert.deepEqual(
      moveRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
    assert.deepEqual(upRuntime.calls, []);

    moveBinding.target.dispatch(up);
    upBinding.target.dispatch(up);

    assert.deepEqual(
      moveRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
    assert.deepEqual(
      upRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
  } finally {
    moveBinding.cleanup();
    upBinding.cleanup();
  }
});

test("PRC-H7/H8/H9: disposition-only feedback supports reject-reverse-accept then consumes the accepted sequence", () => {
  const policy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const { runtime, calls } =
    createRecordingRuntime({
      dispositions: [
        "rejected",
        "accepted",
        "accepted",
      ],
    });
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
    ]);

    assert.equal(
      policy.snapshot().committed,
      false,
    );

    target.dispatch(
      pointerEvent(
        "pointermove",
        { clientY: 270 },
      ),
    );

    assert.equal(
      policy.snapshot().committed,
      true,
    );

    target.dispatch(
      pointerEvent(
        "pointermove",
        { clientY: 100 },
      ),
    );

    assert.deepEqual(
      calls.map(
        ({ intent, disposition }) => ({
          intent,
          disposition,
        }),
      ),
      [
        {
          intent: "next",
          disposition: "rejected",
        },
        {
          intent: "previous",
          disposition: "accepted",
        },
      ],
    );
    assert.deepEqual(
      policy.dispositions,
      [
        {
          intent: "next",
          disposition: "rejected",
        },
        {
          intent: "previous",
          disposition: "accepted",
        },
      ],
    );
  } finally {
    cleanup();
  }
});

test("PRC-H10: second admitted pointer contaminates the composed sequence until membership returns to zero", () => {
  const policy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const { runtime, calls } =
    createRecordingRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 1,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointerdown",
        {
          pointerId: 2,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 1,
          clientY: 100,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 2,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 1,
          clientY: 80,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 1,
          clientY: 80,
        },
      ),
    ]);

    assert.deepEqual(calls, []);
    assert.deepEqual(
      policy.snapshot().activeIds,
      [],
    );
    assert.equal(
      policy.snapshot().invalid,
      false,
    );

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 3,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 3,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("PRC-H11: pointercancel resets a completed participating set and permits only a fresh pointerdown restart", () => {
  const policy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const { runtime, calls } =
    createRecordingRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 1,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointercancel",
        {
          pointerId: 1,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 1,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(calls, []);
    assert.deepEqual(
      policy.snapshot().activeIds,
      [],
    );

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 2,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 2,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("PRC-H11: listener cleanup aborts composed host state without a semantic request", () => {
  const policy = createComposedPolicy({
    participates: admitAll,
    project: projectY,
    qualifies: strictMagnitude(40),
    map: positiveNext,
    shouldPropose: moveTime,
  });
  const { runtime, calls } =
    createRecordingRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  target.dispatch(
    pointerEvent(
      "pointerdown",
      {
        pointerId: 9,
        clientY: 200,
      },
    ),
  );

  assert.deepEqual(
    policy.snapshot().activeIds,
    [9],
  );

  cleanup();

  assert.deepEqual(calls, []);
  assert.deepEqual(
    policy.snapshot(),
    {
      activeIds: [],
      trackedPointerId: null,
      invalid: false,
      baseline: null,
      committed: false,
      aborts: 1,
    },
  );
});

test("PRC-H12: pointerType admission remains an explicit caller-owned collaborator", () => {
  const cases = [
    {
      participates: (event) =>
        event.pointerType === "touch",
      pointerType: "touch",
    },
    {
      participates: (event) =>
        event.pointerType === "mouse",
      pointerType: "mouse",
    },
  ];

  for (const candidate of cases) {
    const policy = createComposedPolicy({
      participates: candidate.participates,
      project: projectY,
      qualifies: strictMagnitude(40),
      map: positiveNext,
      shouldPropose: moveTime,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          {
            pointerId: 1,
            pointerType: "pen",
            clientY: 200,
          },
        ),
        pointerEvent(
          "pointermove",
          {
            pointerId: 1,
            pointerType: "pen",
            clientY: 100,
          },
        ),
        pointerEvent(
          "pointerup",
          {
            pointerId: 1,
            pointerType: "pen",
            clientY: 100,
          },
        ),
      ]);

      assert.deepEqual(calls, []);

      dispatch(target, [
        pointerEvent(
          "pointerdown",
          {
            pointerId: 2,
            pointerType:
              candidate.pointerType,
            clientY: 200,
          },
        ),
        pointerEvent(
          "pointermove",
          {
            pointerId: 2,
            pointerType:
              candidate.pointerType,
            clientY: 100,
          },
        ),
      ]);

      assert.deepEqual(
        calls.map(({ intent }) => intent),
        ["next"],
      );
    } finally {
      cleanup();
    }
  }
});
