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
    clientY = 200,
    pointerType = "touch",
  } = {},
) {
  return {
    type,
    pointerId,
    clientY,
    pointerType,
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
      throw new Error("feedback research must not inspect Runtime snapshots");
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

function createAcceptedOnlyPolicy({ threshold = 40 } = {}) {
  let startY = null;
  let pointerId = null;
  let committed = false;
  let sequence = 0;
  const dispositions = [];
  const resets = [];

  function reset(reason) {
    startY = null;
    pointerId = null;
    committed = false;
    resets.push({ reason, sequence });
  }

  return {
    dispositions,
    resets,

    handle(event) {
      if (event.pointerType !== "touch") {
        return null;
      }

      if (event.type === "pointercancel") {
        reset("pointercancel");
        return null;
      }

      if (event.type === "pointerdown") {
        sequence += 1;
        pointerId = event.pointerId;
        startY = event.clientY;
        committed = false;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === pointerId &&
        startY !== null &&
        !committed
      ) {
        const delta = startY - event.clientY;

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
      }

      if (event.type === "pointerup") {
        reset("pointerup");
      }

      return null;
    },

    observeDisposition(intent, disposition) {
      dispositions.push({
        intent,
        disposition,
        sequenceAtObservation: sequence,
      });

      if (disposition === "accepted") {
        committed = true;
      }
    },

    abort() {
      reset("binding-cleanup");
    },

    snapshot() {
      return {
        startY,
        pointerId,
        committed,
        sequence,
      };
    },
  };
}

function createFeedbackRuntimeFacade({
  runtime,
  observe,
  defer = null,
}) {
  function request(intent) {
    const requestMethod =
      intent === "next" ? runtime.next : runtime.previous;
    const disposition = requestMethod.call(runtime);

    const deliver = () => observe(intent, disposition);

    if (defer === null) {
      deliver();
    } else {
      defer(deliver);
    }

    return disposition;
  }

  return {
    next() {
      return request("next");
    },

    previous() {
      return request("previous");
    },

    getSnapshot() {
      throw new Error("feedback facade must not expose Runtime snapshots");
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

function createListenerMediatedResearchBinding({
  target,
  runtime,
  policy,
}) {
  const types = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
  ];
  const listeners = new Map();

  for (const type of types) {
    const listener = (event) => {
      const intent = policy.handle(event);

      if (intent === null || intent === undefined) {
        return;
      }

      if (intent !== "next" && intent !== "previous") {
        throw new Error("invalid pointer navigation intent");
      }

      const request =
        intent === "next" ? runtime.next : runtime.previous;
      const disposition = request.call(runtime);

      policy.observeDisposition(intent, disposition);
    };

    listeners.set(type, listener);
    target.addEventListener(type, listener);
  }

  let active = true;

  return function cleanup() {
    if (!active) return;
    active = false;

    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener);
    }

    policy.abort();
  };
}

function createProposalTransactionPolicy({ threshold = 40 } = {}) {
  const policy = createAcceptedOnlyPolicy({ threshold });

  return {
    dispositions: policy.dispositions,

    handle(event) {
      const intent = policy.handle(event);

      if (intent === null || intent === undefined) {
        return null;
      }

      return {
        intent,
        settle(disposition) {
          policy.observeDisposition(intent, disposition);
        },
      };
    },

    abort() {
      policy.abort();
    },

    snapshot() {
      return policy.snapshot();
    },
  };
}

function createProposalTransactionResearchBinding({
  target,
  runtime,
  policy,
}) {
  const types = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
  ];
  const listeners = new Map();

  for (const type of types) {
    const listener = (event) => {
      const proposal = policy.handle(event);

      if (proposal === null || proposal === undefined) {
        return;
      }

      const { intent, settle } = proposal;

      if (
        (intent !== "next" && intent !== "previous") ||
        typeof settle !== "function"
      ) {
        throw new Error("invalid pointer navigation proposal");
      }

      const request =
        intent === "next" ? runtime.next : runtime.previous;
      const disposition = request.call(runtime);
      settle(disposition);
    };

    listeners.set(type, listener);
    target.addEventListener(type, listener);
  }

  let active = true;

  return function cleanup() {
    if (!active) return;
    active = false;

    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener);
    }

    policy.abort();
  };
}

test("DS-H1/H9/H10: binding-local facade feeds only pointer-origin requests while direct Runtime calls stay silent", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyPolicy();
  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    begin(target);
    move(target, 100);

    assert.equal(phase.selected(), "B");
    assert.deepEqual(
      policy.dispositions.map(({ intent, disposition }) => ({
        intent,
        disposition,
      })),
      [{ intent: "next", disposition: "accepted" }],
    );

    phase.runtime.next();

    assert.equal(phase.selected(), "C");
    assert.equal(
      policy.dispositions.length,
      1,
      "direct use of the original semantic Runtime must not feed pointer policy",
    );
  } finally {
    cleanup();
  }
});

test("DS-H1/H9: a shared decorated Runtime misattributes unrelated programmatic requests", () => {
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyPolicy();
  const sharedDecoratedRuntime = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
  });

  assert.equal(sharedDecoratedRuntime.next(), "accepted");

  assert.equal(phase.selected(), "B");
  assert.deepEqual(
    policy.dispositions.map(({ intent, disposition }) => ({
      intent,
      disposition,
    })),
    [{ intent: "next", disposition: "accepted" }],
  );
  assert.equal(
    policy.snapshot().committed,
    true,
    "pointer policy was committed even though no pointer proposal occurred",
  );
});

test("DS-H3/H4: intent plus disposition is sufficient for rejection then reversal without Runtime snapshots or PointerEvent feedback", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "C" });
  const policy = createAcceptedOnlyPolicy();
  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    begin(target, 200);

    move(target, 100);
    assert.equal(phase.selected(), "C");
    assert.equal(policy.snapshot().committed, false);

    move(target, 300);

    assert.equal(phase.selected(), "B");
    assert.equal(policy.snapshot().committed, true);
    assert.deepEqual(
      policy.dispositions.map(({ intent, disposition }) => ({
        intent,
        disposition,
      })),
      [
        { intent: "next", disposition: "rejected" },
        { intent: "previous", disposition: "accepted" },
      ],
    );
  } finally {
    cleanup();
  }
});

test("DS-H2: deferred feedback without proposal identity can commit a later pointer sequence", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyPolicy();
  const queued = [];
  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
    defer(deliver) {
      queued.push(deliver);
    },
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    begin(target, 200, 1);
    move(target, 100, 1);

    assert.equal(phase.selected(), "B");
    assert.equal(policy.snapshot().committed, false);
    assert.equal(queued.length, 1);

    cancel(target, 1);
    begin(target, 200, 2);

    assert.deepEqual(policy.snapshot(), {
      startY: 200,
      pointerId: 2,
      committed: false,
      sequence: 2,
    });

    queued.shift()();

    assert.equal(
      policy.snapshot().committed,
      true,
      "stale accepted feedback from sequence 1 committed sequence 2",
    );
    assert.equal(
      policy.dispositions[0].sequenceAtObservation,
      2,
      "feedback had no identity capable of recovering its originating sequence",
    );
  } finally {
    cleanup();
  }
});

test("DS-H2: synchronous feedback completes before cancellation/new sequence and needs no proposal identity for the researched contract", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const policy = createAcceptedOnlyPolicy();
  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    begin(target, 200, 1);
    move(target, 100, 1);

    assert.equal(policy.snapshot().committed, true);
    assert.equal(
      policy.dispositions[0].sequenceAtObservation,
      1,
    );

    cancel(target, 1);
    begin(target, 200, 2);

    assert.deepEqual(policy.snapshot(), {
      startY: 200,
      pointerId: 2,
      committed: false,
      sequence: 2,
    });
    assert.equal(policy.dispositions.length, 1);
  } finally {
    cleanup();
  }
});

test("DS-H8: Runtime failure before disposition produces no policy feedback", () => {
  const target = new RecordingTarget();
  const policy = createAcceptedOnlyPolicy();
  const failure = new Error("runtime failure");
  const runtime = {
    next() {
      throw failure;
    },
    previous() {
      throw failure;
    },
    getSnapshot() {
      throw new Error("snapshot must not be read");
    },
  };
  const facade = createFeedbackRuntimeFacade({
    runtime,
    observe: (intent, disposition) =>
      policy.observeDisposition(intent, disposition),
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    begin(target);
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

test("DS-H8: feedback failure occurs after semantic acceptance and cannot be reclassified as rejected", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const feedbackFailure = new Error("feedback failure");
  const observed = [];
  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe(intent, disposition) {
      observed.push({ intent, disposition });
      throw feedbackFailure;
    },
  });
  const policy = {
    handle(event) {
      return event.type === "pointermove" ? "next" : null;
    },
    abort() {},
  };

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy,
  });

  try {
    assert.throws(
      () => target.dispatch("pointermove", pointerEvent("pointermove")),
      (error) => error === feedbackFailure,
    );

    assert.equal(
      phase.selected(),
      "B",
      "semantic acceptance occurred before feedback failed",
    );
    assert.deepEqual(phase.calls, [
      {
        intent: "next",
        before: "A",
        after: "B",
        disposition: "accepted",
      },
    ]);
    assert.deepEqual(observed, [
      { intent: "next", disposition: "accepted" },
    ]);
  } finally {
    cleanup();
  }
});

test("DS-H5: listener-mediated synchronous routing can remain transaction plumbing while gesture state stays policy-owned", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "C" });
  const policy = createAcceptedOnlyPolicy();

  const cleanup = createListenerMediatedResearchBinding({
    target,
    runtime: phase.runtime,
    policy,
  });

  try {
    begin(target, 200);
    move(target, 100);

    assert.equal(phase.selected(), "C");
    assert.equal(policy.snapshot().committed, false);

    move(target, 300);

    assert.equal(phase.selected(), "B");
    assert.equal(policy.snapshot().committed, true);
    assert.deepEqual(
      policy.dispositions.map(({ intent, disposition }) => ({
        intent,
        disposition,
      })),
      [
        { intent: "next", disposition: "rejected" },
        { intent: "previous", disposition: "accepted" },
      ],
    );
  } finally {
    cleanup();
  }
});

test("DS-H6: proposal-local transaction identity is not required to reproduce the synchronous accepted-only trace", () => {
  function runWithBinding(createBinding, makePolicy) {
    const target = new RecordingTarget();
    const phase = createPhaseRuntime({ initial: "C" });
    const policy = makePolicy();

    const cleanup = createBinding({
      target,
      runtime: phase.runtime,
      policy,
    });

    try {
      begin(target, 200);
      move(target, 100);
      move(target, 300);

      return {
        selected: phase.selected(),
        dispositions: policy.dispositions.map(
          ({ intent, disposition }) => ({
            intent,
            disposition,
          }),
        ),
        committed: policy.snapshot().committed,
      };
    } finally {
      cleanup();
    }
  }

  const listenerMediated = runWithBinding(
    createListenerMediatedResearchBinding,
    () => createAcceptedOnlyPolicy(),
  );

  const proposalTransaction = runWithBinding(
    createProposalTransactionResearchBinding,
    () => createProposalTransactionPolicy(),
  );

  assert.deepEqual(listenerMediated, {
    selected: "B",
    dispositions: [
      { intent: "next", disposition: "rejected" },
      { intent: "previous", disposition: "accepted" },
    ],
    committed: true,
  });
  assert.deepEqual(proposalTransaction, listenerMediated);
});

test("DS-H7: an independently wired disposition observer can diverge from the policy that originated the proposal", () => {
  const target = new RecordingTarget();
  const phase = createPhaseRuntime({ initial: "A" });
  const proposingPolicy = createAcceptedOnlyPolicy();
  const unrelatedPolicy = createAcceptedOnlyPolicy();

  const facade = createFeedbackRuntimeFacade({
    runtime: phase.runtime,
    observe: (intent, disposition) =>
      unrelatedPolicy.observeDisposition(intent, disposition),
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime: facade,
    policy: proposingPolicy,
  });

  try {
    begin(target, 200);
    move(target, 100);

    assert.equal(phase.selected(), "B");
    assert.equal(proposingPolicy.snapshot().committed, false);
    assert.equal(unrelatedPolicy.snapshot().committed, true);

    move(target, 50);

    assert.equal(
      phase.selected(),
      "C",
      "miswired observer left the proposing policy uncommitted and allowed a second accepted request",
    );
  } finally {
    cleanup();
  }
});
