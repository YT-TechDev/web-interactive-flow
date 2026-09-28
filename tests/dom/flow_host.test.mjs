import assert from "node:assert/strict";
import test from "node:test";

import { createAcceptedPointerRecognizer } from "../../adapters/dom/accepted_pointer_recognizer.mjs";
import { bindDomFlowHost } from "../../adapters/dom/flow_host.mjs";

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

function fixture({ dispositions = [], failRequest = false } = {}) {
  const target = new Target();
  const keyboardTarget = new Target();
  const requests = [];
  const ticks = [];
  const frames = new Map();
  const cancellations = [];
  let nextFrameId = 1;
  let disposeCount = 0;
  const runtime = {
    next() { requests.push("next"); return dispositions.shift() ?? "accepted"; },
    previous() { requests.push("previous"); return dispositions.shift() ?? "accepted"; },
    tick(dt) { ticks.push(dt); },
    getSnapshot() { return { ticks: [...ticks] }; },
    dispose() { disposeCount += 1; },
  };
  const feedback = [];
  const pointerPolicy = createAcceptedPointerRecognizer({
    admitPointer: () => true,
    project: (event) => event.clientY,
    qualify: (distance) => Math.abs(distance) >= 10,
    mapIntent: (distance) => distance > 0 ? "next" : "previous",
    shouldPropose: (event) => event.type === "pointermove",
  });
  const originalFeedback = pointerPolicy.onDisposition;
  pointerPolicy.onDisposition = function (intent, disposition) {
    feedback.push([intent, disposition]);
    originalFeedback.call(this, intent, disposition);
  };
  const requestFrame = (callback) => {
    if (failRequest) throw new Error("cannot schedule");
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  };
  const cancelFrame = (id) => { cancellations.push(id); frames.delete(id); };

  return {
    target, keyboardTarget, runtime, pointerPolicy, requests, feedback, frames, cancellations,
    requestFrame, cancelFrame,
    get disposeCount() { return disposeCount; },
  };
}

function bind(entry, overrides = {}) {
  return bindDomFlowHost({
    runtime: entry.runtime,
    target: entry.target,
    resolveWheelIntent: (event) => event.intent,
    keyboardTarget: entry.keyboardTarget,
    resolveKeyboardIntent: (event) => event.intent,
    pointerPolicy: entry.pointerPolicy,
    requestFrame: entry.requestFrame,
    cancelFrame: entry.cancelFrame,
    onFrame: () => {},
    ...overrides,
  });
}

test("composition starts one scheduler and owns wheel, pointer, and explicit keyboard listeners", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  assert.equal(entry.frames.size, 1);
  assert.equal(entry.target.count(), 5);
  assert.equal(entry.keyboardTarget.count(), 1);
  cleanup();
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.target.count(), 0);
  assert.equal(entry.keyboardTarget.count(), 0);
  assert.deepEqual(entry.cancellations, [1]);
  assert.equal(entry.disposeCount, 0);
});

test("cleanup is idempotent, attempts every release, and never disposes Runtime", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  cleanup();
  const removalCount = entry.target.removes.length;
  const keyboardRemovalCount = entry.keyboardTarget.removes.length;
  cleanup();
  assert.equal(entry.target.removes.length, removalCount);
  assert.equal(entry.keyboardTarget.removes.length, keyboardRemovalCount);
  assert.deepEqual(entry.cancellations, [1]);
  assert.equal(entry.disposeCount, 0);
});

test("keyboard uses its distinct explicit target and preserves resolver and Runtime dispositions", () => {
  const entry = fixture({ dispositions: ["accepted", "rejected"] });
  const seen = [];
  const cleanup = bind(entry, {
    resolveKeyboardIntent(event) {
      seen.push(event);
      return event.intent;
    },
  });
  let prevented = 0;
  const accepted = { intent: "next", cancelable: true, preventDefault() { prevented += 1; } };
  const rejected = { intent: "previous", cancelable: true, preventDefault() { prevented += 1; } };
  entry.target.dispatch("keydown", { intent: "previous" });
  entry.keyboardTarget.dispatch("keydown", accepted);
  entry.keyboardTarget.dispatch("keydown", rejected);
  assert.deepEqual(seen, [accepted, rejected]);
  assert.deepEqual(entry.requests, ["next", "previous"]);
  assert.equal(prevented, 1);
  cleanup();
});

test("keyboard resolver decline produces no semantic request", () => {
  const entry = fixture();
  const cleanup = bind(entry, { resolveKeyboardIntent: () => null });
  entry.keyboardTarget.dispatch("keydown", {
    intent: "next", cancelable: true, preventDefault() { throw new Error("unexpected prevention"); },
  });
  assert.deepEqual(entry.requests, []);
  cleanup();
});

test("wheel preserves Runtime disposition as accepted-only prevention authority", () => {
  const entry = fixture({ dispositions: ["rejected", "accepted"] });
  const cleanup = bind(entry);
  let prevented = 0;
  const event = { intent: "next", cancelable: true, preventDefault() { prevented += 1; } };
  entry.target.dispatch("wheel", event);
  entry.target.dispatch("wheel", event);
  assert.deepEqual(entry.requests, ["next", "next"]);
  assert.equal(prevented, 1);
  cleanup();
});

test("pointer recognizer feedback survives composition and rejection does not commit", () => {
  const entry = fixture({ dispositions: ["rejected", "accepted"] });
  const cleanup = bind(entry);
  entry.target.dispatch("pointerdown", { type: "pointerdown", pointerId: 1, clientY: 100 });
  entry.target.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 80 });
  entry.target.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 120 });
  entry.target.dispatch("pointermove", { type: "pointermove", pointerId: 1, clientY: 70 });
  assert.deepEqual(entry.requests, ["next", "previous"]);
  assert.deepEqual(entry.feedback, [["next", "rejected"], ["previous", "accepted"]]);
  cleanup();
});

test("scheduler startup failure rolls back every installed listener", () => {
  const entry = fixture({ failRequest: true });
  assert.throws(() => bind(entry), /cannot schedule/);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.target.count(), 0);
  assert.equal(entry.keyboardTarget.count(), 0);
  assert.equal(entry.disposeCount, 0);
});

test("keyboard setup failure rolls back wheel and pointer listeners", () => {
  const entry = fixture();
  entry.keyboardTarget.failOnAdd = "keydown";
  assert.throws(() => bind(entry), /cannot add keydown/);
  assert.equal(entry.target.count(), 0);
  assert.equal(entry.keyboardTarget.count(), 0);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});

test("one cleanup failure does not prevent later resources from being released", () => {
  const entry = fixture();
  const cleanup = bind(entry);
  entry.keyboardTarget.failOnRemove = "keydown";
  assert.throws(() => cleanup(), /cannot remove keydown/);
  assert.equal(entry.keyboardTarget.count(), 0);
  assert.equal(entry.target.count(), 0);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});

test("pointer setup failure rolls back its partial listeners and the wheel listener", () => {
  const entry = fixture();
  entry.target.failOnAdd = "pointerup";
  assert.throws(() => bind(entry), /cannot add pointerup/);
  assert.equal(entry.target.count(), 0);
  assert.equal(entry.frames.size, 0);
  assert.equal(entry.disposeCount, 0);
});
