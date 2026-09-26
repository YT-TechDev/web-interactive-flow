import { bindWheelNavigation } from "/adapters/dom/wheel_listener.mjs";
import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_DOM_LISTENER_QUALIFICATION__";

function publish(state, details) {
  const value = { state, details };
  window[STATUS_KEY] = value;

  const output = document.getElementById("qualification-output");
  if (output !== null) {
    output.textContent = JSON.stringify(value);
  }
}

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error(`missing real DOM element: ${id}`);
  }
  return value;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

publish("pending", null);

try {
  const target = requireElement("wheel-target");
  const unrelatedTarget = requireElement("unrelated-target");

  const module = await compileFlowModule(fetch("/core.wasm"));
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
  });

  const intentByEvent = new WeakMap();
  let resolverCalls = 0;
  let realWheelEventCalls = 0;
  let currentTargetCalls = 0;

  const resolveIntent = (event) => {
    resolverCalls += 1;

    if (event instanceof WheelEvent) {
      realWheelEventCalls += 1;
    } else {
      throw new Error("resolver did not receive a real WheelEvent");
    }

    if (event.currentTarget === target) {
      currentTargetCalls += 1;
    } else {
      throw new Error("resolver did not run on the explicit DOM target");
    }

    return intentByEvent.get(event) ?? null;
  };

  const cleanup = bindWheelNavigation({
    target,
    runtime,
    resolveIntent,
    preventDefault: true,
  });

  function makeWheelEvent(intent) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 0,
      deltaY: 0,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    });
    intentByEvent.set(event, intent);
    return event;
  }

  function observeDispatch(dispatchTarget, event) {
    const beforeCalls = resolverCalls;
    const dispatchResult = dispatchTarget.dispatchEvent(event);
    return {
      dispatchResult,
      defaultPrevented: event.defaultPrevented,
      resolverCallDelta: resolverCalls - beforeCalls,
      snapshot: runtime.getSnapshot(),
    };
  }

  const initial = runtime.getSnapshot();

  const rejectedPrevious = observeDispatch(
    target,
    makeWheelEvent("previous"),
  );

  const acceptedNext = observeDispatch(
    target,
    makeWheelEvent("next"),
  );

  const activeRejectedNext = observeDispatch(
    target,
    makeWheelEvent("next"),
  );

  const beforeDecline = runtime.getSnapshot();
  const declined = observeDispatch(
    target,
    makeWheelEvent(null),
  );

  const beforeUnrelated = runtime.getSnapshot();
  const unrelated = observeDispatch(
    unrelatedTarget,
    makeWheelEvent("next"),
  );

  const callsBeforeCleanup = resolverCalls;
  const beforeCleanupDispatch = runtime.getSnapshot();

  cleanup();
  cleanup();

  const afterCleanup = observeDispatch(
    target,
    makeWheelEvent("next"),
  );

  const details = {
    targetIsElement: target instanceof Element,
    targetIsEventTarget: target instanceof EventTarget,
    initial,
    rejectedPrevious,
    acceptedNext,
    activeRejectedNext,
    declined: {
      ...declined,
      snapshotUnchanged: sameSnapshot(beforeDecline, declined.snapshot),
    },
    unrelated: {
      ...unrelated,
      snapshotUnchanged: sameSnapshot(beforeUnrelated, unrelated.snapshot),
    },
    cleanup: {
      ...afterCleanup,
      resolverCallsBeforeCleanup: callsBeforeCleanup,
      resolverCallsAfterDispatch: resolverCalls,
      snapshotUnchanged: sameSnapshot(
        beforeCleanupDispatch,
        afterCleanup.snapshot,
      ),
    },
    resolverCalls,
    realWheelEventCalls,
    currentTargetCalls,
  };

  runtime.dispose();

  publish("pass", details);
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
