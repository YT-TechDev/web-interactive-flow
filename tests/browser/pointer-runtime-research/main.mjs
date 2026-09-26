import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_POINTER_RUNTIME_RESEARCH__";
const THRESHOLD = 50;

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing DOM element: " + id);
  }
  return value;
}

function createGestureState() {
  return {
    activeIds: new Set(),
    trackedPointerId: null,
    startY: null,
    lastY: null,
    invalid: false,
  };
}

function snapshotGesture(state) {
  return {
    activeIds: [...state.activeIds],
    trackedPointerId: state.trackedPointerId,
    startY: state.startY,
    lastY: state.lastY,
    invalid: state.invalid,
  };
}

function resetGesture(state) {
  state.activeIds.clear();
  state.trackedPointerId = null;
  state.startY = null;
  state.lastY = null;
  state.invalid = false;
}

function createPointerBinding({ label, target, runtime, observations, decisions }) {
  const state = createGestureState();

  function record(event, phase) {
    observations.push({
      label,
      phase,
      type: event.type,
      isTrusted: event.isTrusted,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      clientY: event.clientY,
      cancelable: event.cancelable,
      defaultPrevented: event.defaultPrevented,
      targetId: event.target instanceof Element ? event.target.id : null,
      currentTargetId:
        event.currentTarget instanceof Element ? event.currentTarget.id : null,
      gesture: snapshotGesture(state),
    });
  }

  function request(intent, event) {
    const disposition =
      intent === "next" ? runtime.next() : runtime.previous();

    decisions.push({
      label,
      intent,
      disposition,
      eventType: event.type,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      defaultPrevented: event.defaultPrevented,
    });

    return disposition;
  }

  function onPointerDown(event) {
    if (!(event instanceof PointerEvent)) return;

    record(event, "before");

    if (event.pointerType !== "touch") {
      decisions.push({
        label,
        intent: null,
        disposition: null,
        eventType: event.type,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        reason: "pointer-type-decline",
        defaultPrevented: event.defaultPrevented,
      });
      record(event, "after");
      return;
    }

    state.activeIds.add(event.pointerId);

    if (state.activeIds.size !== 1 || state.trackedPointerId !== null) {
      state.invalid = true;
      record(event, "after");
      return;
    }

    state.trackedPointerId = event.pointerId;
    state.startY = event.clientY;
    state.lastY = event.clientY;
    state.invalid = false;

    record(event, "after");
  }

  function onPointerMove(event) {
    if (!(event instanceof PointerEvent)) return;

    record(event, "before");

    if (
      event.pointerType === "touch" &&
      event.pointerId === state.trackedPointerId
    ) {
      state.lastY = event.clientY;
    }

    record(event, "after");
  }

  function onPointerCancel(event) {
    if (!(event instanceof PointerEvent)) return;

    record(event, "before");

    if (event.pointerType === "touch") {
      state.activeIds.delete(event.pointerId);
      state.invalid = true;

      if (state.activeIds.size === 0) {
        resetGesture(state);
      }
    }

    record(event, "after");
  }

  function onPointerUp(event) {
    if (!(event instanceof PointerEvent)) return;

    record(event, "before");

    if (event.pointerType !== "touch") {
      record(event, "after");
      return;
    }

    const activeCountBefore = state.activeIds.size;
    const isTracked = event.pointerId === state.trackedPointerId;
    const startY = state.startY;
    const endY = event.clientY;

    state.activeIds.delete(event.pointerId);

    const canCommit =
      isTracked &&
      !state.invalid &&
      activeCountBefore === 1 &&
      startY !== null;

    if (canCommit) {
      const delta = startY - endY;

      if (delta > THRESHOLD) {
        request("next", event);
      } else if (delta < -THRESHOLD) {
        request("previous", event);
      }
    }

    if (state.activeIds.size === 0) {
      resetGesture(state);
    }

    record(event, "after");
  }

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointercancel", onPointerCancel);
  target.addEventListener("pointerup", onPointerUp);

  let active = true;

  return {
    snapshot() {
      return snapshotGesture(state);
    },

    cleanup() {
      if (!active) return;
      active = false;
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointercancel", onPointerCancel);
      target.removeEventListener("pointerup", onPointerUp);
      resetGesture(state);
    },
  };
}

function publish(state, details) {
  const value = { state, details };
  window[STATUS_KEY] = value;

  const output = document.getElementById("qualification-output");
  if (output !== null) output.textContent = JSON.stringify(value);
}

publish("pending", null);

try {
  const module = await compileFlowModule(fetch("/core.wasm"));

  const configs = {
    sequence: {
      phases: ["A", "B", "C"],
      initial: "A",
    },
    rejected: {
      phases: ["A", "B", "C"],
      initial: "A",
    },
    multi: {
      phases: ["A", "B", "C"],
      initial: "A",
    },
    mouse: {
      phases: ["A", "B", "C"],
      initial: "A",
    },
  };

  const runtimes = {};
  const bindings = {};
  const observations = {};
  const decisions = {};

  for (const [id, config] of Object.entries(configs)) {
    const target = requireElement(id);
    const runtime = createFlowRuntime(module, {
      phases: config.phases,
      initial: config.initial,
      transitionDuration: 0,
      cooldown: 0,
    });

    runtimes[id] = runtime;
    observations[id] = [];
    decisions[id] = [];
    bindings[id] = createPointerBinding({
      label: id,
      target,
      runtime,
      observations: observations[id],
      decisions: decisions[id],
    });
  }

  function caseSnapshot(id) {
    const target = requireElement(id);

    return {
      runtime: runtimes[id].getSnapshot(),
      gesture: bindings[id].snapshot(),
      observations: observations[id].map((entry) => ({
        ...entry,
        gesture: { ...entry.gesture, activeIds: [...entry.gesture.activeIds] },
      })),
      decisions: decisions[id].map((entry) => ({ ...entry })),
      scrollTop: target.scrollTop,
      touchAction: getComputedStyle(target).touchAction,
    };
  }

  window.__WIF_POINTER_RUNTIME_CONTROL__ = {
    resetObservations(id) {
      observations[id].length = 0;
      decisions[id].length = 0;
      return true;
    },

    setTouchAction(id, value) {
      requireElement(id).style.touchAction = value;
      return getComputedStyle(requireElement(id)).touchAction;
    },

    rect(id) {
      const element = requireElement(id);
      element.scrollIntoView({ block: "center" });
      const rect = element.getBoundingClientRect();
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    },

    snapshot(id) {
      return caseSnapshot(id);
    },

    finish() {
      const details = {};

      for (const id of Object.keys(configs)) {
        bindings[id].cleanup();
        details[id] = caseSnapshot(id);
        runtimes[id].dispose();
      }

      publish("pass", details);
      return details;
    },
  };

  publish("ready", {
    sequence: caseSnapshot("sequence"),
    rejected: caseSnapshot("rejected"),
    multi: caseSnapshot("multi"),
    mouse: caseSnapshot("mouse"),
  });
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
