import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFrameScheduler } from "../../bridge/frame_scheduler.mjs";
import { createFlowRuntime } from "../../bridge/runtime.mjs";

const INT32_MAX = 2_147_483_647;

function createFakeFrameApi({
  ids = [],
  throwOnRequestNumber = null,
  throwOnCancel = false,
} = {}) {
  let fallbackId = 1000;
  let idIndex = 0;
  let requestCount = 0;
  const pending = new Map();
  const cancelled = [];

  function requestFrame(callback) {
    requestCount += 1;

    if (throwOnRequestNumber === requestCount) {
      throw new Error("requestFrame failure");
    }

    const id = idIndex < ids.length ? ids[idIndex] : fallbackId++;
    idIndex += 1;
    pending.set(id, callback);
    return id;
  }

  function cancelFrame(id) {
    cancelled.push(id);
    pending.delete(id);
    if (throwOnCancel) {
      throw new Error("cancelFrame failure");
    }
  }

  function deliver(id, timestampMs) {
    const callback = pending.get(id);
    assert.equal(typeof callback, "function", `missing pending frame ${String(id)}`);
    pending.delete(id);
    return callback(timestampMs);
  }

  return {
    requestFrame,
    cancelFrame,
    deliver,
    getCallback(id) {
      return pending.get(id);
    },
    pendingIds() {
      return [...pending.keys()];
    },
    cancelled,
    get requestCount() {
      return requestCount;
    },
  };
}

function createFakeRuntime({
  tickFailure = null,
  snapshotFailure = false,
} = {}) {
  const trace = [];
  const ticks = [];
  let snapshotCount = 0;
  let disposeCount = 0;

  const runtime = {
    tick(value) {
      trace.push(["tick", value]);
      ticks.push(value);
      if (tickFailure !== null && ticks.length === tickFailure) {
        throw new Error("tick failure");
      }
    },
    getSnapshot() {
      trace.push(["snapshot"]);
      snapshotCount += 1;
      if (snapshotFailure) {
        throw new Error("snapshot failure");
      }
      return {
        snapshotCount,
        ticks: [...ticks],
      };
    },
    dispose() {
      disposeCount += 1;
    },
  };

  return {
    runtime,
    trace,
    ticks,
    get snapshotCount() {
      return snapshotCount;
    },
    get disposeCount() {
      return disposeCount;
    },
  };
}

function createObservedScheduler({
  frameApi = createFakeFrameApi(),
  fakeRuntime = createFakeRuntime(),
  onFrame,
} = {}) {
  const observations = [];
  let scheduler;

  scheduler = createFrameScheduler({
    runtime: fakeRuntime.runtime,
    requestFrame: frameApi.requestFrame,
    cancelFrame: frameApi.cancelFrame,
    onFrame:
      onFrame ??
      ((snapshot) => {
        fakeRuntime.trace.push(["observer", snapshot]);
        observations.push(snapshot);
      }),
  });

  return {
    scheduler,
    frameApi,
    fakeRuntime,
    observations,
  };
}

const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

test("F01/F02: first and equal-timestamp frames observe once without ticking", () => {
  const frameApi = createFakeFrameApi({ ids: [0, 1, 2] });
  const { scheduler, fakeRuntime, observations } = createObservedScheduler({
    frameApi,
  });

  scheduler.start();
  assert.equal(frameApi.requestCount, 1);
  assert.deepEqual(frameApi.pendingIds(), [0]);

  // Request ID 0 is a valid opaque pending identifier.
  scheduler.start();
  assert.equal(frameApi.requestCount, 1);

  frameApi.deliver(0, 1000.25);
  assert.deepEqual(fakeRuntime.ticks, []);
  assert.equal(fakeRuntime.snapshotCount, 1);
  assert.equal(observations.length, 1);
  assert.deepEqual(frameApi.pendingIds(), [1]);

  frameApi.deliver(1, 1000.25);
  assert.deepEqual(fakeRuntime.ticks, []);
  assert.equal(fakeRuntime.snapshotCount, 2);
  assert.equal(observations.length, 2);
  assert.deepEqual(frameApi.pendingIds(), [2]);

  scheduler.stop();
});

test("F03/F07: all long-gap chunks precede one snapshot and observer", () => {
  const frameApi = createFakeFrameApi({ ids: [10, 11, 12] });
  const fakeRuntime = createFakeRuntime();
  const observations = [];

  const scheduler = createFrameScheduler({
    runtime: fakeRuntime.runtime,
    requestFrame: frameApi.requestFrame,
    cancelFrame: frameApi.cancelFrame,
    onFrame(snapshot) {
      fakeRuntime.trace.push(["observer", snapshot]);
      observations.push(snapshot);
    },
  });

  scheduler.start();
  frameApi.deliver(10, 0);

  fakeRuntime.trace.length = 0;
  fakeRuntime.ticks.length = 0;
  observations.length = 0;

  frameApi.deliver(11, 2_147_483.648);

  assert.deepEqual(fakeRuntime.ticks, [INT32_MAX, 1]);
  assert.deepEqual(
    fakeRuntime.trace.map(([kind]) => kind),
    ["tick", "tick", "snapshot", "observer"],
  );
  assert.equal(observations.length, 1);

  scheduler.stop();
});

test("F04: scheduler owns at most one pending request and double start is inert", () => {
  const frameApi = createFakeFrameApi({ ids: [0, 7, 9] });
  const { scheduler } = createObservedScheduler({ frameApi });

  scheduler.start();
  scheduler.start();
  scheduler.start();

  assert.equal(frameApi.requestCount, 1);
  assert.deepEqual(frameApi.pendingIds(), [0]);

  frameApi.deliver(0, 1);
  assert.equal(frameApi.requestCount, 2);
  assert.deepEqual(frameApi.pendingIds(), [7]);

  scheduler.start();
  assert.equal(frameApi.requestCount, 2);
  assert.deepEqual(frameApi.pendingIds(), [7]);

  scheduler.stop();
});

test("F05: stop cancels pending request and stale callback is inert", () => {
  const frameApi = createFakeFrameApi({ ids: [3] });
  const fakeRuntime = createFakeRuntime();
  const observations = [];
  const scheduler = createFrameScheduler({
    runtime: fakeRuntime.runtime,
    requestFrame: frameApi.requestFrame,
    cancelFrame: frameApi.cancelFrame,
    onFrame(snapshot) {
      observations.push(snapshot);
    },
  });

  scheduler.start();
  const stale = frameApi.getCallback(3);
  assert.equal(typeof stale, "function");

  scheduler.stop();
  assert.deepEqual(frameApi.cancelled, [3]);
  assert.deepEqual(frameApi.pendingIds(), []);

  stale(100);

  assert.deepEqual(fakeRuntime.ticks, []);
  assert.equal(fakeRuntime.snapshotCount, 0);
  assert.deepEqual(observations, []);
  assert.equal(frameApi.requestCount, 1);

  scheduler.stop();
});

test("F06: restart establishes a fresh epoch without disposing Runtime", () => {
  const frameApi = createFakeFrameApi({ ids: [1, 2, 3, 4] });
  const fakeRuntime = createFakeRuntime();
  const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

  scheduler.start();
  frameApi.deliver(1, 100);
  frameApi.deliver(2, 101);
  assert.deepEqual(fakeRuntime.ticks, [1000]);

  scheduler.stop();
  scheduler.start();

  frameApi.deliver(3, 5000);
  assert.deepEqual(fakeRuntime.ticks, [1000]);
  assert.equal(fakeRuntime.disposeCount, 0);

  frameApi.deliver(4, 5000.5);
  assert.deepEqual(fakeRuntime.ticks, [1000, 500]);

  scheduler.stop();
});

test("F08: observer stop prevents the current callback from rescheduling", () => {
  const frameApi = createFakeFrameApi({ ids: [20, 21] });
  const fakeRuntime = createFakeRuntime();
  let scheduler;
  let observerCalls = 0;

  scheduler = createFrameScheduler({
    runtime: fakeRuntime.runtime,
    requestFrame: frameApi.requestFrame,
    cancelFrame: frameApi.cancelFrame,
    onFrame() {
      observerCalls += 1;
      scheduler.stop();
    },
  });

  scheduler.start();
  frameApi.deliver(20, 1);

  assert.equal(observerCalls, 1);
  assert.equal(frameApi.requestCount, 1);
  assert.deepEqual(frameApi.pendingIds(), []);
  assert.equal(fakeRuntime.disposeCount, 0);
});

test("F09: timestamp regression stops scheduler and prevents reschedule", () => {
  const frameApi = createFakeFrameApi({ ids: [30, 31, 32] });
  const { scheduler } = createObservedScheduler({ frameApi });

  scheduler.start();
  frameApi.deliver(30, 10);

  assert.throws(() => frameApi.deliver(31, 9));
  assert.equal(frameApi.requestCount, 2);
  assert.deepEqual(frameApi.pendingIds(), []);

  scheduler.start();
  assert.equal(frameApi.requestCount, 3);
  scheduler.stop();
});

test("F09: tick, snapshot, observer, and next-request failures stop without disposing Runtime", () => {
  {
    const frameApi = createFakeFrameApi({ ids: [40, 41] });
    const fakeRuntime = createFakeRuntime({ tickFailure: 1 });
    const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

    scheduler.start();
    frameApi.deliver(40, 0);
    assert.throws(() => frameApi.deliver(41, 0.001));
    assert.deepEqual(frameApi.pendingIds(), []);
    assert.equal(fakeRuntime.disposeCount, 0);
  }

  {
    const frameApi = createFakeFrameApi({ ids: [50] });
    const fakeRuntime = createFakeRuntime({ snapshotFailure: true });
    const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

    scheduler.start();
    assert.throws(() => frameApi.deliver(50, 0));
    assert.deepEqual(frameApi.pendingIds(), []);
    assert.equal(fakeRuntime.disposeCount, 0);
  }

  {
    const frameApi = createFakeFrameApi({ ids: [60] });
    const fakeRuntime = createFakeRuntime();
    const scheduler = createFrameScheduler({
      runtime: fakeRuntime.runtime,
      requestFrame: frameApi.requestFrame,
      cancelFrame: frameApi.cancelFrame,
      onFrame() {
        throw new Error("observer failure");
      },
    });

    scheduler.start();
    assert.throws(() => frameApi.deliver(60, 0));
    assert.deepEqual(frameApi.pendingIds(), []);
    assert.equal(fakeRuntime.disposeCount, 0);
  }

  {
    const frameApi = createFakeFrameApi({
      ids: [70],
      throwOnRequestNumber: 2,
    });
    const fakeRuntime = createFakeRuntime();
    const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

    scheduler.start();
    assert.throws(() => frameApi.deliver(70, 0));
    assert.deepEqual(frameApi.pendingIds(), []);
    assert.equal(fakeRuntime.disposeCount, 0);

    // A later explicit start must create a fresh epoch, not remain half-running.
    scheduler.start();
    scheduler.stop();
  }
});

test("initial request failure and cancellation failure leave scheduler stopped", () => {
  {
    const frameApi = createFakeFrameApi({ throwOnRequestNumber: 1 });
    const fakeRuntime = createFakeRuntime();
    const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

    assert.throws(() => scheduler.start());
    assert.equal(fakeRuntime.disposeCount, 0);
  }

  {
    const frameApi = createFakeFrameApi({
      ids: [80, 81],
      throwOnCancel: true,
    });
    const fakeRuntime = createFakeRuntime();
    const { scheduler } = createObservedScheduler({ frameApi, fakeRuntime });

    scheduler.start();
    assert.throws(() => scheduler.stop());
    assert.deepEqual(frameApi.pendingIds(), []);
    assert.equal(fakeRuntime.disposeCount, 0);

    // stop() changed state before host cancellation failed.
    scheduler.stop();
  }
});

test("F10: independent schedulers do not share frame or epoch state", () => {
  const framesA = createFakeFrameApi({ ids: [1, 2, 3] });
  const framesB = createFakeFrameApi({ ids: [10, 11, 12] });
  const runtimeA = createFakeRuntime();
  const runtimeB = createFakeRuntime();

  const a = createObservedScheduler({
    frameApi: framesA,
    fakeRuntime: runtimeA,
  }).scheduler;
  const b = createObservedScheduler({
    frameApi: framesB,
    fakeRuntime: runtimeB,
  }).scheduler;

  a.start();
  b.start();

  framesA.deliver(1, 100);
  framesB.deliver(10, 500);
  framesA.deliver(2, 101);

  assert.deepEqual(runtimeA.ticks, [1000]);
  assert.deepEqual(runtimeB.ticks, []);

  a.stop();

  framesB.deliver(11, 500.25);
  assert.deepEqual(runtimeB.ticks, [250]);
  assert.deepEqual(framesA.pendingIds(), []);
  assert.deepEqual(framesB.pendingIds(), [12]);

  b.stop();
});

test("real semantic runtime observer sees post-tick snapshots and reported-gap catch-up", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 2000,
    cooldown: 1000,
  });
  const frames = createFakeFrameApi({ ids: [100, 101, 102, 103] });
  const snapshots = [];

  assert.equal(runtime.next(), "accepted");

  const scheduler = createFrameScheduler({
    runtime,
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    onFrame(snapshot) {
      snapshots.push(snapshot);
    },
  });

  scheduler.start();

  frames.deliver(100, 100);
  assert.deepEqual(snapshots.at(-1), {
    selected: "B",
    transition: {
      direction: "forward",
      rawProgress: 0,
    },
    cooldownActive: false,
    locked: false,
  });

  frames.deliver(101, 101);
  assert.deepEqual(snapshots.at(-1), {
    selected: "B",
    transition: {
      direction: "forward",
      rawProgress: 0.5,
    },
    cooldownActive: false,
    locked: false,
  });

  // Scheduler stayed Running; the larger delivered timestamp catches up the
  // reported gap through transition completion and cooldown settlement.
  frames.deliver(102, 104);
  assert.deepEqual(snapshots.at(-1), {
    selected: "B",
    transition: null,
    cooldownActive: false,
    locked: false,
  });

  scheduler.stop();
  runtime.dispose();
});

test("scheduler dependency validation fails before scheduling", () => {
  const frameApi = createFakeFrameApi();
  const runtime = createFakeRuntime().runtime;

  assert.throws(() =>
    createFrameScheduler({
      runtime: null,
      requestFrame: frameApi.requestFrame,
      cancelFrame: frameApi.cancelFrame,
      onFrame() {},
    }),
  );

  assert.throws(() =>
    createFrameScheduler({
      runtime,
      requestFrame: null,
      cancelFrame: frameApi.cancelFrame,
      onFrame() {},
    }),
  );

  assert.throws(() =>
    createFrameScheduler({
      runtime,
      requestFrame: frameApi.requestFrame,
      cancelFrame: null,
      onFrame() {},
    }),
  );

  assert.throws(() =>
    createFrameScheduler({
      runtime,
      requestFrame: frameApi.requestFrame,
      cancelFrame: frameApi.cancelFrame,
      onFrame: null,
    }),
  );
});
