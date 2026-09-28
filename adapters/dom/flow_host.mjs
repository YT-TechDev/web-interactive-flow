import { createFrameScheduler } from "../../bridge/frame_scheduler.mjs";
import { bindKeyboardNavigation } from "./keyboard_listener.mjs";
import { bindPointerNavigation } from "./pointer_listener.mjs";
import { bindWheelNavigation } from "./wheel_listener.mjs";

// Internal production composition boundary. Runtime, Wasm acquisition, input
// policies, and presentation effects remain caller-owned.
export function bindDomFlowHost({
  runtime,
  wheelTarget,
  pointerTarget,
  resolveWheelIntent,
  preventWheelDefault = true,
  keyboardTarget,
  resolveKeyboardIntent,
  preventKeyboardDefault = true,
  pointerPolicy,
  requestFrame,
  cancelFrame,
  onFrame,
}) {
  const scheduler = createFrameScheduler({
    runtime,
    requestFrame,
    cancelFrame,
    onFrame,
  });

  let cleanupWheel = null;
  let cleanupPointer = null;
  let cleanupKeyboard = null;
  let active = true;

  function cleanup() {
    if (!active) {
      return;
    }

    active = false;
    let firstFailure = null;

    for (const release of [
      () => scheduler.stop(),
      cleanupKeyboard,
      cleanupPointer,
      cleanupWheel,
    ]) {
      if (release === null) {
        continue;
      }

      try {
        release();
      } catch (error) {
        firstFailure ??= error;
      }
    }

    if (firstFailure !== null) {
      throw firstFailure;
    }
  }

  try {
    cleanupWheel = bindWheelNavigation({
      target: wheelTarget,
      runtime,
      resolveIntent: resolveWheelIntent,
      preventDefault: preventWheelDefault,
    });
    cleanupPointer = bindPointerNavigation({
      target: pointerTarget,
      runtime,
      policy: pointerPolicy,
    });
    cleanupKeyboard = bindKeyboardNavigation({
      target: keyboardTarget,
      runtime,
      resolveIntent: resolveKeyboardIntent,
      preventDefault: preventKeyboardDefault,
    });
    scheduler.start();
  } catch (error) {
    try {
      cleanup();
    } catch {
      // Preserve the construction failure; cleanup is best-effort and complete.
    }
    throw error;
  }

  return cleanup;
}
