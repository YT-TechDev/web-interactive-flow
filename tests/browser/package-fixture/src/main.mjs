import wasmUrl from "wif-package-qualification/core.wasm?url";
import {
  applyWheelNavigationIntent,
  compileFlowModule,
  createFlowRuntime,
  createFrameScheduler,
} from "wif-package-qualification";

const status = { state: "pending", details: null };
window.__WIF_QUALIFICATION__ = status;

const firstOutput = document.createElement("output");
firstOutput.id = "qualification-first-snapshot";
const latestOutput = document.createElement("output");
latestOutput.id = "qualification-latest-snapshot";
document.body.append(firstOutput, latestOutput);

let runtime;
let scheduler;
let firstSnapshot;
let observerCount = 0;

const fail = (error) => {
  scheduler?.stop();
  runtime?.dispose();
  window.__WIF_QUALIFICATION__ = {
    state: "fail",
    details: { message: error instanceof Error ? error.message : String(error) },
  };
};

try {
  // The application owns both URL resolution and fetch; WIF only consumes Response.
  const module = await compileFlowModule(fetch(wasmUrl));
  runtime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 10_000_000,
    cooldown: 0,
  });
  const disposition = runtime.next();
  if (disposition !== "accepted") throw new Error(`request was ${disposition}`);

  // Public target-capable wheel ownership through the package root, using a
  // real cancelable browser event on a separate Runtime.
  const targetRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 10_000_000,
    cooldown: 0,
  });
  try {
    const wheelIntent = (target, cancelable = true) => {
      const event = new WheelEvent("wheel", { cancelable });
      const result = applyWheelNavigationIntent({
        runtime: targetRuntime,
        event,
        intent: { type: "target", target },
      });
      return { result, defaultPrevented: event.defaultPrevented };
    };
    const accepted = wheelIntent("C");
    if (accepted.result !== "accepted" || !accepted.defaultPrevented
      || targetRuntime.getSnapshot().selected !== "C") {
      throw new Error("tagged direct target was not accepted with prevention");
    }
    const rejected = wheelIntent("B");
    if (rejected.result !== "rejected" || rejected.defaultPrevented
      || targetRuntime.getSnapshot().selected !== "C") {
      throw new Error("known target rejection must not prevent default");
    }
  } finally {
    targetRuntime.dispose();
  }

  scheduler = createFrameScheduler({
    runtime,
    requestFrame: window.requestAnimationFrame.bind(window),
    cancelFrame: window.cancelAnimationFrame.bind(window),
    onFrame(snapshot) {
      try {
        observerCount += 1;
        latestOutput.textContent = JSON.stringify(snapshot);
        if (firstSnapshot === undefined) {
          firstSnapshot = snapshot;
          firstOutput.textContent = JSON.stringify(snapshot);
          // selected is the semantic accepted destination; it is not visual occupancy.
          if (snapshot.selected !== "B" || snapshot.transition?.rawProgress !== 0) {
            throw new Error("incoherent initial transition");
          }
          return;
        }
        if (snapshot.transition === null || snapshot.transition.rawProgress > 0) {
          scheduler.stop();
          runtime.dispose();
          window.__WIF_QUALIFICATION__ = {
            state: "pass",
            details: { disposition, observerCount, firstSnapshot, laterSnapshot: snapshot },
          };
        }
      } catch (error) { fail(error); }
    },
  });
  scheduler.start();
} catch (error) { fail(error); }
