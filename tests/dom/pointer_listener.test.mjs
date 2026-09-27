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
} = {}) {
  return { handle, abort };
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
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      "forbidden production pointer-listener mechanism: " + pattern,
    );
  }
});
