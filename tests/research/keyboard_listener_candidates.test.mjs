import assert from "node:assert/strict";
import test from "node:test";

function bindCandidateKeyboardNavigation({
  target,
  runtime,
  resolveIntent,
  preventDefault = true,
  listenerOptions = undefined,
}) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid keyboard listener target");
  }

  if (typeof resolveIntent !== "function") {
    throw new Error("invalid keyboard intent resolver");
  }

  if (typeof preventDefault !== "boolean") {
    throw new Error("invalid preventDefault policy");
  }

  const handleKeyDown = (event) => {
    const intent = resolveIntent(event);

    if (intent === null || intent === undefined) {
      return;
    }

    if (intent !== "next" && intent !== "previous") {
      throw new Error("invalid keyboard navigation intent");
    }

    const disposition =
      intent === "next" ? runtime.next() : runtime.previous();

    if (
      disposition === "accepted" &&
      preventDefault &&
      event.cancelable === true
    ) {
      event.preventDefault();
    }
  };

  target.addEventListener("keydown", handleKeyDown, listenerOptions);

  let active = true;

  return function cleanup() {
    if (!active) return;
    active = false;
    target.removeEventListener("keydown", handleKeyDown, listenerOptions);
  };
}

class RecordingTarget {
  constructor() {
    this.listeners = [];
    this.addCalls = [];
    this.removeCalls = [];
  }

  addEventListener(type, listener, options) {
    this.addCalls.push({ type, listener, options });
    this.listeners.push({ type, listener, options });
  }

  removeEventListener(type, listener, options) {
    this.removeCalls.push({ type, listener, options });
    const index = this.listeners.findIndex(
      (entry) =>
        entry.type === type &&
        entry.listener === listener &&
        Boolean(entry.options?.capture) === Boolean(options?.capture),
    );
    if (index !== -1) this.listeners.splice(index, 1);
  }

  dispatch(type, event) {
    for (const entry of [...this.listeners]) {
      if (entry.type === type) {
        entry.listener.call(this, event);
      }
    }
  }

  listenerCount(type) {
    return this.listeners.filter((entry) => entry.type === type).length;
  }
}

function makeEvent({
  key = "k",
  cancelable = true,
  repeat = false,
  isComposing = false,
  defaultPrevented = false,
  target = null,
  order = [],
} = {}) {
  let prevented = defaultPrevented;

  const event = {
    key,
    code: key.length === 1 ? "Key" + key.toUpperCase() : key,
    cancelable,
    repeat,
    isComposing,
    target,
    currentTarget: null,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      order.push("preventDefault");
      if (cancelable) prevented = true;
    },
  };

  return event;
}

function makeRuntime({
  nextDisposition = "accepted",
  previousDisposition = "accepted",
  order = [],
} = {}) {
  const calls = { next: 0, previous: 0 };

  return {
    calls,
    runtime: {
      next() {
        calls.next += 1;
        order.push("request:next");
        return nextDisposition;
      },
      previous() {
        calls.previous += 1;
        order.push("request:previous");
        return previousDisposition;
      },
    },
  };
}

test("KBL-H1: candidate requires an explicit listener target", () => {
  assert.throws(() =>
    bindCandidateKeyboardNavigation({
      target: null,
      runtime: {},
      resolveIntent: () => null,
    }),
  );

  const target = new RecordingTarget();

  assert.throws(() =>
    bindCandidateKeyboardNavigation({
      target,
      runtime: {},
      resolveIntent: null,
    }),
  );

  assert.equal(target.addCalls.length, 0);
});

test("KBL-H2/KBL-H9: binding owns one listener and cleanup is isolated + repeat-safe", () => {
  const target = new RecordingTarget();
  let unrelatedCalls = 0;
  const unrelated = () => {
    unrelatedCalls += 1;
  };

  target.addEventListener("keydown", unrelated);

  const { runtime, calls } = makeRuntime();
  const cleanup = bindCandidateKeyboardNavigation({
    target,
    runtime,
    resolveIntent: () => "next",
  });

  assert.equal(target.listenerCount("keydown"), 2);

  cleanup();
  cleanup();

  assert.equal(target.removeCalls.length, 1);
  assert.equal(target.listenerCount("keydown"), 1);

  target.dispatch("keydown", makeEvent());

  assert.equal(unrelatedCalls, 1);
  assert.deepEqual(calls, { next: 0, previous: 0 });
});

test("KBL-H3: keydown candidate does not require wheel-style passive options", () => {
  const target = new RecordingTarget();
  const cleanup = bindCandidateKeyboardNavigation({
    target,
    runtime: makeRuntime().runtime,
    resolveIntent: () => null,
  });

  try {
    assert.equal(target.addCalls.length, 1);
    assert.equal(target.addCalls[0].type, "keydown");
    assert.equal(target.addCalls[0].options, undefined);
  } finally {
    cleanup();
  }
});

test("KBL-H4/KBL-H5: listener forwards raw host observations to resolver without hard-coded decline", () => {
  const cases = [
    {
      label: "native button-like target",
      event: makeEvent({ target: { kind: "button" } }),
    },
    {
      label: "repeat",
      event: makeEvent({ repeat: true }),
    },
    {
      label: "composition",
      event: makeEvent({ isComposing: true }),
    },
  ];

  for (const { label, event } of cases) {
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime();
    let observed = null;

    const cleanup = bindCandidateKeyboardNavigation({
      target,
      runtime,
      resolveIntent(candidate) {
        observed = candidate;
        return null;
      },
    });

    try {
      target.dispatch("keydown", event);
      assert.equal(observed, event, label);
      assert.deepEqual(calls, { next: 0, previous: 0 }, label);
    } finally {
      cleanup();
    }
  }
});

test("KBL-H4: native-control ownership remains resolver policy", () => {
  const target = new RecordingTarget();

  const declinedRuntime = makeRuntime();
  const declineEvent = makeEvent({ target: { kind: "button" } });
  const cleanupDecline = bindCandidateKeyboardNavigation({
    target,
    runtime: declinedRuntime.runtime,
    resolveIntent: () => null,
  });

  target.dispatch("keydown", declineEvent);
  cleanupDecline();

  assert.deepEqual(declinedRuntime.calls, { next: 0, previous: 0 });
  assert.equal(declineEvent.defaultPrevented, false);

  const mappedRuntime = makeRuntime();
  const mappedEvent = makeEvent({ target: { kind: "button" } });
  const cleanupMapped = bindCandidateKeyboardNavigation({
    target,
    runtime: mappedRuntime.runtime,
    resolveIntent: () => "next",
  });

  target.dispatch("keydown", mappedEvent);
  cleanupMapped();

  assert.deepEqual(mappedRuntime.calls, { next: 1, previous: 0 });
  assert.equal(mappedEvent.defaultPrevented, true);
});

test("KBL-H6: already-defaultPrevented arbitration stays resolver-visible", () => {
  for (const policy of ["decline", "map"]) {
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime();
    const event = makeEvent({ defaultPrevented: true });
    let observedDefaultPrevented = null;

    const cleanup = bindCandidateKeyboardNavigation({
      target,
      runtime,
      resolveIntent(candidate) {
        observedDefaultPrevented = candidate.defaultPrevented;
        return policy === "map" ? "next" : null;
      },
    });

    try {
      target.dispatch("keydown", event);
      assert.equal(observedDefaultPrevented, true);

      if (policy === "map") {
        assert.deepEqual(calls, { next: 1, previous: 0 });
      } else {
        assert.deepEqual(calls, { next: 0, previous: 0 });
      }
    } finally {
      cleanup();
    }
  }
});

test("KBL-H8: one produced normalized intent delegates exactly once", () => {
  const order = [];
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime({ order });
  const event = makeEvent({ order });
  let resolverCalls = 0;

  const cleanup = bindCandidateKeyboardNavigation({
    target,
    runtime,
    resolveIntent(candidate) {
      assert.equal(candidate, event);
      resolverCalls += 1;
      order.push("resolve:next");
      return "next";
    },
  });

  try {
    target.dispatch("keydown", event);

    assert.equal(resolverCalls, 1);
    assert.deepEqual(calls, { next: 1, previous: 0 });
    assert.deepEqual(order, [
      "resolve:next",
      "request:next",
      "preventDefault",
    ]);
  } finally {
    cleanup();
  }
});

test("KBL-H8: decline, resolver failure, and invalid intent occur before semantic request", () => {
  for (const mode of ["decline", "throw", "invalid"]) {
    const order = [];
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime({ order });
    const event = makeEvent({ order });
    const failure = new Error("resolver failure");

    const cleanup = bindCandidateKeyboardNavigation({
      target,
      runtime,
      resolveIntent() {
        order.push("resolve:" + mode);
        if (mode === "decline") return null;
        if (mode === "throw") throw failure;
        return "forward";
      },
    });

    try {
      if (mode === "throw") {
        assert.throws(
          () => target.dispatch("keydown", event),
          (error) => error === failure,
        );
      } else if (mode === "invalid") {
        assert.throws(() => target.dispatch("keydown", event));
      } else {
        target.dispatch("keydown", event);
      }

      assert.deepEqual(calls, { next: 0, previous: 0 });
      assert.equal(event.defaultPrevented, false);
      assert.deepEqual(order, ["resolve:" + mode]);
    } finally {
      cleanup();
    }
  }
});

test("KBL-H10: listener need not inspect Runtime state to preserve rejected requests", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime({ nextDisposition: "rejected" });
  const event = makeEvent();

  const cleanup = bindCandidateKeyboardNavigation({
    target,
    runtime,
    resolveIntent: () => "next",
  });

  try {
    target.dispatch("keydown", event);
    assert.deepEqual(calls, { next: 1, previous: 0 });
    assert.equal(event.defaultPrevented, false);
  } finally {
    cleanup();
  }
});

test("KBL-H7: nested independent bindings can both consume one bubbling-model event", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const inner = new RecordingTarget();
  const outer = new RecordingTarget();
  const event = makeEvent({ order });

  const cleanupInner = bindCandidateKeyboardNavigation({
    target: inner,
    runtime,
    resolveIntent() {
      order.push("resolve:inner");
      return "next";
    },
  });

  const cleanupOuter = bindCandidateKeyboardNavigation({
    target: outer,
    runtime,
    resolveIntent() {
      order.push("resolve:outer");
      return "next";
    },
  });

  try {
    // Model one bubbling event: target listener first, then ancestor listener.
    inner.dispatch("keydown", event);
    outer.dispatch("keydown", event);

    assert.deepEqual(calls, { next: 2, previous: 0 });
    assert.deepEqual(order, [
      "resolve:inner",
      "request:next",
      "preventDefault",
      "resolve:outer",
      "request:next",
      "preventDefault",
    ]);
  } finally {
    cleanupInner();
    cleanupOuter();
  }
});
