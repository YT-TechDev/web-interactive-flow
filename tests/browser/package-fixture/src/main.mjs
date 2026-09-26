import wasmUrl from "wif-package-qualification/core.wasm?url";
import {
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
