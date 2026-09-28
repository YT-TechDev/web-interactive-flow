import assert from "node:assert/strict";
import test from "node:test";

import { bindDomFlowHost } from "../../adapters/dom/flow_host.mjs";

class Target {
  listeners = new Map();
  failOnRemove = null;

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
    if (type === this.failOnRemove) throw new Error(`cannot remove ${type}`);
  }

  count() {
    return [...this.listeners.values()].reduce((total, list) => total + list.length, 0);
  }
}

function fixture({ failRequest = false, failCancel = false } = {}) {
  const wheelTarget = new Target();
  const pointerTarget = new Target();
  const keyboardTarget = new Target();
  const frames = new Map();
  const cancellations = [];
  const receivers = [];
  let disposeCount = 0;
  let nextId = 0;
  const runtime = {
    next() { return "accepted"; },
    previous() { return "accepted"; },
    tick() {},
    getSnapshot() { return {}; },
    dispose() { disposeCount += 1; },
  };
  return {
    wheelTarget,
    pointerTarget,
    keyboardTarget,
    runtime,
    frames,
    cancellations,
    frameSource: {
      requestAnimationFrame(callback) {
        receivers.push(this);
        if (failRequest) throw new Error("cannot schedule");
        const id = ++nextId;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id) {
        receivers.push(this);
        cancellations.push(id);
        frames.delete(id);
        if (failCancel) throw new Error("cannot cancel");
      },
    },
    receivers,
    pointerPolicy: { handle() { return null; }, abort() {} },
    get disposeCount() { return disposeCount; },
  };
}

function bind(entry, overrides = {}) {
  return bindDomFlowHost({
    runtime: entry.runtime,
    wheelTarget: entry.wheelTarget,
    pointerTarget: entry.pointerTarget,
    keyboardTarget: entry.keyboardTarget,
    resolveWheelIntent: () => null,
    resolveKeyboardIntent: () => null,
    pointerPolicy: entry.pointerPolicy,
    frameSource: entry.frameSource,
    onFrame: () => {},
    ...overrides,
  });
}

function listenerCount(entry) {
  return entry.wheelTarget.count() + entry.pointerTarget.count() + entry.keyboardTarget.count();
}

test("host composes one input binding with one started scheduler", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  assert.equal(listenerCount(entry), 6);
  assert.equal(entry.frames.size, 1);
  cleanup();
  assert.equal(listenerCount(entry), 0);
  assert.equal(entry.frames.size, 0);
  assert.deepEqual(entry.cancellations, [1]);
  assert.deepEqual(entry.receivers, [entry.frameSource, entry.frameSource]);
  assert.equal(entry.disposeCount, 0);
});

test("host requires an explicit valid frame source without consulting globals", () => {
  const originalWindow = globalThis.window;
  let globalRequests = 0;
  globalThis.window = {
    requestAnimationFrame() { globalRequests += 1; },
    cancelAnimationFrame() {},
  };
  try {
    for (const frameSource of [undefined, null, {}, {
      requestAnimationFrame() {},
    }, {
      cancelAnimationFrame() {},
    }]) {
      const entry = fixture();
      assert.throws(() => bind(entry, { frameSource }), /frameSource/);
      assert.equal(listenerCount(entry), 0);
      assert.equal(entry.disposeCount, 0);
    }
    assert.equal(globalRequests, 0);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("host cleanup is repeat-safe and leaves Runtime undisposed", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  cleanup();
  cleanup();
  assert.deepEqual(entry.cancellations, [1]);
  assert.equal(listenerCount(entry), 0);
  assert.equal(entry.disposeCount, 0);
});

test("scheduler startup failure releases the already-created input binding", () => {
  const entry = fixture({ failRequest: true });
  assert.throws(() => bind(entry), /cannot schedule/);
  assert.equal(listenerCount(entry), 0);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});

test("scheduler cleanup failure does not skip input cleanup", () => {
  const entry = fixture({ failCancel: true });
  const cleanup = bind(entry);
  assert.throws(() => cleanup(), /cannot cancel/);
  assert.equal(listenerCount(entry), 0);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});

test("input cleanup failure does not skip scheduler cleanup", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  entry.keyboardTarget.failOnRemove = "keydown";
  assert.throws(() => cleanup(), /cannot remove keydown/);
  assert.deepEqual(entry.cancellations, [1]);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});
