import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_POINTER_LISTENER_LIFECYCLE_RESEARCH__";
const POINTER_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
];

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing DOM element: " + id);
  }
  return value;
}

function createResearchGesturePolicy({
  label,
  threshold = 50,
  observations,
}) {
  const activeIds = new Set();
  let trackedPointerId = null;
  let startY = null;
  let lastY = null;
  let invalid = false;
  const resets = [];

  function snapshotState() {
    return {
      activeIds: [...activeIds],
      trackedPointerId,
      startY,
      lastY,
      invalid,
      resets: [...resets],
    };
  }

  function reset(reason) {
    activeIds.clear();
    trackedPointerId = null;
    startY = null;
    lastY = null;
    invalid = false;
    resets.push(reason);
  }

  return {
    handle(event) {
      observations.push({
        label,
        type: event.type,
        isTrusted: event.isTrusted,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        clientX: event.clientX,
        clientY: event.clientY,
        targetId: event.target instanceof Element ? event.target.id : null,
        currentTargetId:
          event.currentTarget instanceof Element
            ? event.currentTarget.id
            : null,
        stateBefore: snapshotState(),
      });

      if (event.pointerType !== "touch") {
        return null;
      }

      if (event.type === "pointercancel") {
        reset("pointercancel");
        return null;
      }

      if (event.type === "pointerdown") {
        activeIds.add(event.pointerId);

        if (activeIds.size !== 1 || trackedPointerId !== null) {
          invalid = true;
          return null;
        }

        trackedPointerId = event.pointerId;
        startY = event.clientY;
        lastY = event.clientY;
        return null;
      }

      if (event.type === "pointermove") {
        if (event.pointerId === trackedPointerId) {
          lastY = event.clientY;
        }
        return null;
      }

      if (event.type === "pointerup") {
        const activeCountBefore = activeIds.size;
        const isTracked = event.pointerId === trackedPointerId;
        const initialY = startY;

        activeIds.delete(event.pointerId);

        if (
          !isTracked ||
          invalid ||
          activeCountBefore !== 1 ||
          initialY === null
        ) {
          if (activeIds.size === 0) reset("pointerup-invalid-or-untracked");
          return null;
        }

        const delta = initialY - event.clientY;
        reset("pointerup-complete");

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
        return null;
      }

      return null;
    },

    abort(reason) {
      reset(reason);
    },

    snapshot() {
      return snapshotState();
    },
  };
}

function bindPointerLifecycle({
  label,
  target,
  runtime,
  policy,
  decisions,
}) {
  if (
    target === null ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid research pointer listener target");
  }

  const listeners = new Map();

  for (const type of POINTER_TYPES) {
    const listener = (event) => {
      if (!(event instanceof PointerEvent)) {
        throw new Error("research pointer listener expected PointerEvent");
      }

      const intent = policy.handle(event);

      if (intent === null || intent === undefined) {
        return;
      }

      if (intent !== "next" && intent !== "previous") {
        throw new Error("invalid research pointer navigation intent");
      }

      const disposition =
        intent === "next" ? runtime.next() : runtime.previous();

      decisions.push({
        label,
        eventType: event.type,
        isTrusted: event.isTrusted,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        intent,
        disposition,
      });
    };

    listeners.set(type, listener);
    target.addEventListener(type, listener);
  }

  let active = true;

  return {
    cleanup() {
      if (!active) return;
      active = false;

      for (const [type, listener] of listeners) {
        target.removeEventListener(type, listener);
      }

      policy.abort("binding-cleanup");
    },

    isActive() {
      return active;
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

  function createRuntime() {
    return createFlowRuntime(module, {
      phases: ["A", "B", "C"],
      initial: "A",
      transitionDuration: 0,
      cooldown: 0,
    });
  }

  const cases = {};

  function createCase(name, targetId) {
    const runtime = createRuntime();
    const observations = [];
    const decisions = [];
    const policy = createResearchGesturePolicy({
      label: name,
      observations,
    });

    const value = {
      name,
      targetId,
      runtime,
      observations,
      decisions,
      policy,
      binding: null,
    };

    cases[name] = value;
    return value;
  }

  const scope = createCase("scope", "scope");
  const cleanupCase = createCase("cleanup", "cleanup");
  const replacement = createCase("replacement", "replacement-a");
  const uaAuto = createCase("ua-auto", "ua-auto");

  function install(caseValue, targetId = caseValue.targetId) {
    const target = requireElement(targetId);

    caseValue.targetId = targetId;
    caseValue.binding = bindPointerLifecycle({
      label: caseValue.name + ":" + targetId,
      target,
      runtime: caseValue.runtime,
      policy: caseValue.policy,
      decisions: caseValue.decisions,
    });

    return true;
  }

  install(scope);
  install(cleanupCase);
  install(replacement);
  install(uaAuto);

  const unrelated = {
    pointerdown: 0,
    pointerup: 0,
    pointercancel: 0,
  };

  const cleanupTarget = requireElement("cleanup");

  cleanupTarget.addEventListener("pointerdown", () => {
    unrelated.pointerdown += 1;
  });
  cleanupTarget.addEventListener("pointerup", () => {
    unrelated.pointerup += 1;
  });
  cleanupTarget.addEventListener("pointercancel", () => {
    unrelated.pointercancel += 1;
  });

  function caseSnapshot(caseValue) {
    const target = requireElement(caseValue.targetId);

    return {
      runtime: caseValue.runtime.getSnapshot(),
      policy: caseValue.policy.snapshot(),
      observations: caseValue.observations.map((entry) => ({
        ...entry,
        stateBefore: {
          ...entry.stateBefore,
          activeIds: [...entry.stateBefore.activeIds],
          resets: [...entry.stateBefore.resets],
        },
      })),
      decisions: caseValue.decisions.map((entry) => ({ ...entry })),
      bindingActive: caseValue.binding?.isActive() ?? false,
      targetId: caseValue.targetId,
      touchAction: getComputedStyle(target).touchAction,
      scrollTop: target.scrollTop,
    };
  }

  window.__WIF_POINTER_LISTENER_LIFECYCLE_CONTROL__ = {
    rect(id) {
      const element = requireElement(id);
      element.scrollIntoView({ block: "center" });
      const rect = element.getBoundingClientRect();

      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    },

    resetObservations(name) {
      cases[name].observations.length = 0;
      cases[name].decisions.length = 0;
      return true;
    },

    cleanup(name) {
      cases[name].binding?.cleanup();
      return caseSnapshot(cases[name]);
    },

    rebind(name, targetId = null) {
      const value = cases[name];

      if (value.binding?.isActive()) {
        value.binding.cleanup();
      }

      install(value, targetId ?? value.targetId);
      return caseSnapshot(value);
    },

    replaceToB() {
      const value = replacement;

      if (value.binding?.isActive()) {
        value.binding.cleanup();
      }

      install(value, "replacement-b");
      return caseSnapshot(value);
    },

    snapshot(name) {
      return caseSnapshot(cases[name]);
    },

    runDetachedSyntheticProbe() {
      const detached = document.createElement("div");
      detached.id = "detached-pointer-probe";
      document.body.appendChild(detached);

      const runtime = createRuntime();
      const observations = [];
      const decisions = [];
      const policy = createResearchGesturePolicy({
        label: "detached-pointer-probe",
        observations,
      });

      const binding = bindPointerLifecycle({
        label: "detached-pointer-probe",
        target: detached,
        runtime,
        policy,
        decisions,
      });

      detached.remove();

      const first = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 200,
      });

      const firstDispatchResult = detached.dispatchEvent(first);
      const afterDetachedDispatch = {
        observations: observations.map((entry) => ({ ...entry })),
        policy: policy.snapshot(),
        runtime: runtime.getSnapshot(),
      };

      binding.cleanup();

      const second = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 78,
        pointerType: "touch",
        isPrimary: true,
        clientX: 10,
        clientY: 300,
      });

      const secondDispatchResult = detached.dispatchEvent(second);
      const afterCleanupDispatch = {
        observations: observations.map((entry) => ({ ...entry })),
        policy: policy.snapshot(),
        runtime: runtime.getSnapshot(),
      };

      runtime.dispose();

      return {
        isConnected: detached.isConnected,
        firstIsTrusted: first.isTrusted,
        firstDispatchResult,
        afterDetachedDispatch,
        secondIsTrusted: second.isTrusted,
        secondDispatchResult,
        afterCleanupDispatch,
      };
    },

    snapshotAll() {
      return {
        scope: caseSnapshot(scope),
        cleanup: caseSnapshot(cleanupCase),
        replacement: caseSnapshot(replacement),
        uaAuto: caseSnapshot(uaAuto),
        unrelated: { ...unrelated },
        css: {
          scope: getComputedStyle(requireElement("scope")).touchAction,
          outside: getComputedStyle(requireElement("outside")).touchAction,
          cleanup: getComputedStyle(requireElement("cleanup")).touchAction,
          replacementA: getComputedStyle(
            requireElement("replacement-a"),
          ).touchAction,
          replacementB: getComputedStyle(
            requireElement("replacement-b"),
          ).touchAction,
          uaAuto: getComputedStyle(requireElement("ua-auto")).touchAction,
        },
      };
    },

    finish() {
      const result = this.snapshotAll();

      for (const value of Object.values(cases)) {
        value.binding?.cleanup();
        value.runtime.dispose();
      }

      publish("pass", result);
      return result;
    },
  };

  publish(
    "ready",
    window.__WIF_POINTER_LISTENER_LIFECYCLE_CONTROL__.snapshotAll(),
  );
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
