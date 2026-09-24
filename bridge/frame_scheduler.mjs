import {
  createMonotonicTimeNormalizer,
  decomposeTickBudgetUs,
} from "./clock.mjs";

function fail(message) {
  throw new Error(message);
}

function assertDependencies({
  runtime,
  requestFrame,
  cancelFrame,
  onFrame,
}) {
  if (
    runtime === null ||
    typeof runtime !== "object" ||
    typeof runtime.tick !== "function" ||
    typeof runtime.getSnapshot !== "function"
  ) {
    fail("invalid semantic runtime");
  }

  if (typeof requestFrame !== "function") {
    fail("invalid requestFrame");
  }
  if (typeof cancelFrame !== "function") {
    fail("invalid cancelFrame");
  }
  if (typeof onFrame !== "function") {
    fail("invalid onFrame");
  }
}

export function createFrameScheduler({
  runtime,
  requestFrame,
  cancelFrame,
  onFrame,
}) {
  assertDependencies({
    runtime,
    requestFrame,
    cancelFrame,
    onFrame,
  });

  let running = false;
  let pendingRequestId = null;
  let clock = null;

  function transitionToStopped() {
    running = false;
    pendingRequestId = null;
    clock = null;
  }

  function requestNextFrame() {
    try {
      pendingRequestId = requestFrame(handleFrame);
    } catch (error) {
      transitionToStopped();
      throw error;
    }
  }

  function handleFrame(timestampMs) {
    if (!running) {
      return;
    }

    pendingRequestId = null;

    try {
      const budgetUs = clock.observe(timestampMs);

      for (const chunk of decomposeTickBudgetUs(budgetUs)) {
        runtime.tick(chunk);
      }

      const snapshot = runtime.getSnapshot();
      onFrame(snapshot);

      if (running) {
        requestNextFrame();
      }
    } catch (error) {
      if (running) {
        requestNextFrame();
      }
      throw error;
    }
  }

  function start() {
    if (running) {
      return;
    }

    running = true;
    clock = createMonotonicTimeNormalizer();

    requestNextFrame();
  }

  function stop() {
    if (!running) {
      return;
    }

    const requestId = pendingRequestId;

    running = false;
    pendingRequestId = null;
    clock = null;

    if (requestId !== null) {
      cancelFrame(requestId);
    }
  }

  return {
    start,
    stop,
  };
}
