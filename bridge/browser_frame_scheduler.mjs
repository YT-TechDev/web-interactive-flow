import { createFrameScheduler } from "./frame_scheduler.mjs";

function fail(message) {
  throw new Error(message);
}

export function createBrowserFrameScheduler({ runtime, frameSource, onFrame }) {
  if (
    frameSource === null ||
    (typeof frameSource !== "object" && typeof frameSource !== "function")
  ) {
    fail("invalid frameSource");
  }
  if (typeof frameSource.requestAnimationFrame !== "function") {
    fail("invalid frameSource.requestAnimationFrame");
  }
  if (typeof frameSource.cancelAnimationFrame !== "function") {
    fail("invalid frameSource.cancelAnimationFrame");
  }

  return createFrameScheduler({
    runtime,
    requestFrame: (callback) => frameSource.requestAnimationFrame(callback),
    cancelFrame: (requestId) => frameSource.cancelAnimationFrame(requestId),
    onFrame,
  });
}
