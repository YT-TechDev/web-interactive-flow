import { createFlowRuntime } from "/bridge/runtime.mjs";
import { createFrameScheduler } from "/bridge/frame_scheduler.mjs";

let runtime = null;
let scheduler = null;
let finished = false;
let firstSnapshot = null;
let observerCount = 0;

function describeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "Error", message: String(error) };
}

function cleanup() {
  const cleanupErrors = [];

  if (scheduler !== null) {
    try {
      scheduler.stop();
    } catch (error) {
      cleanupErrors.push(describeError(error));
    }
    scheduler = null;
  }

  if (runtime !== null) {
    try {
      runtime.dispose();
    } catch (error) {
      cleanupErrors.push(describeError(error));
    }
    runtime = null;
  }

  return cleanupErrors;
}

function finishPass(laterSnapshot) {
  if (finished) {
    return;
  }
  finished = true;

  const cleanupErrors = cleanup();
  if (cleanupErrors.length > 0) {
    window.__WIF_QUALIFICATION__ = {
      state: "fail",
      details: {
        kind: "cleanup",
        cleanupErrors,
      },
    };
    return;
  }

  window.__WIF_QUALIFICATION__ = {
    state: "pass",
    details: {
      observerCount,
      firstSnapshot,
      laterSnapshot,
    },
  };
}

function finishFail(error) {
  if (finished) {
    return;
  }
  finished = true;

  const cleanupErrors = cleanup();
  window.__WIF_QUALIFICATION__ = {
    state: "fail",
    details: {
      kind: "fixture",
      error: describeError(error),
      cleanupErrors,
    },
  };
}

try {
  const module = await WebAssembly.compileStreaming(fetch("/core.wasm"));

  runtime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 10_000_000,
    cooldown: 0,
  });

  const disposition = runtime.next();
  if (disposition !== "accepted") {
    throw new Error(`expected accepted navigation, got ${disposition}`);
  }

  scheduler = createFrameScheduler({
    runtime,
    requestFrame: window.requestAnimationFrame.bind(window),
    cancelFrame: window.cancelAnimationFrame.bind(window),
    onFrame(snapshot) {
      observerCount += 1;

      try {
        if (firstSnapshot === null) {
          if (snapshot.selected !== "B") {
            throw new Error("first frame did not expose selected target B");
          }
          if (snapshot.transition === null) {
            throw new Error("first frame transition settled before epoch witness");
          }
          if (snapshot.transition.rawProgress !== 0) {
            throw new Error("first frame did not establish zero-progress epoch");
          }

          firstSnapshot = snapshot;
          return;
        }

        const advanced =
          snapshot.transition === null ||
          snapshot.transition.rawProgress > 0;

        if (advanced) {
          finishPass(snapshot);
        }
      } catch (error) {
        finishFail(error);
      }
    },
  });

  scheduler.start();
} catch (error) {
  finishFail(error);
}
