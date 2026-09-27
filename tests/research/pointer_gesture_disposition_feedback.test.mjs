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
    clientY = 200,
  } = {},
) {
  return {
    type,
    pointerId,
    pointerType,
    clientY,
  };
}

function createPhaseRuntime({ initial = "A" } = {}) {
  const phases = ["A", "B", "C"];
  let index = phases.indexOf(initial);
  const calls = [];

  if (index === -1) {
    throw new Error("invalid initial phase");
  }

  const runtime = {
    next() {
      const before = phases[index];
      let disposition = "rejected";

      if (index < phases.length - 1) {
        index += 1;
        disposition = "accepted";
      }

      calls.push({
        intent: "next",
        before,
        after: phases[index],
        disposition,
      });

      return disposition;
    },

    previous() {
      const before = phases[index];
      let disposition = "rejected";

      if (index > 0) {
        index -= 1;
        disposition = "accepted";
      }

      calls.push({
        intent: "previous",
        before,
        after: phases[index],
        disposition,
      });

      return disposition;
    },

    getSnapshot() {
      throw new Error("gesture policy must not inspect Runtime snapshots");
    },
  };

  return {
    runtime,
    calls,
    selected() {
      return phases[index];
    },
  };
}

function createNoFeedbackMovePolicy({ threshold = 40 } = {}) {
  let startY = null;
  let trackedPointerId = null;
  const aborts = [];

  function reset() {
    startY = null;
    trackedPointerId = null;
  }

  return {
    aborts,

    handle(event) {
      if (event.pointerType !== "touch") {
        return null;
      }

      if (event.type === "pointercancel") {
        reset();
        return null;
      }

      if (event.type === "pointerdown") {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === trackedPointerId &&
        startY !== null
      ) {
        const delta = startY - event.clientY;

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
      }

      if (event.type === "pointerup") {
        reset();
      }

      return null;
    },

    abort() {
      aborts.push("abort");
      reset();
    },

    snapshot() {
      return { startY, trackedPointerId };
    },
  };
}

function createProposalCommitPolicy({ threshold = 40 } = {}) {
  let startY = null;
  let trackedPointerId = null;
  let committed = false;

  function reset() {
    startY = null;
    trackedPointerId = null;
    committed = false;
  }

  return {
    handle(event) {
      if (event.pointerType !== "touch") {
        return null;
      }

      if (event.type === "pointercancel") {
        reset();
        return null;
      }

      if (event.type === "pointerdown") {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
        committed = false;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === trackedPointerId &&
        startY !== null &&
        !committed
      ) {
        const delta = startY - event.clientY;

        if (delta > threshold) {
          committed = true;
          return "next";
        }

        if (delta < -threshold) {
          committed = true;
          return "previous";
        }
      }

      if (event.type === "pointerup") {
        reset();
      }

      return null;
    },

    abort() {
      reset();
    },

    snapshot() {
      return { committed, startY, trackedPointerId };
    },
  };
}

function createAcceptedOnlyCommitPolicy({ threshold = 40 } = {}) {
  let startY = null;
  let trackedPointerId = null;
  let committed = false;
  const dispositions = [];

  function reset() {
    startY = null;
    trackedPointerId = null;
    committed = false;
  }

  return {
    dispositions,

    handle(event) {
      if (event.pointerType !== "touch") {
        return null;
      }

      if (event.type === "pointercancel") {
        reset();
        return null;
      }

      if (event.type === "pointerdown") {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
        committed = false;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === trackedPointerId &&
        startY !== null &&
        !committed
      ) {
        const delta = startY - event.clientY;

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
      }

      if (event.type === "pointerup") {
        reset();
      }

      return null;
    },

    observeDisposition({ intent, disposition }) {
      dispositions.push({ intent, disposition });

      if (disposition === "accepted") {
        committed = true;
      }
    },

    abort() {
      reset();
    },

    snapshot() {
      return { committed, startY, trackedPointerId };
    },
  };
}

function createDispositionFeedbackRuntime(runtime, policy) {
  return {
    next() {
      const disposition = runtime.next();
      policy.observeDisposition({
        intent: "next",
        disposition,
      });
      return disposition;
    },

    previous() {
      const disposition = runtime.previous();
      policy.observeDisposition({
        intent: "previous",
        disposition,
      });
      return disposition;
    },

    getSnapshot() {
      throw new Error("feedback seam must not require Runtime snapshots");
    },
  };
}

function begin(target, y = 200, pointerId = 1) {
  target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId,
      clientY: y,
    }),
  );
}

function move(target, y, pointerId = 1) {
  target.dispatch(
    "pointermove",
    pointerEvent("pointermove", {
      pointerId,
      clientY: y,
    }),
  );
}

function cancel(target, pointerId = 1) {
  target.dispatch(
    "pointercancel",
    pointerEvent("pointercancel", {
      pointerId,
    }),
  );
}

test("GDF-H2/R1: current one-way production listener permits two accepted requests in one move-time gesture", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createNoFeedbackMovePolicy();

  const cleanup = bindPointerNavigation({
    target,
    runtime: phase.runtime,
    policy,
  });

  try {
    begin(target, 200);
    move(target, 150);
    move(target, 100);

    assert.equal(phase.selected(), "C");
    assert.deepEqual(
      phase.calls.map(({ intent, disposition }) => ({
        intent,
        disposition,
      })),
      [
        { intent: "next", disposition: "accepted" },
        { intent: "next", disposition: "accepted" },
      ],
    );
  } finally {
    cleanup();
  }
});

test("GDF-H1/H3: proposal-commit consumes a gesture even when Runtime rejects", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "C" });
  const policy = createProposalCommitPolicy();

  const cleanup = bindPointerNavigation({
    target,
    runtime: phase.runtime,
    policy,
  });

  try {
    begin(target, 200);

    move(target, 100);
    assert.equal(phase.selected(), "C");
    assert.deepEqual(phase.calls, [
      {
        intent: "next",
        before: "C",
        after: "C",
        disposition: "rejected",
      },
    ]);
    assert.equal(policy.snapshot().committed, true);

    move(target, 300);

    assert.equal(
      phase.selected(),
      "C",
      "proposal-commit suppresses the later valid reversal",
    );
    assert.equal(phase.calls.length, 1);
  } finally {
    cleanup();
  }
});

test("GDF-H8/R2: accepted-only feedback permits rejected-next then valid previous reversal", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "C" });
  const policy = createAcceptedOnlyCommitPolicy();
  const feedbackRuntime = createDispositionFeedbackRuntime(
    phase.runtime,
    policy,
  );

  const cleanup = bindPointerNavigation({
    target,
    runtime: feedbackRuntime,
    policy,
  });

  try {
    begin(target, 200);

    move(target, 100);

    assert.equal(phase.selected(), "C");
    assert.equal(policy.snapshot().committed, false);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "rejected" },
    ]);

    move(target, 300);

    assert.equal(phase.selected(), "B");
    assert.equal(policy.snapshot().committed, true);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "rejected" },
      { intent: "previous", disposition: "accepted" },
    ]);
  } finally {
    cleanup();
  }
});

test("GDF-H10/R3: accepted-only feedback consumes the rest of an accepted gesture", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyCommitPolicy();
  const feedbackRuntime = createDispositionFeedbackRuntime(
    phase.runtime,
    policy,
  );

  const cleanup = bindPointerNavigation({
    target,
    runtime: feedbackRuntime,
    policy,
  });

  try {
    begin(target, 200);

    move(target, 100);

    assert.equal(phase.selected(), "B");
    assert.equal(policy.snapshot().committed, true);

    move(target, 50);
    move(target, 300);

    assert.equal(phase.selected(), "B");
    assert.equal(phase.calls.length, 1);
    assert.deepEqual(policy.dispositions, [
      { intent: "next", disposition: "accepted" },
    ]);
  } finally {
    cleanup();
  }
});

test("GDF-H9: accepted-only policy needs only disposition feedback, not Runtime snapshot state", () => {
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyCommitPolicy();
  const feedbackRuntime = createDispositionFeedbackRuntime(
    phase.runtime,
    policy,
  );

  assert.equal(feedbackRuntime.next(), "accepted");
  assert.equal(policy.snapshot().committed, true);
  assert.deepEqual(policy.dispositions, [
    { intent: "next", disposition: "accepted" },
  ]);

  assert.throws(() => feedbackRuntime.getSnapshot());
});

test("GDF-H10: pointercancel and application abort reset accepted-only commit state", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyCommitPolicy();
  const feedbackRuntime = createDispositionFeedbackRuntime(
    phase.runtime,
    policy,
  );

  const cleanup = bindPointerNavigation({
    target,
    runtime: feedbackRuntime,
    policy,
  });

  begin(target, 200);
  move(target, 100);

  assert.equal(policy.snapshot().committed, true);

  cancel(target);

  assert.deepEqual(policy.snapshot(), {
    committed: false,
    startY: null,
    trackedPointerId: null,
  });

  begin(target, 200, 2);
  assert.equal(policy.snapshot().trackedPointerId, 2);

  cleanup();

  assert.deepEqual(policy.snapshot(), {
    committed: false,
    startY: null,
    trackedPointerId: null,
  });
});

test("GDF-H6: pointerup-only policy avoids duplicate move proposals but is a distinct commit policy", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  let startY = null;

  const policy = {
    handle(event) {
      if (event.type === "pointerdown") {
        startY = event.clientY;
        return null;
      }

      if (event.type === "pointerup" && startY !== null) {
        const delta = startY - event.clientY;
        startY = null;
        return delta > 40 ? "next" : null;
      }

      return null;
    },

    abort() {
      startY = null;
    },
  };

  const cleanup = bindPointerNavigation({
    target,
    runtime: phase.runtime,
    policy,
  });

  try {
    begin(target, 200);
    move(target, 100);
    move(target, 50);

    assert.equal(phase.selected(), "A");
    assert.equal(phase.calls.length, 0);

    target.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 1,
        clientY: 50,
      }),
    );

    assert.equal(phase.selected(), "B");
    assert.equal(phase.calls.length, 1);
  } finally {
    cleanup();
  }
});

test("Runtime failure before disposition is distinct from rejected feedback", () => {
  const target = new RecordingTarget();
  const policy = createAcceptedOnlyCommitPolicy();
  const failure = new Error("runtime failure");

  const cleanup = bindPointerNavigation({
    target,
    runtime: {
      next() {
        throw failure;
      },
      previous() {
        throw failure;
      },
    },
    policy,
  });

  try {
    begin(target, 200);

    assert.throws(
      () => move(target, 100),
      (error) => error === failure,
    );

    assert.deepEqual(policy.dispositions, []);
    assert.equal(policy.snapshot().committed, false);
  } finally {
    cleanup();
  }
});
