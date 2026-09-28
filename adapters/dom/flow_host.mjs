import { createFrameScheduler } from "../../bridge/frame_scheduler.mjs";
import { bindDomFlowInputs } from "./input_host.mjs";

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
  let cleanupInputs = null;
  let scheduler = null;
  let active = true;

  function cleanup() {
    if (!active) {
      return;
    }

    active = false;
    let firstFailure = null;

    // Release in reverse construction order.
    for (const release of [
      scheduler === null ? null : () => scheduler.stop(),
      cleanupInputs,
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
    cleanupInputs = bindDomFlowInputs({
      runtime,
      wheelTarget,
      pointerTarget,
      keyboardTarget,
      resolveWheelIntent,
      resolveKeyboardIntent,
      pointerPolicy,
      preventWheelDefault,
      preventKeyboardDefault,
    });
    scheduler = createFrameScheduler({
      runtime,
      requestFrame,
      cancelFrame,
      onFrame,
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
