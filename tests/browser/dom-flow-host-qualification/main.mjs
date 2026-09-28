import { createAcceptedPointerRecognizer } from "/adapters/dom/accepted_pointer_recognizer.mjs";
import { bindDomFlowHost } from "/adapters/dom/flow_host.mjs";
import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const output = document.getElementById("result");
try {
  const module = await compileFlowModule(fetch("/core.wasm"));
  const ownedRuntime = createFlowRuntime(module, {
    phases: ["A", "B"], initial: "A", transitionDuration: 0, cooldown: 0,
  });
  const decisions = [];
  let disposed = false;
  const runtime = {
    next() { const value = ownedRuntime.next(); decisions.push(["next", value]); return value; },
    previous() { const value = ownedRuntime.previous(); decisions.push(["previous", value]); return value; },
    tick(value) { ownedRuntime.tick(value); },
    getSnapshot() { return ownedRuntime.getSnapshot(); },
    dispose() { disposed = true; ownedRuntime.dispose(); },
  };
  const feedback = [];
  const pointerPolicy = createAcceptedPointerRecognizer({
    admitPointer: () => true,
    project: (event) => event.clientY,
    qualify: (distance) => Math.abs(distance) >= 10,
    mapIntent: (distance) => distance > 0 ? "next" : "previous",
    shouldPropose: (event) => event.type === "pointermove",
  });
  const observeDisposition = pointerPolicy.onDisposition;
  pointerPolicy.onDisposition = function (intent, disposition) {
    feedback.push([intent, disposition]);
    observeDisposition.call(this, intent, disposition);
  };
  const wheelTarget = document.getElementById("wheel-target");
  const pointerTarget = document.getElementById("pointer-target");
  const keyboardTarget = document.getElementById("keyboard-target");
  const outsideTarget = document.getElementById("outside-target");
  let frames = 0;
  let cleanup;
  cleanup = bindDomFlowHost({
    runtime, wheelTarget, pointerTarget, keyboardTarget,
    resolveWheelIntent: (event) => event.deltaY > 0 ? "next" : "previous",
    resolveKeyboardIntent: (event) => event.key === "ArrowDown"
      ? "next"
      : event.key === "ArrowUp" ? "previous" : null,
    pointerPolicy,
    requestFrame(callback) {
      return setTimeout(() => callback(performance.now()), 0);
    },
    cancelFrame: clearTimeout,
    onFrame() {
      frames += 1;
      cleanup();
      const before = decisions.length;
      wheelTarget.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, cancelable: true }));
      pointerTarget.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 8, clientY: 100 }));
      pointerTarget.dispatchEvent(new PointerEvent("pointermove", { pointerId: 8, clientY: 80 }));
      keyboardTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      const pass = frames === 1 && decisions.length === before && !disposed;
      output.textContent = JSON.stringify({
        state: pass ? "pass" : "fail",
        frames,
        decisions,
        feedback,
        disposed,
      });
    },
  });

  const beforeIsolation = decisions.length;
  pointerTarget.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, cancelable: true }));
  wheelTarget.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 6, clientY: 100 }));
  wheelTarget.dispatchEvent(new PointerEvent("pointermove", { pointerId: 6, clientY: 80 }));
  wheelTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  pointerTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  outsideTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  if (decisions.length !== beforeIsolation) {
    throw new Error("distinct input target isolation changed");
  }

  const acceptedKeyboard = new KeyboardEvent("keydown", {
    key: "ArrowDown", cancelable: true, bubbles: true,
  });
  keyboardTarget.dispatchEvent(acceptedKeyboard);
  const rejectedKeyboard = new KeyboardEvent("keydown", {
    key: "ArrowDown", cancelable: true, bubbles: true,
  });
  keyboardTarget.dispatchEvent(rejectedKeyboard);
  const acceptedWheel = new WheelEvent("wheel", { deltaY: -1, cancelable: true });
  wheelTarget.dispatchEvent(acceptedWheel);
  const rejectedWheel = new WheelEvent("wheel", { deltaY: -1, cancelable: true });
  wheelTarget.dispatchEvent(rejectedWheel);
  pointerTarget.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, clientY: 100 }));
  pointerTarget.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientY: 80 }));

  if (!acceptedKeyboard.defaultPrevented || rejectedKeyboard.defaultPrevented) {
    throw new Error("accepted-only keyboard prevention changed");
  }
  if (!acceptedWheel.defaultPrevented || rejectedWheel.defaultPrevented) {
    throw new Error("accepted-only wheel prevention changed");
  }
} catch (error) {
  output.textContent = JSON.stringify({ state: "fail", error: String(error?.stack ?? error) });
}
