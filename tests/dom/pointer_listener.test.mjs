import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { bindPointerNavigation } from "../../adapters/dom/pointer_listener.mjs";

const POINTER_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
];

class RecordingTarget {
  constructor() {
    this.listeners = new Map();
    this.addCalls = [];
    this.removeCalls = [];
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

  count(type) {
    return (this.listeners.get(type) ?? []).length;
  }
}

function makeRuntime({
  nextDisposition = "accepted",
  previousDisposition = "accepted",
} = {}) {
  const calls = [];

  return {
    calls,
    runtime: {
      next() {
        calls.push({ method: "next", disposition: nextDisposition });
        return nextDisposition;
      },

      previous() {
        calls.push({ method: "previous", disposition: previousDisposition });
        return previousDisposition;
      },

      getSnapshot() {
        throw new Error("production listener must not inspect Runtime snapshots");
      },
    },
  };
}

function makePolicy({
  handle = () => null,
  abort = () => {},
  ...capabilities
} = {}) {
  return { handle, abort, ...capabilities };
}

test("P01/P02: validates target and stateful policy before listener installation", () => {
  const { runtime } = makeRuntime();
  const target = new RecordingTarget();

  for (const invalidTarget of [
    null,
    {},
    { addEventListener() {} },
    { removeEventListener() {} },
  ]) {
    assert.throws(() =>
      bindPointerNavigation({
        target: invalidTarget,
        runtime,
        policy: makePolicy(),
      }),
    );
  }

  for (const invalidPolicy of [
    null,
    {},
    { handle() {} },
    { abort() {} },
  ]) {
    assert.throws(() =>
      bindPointerNavigation({
        target,
        runtime,
        policy: invalidPolicy,
      }),
    );
  }

  assert.equal(target.addCalls.length, 0);
});

test("PFD11: rejects a malformed disposition-feedback opt-in before listener installation", () => {
  const { runtime } = makeRuntime();

  for (const onDisposition of [undefined, null, false, "observe", {}]) {
    const target = new RecordingTarget();

    assert.throws(
      () =>
        bindPointerNavigation({
          target,
          runtime,
          policy: makePolicy({ onDisposition }),
        }),
      /invalid pointer gesture policy disposition feedback/,
    );
    assert.equal(target.addCalls.length, 0);
  }

  const legacyTarget = new RecordingTarget();
  const cleanup = bindPointerNavigation({
    target: legacyTarget,
    runtime,
    policy: makePolicy(),
  });

  assert.equal(legacyTarget.addCalls.length, POINTER_TYPES.length);
  cleanup();
});

test("P03: installs exactly the bounded PointerEvent listener set", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy(),
  });

  try {
    assert.deepEqual(
      target.addCalls.map(({ type }) => type),
      POINTER_TYPES,
    );

    for (const type of POINTER_TYPES) {
      assert.equal(target.count(type), 1);
    }

    for (const type of [
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
    ]) {
      assert.equal(target.count(type), 0);
    }
  } finally {
    cleanup();
  }
});

test("P04: forwards each delivered event unchanged to policy exactly once", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();
  const observed = [];

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      handle(event) {
        observed.push(event);
        return null;
      },
    }),
  });

  try {
    for (const type of POINTER_TYPES) {
      const event = {
        type,
        pointerId: 11,
        pointerType: "mouse",
        clientX: 123,
        clientY: 456,
      };

      target.dispatch(type, event);
      assert.equal(observed.at(-1), event);
    }

    assert.equal(observed.length, POINTER_TYPES.length);
  } finally {
    cleanup();
  }
});

test("P05: null and undefined decline before Runtime request", () => {
  for (const result of [null, undefined]) {
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime();

    const cleanup = bindPointerNavigation({
      target,
      runtime,
      policy: makePolicy({ handle: () => result }),
    });

    try {
      target.dispatch("pointerup", { type: "pointerup" });
      assert.deepEqual(calls, []);
    } finally {
      cleanup();
    }
  }
});

test("P06: invalid produced intent fails before Runtime request", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({ handle: () => "forward" }),
  });

  try {
    assert.throws(() =>
      target.dispatch("pointerup", { type: "pointerup" }),
    );
    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("P07/P08: next and previous delegate exactly once without semantic prediction", () => {
  const cases = [
    {
      intent: "next",
      nextDisposition: "rejected",
      previousDisposition: "accepted",
      expectedMethod: "next",
      expectedDisposition: "rejected",
    },
    {
      intent: "previous",
      nextDisposition: "accepted",
      previousDisposition: "rejected",
      expectedMethod: "previous",
      expectedDisposition: "rejected",
    },
  ];

  for (const entry of cases) {
    const target = new RecordingTarget();
    const { runtime, calls } = makeRuntime(entry);

    const cleanup = bindPointerNavigation({
      target,
      runtime,
      policy: makePolicy({ handle: () => entry.intent }),
    });

    try {
      target.dispatch("pointerup", { type: "pointerup" });

      assert.deepEqual(calls, [
        {
          method: entry.expectedMethod,
          disposition: entry.expectedDisposition,
        },
      ]);
    } finally {
      cleanup();
    }
  }
});

test("PFD02/PFD03/PFD12: accepted and rejected dispositions synchronously return to their originating policy", () => {
  const cases = [
    { intent: "next", disposition: "accepted" },
    { intent: "previous", disposition: "rejected" },
  ];

  for (const { intent, disposition } of cases) {
    const target = new RecordingTarget();
    const order = [];
    const runtime = {
      next() {
        order.push("runtime:next");
        return disposition;
      },
      previous() {
        order.push("runtime:previous");
        return disposition;
      },
      getSnapshot() {
        throw new Error("production listener must not inspect Runtime snapshots");
      },
    };
    let policy;
    policy = makePolicy({
      handle: () => intent,
      onDisposition(observedIntent, observedDisposition) {
        assert.equal(this, policy);
        order.push(`feedback:${observedIntent}:${observedDisposition}`);
      },
    });
    const cleanup = bindPointerNavigation({ target, runtime, policy });

    try {
      target.dispatch("pointermove", { type: "pointermove" });
      assert.deepEqual(order, [
        `runtime:${intent}`,
        `feedback:${intent}:${disposition}`,
      ]);
    } finally {
      cleanup();
    }
  }
});

test("PFD04: Runtime failure propagates unchanged without feedback or retry", () => {
  const target = new RecordingTarget();
  const failure = new Error("runtime failure");
  let requests = 0;
  let feedback = 0;
  const runtime = {
    next() {
      requests += 1;
      throw failure;
    },
  };
  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      handle: () => "next",
      onDisposition() {
        feedback += 1;
      },
    }),
  });

  try {
    assert.throws(
      () => target.dispatch("pointermove", { type: "pointermove" }),
      (error) => error === failure,
    );
    assert.equal(requests, 1);
    assert.equal(feedback, 0);
  } finally {
    cleanup();
  }
});

test("PFD05: feedback failure propagates after one Runtime request without retry or rewritten disposition", () => {
  for (const disposition of ["accepted", "rejected"]) {
    const target = new RecordingTarget();
    const failure = new Error(`feedback failure after ${disposition}`);
    const observations = [];
    let requests = 0;
    const runtime = {
      previous() {
        requests += 1;
        return disposition;
      },
    };
    const cleanup = bindPointerNavigation({
      target,
      runtime,
      policy: makePolicy({
        handle: () => "previous",
        onDisposition(intent, observedDisposition) {
          observations.push({ intent, disposition: observedDisposition });
          throw failure;
        },
      }),
    });

    try {
      assert.throws(
        () => target.dispatch("pointerup", { type: "pointerup" }),
        (error) => error === failure,
      );
      assert.equal(requests, 1);
      assert.deepEqual(observations, [
        { intent: "previous", disposition },
      ]);
    } finally {
      cleanup();
    }
  }
});

test("PFD06: direct use of the same Runtime does not produce pointer feedback", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();
  const observations = [];
  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      handle: () => null,
      onDisposition(intent, disposition) {
        observations.push({ intent, disposition });
      },
    }),
  });

  try {
    assert.equal(runtime.next(), "accepted");
    assert.deepEqual(observations, []);
  } finally {
    cleanup();
  }
});

test("PFD10: invalid intent produces neither a Runtime request nor disposition feedback", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  let feedback = 0;
  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      handle: () => "forward",
      onDisposition() {
        feedback += 1;
      },
    }),
  });

  try {
    assert.throws(() =>
      target.dispatch("pointerup", { type: "pointerup" }),
    );
    assert.deepEqual(calls, []);
    assert.equal(feedback, 0);
  } finally {
    cleanup();
  }
});

test("P09/P10: cleanup removes only owned listeners, is repeat-safe, and aborts once", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  const aborts = [];
  let unrelated = 0;

  for (const type of POINTER_TYPES) {
    target.addEventListener(type, () => {
      unrelated += 1;
    });
  }

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      handle: () => "next",
      abort() {
        aborts.push("abort");
      },
    }),
  });

  cleanup();
  cleanup();

  assert.equal(target.removeCalls.length, POINTER_TYPES.length);
  assert.deepEqual(aborts, ["abort"]);

  for (const type of POINTER_TYPES) {
    assert.equal(target.count(type), 1);
  }

  target.dispatch("pointerup", { type: "pointerup" });

  assert.equal(unrelated, 1);
  assert.deepEqual(calls, []);
});

test("P11: listeners are removed before policy abort runs", () => {
  const target = new RecordingTarget();
  const { runtime, calls } = makeRuntime();
  let handleCalls = 0;

  const policy = makePolicy({
    handle() {
      handleCalls += 1;
      return "next";
    },

    abort() {
      target.dispatch("pointerup", { type: "pointerup" });
    },
  });

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  cleanup();

  assert.equal(handleCalls, 0);
  assert.deepEqual(calls, []);
});

test("cleanup propagates policy abort failure after removing owned listeners", () => {
  const target = new RecordingTarget();
  const { runtime } = makeRuntime();
  const failure = new Error("abort failure");

  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy: makePolicy({
      abort() {
        throw failure;
      },
    }),
  });

  assert.throws(
    () => cleanup(),
    (error) => error === failure,
  );

  for (const type of POINTER_TYPES) {
    assert.equal(target.count(type), 0);
  }

  assert.doesNotThrow(() => cleanup());
});

test("P12: production source contains no deferred gesture or semantic ownership", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "../../adapters/dom/pointer_listener.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );

  const forbiddenPatterns = [
    /touchstart/,
    /touchmove/,
    /touchend/,
    /touchcancel/,
    /threshold/i,
    /delta[XY]/,
    /client[XY]/,
    /pointerId/,
    /pointerType/,
    /isPrimary/,
    /activePointer/i,
    /touchAction/,
    /style\./,
    /setPointerCapture/,
    /releasePointerCapture/,
    /preventDefault/,
    /getSnapshot/,
    /transition/i,
    /cooldown/i,
    /\blocked\b/i,
    /\locked\b/i,
    /selected/i,
    /stopPropagation/,
    /stopImmediatePropagation/,
    /\bwindow\b/,
    /\bdocument\b/,
    /WeakMap/,
    /WeakSet/,
    /\bPromise\b/,
    /queueMicrotask/,
    /setTimeout/,
    /setInterval/,
    /\basync\b/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      "forbidden production pointer-listener mechanism: " + pattern,
    );
  }
});

test("setup failure removes already-installed listeners and aborts policy", () => {
  const target = new RecordingTarget();
  const originalAdd = target.addEventListener.bind(target);
  target.addEventListener = (type, listener, options) => {
    if (type === "pointerup") throw new Error("setup failure");
    originalAdd(type, listener, options);
  };
  let aborts = 0;
  const { runtime } = makeRuntime();
  assert.throws(
    () => bindPointerNavigation({
      target,
      runtime,
      policy: makePolicy({ abort: () => { aborts += 1; } }),
    }),
    /setup failure/,
  );
  assert.equal(aborts, 1);
  for (const type of POINTER_TYPES) assert.equal(target.count(type), 0);
});
