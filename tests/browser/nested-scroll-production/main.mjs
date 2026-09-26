import { bindWheelNavigation } from "/adapters/dom/wheel_listener.mjs";
import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_EXPLICIT_NESTED_SCROLL__";

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing real DOM element: " + id);
  }
  return value;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const nativeScroll = requireElement("native-scroll");
  const flowOwned = requireElement("flow-owned");

  const module = await compileFlowModule(fetch("/core.wasm"));
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });

  let resolverCalls = 0;
  let nativeDeclines = 0;
  let producedIntents = 0;
  const observedEvents = [];

  const resolveIntent = (event) => {
    resolverCalls += 1;

    if (!(event instanceof WheelEvent)) {
      throw new Error("resolver did not receive a real WheelEvent");
    }

    if (!(event.target instanceof Element)) {
      return null;
    }

    if (event.target.closest("[data-wif-native-scroll]") !== null) {
      nativeDeclines += 1;
      return null;
    }

    producedIntents += 1;
    return "next";
  };

  const cleanup = bindWheelNavigation({
    target: root,
    runtime,
    resolveIntent,
    preventDefault: true,
  });

  root.addEventListener(
    "wheel",
    (event) => {
      observedEvents.push({
        isTrusted: event.isTrusted,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented,
        targetId: event.target instanceof Element ? event.target.id : null,
        currentTargetId:
          event.currentTarget instanceof Element ? event.currentTarget.id : null,
      });
    },
    { passive: true },
  );

  nativeScroll.scrollTop = 100;

  window[STATUS_KEY] = {
    state: "ready",
    details: {
      snapshot: runtime.getSnapshot(),
      nativeScrollTop: nativeScroll.scrollTop,
    },
  };

  window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__ = {
    snapshot() {
      return {
        runtime: runtime.getSnapshot(),
        nativeScrollTop: nativeScroll.scrollTop,
        nativeMaxScrollTop:
          nativeScroll.scrollHeight - nativeScroll.clientHeight,
        resolverCalls,
        nativeDeclines,
        producedIntents,
        observedEvents: observedEvents.map((event) => ({ ...event })),
      };
    },

    resetEvents() {
      observedEvents.length = 0;
    },

    setNativePosition(position) {
      const max = nativeScroll.scrollHeight - nativeScroll.clientHeight;

      if (position === "middle") {
        nativeScroll.scrollTop = Math.floor(max / 2);
        return nativeScroll.scrollTop;
      }

      if (position === "end") {
        nativeScroll.scrollTop = max;
        return nativeScroll.scrollTop;
      }

      throw new Error("unknown native scroll position");
    },

    finish() {
      cleanup();
      const details = {
        rootIsElement: root instanceof Element,
        nativeScrollIsElement: nativeScroll instanceof Element,
        flowOwnedIsElement: flowOwned instanceof Element,
        snapshot: runtime.getSnapshot(),
        nativeScrollTop: nativeScroll.scrollTop,
        resolverCalls,
        nativeDeclines,
        producedIntents,
        observedEvents: observedEvents.map((event) => ({ ...event })),
      };
      runtime.dispose();
      publish("pass", details);
      return details;
    },

    assertUnchanged(before) {
      return sameSnapshot(before, runtime.getSnapshot());
    },
  };
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
