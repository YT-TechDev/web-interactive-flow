import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_OVERLAP_ARBITRATION_RESEARCH__";

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing element: " + id);
  }
  return value;
}

function pathLabel(value) {
  if (value === window) return "window";
  if (value === document) return "document";
  if (value instanceof Element) {
    return value.id || value.tagName.toLowerCase();
  }
  return value?.constructor?.name ?? "unknown";
}

function createPerRuntimeAcceptedArbiter() {
  const acceptedByEvent = new WeakMap();

  return {
    process({ event, runtime, resolve }) {
      const existing = acceptedByEvent.get(event);
      if (existing?.has(runtime)) {
        return {
          status: "suppressed",
          intent: null,
          disposition: null,
        };
      }

      const intent = resolve(event);
      if (intent === null || intent === undefined) {
        return {
          status: "declined",
          intent: null,
          disposition: null,
        };
      }

      if (intent !== "next" && intent !== "previous") {
        throw new Error("invalid research intent");
      }

      const disposition =
        intent === "next" ? runtime.next() : runtime.previous();

      if (disposition === "accepted") {
        const set = existing ?? new Set();
        set.add(runtime);
        if (existing === undefined) {
          acceptedByEvent.set(event, set);
        }
      }

      return {
        status: disposition,
        intent,
        disposition,
      };
    },
  };
}

function bind({
  label,
  target,
  runtime,
  resolve,
  observations,
  arbiter = null,
}) {
  const listener = (event) => {
    const before = {
      label,
      isTrusted: event.isTrusted,
      key: event.key,
      code: event.code,
      targetId: event.target instanceof Element ? event.target.id : null,
      currentTargetId:
        event.currentTarget instanceof Element
          ? event.currentTarget.id
          : null,
      defaultPreventedBefore: event.defaultPrevented,
      composedPath: event.composedPath().map(pathLabel),
    };

    const result =
      arbiter === null
        ? (() => {
            const intent = resolve(event);
            if (intent == null) {
              return {
                status: "declined",
                intent: null,
                disposition: null,
              };
            }

            const disposition =
              intent === "next" ? runtime.next() : runtime.previous();

            return {
              status: disposition,
              intent,
              disposition,
            };
          })()
        : arbiter.process({ event, runtime, resolve });

    observations.push({
      ...before,
      ...result,
      defaultPreventedAfter: event.defaultPrevented,
    });
  };

  target.addEventListener("keydown", listener);

  return () => target.removeEventListener("keydown", listener);
}

function snapshotRuntime(runtime) {
  const value = runtime.getSnapshot();
  return {
    selected: value.selected,
    transition: value.transition,
    cooldownActive: value.cooldownActive,
    locked: value.locked,
  };
}

function publish(state, details) {
  const value = { state, details };
  window[STATUS_KEY] = value;
  const output = document.getElementById("research-output");
  if (output !== null) output.textContent = JSON.stringify(value);
}

publish("pending", null);

try {
  const module = await compileFlowModule(fetch("/core.wasm"));
  const cleanup = [];

  const nextFirstTarget = requireElement("same-target-next-first");
  const previousFirstTarget = requireElement("same-target-previous-first");
  const independentInner = requireElement("independent-inner");
  const independentOuter = requireElement("independent-outer");
  const sameRuntimeInner = requireElement("same-runtime-inner");
  const sameRuntimeOuter = requireElement("same-runtime-outer");
  const fallbackInner = requireElement("fallback-inner");
  const fallbackOuter = requireElement("fallback-outer");
  const propagationStop = requireElement("propagation-stop");
  const propagationImmediate = requireElement("propagation-immediate");
  const syntheticReuseTarget = requireElement("synthetic-reuse-target");

  const nextFirstRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "B",
    transitionDuration: 0,
    cooldown: 0,
  });
  const previousFirstRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "B",
    transitionDuration: 0,
    cooldown: 0,
  });

  const nextFirstArbiter = createPerRuntimeAcceptedArbiter();
  const previousFirstArbiter = createPerRuntimeAcceptedArbiter();
  const nextFirstObservations = [];
  const previousFirstObservations = [];

  cleanup.push(
    bind({
      label: "next-first:next",
      target: nextFirstTarget,
      runtime: nextFirstRuntime,
      resolve: () => "next",
      observations: nextFirstObservations,
      arbiter: nextFirstArbiter,
    }),
  );
  cleanup.push(
    bind({
      label: "next-first:previous",
      target: nextFirstTarget,
      runtime: nextFirstRuntime,
      resolve: () => "previous",
      observations: nextFirstObservations,
      arbiter: nextFirstArbiter,
    }),
  );

  cleanup.push(
    bind({
      label: "previous-first:previous",
      target: previousFirstTarget,
      runtime: previousFirstRuntime,
      resolve: () => "previous",
      observations: previousFirstObservations,
      arbiter: previousFirstArbiter,
    }),
  );
  cleanup.push(
    bind({
      label: "previous-first:next",
      target: previousFirstTarget,
      runtime: previousFirstRuntime,
      resolve: () => "next",
      observations: previousFirstObservations,
      arbiter: previousFirstArbiter,
    }),
  );

  const independentInnerRuntime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const independentOuterRuntime = createFlowRuntime(module, {
    phases: ["X", "Y"],
    initial: "X",
    transitionDuration: 0,
    cooldown: 0,
  });
  const independentObservations = [];

  cleanup.push(
    bind({
      label: "independent-inner",
      target: independentInner,
      runtime: independentInnerRuntime,
      resolve: () => "next",
      observations: independentObservations,
    }),
  );
  cleanup.push(
    bind({
      label: "independent-outer",
      target: independentOuter,
      runtime: independentOuterRuntime,
      resolve: () => "next",
      observations: independentObservations,
    }),
  );

  const sameRuntime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const sameRuntimeArbiter = createPerRuntimeAcceptedArbiter();
  const sameRuntimeObservations = [];

  cleanup.push(
    bind({
      label: "same-runtime-inner",
      target: sameRuntimeInner,
      runtime: sameRuntime,
      resolve: () => "next",
      observations: sameRuntimeObservations,
      arbiter: sameRuntimeArbiter,
    }),
  );
  cleanup.push(
    bind({
      label: "same-runtime-outer",
      target: sameRuntimeOuter,
      runtime: sameRuntime,
      resolve: () => "next",
      observations: sameRuntimeObservations,
      arbiter: sameRuntimeArbiter,
    }),
  );

  const fallbackRuntime = createFlowRuntime(module, {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });
  const fallbackArbiter = createPerRuntimeAcceptedArbiter();
  const fallbackObservations = [];

  cleanup.push(
    bind({
      label: "fallback-inner",
      target: fallbackInner,
      runtime: fallbackRuntime,
      resolve: () => "previous",
      observations: fallbackObservations,
      arbiter: fallbackArbiter,
    }),
  );
  cleanup.push(
    bind({
      label: "fallback-outer",
      target: fallbackOuter,
      runtime: fallbackRuntime,
      resolve: () => "next",
      observations: fallbackObservations,
      arbiter: fallbackArbiter,
    }),
  );

  const propagation = {
    stop: [],
    immediate: [],
  };

  const stopFirst = (event) => {
    propagation.stop.push("wif-stop");
    event.stopPropagation();
  };
  const stopSecond = () => {
    propagation.stop.push("unrelated-same-target");
  };
  const stopDocument = (event) => {
    if (event.target === propagationStop) {
      propagation.stop.push("document");
    }
  };

  propagationStop.addEventListener("keydown", stopFirst);
  propagationStop.addEventListener("keydown", stopSecond);
  document.addEventListener("keydown", stopDocument);
  cleanup.push(() => propagationStop.removeEventListener("keydown", stopFirst));
  cleanup.push(() => propagationStop.removeEventListener("keydown", stopSecond));
  cleanup.push(() => document.removeEventListener("keydown", stopDocument));

  const immediateFirst = (event) => {
    propagation.immediate.push("wif-immediate");
    event.stopImmediatePropagation();
  };
  const immediateSecond = () => {
    propagation.immediate.push("unrelated-same-target");
  };
  const immediateDocument = (event) => {
    if (event.target === propagationImmediate) {
      propagation.immediate.push("document");
    }
  };

  propagationImmediate.addEventListener("keydown", immediateFirst);
  propagationImmediate.addEventListener("keydown", immediateSecond);
  document.addEventListener("keydown", immediateDocument);
  cleanup.push(() =>
    propagationImmediate.removeEventListener("keydown", immediateFirst),
  );
  cleanup.push(() =>
    propagationImmediate.removeEventListener("keydown", immediateSecond),
  );
  cleanup.push(() =>
    document.removeEventListener("keydown", immediateDocument),
  );

  window.__WIF_OVERLAP_ARBITRATION_CONTROL__ = {
    focus(id) {
      const element = requireElement(id);
      element.focus();
      return document.activeElement === element;
    },

    runSyntheticReuseProbe() {
      const runtime = createFlowRuntime(module, {
        phases: ["A", "B", "C"],
        initial: "A",
        transitionDuration: 0,
        cooldown: 0,
      });
      const arbiter = createPerRuntimeAcceptedArbiter();
      const observations = [];

      const remove = bind({
        label: "synthetic-reuse",
        target: syntheticReuseTarget,
        runtime,
        resolve: () => "next",
        observations,
        arbiter,
      });

      const event = new KeyboardEvent("keydown", {
        key: "n",
        bubbles: true,
        cancelable: false,
      });

      const firstDispatch = syntheticReuseTarget.dispatchEvent(event);
      const afterFirst = snapshotRuntime(runtime);
      const secondDispatch = syntheticReuseTarget.dispatchEvent(event);
      const afterSecond = snapshotRuntime(runtime);

      remove();
      runtime.dispose();

      return {
        eventIsTrusted: event.isTrusted,
        firstDispatch,
        secondDispatch,
        afterFirst,
        afterSecond,
        observations,
      };
    },

    snapshot() {
      return {
        sameTargetNextFirst: {
          runtime: snapshotRuntime(nextFirstRuntime),
          observations: nextFirstObservations.map((entry) => ({ ...entry })),
        },
        sameTargetPreviousFirst: {
          runtime: snapshotRuntime(previousFirstRuntime),
          observations: previousFirstObservations.map((entry) => ({ ...entry })),
        },
        independent: {
          innerRuntime: snapshotRuntime(independentInnerRuntime),
          outerRuntime: snapshotRuntime(independentOuterRuntime),
          observations: independentObservations.map((entry) => ({ ...entry })),
        },
        sameRuntime: {
          runtime: snapshotRuntime(sameRuntime),
          observations: sameRuntimeObservations.map((entry) => ({ ...entry })),
        },
        fallback: {
          runtime: snapshotRuntime(fallbackRuntime),
          observations: fallbackObservations.map((entry) => ({ ...entry })),
        },
        propagation: {
          stop: [...propagation.stop],
          immediate: [...propagation.immediate],
        },
      };
    },

    finish() {
      while (cleanup.length > 0) {
        cleanup.pop()();
      }

      const details = this.snapshot();

      nextFirstRuntime.dispose();
      previousFirstRuntime.dispose();
      independentInnerRuntime.dispose();
      independentOuterRuntime.dispose();
      sameRuntime.dispose();
      fallbackRuntime.dispose();

      publish("pass", details);
      return details;
    },
  };

  publish("ready", window.__WIF_OVERLAP_ARBITRATION_CONTROL__.snapshot());
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
