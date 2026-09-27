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
    clientY = 0,
  } = {},
) {
  return {
    type,
    pointerId,
    clientY,
  };
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
          "proposal timing research must not inspect Runtime snapshots",
        );
      },
    },
  };
}

function startRelativeDelta(startY, currentY) {
  if (
    !Number.isFinite(startY) ||
    !Number.isFinite(currentY)
  ) {
    return null;
  }

  const delta = startY - currentY;
  return Number.isFinite(delta) ? delta : null;
}

function strictQualifies(delta, threshold) {
  return Number.isFinite(delta) &&
    Math.abs(delta) > threshold;
}

function mapDirection(delta) {
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  return delta > 0 ? "next" : "previous";
}

/*
 * Research-only proposal-timing witness.
 *
 * Measurement, qualification, and mapping are deliberately identical between
 * the two policy classes. Only the event boundary at which an eligible
 * proposal may be emitted changes.
 *
 * This is not a complete reusable recognizer and does not implement ADR-0020
 * multi-pointer contamination, pointerType admission, velocity, direction
 * locking, or accepted-only semantic commitment.
 */
function createTimingProbePolicy({
  proposalEvent,
  threshold = 40,
}) {
  if (
    proposalEvent !== "pointermove" &&
    proposalEvent !== "pointerup"
  ) {
    throw new Error("invalid proposal event");
  }

  let trackedPointerId = null;
  let startY = null;
  let aborts = 0;
  const evaluations = [];

  function reset() {
    trackedPointerId = null;
    startY = null;
  }

  function evaluate(event) {
    const delta = startRelativeDelta(
      startY,
      event.clientY,
    );

    evaluations.push({
      eventType: event.type,
      delta,
    });

    if (
      delta === null ||
      !strictQualifies(delta, threshold)
    ) {
      return null;
    }

    return mapDirection(delta);
  }

  return {
    evaluations,

    handle(event) {
      if (
        event.type === "pointerdown" &&
        trackedPointerId === null
      ) {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
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
        const intent = proposalEvent === "pointerup"
          ? evaluate(event)
          : null;
        reset();
        return intent;
      }

      if (
        event.type === "pointermove" &&
        proposalEvent === "pointermove"
      ) {
        return evaluate(event);
      }

      return null;
    },

    abort() {
      aborts += 1;
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        startY,
        aborts,
      };
    },
  };
}

function createAcceptedMoveTimePolicy({
  threshold = 40,
} = {}) {
  let trackedPointerId = null;
  let startY = null;
  let committed = false;
  const dispositions = [];

  function reset() {
    trackedPointerId = null;
    startY = null;
    committed = false;
  }

  return {
    dispositions,

    handle(event) {
      if (
        event.type === "pointerdown" &&
        trackedPointerId === null
      ) {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
        committed = false;
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
        committed
      ) {
        return null;
      }

      const delta = startRelativeDelta(
        startY,
        event.clientY,
      );

      if (
        delta === null ||
        !strictQualifies(delta, threshold)
      ) {
        return null;
      }

      return mapDirection(delta);
    },

    onDisposition(intent, disposition) {
      dispositions.push({
        intent,
        disposition,
      });

      if (disposition === "accepted") {
        committed = true;
      }
    },

    abort() {
      reset();
    },

    snapshot() {
      return {
        trackedPointerId,
        startY,
        committed,
      };
    },
  };
}

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

function dispatchSequence(target, events) {
  for (const event of events) {
    target.dispatch(event);
  }
}

test("PTM-H1: qualifying move is observable before pointerup only under move-time policy", () => {
  const movePolicy = createTimingProbePolicy({
    proposalEvent: "pointermove",
  });
  const upPolicy = createTimingProbePolicy({
    proposalEvent: "pointerup",
  });
  const moveRuntime = createRecordingRuntime();
  const upRuntime = createRecordingRuntime();
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
    const crossedMove = pointerEvent(
      "pointermove",
      { clientY: 140 },
    );

    moveBinding.target.dispatch(down);
    upBinding.target.dispatch(down);
    moveBinding.target.dispatch(crossedMove);
    upBinding.target.dispatch(crossedMove);

    assert.deepEqual(
      moveRuntime.calls.map(({ intent }) => intent),
      ["next"],
    );
    assert.deepEqual(upRuntime.calls, []);
  } finally {
    moveBinding.cleanup();
    upBinding.cleanup();
  }
});

test("PTM-H2: identical terminal displacement, qualification, and mapping can produce the same intent under both timing classes", () => {
  const finalY = 140;

  for (const proposalEvent of [
    "pointermove",
    "pointerup",
  ]) {
    const policy = createTimingProbePolicy({
      proposalEvent,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      target.dispatch(
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
      );

      if (proposalEvent === "pointermove") {
        target.dispatch(
          pointerEvent(
            "pointermove",
            { clientY: finalY },
          ),
        );
      } else {
        target.dispatch(
          pointerEvent(
            "pointerup",
            { clientY: finalY },
          ),
        );
      }

      assert.deepEqual(
        calls.map(({ intent }) => intent),
        ["next"],
      );
      assert.equal(
        policy.evaluations[0].delta,
        60,
      );
    } finally {
      cleanup();
    }
  }
});

test("PTM-H3: pointerup-time proposal can still be Runtime-rejected", () => {
  const policy = createTimingProbePolicy({
    proposalEvent: "pointerup",
  });
  const { runtime, calls } =
    createRecordingRuntime("rejected");
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatchSequence(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
      pointerEvent(
        "pointerup",
        { clientY: 140 },
      ),
    ]);

    assert.deepEqual(calls, [
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

test("PTM-H4: rejected move-time proposal does not itself commit direction", () => {
  const policy = createTimingProbePolicy({
    proposalEvent: "pointermove",
  });
  const { runtime, calls } =
    createRecordingRuntime("rejected");
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatchSequence(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 270 },
      ),
    ]);

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
          disposition: "rejected",
        },
      ],
    );
  } finally {
    cleanup();
  }
});

test("PTM-H5: cancellation before pointerup exposes a timing difference without creating a terminal proposal", () => {
  const movePolicy = createTimingProbePolicy({
    proposalEvent: "pointermove",
  });
  const upPolicy = createTimingProbePolicy({
    proposalEvent: "pointerup",
  });
  const moveRuntime = createRecordingRuntime();
  const upRuntime = createRecordingRuntime();
  const moveBinding = bind(
    movePolicy,
    moveRuntime.runtime,
  );
  const upBinding = bind(
    upPolicy,
    upRuntime.runtime,
  );

  try {
    const events = [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
      pointerEvent(
        "pointercancel",
        { clientY: 140 },
      ),
    ];

    dispatchSequence(moveBinding.target, events);
    dispatchSequence(upBinding.target, events);

    assert.deepEqual(
      moveRuntime.calls.map(({ intent }) => intent),
      ["next"],
    );
    assert.deepEqual(upRuntime.calls, []);
    assert.deepEqual(
      upPolicy.snapshot(),
      {
        trackedPointerId: null,
        startY: null,
        aborts: 0,
      },
    );
  } finally {
    moveBinding.cleanup();
    upBinding.cleanup();
  }
});

test("PTM-H6: changing only proposal timing changes the Runtime request schedule for identical samples", () => {
  const events = [
    pointerEvent(
      "pointerdown",
      { clientY: 200 },
    ),
    pointerEvent(
      "pointermove",
      { clientY: 140 },
    ),
    pointerEvent(
      "pointermove",
      { clientY: 120 },
    ),
    pointerEvent(
      "pointerup",
      { clientY: 120 },
    ),
  ];

  const observed = {};

  for (const proposalEvent of [
    "pointermove",
    "pointerup",
  ]) {
    const policy = createTimingProbePolicy({
      proposalEvent,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatchSequence(target, events);
      observed[proposalEvent] =
        calls.map(({ intent }) => intent);
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(
    observed.pointermove,
    ["next", "next"],
  );
  assert.deepEqual(
    observed.pointerup,
    ["next"],
  );
});

test("PTM-H7: production listener remains timing-agnostic and forwards only policy-returned intent", () => {
  for (const proposalEvent of [
    "pointermove",
    "pointerup",
  ]) {
    const policy = createTimingProbePolicy({
      proposalEvent,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatchSequence(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
        pointerEvent(
          "pointerup",
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

test("PTM-H8: Runtime receives no proposal-timing or PointerEvent metadata", () => {
  for (const proposalEvent of [
    "pointermove",
    "pointerup",
  ]) {
    const policy = createTimingProbePolicy({
      proposalEvent,
    });
    const { runtime, calls } =
      createRecordingRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatchSequence(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          proposalEvent,
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
    } finally {
      cleanup();
    }
  }
});

test("PTM-H9: terminal reversal separates proposal timing from reversal commitment", () => {
  const events = [
    pointerEvent(
      "pointerdown",
      { clientY: 200 },
    ),
    pointerEvent(
      "pointermove",
      { clientY: 140 },
    ),
    pointerEvent(
      "pointerup",
      { clientY: 270 },
    ),
  ];

  const observed = {};

  for (const proposalEvent of [
    "pointermove",
    "pointerup",
  ]) {
    const policy = createTimingProbePolicy({
      proposalEvent,
    });
    const { runtime, calls } =
      createRecordingRuntime("rejected");
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatchSequence(target, events);
      observed[proposalEvent] =
        calls.map(({ intent }) => intent);
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(
    observed.pointermove,
    ["next"],
  );
  assert.deepEqual(
    observed.pointerup,
    ["previous"],
  );
});

test("PTM-H10: accepted-only move-time policy can consume an accepted sequence without requiring pointerup-only timing", () => {
  const policy =
    createAcceptedMoveTimePolicy();
  const { runtime, calls } =
    createRecordingRuntime("accepted");
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatchSequence(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 100 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 280 },
      ),
    ]);

    assert.deepEqual(calls, [
      {
        intent: "next",
        args: [],
        disposition: "accepted",
      },
    ]);
    assert.deepEqual(
      policy.dispositions,
      [
        {
          intent: "next",
          disposition: "accepted",
        },
      ],
    );
    assert.equal(
      policy.snapshot().committed,
      true,
    );
  } finally {
    cleanup();
  }
});
