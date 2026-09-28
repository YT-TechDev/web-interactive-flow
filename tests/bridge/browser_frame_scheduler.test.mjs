import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBrowserFrameScheduler } from "../../bridge/browser_frame_scheduler.mjs";

function fixture() {
  const pending = new Map();
  const requestedReceivers = [];
  const cancelledReceivers = [];
  const cancelled = [];
  const ticks = [];
  const snapshots = [];
  let nextRequestId = 0;
  let disposeCount = 0;

  const frameSource = {
    requestAnimationFrame(callback) {
      requestedReceivers.push(this);
      const requestId = ++nextRequestId;
      pending.set(requestId, callback);
      return requestId;
    },
    cancelAnimationFrame(requestId) {
      cancelledReceivers.push(this);
      cancelled.push(requestId);
      pending.delete(requestId);
    },
  };
  const runtime = {
    tick(value) { ticks.push(value); },
    getSnapshot() {
      const snapshot = { observation: snapshots.length + 1, ticks: [...ticks] };
      snapshots.push(snapshot);
      return snapshot;
    },
    dispose() { disposeCount += 1; },
  };
  const observed = [];
  const scheduler = createBrowserFrameScheduler({
    runtime,
    frameSource,
    onFrame(snapshot) { observed.push(snapshot); },
  });

  function deliver(timestamp) {
    const [requestId, callback] = pending.entries().next().value;
    pending.delete(requestId);
    callback(timestamp);
  }

  return {
    frameSource, runtime, scheduler, pending, requestedReceivers,
    cancelledReceivers, cancelled, ticks, snapshots, observed, deliver,
    get disposeCount() { return disposeCount; },
  };
}

test("an explicit frameSource with both callable browser methods is required", () => {
  const runtime = { tick() {}, getSnapshot() { return {}; } };
  const onFrame = () => {};
  for (const frameSource of [undefined, null, 1, "window", {}, {
    requestAnimationFrame() {},
  }, {
    cancelAnimationFrame() {},
  }, {
    requestAnimationFrame: 1,
    cancelAnimationFrame() {},
  }, {
    requestAnimationFrame() {},
    cancelAnimationFrame: 1,
  }]) {
    assert.throws(
      () => createBrowserFrameScheduler({ runtime, frameSource, onFrame }),
      /frameSource/,
    );
  }
});

test("delegates start and stop while preserving browser method receivers", () => {
  const entry = fixture();
  entry.scheduler.start();
  entry.scheduler.start();
  assert.equal(entry.pending.size, 1);
  assert.deepEqual(entry.requestedReceivers, [entry.frameSource]);

  entry.scheduler.stop();
  entry.scheduler.stop();
  assert.equal(entry.pending.size, 0);
  assert.deepEqual(entry.cancelled, [1]);
  assert.deepEqual(entry.cancelledReceivers, [entry.frameSource]);
  assert.equal(entry.disposeCount, 0);
});

test("delegates timestamp normalization, snapshot observation, and restart epochs", () => {
  const entry = fixture();
  entry.scheduler.start();
  entry.deliver(10.25);
  assert.deepEqual(entry.ticks, []);
  assert.equal(entry.observed.length, 1);
  assert.equal(entry.observed[0], entry.snapshots[0]);

  entry.deliver(12.75);
  assert.deepEqual(entry.ticks, [2500]);
  assert.equal(entry.observed.length, 2);
  assert.equal(entry.observed[1], entry.snapshots[1]);

  entry.scheduler.stop();
  entry.scheduler.start();
  entry.deliver(50);
  assert.deepEqual(entry.ticks, [2500]);
  assert.equal(entry.observed.length, 3);
  assert.equal(entry.observed[2], entry.snapshots[2]);
  assert.equal(entry.disposeCount, 0);
  entry.scheduler.stop();
});

test("binding source owns no visibility, input, Runtime, or scheduler lifecycle policy", async () => {
  const source = await readFile(
    new URL("../../bridge/browser_frame_scheduler.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:window|globalThis|document|visibilitychange|hidden)\b/);
  assert.doesNotMatch(source, /\b(?:wheel|pointer|keyboard)\b/i);
  assert.doesNotMatch(source, /runtime\.(?:tick|getSnapshot|dispose)\s*\(/);
  assert.doesNotMatch(source, /\b(?:running|pendingRequestId|clock)\b/);
  assert.match(source, /createFrameScheduler\s*\(/);
});
