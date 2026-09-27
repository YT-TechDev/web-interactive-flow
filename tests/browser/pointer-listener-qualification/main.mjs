import { bindPointerNavigation } from "/adapters/dom/pointer_listener.mjs";
import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_POINTER_LISTENER_QUALIFICATION__";

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing DOM element: " + id);
  }
  return value;
}

function publish(state, details) {
  const value = { state, details };
  window[STATUS_KEY] = value;

  const output = document.getElementById("qualification-output");
  if (output !== null) {
    output.textContent = JSON.stringify(value);
  }
}

function createResearchGesturePolicy({
  label,
  observations,
  threshold = 50,
}) {
  const activeIds = new Set();
  let trackedPointerId = null;
  let startY = null;
  let invalid = false;
  const resets = [];

  function snapshotState() {
    return {
      activeIds: [...activeIds],
      trackedPointerId,
      startY,
      invalid,
      resets: [...resets],
    };
  }

  function reset(reason) {
    activeIds.clear();
    trackedPointerId = null;
    startY = null;
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
        defaultPrevented: event.defaultPrevented,
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
          if (activeIds.size === 0) {
            reset("pointerup-invalid-or-untracked");
          }
          return null;
        }

        const delta = initialY - event.clientY;
        reset("pointerup-complete");

        if (delta > threshold) return "next";
        if (delta < -threshold) return "previous";
      }

      return null;
    },

    abort() {
      reset("binding-cleanup");
    },

    snapshot() {
      return snapshotState();
    },
  };
}

publish("pending", null);

try {
  const module = await compileFlowModule(fetch("/core.wasm"));

  function createCase(name, targetId) {
    const runtime = createFlowRuntime(module, {
      phases: ["A", "B", "C"],
      initial: "A",
      transitionDuration: 0,
      cooldown: 0,
    });
    const observations = [];
    const decisions = [];
    const policy = createResearchGesturePolicy({
      label: name,
      observations,
    });

    const observedRuntime = {
      next() {
        const disposition = runtime.next();
        decisions.push({ intent: "next", disposition });
        return disposition;
      },

      previous() {
        const disposition = runtime.previous();
        decisions.push({ intent: "previous", disposition });
        return disposition;
      },
    };

    return {
      name,
      targetId,
      runtime,
      observedRuntime,
      observations,
      decisions,
      policy,
      cleanup: null,
    };
  }

  const cases = {
    scope: createCase("scope", "scope"),
    reject: createCase("reject", "reject"),
    cleanup: createCase("cleanup", "cleanup"),
    replacement: createCase("replacement", "replacement-a"),
    uaAuto: createCase("ua-auto", "ua-auto"),
  };

  function bindCase(caseValue, targetId = caseValue.targetId) {
    const target = requireElement(targetId);

    caseValue.targetId = targetId;
    caseValue.cleanup = bindPointerNavigation({
      target,
      runtime: caseValue.observedRuntime,
      policy: caseValue.policy,
    });
  }

  for (const value of Object.values(cases)) {
    bindCase(value);
  }

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

  function snapshotCase(value) {
    const target = requireElement(value.targetId);

    return {
      runtime: value.runtime.getSnapshot(),
      policy: value.policy.snapshot(),
      observations: value.observations.map((entry) => ({
        ...entry,
        stateBefore: {
          ...entry.stateBefore,
          activeIds: [...entry.stateBefore.activeIds],
          resets: [...entry.stateBefore.resets],
        },
      })),
      decisions: value.decisions.map((entry) => ({ ...entry })),
      targetId: value.targetId,
      touchAction: getComputedStyle(target).touchAction,
      scrollTop: target.scrollTop,
      bindingActive: value.cleanup !== null,
    };
  }

  window.__WIF_POINTER_LISTENER_CONTROL__ = {
    rect(id) {
      const element = requireElement(id);
      element.scrollIntoView({ block: "center" });
      const rect = element.getBoundingClientRect();

      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    },

    snapshot(name) {
      return snapshotCase(cases[name]);
    },

    snapshotAll() {
      return {
        scope: snapshotCase(cases.scope),
        reject: snapshotCase(cases.reject),
        cleanup: snapshotCase(cases.cleanup),
        replacement: snapshotCase(cases.replacement),
        uaAuto: snapshotCase(cases.uaAuto),
        unrelated: { ...unrelated },
        css: {
          scope: getComputedStyle(requireElement("scope")).touchAction,
          outside: getComputedStyle(requireElement("outside")).touchAction,
          reject: getComputedStyle(requireElement("reject")).touchAction,
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

    cleanup(name) {
      const value = cases[name];

      if (value.cleanup !== null) {
        value.cleanup();
        value.cleanup = null;
      }

      return snapshotCase(value);
    },

    rebind(name, targetId = null) {
      const value = cases[name];

      if (value.cleanup !== null) {
        value.cleanup();
      }

      bindCase(value, targetId ?? value.targetId);
      return snapshotCase(value);
    },

    replaceToB() {
      const value = cases.replacement;

      if (value.cleanup !== null) {
        value.cleanup();
      }

      bindCase(value, "replacement-b");
      return snapshotCase(value);
    },

    finish() {
      const details = this.snapshotAll();

      for (const value of Object.values(cases)) {
        if (value.cleanup !== null) {
          value.cleanup();
          value.cleanup = null;
        }
        value.runtime.dispose();
      }

      publish("pass", details);
      return details;
    },
  };

  publish(
    "ready",
    window.__WIF_POINTER_LISTENER_CONTROL__.snapshotAll(),
  );
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
