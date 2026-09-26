import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_KEYBOARD_LISTENER_RESEARCH__";

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
  const output = document.getElementById("research-output");
  if (output !== null) output.textContent = JSON.stringify(value);
}

function bindResearchKeyboardNavigation({
  label,
  target,
  runtime,
  resolveIntent,
  preventDefault = true,
  listenerOptions = undefined,
  observations,
}) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid research keyboard target");
  }

  const handleKeyDown = (event) => {
    if (!(event instanceof KeyboardEvent)) {
      throw new Error("research listener did not receive KeyboardEvent");
    }

    const before = {
      label,
      isTrusted: event.isTrusted,
      key: event.key,
      code: event.code,
      repeat: event.repeat,
      isComposing: event.isComposing,
      cancelable: event.cancelable,
      defaultPreventedBefore: event.defaultPrevented,
      targetId: event.target instanceof Element ? event.target.id : null,
      currentTargetId:
        event.currentTarget instanceof Element
          ? event.currentTarget.id
          : event.currentTarget === window
            ? "window"
            : null,
      activeElementId:
        document.activeElement instanceof Element
          ? document.activeElement.id
          : null,
    };

    const intent = resolveIntent(event);

    if (intent === null || intent === undefined) {
      observations.push({
        ...before,
        intent: null,
        disposition: null,
        preventAttempted: false,
        defaultPreventedAfter: event.defaultPrevented,
      });
      return;
    }

    if (intent !== "next" && intent !== "previous") {
      throw new Error("invalid research keyboard intent: " + String(intent));
    }

    const disposition =
      intent === "next" ? runtime.next() : runtime.previous();

    let preventAttempted = false;

    if (
      disposition === "accepted" &&
      preventDefault &&
      event.cancelable
    ) {
      preventAttempted = true;
      event.preventDefault();
    }

    observations.push({
      ...before,
      intent,
      disposition,
      preventAttempted,
      defaultPreventedAfter: event.defaultPrevented,
    });
  };

  target.addEventListener("keydown", handleKeyDown, listenerOptions);

  let active = true;

  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener("keydown", handleKeyDown, listenerOptions);
  };
}

publish("pending", null);

try {
  const module = await compileFlowModule(fetch("/core.wasm"));

  const explicitRoot = requireElement("explicit-root");
  const explicitButton = requireElement("explicit-button");
  const explicitInput = requireElement("explicit-input");
  const normalScroller = requireElement("normal-scroller");
  const passiveScroller = requireElement("passive-scroller");
  const nestedOuter = requireElement("nested-outer");
  const nestedInner = requireElement("nested-inner");
  const detachmentHost = requireElement("detachment-host");

  const explicitRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const normalRuntime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const passiveRuntime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const nestedRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C", "D"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });

  const explicitObservations = [];
  const normalObservations = [];
  const passiveObservations = [];
  const nestedObservations = [];

  let explicitResolverCalls = 0;
  let buttonClicks = 0;
  let inputEvents = 0;

  const cleanupExplicit = bindResearchKeyboardNavigation({
    label: "explicit-root",
    target: explicitRoot,
    runtime: explicitRuntime,
    observations: explicitObservations,
    resolveIntent(event) {
      explicitResolverCalls += 1;

      if (
        event.target instanceof Element &&
        event.target.closest(
          "button, input, textarea, select, [contenteditable]",
        ) !== null
      ) {
        return null;
      }

      return event.key === "n" ? "next" : null;
    },
  });

  explicitButton.addEventListener("click", (event) => {
    if (event.isTrusted) buttonClicks += 1;
  });

  explicitInput.addEventListener("input", (event) => {
    if (event.isTrusted) inputEvents += 1;
  });

  const cleanupNormal = bindResearchKeyboardNavigation({
    label: "normal-options",
    target: normalScroller,
    runtime: normalRuntime,
    observations: normalObservations,
    resolveIntent(event) {
      return event.key === "PageDown" ? "next" : null;
    },
  });

  const cleanupPassive = bindResearchKeyboardNavigation({
    label: "passive-true",
    target: passiveScroller,
    runtime: passiveRuntime,
    observations: passiveObservations,
    listenerOptions: { passive: true },
    resolveIntent(event) {
      return event.key === "PageDown" ? "next" : null;
    },
  });

  const cleanupNestedInner = bindResearchKeyboardNavigation({
    label: "nested-inner",
    target: nestedInner,
    runtime: nestedRuntime,
    observations: nestedObservations,
    resolveIntent(event) {
      return event.key === "n" ? "next" : null;
    },
  });

  const cleanupNestedOuter = bindResearchKeyboardNavigation({
    label: "nested-outer",
    target: nestedOuter,
    runtime: nestedRuntime,
    observations: nestedObservations,
    resolveIntent(event) {
      return event.key === "n" ? "next" : null;
    },
  });

  let explicitActive = true;

  window.__WIF_KEYBOARD_LISTENER_CONTROL__ = {
    focus(id) {
      const element = requireElement(id);
      element.focus();
      return document.activeElement === element;
    },

    resetExplicitObservations() {
      explicitObservations.length = 0;
      return true;
    },

    resetNormalObservations() {
      normalObservations.length = 0;
      normalScroller.scrollTop = 0;
      return true;
    },

    resetPassiveObservations() {
      passiveObservations.length = 0;
      passiveScroller.scrollTop = 0;
      return true;
    },

    resetNestedObservations() {
      nestedObservations.length = 0;
      return true;
    },

    clearInput() {
      explicitInput.value = "";
      return explicitInput.value;
    },

    cleanupExplicit() {
      cleanupExplicit();
      explicitActive = false;
      return true;
    },

    runDetachedSyntheticProbe() {
      const detached = document.createElement("div");
      detached.id = "detached-probe";
      detached.tabIndex = 0;
      detachmentHost.appendChild(detached);

      const runtime = createFlowRuntime(module, {
        phases: ["A", "B", "C"],
        initial: "A",
        transitionDuration: 0,
        cooldown: 0,
      });

      const observations = [];
      let resolverCalls = 0;

      const cleanup = bindResearchKeyboardNavigation({
        label: "detached-probe",
        target: detached,
        runtime,
        observations,
        resolveIntent(event) {
          resolverCalls += 1;
          return event.key === "n" ? "next" : null;
        },
      });

      detachmentHost.removeChild(detached);

      const first = new KeyboardEvent("keydown", {
        key: "n",
        bubbles: true,
        cancelable: true,
      });
      const firstDispatchResult = detached.dispatchEvent(first);
      const afterDetachedDispatch = runtime.getSnapshot();
      const resolverCallsAfterDetached = resolverCalls;

      cleanup();
      cleanup();

      const second = new KeyboardEvent("keydown", {
        key: "n",
        bubbles: true,
        cancelable: true,
      });
      const secondDispatchResult = detached.dispatchEvent(second);
      const afterCleanupDispatch = runtime.getSnapshot();

      runtime.dispose();

      return {
        isConnectedAfterRemoval: detached.isConnected,
        firstIsTrusted: first.isTrusted,
        firstDispatchResult,
        firstDefaultPrevented: first.defaultPrevented,
        resolverCallsAfterDetached,
        afterDetachedDispatch,
        secondIsTrusted: second.isTrusted,
        secondDispatchResult,
        secondDefaultPrevented: second.defaultPrevented,
        resolverCallsAfterCleanupDispatch: resolverCalls,
        afterCleanupDispatch,
        observations,
      };
    },

    snapshot() {
      return {
        explicit: {
          runtime: explicitRuntime.getSnapshot(),
          observations: explicitObservations.map((entry) => ({ ...entry })),
          resolverCalls: explicitResolverCalls,
          buttonClicks,
          inputEvents,
          inputValue: explicitInput.value,
          activeElementId:
            document.activeElement instanceof Element
              ? document.activeElement.id
              : null,
          bindingActive: explicitActive,
        },
        normal: {
          runtime: normalRuntime.getSnapshot(),
          observations: normalObservations.map((entry) => ({ ...entry })),
          scrollTop: normalScroller.scrollTop,
          activeElementId:
            document.activeElement instanceof Element
              ? document.activeElement.id
              : null,
        },
        passive: {
          runtime: passiveRuntime.getSnapshot(),
          observations: passiveObservations.map((entry) => ({ ...entry })),
          scrollTop: passiveScroller.scrollTop,
          activeElementId:
            document.activeElement instanceof Element
              ? document.activeElement.id
              : null,
        },
        nested: {
          runtime: nestedRuntime.getSnapshot(),
          observations: nestedObservations.map((entry) => ({ ...entry })),
          activeElementId:
            document.activeElement instanceof Element
              ? document.activeElement.id
              : null,
        },
      };
    },

    finish() {
      cleanupExplicit();
      cleanupNormal();
      cleanupPassive();
      cleanupNestedInner();
      cleanupNestedOuter();

      const details = this.snapshot();

      explicitRuntime.dispose();
      normalRuntime.dispose();
      passiveRuntime.dispose();
      nestedRuntime.dispose();

      publish("pass", details);
      return details;
    },
  };

  publish("ready", window.__WIF_KEYBOARD_LISTENER_CONTROL__.snapshot());
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
