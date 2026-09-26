import assert from "node:assert/strict";
import test from "node:test";

const POINTER_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
];

function bindCandidatePointerLifecycle({
  target,
  runtime,
  policy,
}) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid pointer listener target");
  }

  if (
    policy === null ||
    typeof policy !== "object" ||
    typeof policy.handle !== "function" ||
    typeof policy.abort !== "function"
  ) {
    throw new Error("invalid pointer gesture policy");
  }

  const listeners = new Map();

  for (const type of POINTER_TYPES) {
    const listener = (event) => {
      const intent = policy.handle(event);

      if (intent === null || intent === undefined) {
        return;
      }

      if (intent !== "next" && intent !== "previous") {
        throw new Error("invalid pointer navigation intent");
      }

      if (intent === "next") {
        runtime.next();
      } else {
        runtime.previous();
      }
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

    policy.abort("binding-cleanup");
  };
}

function bindNaiveWithoutAbort({
  target,
  runtime,
  policy,
}) {
  const listeners = new Map();

  for (const type of POINTER_TYPES) {
    const listener = (event) => {
      const intent = policy.handle(event);
      if (intent === "next") runtime.next();
      if (intent === "previous") runtime.previous();
    };

    listeners.set(type, listener);
    target.addEventListener(type, listener);
  }

  return () => {
    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener);
    }
  };
}

class RecordingTarget {
  constructor() {
    this.listeners = new Map();
    this.addCalls = [];
    this.removeCalls = [];
    this.style = { touchAction: "none" };
  }

  addEventListener(type, listener, options) {
    this.addCalls.push({ type, listener, options });
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener, options) {
    this.removeCalls.push({ type, listener, options });
    const list = this.listeners.get(type) ?? [];
    const next = list.filter((candidate) => candidate !== listener);
    this.listeners.set(type, next);
  }

  dispatch(type, event) {
    const list = [...(this.listeners.get(type) ?? [])];
    for (const listener of list) {
      listener.call(this, event);
    }
  }

  listenerCount(type) {
    return (this.listeners.get(type) ?? []).length;
  }
}

function makeRuntime({ nextDisposition = "accepted", previousDisposition = "accepted" } = {}) {
  const calls = { next: 0, previous: 0 };

  const runtime = {
    next() {
      calls.next += 1;
      return nextDisposition;
    },

    previous() {
      calls.previous += 1;
      return previousDisposition;
    },

    getSnapshot() {
      throw new Error("listener must not inspect Runtime snapshots");
    },
  };

  return { runtime, calls };
}

function createStatefulPolicy({ threshold = 50 } = {}) {
  const observations = [];
  const aborts = [];
  let startY = null;
  let trackedPointerId = null;

  return {
    observations,
    aborts,

    handle(event) {
      observations.push(event);

      if (event.type === "pointercancel") {
        startY = null;
        trackedPointerId = null;
        return null;
      }

      if (event.type === "pointerdown") {
        trackedPointerId = event.pointerId;
        startY = event.clientY;
        return null;
      }

      if (
        event.type === "pointerup" &&
        event.pointerId === trackedPointerId &&
        startY !== null
      ) {
        const delta = startY - event.clientY;
        startY = null;
        trackedPointerId = null;

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
      }

      return null;
    },

    abort(reason) {
      aborts.push(reason);
      startY = null;
      trackedPointerId = null;
    },

    snapshot() {
      return { startY, trackedPointerId };
    },
  };
}

function pointerEvent(
  type,
  {
    pointerId = 1,
    pointerType = "touch",
    isPrimary = true,
    clientX = 10,
    clientY = 100,
  } = {},
) {
  return {
    type,
    pointerId,
    pointerType,
    isPrimary,
    clientX,
    clientY,
  };
}

test("PBL-H1: candidate requires an explicit EventTarget", () => {
  const { runtime } = makeRuntime();
  const policy = createStatefulPolicy();

  assert.throws(() =>
    bindCandidatePointerLifecycle({
      target: null,
      runtime,
      policy,
    }),
  );
});

test("PBL-H5: listener mechanics install only the bounded PointerEvent set", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();
  const policy = createStatefulPolicy();

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  try {
    assert.deepEqual(
      target.addCalls.map(({ type }) => type),
      POINTER_TYPES,
    );

    for (const type of POINTER_TYPES) {
      assert.equal(target.listenerCount(type), 1);
    }
  } finally {
    cleanup();
  }
});

test("PBL-H5/PBL-H9: listener forwards raw pointer observations unchanged to replaceable policy", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();
  const observations = [];

  const policy = {
    handle(event) {
      observations.push(event);
      return null;
    },
    abort() {},
  };

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  const event = pointerEvent("pointerdown", {
    pointerId: 91,
    pointerType: "mouse",
    isPrimary: false,
    clientX: 321,
    clientY: 654,
  });

  try {
    target.dispatch("pointerdown", event);
    assert.equal(observations.length, 1);
    assert.equal(observations[0], event);
  } finally {
    cleanup();
  }
});

test("PBL-H10: one policy result produces at most one Runtime request", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  let handleCalls = 0;

  const policy = {
    handle() {
      handleCalls += 1;
      return "next";
    },
    abort() {},
  };

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  try {
    target.dispatch("pointerup", pointerEvent("pointerup"));

    assert.equal(handleCalls, 1);
    assert.deepEqual(calls, { next: 1, previous: 0 });
  } finally {
    cleanup();
  }
});

test("policy decline and invalid result occur before semantic request", () => {
  for (const mode of ["decline", "invalid"]) {
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime();

    const policy = {
      handle() {
        return mode === "decline" ? null : "forward";
      },
      abort() {},
    };

    const cleanup = bindCandidatePointerLifecycle({
      target,
      runtime,
      policy,
    });

    try {
      if (mode === "invalid") {
        assert.throws(() =>
          target.dispatch("pointerup", pointerEvent("pointerup")),
        );
      } else {
        target.dispatch("pointerup", pointerEvent("pointerup"));
      }

      assert.deepEqual(calls, { next: 0, previous: 0 });
    } finally {
      cleanup();
    }
  }
});

test("PBL-H11: cleanup removes only owned listeners and is repeat-safe", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const policy = createStatefulPolicy();
  let unrelatedCalls = 0;

  for (const type of POINTER_TYPES) {
    target.addEventListener(type, () => {
      unrelatedCalls += 1;
    });
  }

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  cleanup();
  cleanup();

  assert.equal(target.removeCalls.length, POINTER_TYPES.length);

  for (const type of POINTER_TYPES) {
    assert.equal(target.listenerCount(type), 1);
  }

  target.dispatch("pointerup", pointerEvent("pointerup"));

  assert.equal(unrelatedCalls, 1);
  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.deepEqual(policy.aborts, ["binding-cleanup"]);
});

test("PBL-H3/PBL-H6: cleanup aborts accumulated gesture state", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const policy = createStatefulPolicy();

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", { pointerId: 7, clientY: 200 }),
  );

  assert.deepEqual(policy.snapshot(), {
    startY: 200,
    trackedPointerId: 7,
  });

  cleanup();

  assert.deepEqual(policy.snapshot(), {
    startY: null,
    trackedPointerId: null,
  });
  assert.deepEqual(calls, { next: 0, previous: 0 });
});

test("PBL-H3: listener cleanup without policy abort permits stale target-replacement commit", () => {
  const targetA = new RecordingTarget();
  const targetB = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const policy = createStatefulPolicy();

  const cleanupA = bindNaiveWithoutAbort({
    target: targetA,
    runtime,
    policy,
  });

  targetA.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId: 11,
      clientY: 200,
    }),
  );

  cleanupA();

  const cleanupB = bindNaiveWithoutAbort({
    target: targetB,
    runtime,
    policy,
  });

  try {
    targetB.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 11,
        clientY: 100,
      }),
    );

    assert.deepEqual(calls, { next: 1, previous: 0 });
  } finally {
    cleanupB();
  }
});

test("PBL-H3/PBL-H6: abort on cleanup prevents stale target-replacement commit", () => {
  const targetA = new RecordingTarget();
  const targetB = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const policy = createStatefulPolicy();

  const cleanupA = bindCandidatePointerLifecycle({
    target: targetA,
    runtime,
    policy,
  });

  targetA.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId: 12,
      clientY: 200,
    }),
  );

  cleanupA();

  const cleanupB = bindCandidatePointerLifecycle({
    target: targetB,
    runtime,
    policy,
  });

  try {
    targetB.dispatch(
      "pointerup",
      pointerEvent("pointerup", {
        pointerId: 12,
        clientY: 100,
      }),
    );

    assert.deepEqual(calls, { next: 0, previous: 0 });
  } finally {
    cleanupB();
  }
});

test("PBL-H4: pointercancel reset and explicit cleanup reset are independent lifecycle boundaries", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const policy = createStatefulPolicy();

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId: 22,
      clientY: 200,
    }),
  );

  target.dispatch(
    "pointercancel",
    pointerEvent("pointercancel", {
      pointerId: 22,
      clientY: 180,
    }),
  );

  assert.deepEqual(policy.snapshot(), {
    startY: null,
    trackedPointerId: null,
  });
  assert.deepEqual(policy.aborts, []);

  target.dispatch(
    "pointerdown",
    pointerEvent("pointerdown", {
      pointerId: 23,
      clientY: 300,
    }),
  );

  cleanup();

  assert.deepEqual(policy.snapshot(), {
    startY: null,
    trackedPointerId: null,
  });
  assert.deepEqual(policy.aborts, ["binding-cleanup"]);
  assert.deepEqual(calls, { next: 0, previous: 0 });
});

test("PBL-H7: listener lifecycle does not mutate author touch-action policy", () => {
  const target = new RecordingTarget();
  target.style.touchAction = "pan-y";

  const { runtime } = makeRuntime();
  const policy = createStatefulPolicy();

  const before = target.style.touchAction;

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  const during = target.style.touchAction;
  cleanup();
  const after = target.style.touchAction;

  assert.equal(before, "pan-y");
  assert.equal(during, "pan-y");
  assert.equal(after, "pan-y");
});

test("PBL-H12: listener requires no Runtime snapshot inspection", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime({
    nextDisposition: "rejected",
  });

  const policy = {
    handle() {
      return "next";
    },
    abort() {},
  };

  const cleanup = bindCandidatePointerLifecycle({
    target,
    runtime,
    policy,
  });

  try {
    target.dispatch("pointerup", pointerEvent("pointerup"));
    assert.deepEqual(calls, { next: 1, previous: 0 });
  } finally {
    cleanup();
  }
});
