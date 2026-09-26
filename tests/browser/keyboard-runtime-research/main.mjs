import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_KEYBOARD_RUNTIME_RESEARCH__";

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

publish("pending", null);

try {
  const root = requireElement("flow-root");
  const scroller = requireElement("flow-scroller");
  const nativeButton = requireElement("native-button");
  const nativeInput = requireElement("native-input");

  const module = await compileFlowModule(fetch("/core.wasm"));
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });

  const decisions = [];
  const observedEvents = [];
  let buttonClicks = 0;
  let inputEvents = 0;

  function resolveIntent(event) {
    if (!(event.target instanceof Element)) {
      return null;
    }

    if (event.target.closest("button, input, textarea, select, [contenteditable]") !== null) {
      return null;
    }

    if (event.key === "PageUp") {
      return "previous";
    }

    if (event.key === "PageDown") {
      return "next";
    }

    return null;
  }

  function handleKeyDown(event) {
    if (!(event instanceof KeyboardEvent)) {
      throw new Error("keyboard handler did not receive KeyboardEvent");
    }

    const intent = resolveIntent(event);

    if (intent === null) {
      decisions.push({
        key: event.key,
        targetId: event.target instanceof Element ? event.target.id : null,
        intent: null,
        disposition: null,
        preventedByOwnership: false,
      });
      return;
    }

    const request = intent === "next" ? runtime.next : runtime.previous;
    const disposition = request.call(runtime);
    let preventedByOwnership = false;

    if (disposition === "accepted" && event.cancelable) {
      event.preventDefault();
      preventedByOwnership = true;
    }

    decisions.push({
      key: event.key,
      targetId: event.target instanceof Element ? event.target.id : null,
      intent,
      disposition,
      preventedByOwnership,
    });
  }

  root.addEventListener("keydown", handleKeyDown);

  root.addEventListener(
    "keydown",
    (event) => {
      observedEvents.push({
        isTrusted: event.isTrusted,
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        isComposing: event.isComposing,
        cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented,
        targetId: event.target instanceof Element ? event.target.id : null,
        currentTargetId:
          event.currentTarget instanceof Element ? event.currentTarget.id : null,
        activeElementId:
          document.activeElement instanceof Element
            ? document.activeElement.id
            : null,
      });
    },
    { passive: true },
  );

  nativeButton.addEventListener("click", (event) => {
    if (event.isTrusted) {
      buttonClicks += 1;
    }
  });

  nativeInput.addEventListener("input", (event) => {
    if (event.isTrusted) {
      inputEvents += 1;
    }
  });

  window.__WIF_KEYBOARD_RUNTIME_CONTROL__ = {
    resetObservations() {
      decisions.length = 0;
      observedEvents.length = 0;
    },

    focus(id) {
      const element = requireElement(id);
      element.focus();
      return document.activeElement === element;
    },

    setScrollerTop(value) {
      scroller.scrollTop = value;
      return scroller.scrollTop;
    },

    clearInput() {
      nativeInput.value = "";
      return nativeInput.value;
    },

    snapshot() {
      return {
        runtime: runtime.getSnapshot(),
        scrollerScrollTop: scroller.scrollTop,
        scrollerMaxScrollTop: scroller.scrollHeight - scroller.clientHeight,
        activeElementId:
          document.activeElement instanceof Element
            ? document.activeElement.id
            : null,
        decisions: decisions.map((entry) => ({ ...entry })),
        observedEvents: observedEvents.map((entry) => ({ ...entry })),
        buttonClicks,
        inputEvents,
        inputValue: nativeInput.value,
      };
    },

    finish() {
      root.removeEventListener("keydown", handleKeyDown);
      const details = this.snapshot();
      runtime.dispose();
      publish("pass", details);
      return details;
    },
  };

  publish("ready", window.__WIF_KEYBOARD_RUNTIME_CONTROL__.snapshot());
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
