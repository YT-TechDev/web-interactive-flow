import assert from "node:assert/strict";
import test from "node:test";

import { createAcceptedPointerRecognizer } from "../../adapters/dom/accepted_pointer_recognizer.mjs";
import { bindDomFlowInputs } from "../../adapters/dom/input_host.mjs";
import { createFrameScheduler } from "../../bridge/frame_scheduler.mjs";

class Target {
  listeners = new Map();
  adds = [];
  removes = [];
  failOnAdd = null;
  failOnRemove = null;

  addEventListener(type, listener, options) {
    this.adds.push([type, listener, options]);
    if (type === this.failOnAdd) throw new Error(`cannot add ${type}`);
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener, options) {
    this.removes.push([type, listener, options]);
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
    if (type === this.failOnRemove) throw new Error(`cannot remove ${type}`);
  }

  dispatch(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  count() {
    return [...this.listeners.values()].reduce((total, list) => total + list.length, 0);
  }
}

function createPointerPolicy(feedback = []) {
  const policy = createAcceptedPointerRecognizer({
    admitPointer: () => true,
    project: (event) => event.clientY,
    qualify: (distance) => Math.abs(distance) >= 10,
    mapIntent: (distance) => distance > 0 ? "next" : "previous",
    shouldPropose: (event) => event.type === "pointermove",
  });
  const originalFeedback = policy.onDisposition;
  policy.onDisposition = function (intent, disposition) {
    feedback.push([intent, disposition]);
    originalFeedback.call(this, intent, disposition);
  };
  return policy;
}

function fixture({ dispositions = [] } = {}) {
  const requests = [];
  let disposeCount = 0;
  const feedback = [];
  return {
    wheelTarget: new Target(),
    pointerTarget: new Target(),
    keyboardTarget: new Target(),
    requests,
    feedback,
    runtime: {
      next() { requests.push("next"); return dispositions.shift() ?? "accepted"; },
      previous() { requests.push("previous"); return dispositions.shift() ?? "accepted"; },
      dispose() { disposeCount += 1; },
    },
    pointerPolicy: createPointerPolicy(feedback),
    get disposeCount() { return disposeCount; },
  };
}

function bind(entry, overrides = {}) {
  return bindDomFlowInputs({
    runtime: entry.runtime,
    wheelTarget: entry.wheelTarget,
    pointerTarget: entry.pointerTarget,
    keyboardTarget: entry.keyboardTarget,
    resolveWheelIntent: (event) => event.intent,
    resolveKeyboardIntent: (event) => event.intent,
    pointerPolicy: entry.pointerPolicy,
    ...overrides,
  });
}

test("three explicit targets install isolated wheel, pointer, and keyboard listeners", () => {
  const entry = fixture();
  const wheelEvents = [];
  const keyboardEvents = [];
  const cleanup = bind(entry, {
    resolveWheelIntent(event) { wheelEvents.push(event); return null; },
    resolveKeyboardIntent(event) { keyboardEvents.push(event); return null; },
  });

  assert.equal(entry.wheelTarget.count(), 1);
  assert.equal(entry.pointerTarget.count(), 4);
  assert.equal(entry.keyboardTarget.count(), 1);

  const wheel = { type: "wheel" };
  entry.pointerTarget.dispatch("wheel", wheel);
  entry.keyboardTarget.dispatch("wheel", wheel);
  entry.wheelTarget.dispatch("wheel", wheel);
  entry.wheelTarget.dispatch("pointerdown", { type: "pointerdown", pointerId: 1, clientY: 100 });
  entry.wheelTarget.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 80 });
  entry.pointerTarget.dispatch("pointerdown", { type: "pointerdown", pointerId: 2, clientY: 100 });
  entry.pointerTarget.dispatch("pointermove", { type: "pointermove", pointerId: 2, clientY: 80 });
  const key = { type: "keydown" };
  entry.wheelTarget.dispatch("keydown", key);
  entry.pointerTarget.dispatch("keydown", key);
  entry.keyboardTarget.dispatch("keydown", key);

  assert.deepEqual(wheelEvents, [wheel]);
  assert.deepEqual(keyboardEvents, [key]);
  assert.deepEqual(entry.requests, ["next"]);
  cleanup();
});

test("missing targets are rejected instead of aliased", () => {
  for (const missing of ["wheelTarget", "pointerTarget", "keyboardTarget"]) {
    const entry = fixture();
    assert.throws(() => bind(entry, { [missing]: undefined }), /invalid .* listener target/);
    assert.equal(entry.wheelTarget.count() + entry.pointerTarget.count() + entry.keyboardTarget.count(), 0);
  }
});

test("wheel and keyboard accepted/rejected prevention remains delegated", () => {
  const entry = fixture({ dispositions: ["rejected", "accepted", "rejected", "accepted"] });
  const cleanup = bind(entry);
  let wheelPrevented = 0;
  let keyboardPrevented = 0;
  const wheel = { intent: "next", cancelable: true, preventDefault() { wheelPrevented += 1; } };
  const key = { intent: "previous", cancelable: true, preventDefault() { keyboardPrevented += 1; } };

  entry.wheelTarget.dispatch("wheel", wheel);
  entry.wheelTarget.dispatch("wheel", wheel);
  entry.keyboardTarget.dispatch("keydown", key);
  entry.keyboardTarget.dispatch("keydown", key);

  assert.deepEqual(entry.requests, ["next", "next", "previous", "previous"]);
  assert.equal(wheelPrevented, 1);
  assert.equal(keyboardPrevented, 1);
  cleanup();
});

test("prevention configuration and resolver declines remain delegated", () => {
  const entry = fixture();
  const cleanup = bind(entry, {
    preventWheelDefault: false,
    preventKeyboardDefault: false,
    resolveWheelIntent: () => null,
    resolveKeyboardIntent: () => null,
  });
  const event = { cancelable: true, preventDefault() { throw new Error("unexpected prevention"); } };
  entry.wheelTarget.dispatch("wheel", event);
  entry.keyboardTarget.dispatch("keydown", event);
  assert.deepEqual(entry.requests, []);
  cleanup();
});

test("pointer disposition feedback remains synchronous", () => {
  const entry = fixture({ dispositions: ["rejected", "accepted"] });
  const cleanup = bind(entry);
  entry.pointerTarget.dispatch("pointerdown", { type: "pointerdown", pointerId: 1, clientY: 100 });
  entry.pointerTarget.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 80 });
  entry.pointerTarget.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 120 });
  assert.deepEqual(entry.requests, ["next", "previous"]);
  assert.deepEqual(entry.feedback, [["next", "rejected"], ["previous", "accepted"]]);
  cleanup();
});

test("cleanup removes all listeners, is idempotent, and does not dispose Runtime", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  cleanup();
  const removals = entry.wheelTarget.removes.length + entry.pointerTarget.removes.length + entry.keyboardTarget.removes.length;
  cleanup();
  assert.equal(entry.wheelTarget.count() + entry.pointerTarget.count() + entry.keyboardTarget.count(), 0);
  assert.equal(entry.wheelTarget.removes.length + entry.pointerTarget.removes.length + entry.keyboardTarget.removes.length, removals);
  assert.equal(entry.disposeCount, 0);
});

test("pointer setup failure rolls back its partial state and prior wheel binding", () => {
  const entry = fixture();
  entry.pointerTarget.failOnAdd = "pointerup";
  assert.throws(() => bind(entry), /cannot add pointerup/);
  assert.equal(entry.wheelTarget.count() + entry.pointerTarget.count() + entry.keyboardTarget.count(), 0);
  assert.equal(entry.disposeCount, 0);
});

test("keyboard setup failure rolls back pointer and wheel bindings", () => {
  const entry = fixture();
  entry.keyboardTarget.failOnAdd = "keydown";
  assert.throws(() => bind(entry), /cannot add keydown/);
  assert.equal(entry.wheelTarget.count() + entry.pointerTarget.count() + entry.keyboardTarget.count(), 0);
  assert.equal(entry.disposeCount, 0);
});

test("cleanup preserves the first failure and still attempts later owned releases", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  entry.keyboardTarget.failOnRemove = "keydown";
  entry.pointerTarget.failOnRemove = "pointerdown";
  assert.throws(() => cleanup(), /cannot remove keydown/);
  assert.equal(entry.keyboardTarget.count(), 0);
  assert.equal(entry.wheelTarget.count(), 0);
  assert.equal(entry.pointerTarget.count(), 0);
  assert.equal(entry.disposeCount, 0);
});

test("cleanup and rebind abort stale pointer state while preserving fresh input", () => {
  const entry = fixture();
  const reusablePolicy = entry.pointerPolicy;
  const targetA = entry.pointerTarget;
  const cleanupA = bind(entry);
  targetA.dispatch("pointerdown", { type: "pointerdown", pointerId: 7, clientY: 100 });
  cleanupA();

  const targetB = new Target();
  const cleanupB = bind(entry, { pointerTarget: targetB, pointerPolicy: reusablePolicy });
  targetB.dispatch("pointermove", { type: "pointermove", pointerId: 7, clientY: 50 });
  targetB.dispatch("pointerup", { type: "pointerup", pointerId: 7, clientY: 50 });
  assert.deepEqual(entry.requests, []);
  targetB.dispatch("pointerdown", { type: "pointerdown", pointerId: 8, clientY: 100 });
  targetB.dispatch("pointermove", { type: "pointermove", pointerId: 8, clientY: 80 });
  assert.deepEqual(entry.requests, ["next"]);
  cleanupB();
});

test("stopping an independent scheduler leaves the input binding active", () => {
  const entry = fixture();
  const frames = new Map();
  const cancellations = [];
  let id = 0;
  const runtime = {
    ...entry.runtime,
    tick() {},
    getSnapshot() { return {}; },
  };
  entry.runtime = runtime;

  const scheduler = createFrameScheduler({
    runtime,
    requestFrame(callback) {
      const nextId = ++id;
      frames.set(nextId, callback);
      return nextId;
    },
    cancelFrame(requestId) {
      cancellations.push(requestId);
      frames.delete(requestId);
    },
    onFrame() {},
  });

  scheduler.start();
  const cleanupInputs = bind(entry);
  scheduler.stop();

  assert.equal(
    entry.wheelTarget.count()
      + entry.pointerTarget.count()
      + entry.keyboardTarget.count(),
    6,
  );

  entry.wheelTarget.dispatch("wheel", {
    intent: "next",
    cancelable: false,
    preventDefault() {},
  });
  assert.deepEqual(entry.requests, ["next"]);
  assert.deepEqual(cancellations, [1]);

  cleanupInputs();
  assert.equal(
    entry.wheelTarget.count()
      + entry.pointerTarget.count()
      + entry.keyboardTarget.count(),
    0,
  );
  assert.equal(entry.disposeCount, 0);
});

test("input cleanup and rebind do not stop or rebase an independent scheduler epoch", () => {
  const entry = fixture();
  const ticks = [];
  const frames = new Map();
  const cancellations = [];
  let id = 0;
  const runtime = {
    ...entry.runtime,
    tick(dt) { ticks.push(dt); },
    getSnapshot() { return { ticks: [...ticks] }; },
  };
  entry.runtime = runtime;
  const scheduler = createFrameScheduler({
    runtime,
    requestFrame(callback) { const nextId = ++id; frames.set(nextId, callback); return nextId; },
    cancelFrame(requestId) { cancellations.push(requestId); frames.delete(requestId); },
    onFrame() {},
  });
  scheduler.start();
  frames.get(1)(100);
  const cleanupA = bind(entry);
  cleanupA();
  const cleanupB = bind(entry, { pointerTarget: new Target() });
  cleanupB();
  frames.get(2)(116.5);

  assert.deepEqual(ticks, [16500]);
  assert.deepEqual(cancellations, []);
  assert.equal(frames.has(3), true);
  scheduler.stop();
  assert.deepEqual(cancellations, [3]);
  assert.equal(entry.disposeCount, 0);
});
