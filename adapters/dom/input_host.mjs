import { bindKeyboardNavigation } from "./keyboard_listener.mjs";
import { bindPointerNavigation } from "./pointer_listener.mjs";
import { bindWheelNavigation } from "./wheel_listener.mjs";

// Internal production composition boundary for caller-owned DOM input policy.
// Runtime construction/disposal and browser frame scheduling remain caller-owned.
export function bindDomFlowInputs({
  runtime,
  wheelTarget,
  pointerTarget,
  keyboardTarget,
  resolveWheelIntent,
  resolveKeyboardIntent,
  pointerPolicy,
  preventWheelDefault = true,
  preventKeyboardDefault = true,
}) {
  let cleanupWheel = null;
  let cleanupPointer = null;
  let cleanupKeyboard = null;
  let active = true;

  function cleanupInputs() {
    if (!active) {
      return;
    }

    active = false;
    let firstFailure = null;

    // Release in reverse construction order. Each lower-level binding owns its
    // own listener details and rollback behavior.
    for (const release of [
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
  } catch (error) {
    try {
      cleanupInputs();
    } catch {
      // Preserve the construction failure after best-effort rollback.
    }
    throw error;
  }

  return cleanupInputs;
}
