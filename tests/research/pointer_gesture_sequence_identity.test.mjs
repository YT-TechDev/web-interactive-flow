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
    pointerType = "touch",
    isPrimary = true,
    clientY = 200,
  } = {},
) {
  return {
    type,
    pointerId,
    pointerType,
    isPrimary,
    clientY,
  };
}

function createRecordingRuntime({ disposition = "accepted" } = {}) {
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
        throw new Error("gesture sequence policy must not inspect Runtime snapshots");
      },
    },
  };
}

function createPrimaryOnlyPolicy() {
  let trackedPointerId = null;
  let candidate = false;

  function reset() {
    trackedPointerId = null;
    candidate = false;
  }

  return {
    handle(event) {
      if (!event.isPrimary) {
        return null;
      }

      if (event.type === "pointerdown" && trackedPointerId === null) {
        trackedPointerId = event.pointerId;
        candidate = false;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === trackedPointerId
      ) {
        candidate = true;
        return null;
      }

      if (
        event.type === "pointerup" &&
        event.pointerId === trackedPointerId
      ) {
        const shouldEmit = candidate;
        reset();
        return shouldEmit ? "next" : null;
      }

      if (
        event.type === "pointercancel" &&
        event.pointerId === trackedPointerId
      ) {
        reset();
      }

      return null;
    },

    abort() {
      reset();
    },

    snapshot() {
      return { trackedPointerId, candidate };
    },
  };
}

function createFirstPointerOnlyPolicy() {
  let trackedPointerId = null;
  let candidate = false;

  function reset() {
    trackedPointerId = null;
    candidate = false;
  }

  return {
    handle(event) {
      if (event.type === "pointerdown" && trackedPointerId === null) {
        trackedPointerId = event.pointerId;
        candidate = false;
        return null;
      }

      if (event.pointerId !== trackedPointerId) {
        return null;
      }

      if (event.type === "pointermove") {
        candidate = true;
        return null;
      }

      if (event.type === "pointerup") {
        const shouldEmit = candidate;
        reset();
        return shouldEmit ? "next" : null;
      }

      if (event.type === "pointercancel") {
        reset();
      }

      return null;
    },

    abort() {
      reset();
    },
  };
}

function createStickySequencePolicy({
  participates = () => true,
} = {}) {
  const activeIds = new Set();
  let trackedPointerId = null;
  let invalid = false;
  let candidate = false;
  let aborts = 0;

  function reset() {
    activeIds.clear();
    trackedPointerId = null;
    invalid = false;
    candidate = false;
  }

  function snapshot() {
    return {
      activeIds: [...activeIds],
      trackedPointerId,
      invalid,
      candidate,
      aborts,
    };
  }

  return {
    handle(event) {
      if (!participates(event)) {
        return null;
      }

      if (event.type === "pointerdown") {
        if (activeIds.has(event.pointerId)) {
          invalid = true;
          return null;
        }

        const startsFreshSequence = activeIds.size === 0;
        activeIds.add(event.pointerId);

        if (startsFreshSequence && trackedPointerId === null && !invalid) {
          trackedPointerId = event.pointerId;
          candidate = false;
        } else {
          invalid = true;
        }

        return null;
      }

      if (event.type === "pointermove") {
        if (
          activeIds.has(event.pointerId) &&
          event.pointerId === trackedPointerId &&
          !invalid
        ) {
          candidate = true;
        }

        return null;
      }

      if (event.type === "pointerup") {
        if (!activeIds.has(event.pointerId)) {
          return null;
        }

        const shouldEmit =
          event.pointerId === trackedPointerId &&
          !invalid &&
          candidate;

        activeIds.delete(event.pointerId);

        if (activeIds.size === 0) {
          reset();
        } else if (event.pointerId === trackedPointerId) {
          trackedPointerId = null;
          invalid = true;
          candidate = false;
        }

        return shouldEmit ? "next" : null;
      }

      if (event.type === "pointercancel") {
        if (!activeIds.has(event.pointerId)) {
          return null;
        }

        activeIds.delete(event.pointerId);
        invalid = true;

        if (event.pointerId === trackedPointerId) {
          trackedPointerId = null;
          candidate = false;
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

    snapshot,
  };
}

function createAcceptedCommitSequencePolicy() {
  const activeIds = new Set();
  let trackedPointerId = null;
  let invalid = false;
  let committed = false;
  let proposed = false;
  const dispositions = [];

  function reset() {
    activeIds.clear();
    trackedPointerId = null;
    invalid = false;
    committed = false;
    proposed = false;
  }

  return {
    dispositions,

    handle(event) {
      if (event.type === "pointerdown") {
        if (activeIds.has(event.pointerId)) {
          invalid = true;
          return null;
        }

        const startsFreshSequence = activeIds.size === 0;
        activeIds.add(event.pointerId);

        if (startsFreshSequence && trackedPointerId === null && !invalid) {
          trackedPointerId = event.pointerId;
          committed = false;
          proposed = false;
        } else {
          invalid = true;
        }

        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === trackedPointerId &&
        activeIds.has(event.pointerId) &&
        !invalid &&
        !committed &&
        !proposed
      ) {
        proposed = true;
        return "next";
      }

      if (event.type === "pointerup" || event.type === "pointercancel") {
        if (!activeIds.has(event.pointerId)) {
          return null;
        }

        activeIds.delete(event.pointerId);

        if (event.type === "pointercancel") {
          invalid = true;
        }

        if (event.pointerId === trackedPointerId) {
          trackedPointerId = null;
        }

        if (activeIds.size === 0) {
          reset();
        }

        return null;
      }

      return null;
    },

    onDisposition(intent, disposition) {
      dispositions.push({ intent, disposition });

      if (disposition === "accepted") {
        committed = true;
      }

      proposed = false;
    },

    abort() {
      reset();
    },

    snapshot() {
      return {
        activeIds: [...activeIds],
        trackedPointerId,
        invalid,
        committed,
        proposed,
      };
    },
  };
}

function bind({ policy, runtime }) {
  const target = new RecordingTarget();
  const cleanup = bindPointerNavigation({ target, runtime, policy });
  return { target, cleanup };
}

test("PGI-H1: isPrimary does not prove that only one pointer participates", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = createRecordingRuntime();
  const policy = createPrimaryOnlyPolicy();
  const cleanup = bindPointerNavigation({ target, runtime, policy });

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 1,
        isPrimary: true,
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 1,
        isPrimary: true,
        clientY: 120,
      }),
    );

    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 2,
        isPrimary: false,
      }),
    );
    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 2,
        isPrimary: false,
      }),
    );

    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 1,
        isPrimary: true,
        clientY: 120,
      }),
    );

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
      "primary-only filtering failed to notice simultaneous non-primary participation",
    );
  } finally {
    cleanup();
  }
});

test("PGI-H2: ignoring every pointer except the first permits stale commit after contamination", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createFirstPointerOnlyPolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 10 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 10, clientY: 100 }),
    );

    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 11 }));
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 11 }));

    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", { pointerId: 10, clientY: 100 }),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].intent, "next");
  } finally {
    cleanup();
  }
});

test("PGI-H3/H4: sticky invalidation does not revive when two active pointers drop back to one", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 150 }),
    );
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));

    assert.deepEqual(policy.snapshot().activeIds, [1, 2]);
    assert.equal(policy.snapshot().invalid, true);

    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 2 }));

    assert.deepEqual(policy.snapshot().activeIds, [1]);
    assert.equal(policy.snapshot().invalid, true);

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 80 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 1 }));

    assert.deepEqual(calls, []);
    assert.deepEqual(policy.snapshot().activeIds, []);
    assert.equal(policy.snapshot().invalid, false);
  } finally {
    cleanup();
  }
});

test("PGI-H4/B: a fresh pointerdown is eligible only after contaminated membership returns to zero", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 1 }));
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 2 }));

    assert.deepEqual(calls, []);
    assert.deepEqual(policy.snapshot().activeIds, []);

    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 3 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 3, clientY: 90 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 3 }));

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("PGI-H5: canceling the tracked pointer does not silently promote a still-down remainder", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));

    target.dispatch(
      "pointercancel",
      pointerEvent("pointercancel", { pointerId: 1 }),
    );

    assert.deepEqual(policy.snapshot().activeIds, [2]);
    assert.equal(policy.snapshot().trackedPointerId, null);
    assert.equal(policy.snapshot().invalid, true);

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 2, clientY: 50 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 2 }));

    assert.deepEqual(calls, []);

    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 3 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 3, clientY: 50 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 3 }));

    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});

test("PGI-H6: pointerId reuse after full reset begins fresh state", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    for (let sequence = 0; sequence < 2; sequence += 1) {
      target.dispatch(
        "pointerdown",
        pointerEvent("pointerdown", { pointerId: 7 }),
      );
      target.dispatch(
        "pointermove",
        pointerEvent("pointermove", { pointerId: 7, clientY: 100 }),
      );
      target.dispatch(
        "pointerup",
        pointerEvent("pointerup", { pointerId: 7 }),
      );

      assert.deepEqual(policy.snapshot().activeIds, []);
      assert.equal(policy.snapshot().trackedPointerId, null);
      assert.equal(policy.snapshot().invalid, false);
    }

    assert.equal(calls.length, 2);
  } finally {
    cleanup();
  }
});

test("PGI-H7: terminal events from the non-tracked participating pointer are required for zero-active reset", () => {
  const { runtime } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));

    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 1 }));

    assert.deepEqual(policy.snapshot().activeIds, [2]);
    assert.equal(policy.snapshot().invalid, true);

    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 2 }));

    assert.deepEqual(policy.snapshot(), {
      activeIds: [],
      trackedPointerId: null,
      invalid: false,
      candidate: false,
      aborts: 0,
    });
  } finally {
    cleanup();
  }
});

test("PGI-H8: pointerType admission can remain an injected host-policy choice", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy({
    participates: (event) => event.pointerType === "touch",
  });
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 50,
        pointerType: "mouse",
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 50,
        pointerType: "mouse",
        clientY: 100,
      }),
    );
    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 50,
        pointerType: "mouse",
      }),
    );

    assert.deepEqual(policy.snapshot().activeIds, []);
    assert.deepEqual(calls, []);

    target.dispatch(
      "pointerdown",
      pointerEvent("pointerdown", {
        pointerId: 51,
        pointerType: "touch",
      }),
    );
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", {
        pointerId: 51,
        pointerType: "touch",
        clientY: 100,
      }),
    );
    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 51,
        pointerType: "touch",
      }),
    );

    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});

test("PGI-H9: sequence identity does not require explicit pointer capture APIs", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const target = new RecordingTarget();

  assert.equal("setPointerCapture" in target, false);
  assert.equal("releasePointerCapture" in target, false);

  const cleanup = bindPointerNavigation({ target, runtime, policy });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 100 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 1 }));

    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});

test("PGI-H10: semantic accepted commitment and host pointer membership remain separate state", () => {
  const { runtime, calls } = createRecordingRuntime({
    disposition: "accepted",
  });
  const policy = createAcceptedCommitSequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 100 }),
    );

    assert.equal(calls.length, 1);
    assert.equal(policy.snapshot().committed, true);
    assert.deepEqual(policy.snapshot().activeIds, [1]);

    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));

    assert.equal(policy.snapshot().committed, true);
    assert.equal(policy.snapshot().invalid, true);
    assert.deepEqual(policy.snapshot().activeIds, [1, 2]);

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 50 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 2 }));
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 1 }));

    assert.equal(calls.length, 1);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "accepted" },
    ]);
  } finally {
    cleanup();
  }
});

test("PGI-H10b: rejected disposition does not commit and permits a later proposal", () => {
  const { runtime, calls } = createRecordingRuntime({
    disposition: "rejected",
  });
  const policy = createAcceptedCommitSequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 100 }),
    );

    assert.equal(calls.length, 1);
    assert.equal(policy.snapshot().committed, false);
    assert.equal(policy.snapshot().proposed, false);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "rejected" },
    ]);
    assert.deepEqual(policy.snapshot().activeIds, [1]);

    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 1, clientY: 50 }),
    );

    assert.equal(calls.length, 2);
    assert.equal(policy.snapshot().committed, false);
    assert.equal(policy.snapshot().proposed, false);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "rejected" },
      { intent: "next", disposition: "rejected" },
    ]);
    assert.deepEqual(policy.snapshot().activeIds, [1]);
  } finally {
    cleanup();
  }
});

test("PGI-H11: application abort clears all reusable sequence state", () => {
  const { runtime } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 1 }));
  target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 2 }));

  assert.equal(policy.snapshot().invalid, true);
  assert.deepEqual(policy.snapshot().activeIds, [1, 2]);

  cleanup();

  assert.deepEqual(policy.snapshot(), {
    activeIds: [],
    trackedPointerId: null,
    invalid: false,
    candidate: false,
    aborts: 1,
  });
});

test("PGI-H12: malformed pre-sequence terminal/move events do not invent state", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    for (const type of ["pointermove", "pointerup", "pointercancel"]) {
      target.dispatch(type, pointerEvent(type, { pointerId: 91 }));
      assert.deepEqual(policy.snapshot().activeIds, []);
      assert.equal(policy.snapshot().trackedPointerId, null);
      assert.equal(policy.snapshot().invalid, false);
    }

    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 5 }));
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 5 }));

    assert.equal(policy.snapshot().invalid, true);

    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 5 }));

    assert.deepEqual(policy.snapshot().activeIds, []);
    assert.equal(policy.snapshot().invalid, false);
    assert.deepEqual(calls, []);

    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 5 }));
    assert.deepEqual(policy.snapshot().activeIds, []);
  } finally {
    cleanup();
  }
});

test("PGI boundary: Runtime receives no pointer identity or gesture object and no snapshot read is required", () => {
  const { runtime, calls } = createRecordingRuntime();
  const policy = createStickySequencePolicy();
  const { target, cleanup } = bind({ policy, runtime });

  try {
    target.dispatch("pointerdown", pointerEvent("pointerdown", { pointerId: 44 }));
    target.dispatch(
      "pointermove",
      pointerEvent("pointermove", { pointerId: 44, clientY: 20 }),
    );
    target.dispatch("pointerup", pointerEvent("pointerup", { pointerId: 44 }));

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, []);
  } finally {
    cleanup();
  }
});
