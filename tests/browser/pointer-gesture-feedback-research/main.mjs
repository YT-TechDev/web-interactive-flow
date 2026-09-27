import { bindPointerNavigation } from "/adapters/dom/pointer_listener.mjs";
import { compileFlowModule } from "/bridge/module_compiler.mjs";
import { createFlowRuntime } from "/bridge/runtime.mjs";

const STATUS_KEY = "__WIF_POINTER_GESTURE_FEEDBACK_RESEARCH__";

function publish(state, details) {
  const value = { state, details };
  window[STATUS_KEY] = value;

  const output = document.getElementById("research-output");
  if (output !== null) {
    output.textContent = JSON.stringify(value);
  }
}

function requireElement(id) {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) {
    throw new Error("missing fixture element: " + id);
  }
  return value;
}

function createMovePolicy({
  mode,
  threshold = 40,
}) {
  let startY = null;
  let pointerId = null;
  let committed = false;
  const dispositions = [];
  const resets = [];

  function reset(reason) {
    startY = null;
    pointerId = null;
    committed = false;
    resets.push(reason);
  }

  return {
    handle(event) {
      if (event.type === "pointercancel") {
        reset("pointercancel");
        return null;
      }

      if (event.type === "pointerdown") {
        startY = event.clientY;
        pointerId = event.pointerId;
        committed = false;
        return null;
      }

      if (
        event.type === "pointermove" &&
        event.pointerId === pointerId &&
        startY !== null &&
        !committed
      ) {
        const delta = startY - event.clientY;

        if (delta > threshold) {
          if (mode === "proposal-commit") committed = true;
          return "next";
        }

        if (delta < -threshold) {
          if (mode === "proposal-commit") committed = true;
          return "previous";
        }
      }

      if (event.type === "pointerup") {
        reset("pointerup");
      }

      return null;
    },

    observeDisposition(intent, disposition) {
      dispositions.push({ intent, disposition });

      if (mode === "accepted-only" && disposition === "accepted") {
        committed = true;
      }
    },

    abort() {
      reset("binding-cleanup");
    },

    snapshot() {
      return {
        startY,
        pointerId,
        committed,
        dispositions: dispositions.map((entry) => ({ ...entry })),
        resets: [...resets],
      };
    },
  };
}

function makeObservedRuntime(runtime, policy, decisions, withFeedback) {
  function request(intent) {
    const disposition =
      intent === "next" ? runtime.next() : runtime.previous();

    decisions.push({ intent, disposition });

    if (withFeedback) {
      policy.observeDisposition(intent, disposition);
    }

    return disposition;
  }

  return {
    next() {
      return request("next");
    },

    previous() {
      return request("previous");
    },
  };
}

function dispatch(target, type, clientY, pointerId = 1) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: 0,
    clientY,
  });

  target.dispatchEvent(event);

  return {
    type,
    isTrusted: event.isTrusted,
    defaultPrevented: event.defaultPrevented,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientY: event.clientY,
  };
}

publish("pending", null);

try {
  const module = await compileFlowModule(fetch("/core.wasm"));

  function createCase({
    id,
    initial,
    mode,
    withFeedback,
  }) {
    const target = requireElement(id);
    const runtime = createFlowRuntime(module, {
      phases: ["A", "B", "C"],
      initial,
      transitionDuration: 0,
      cooldown: 0,
    });
    const policy = createMovePolicy({ mode });
    const decisions = [];
    const observedRuntime = makeObservedRuntime(
      runtime,
      policy,
      decisions,
      withFeedback,
    );
    const cleanup = bindPointerNavigation({
      target,
      runtime: observedRuntime,
      policy,
    });

    return {
      id,
      target,
      runtime,
      policy,
      decisions,
      cleanup,
      events: [],
    };
  }

  const duplicate = createCase({
    id: "duplicate",
    initial: "A",
    mode: "no-feedback",
    withFeedback: false,
  });

  duplicate.events.push(
    dispatch(duplicate.target, "pointerdown", 200),
    dispatch(duplicate.target, "pointermove", 150),
    dispatch(duplicate.target, "pointermove", 100),
  );

  const proposal = createCase({
    id: "proposal",
    initial: "C",
    mode: "proposal-commit",
    withFeedback: false,
  });

  proposal.events.push(
    dispatch(proposal.target, "pointerdown", 200),
    dispatch(proposal.target, "pointermove", 100),
    dispatch(proposal.target, "pointermove", 300),
  );

  const acceptedReversal = createCase({
    id: "accepted-reversal",
    initial: "C",
    mode: "accepted-only",
    withFeedback: true,
  });

  acceptedReversal.events.push(
    dispatch(acceptedReversal.target, "pointerdown", 200),
    dispatch(acceptedReversal.target, "pointermove", 100),
    dispatch(acceptedReversal.target, "pointermove", 300),
  );

  const acceptedConsume = createCase({
    id: "accepted-consume",
    initial: "A",
    mode: "accepted-only",
    withFeedback: true,
  });

  acceptedConsume.events.push(
    dispatch(acceptedConsume.target, "pointerdown", 200),
    dispatch(acceptedConsume.target, "pointermove", 100),
    dispatch(acceptedConsume.target, "pointermove", 50),
    dispatch(acceptedConsume.target, "pointermove", 300),
  );

  function snapshotCase(value) {
    return {
      runtime: value.runtime.getSnapshot(),
      policy: value.policy.snapshot(),
      decisions: value.decisions.map((entry) => ({ ...entry })),
      events: value.events.map((entry) => ({ ...entry })),
    };
  }

  const details = {
    duplicate: snapshotCase(duplicate),
    proposal: snapshotCase(proposal),
    acceptedReversal: snapshotCase(acceptedReversal),
    acceptedConsume: snapshotCase(acceptedConsume),
  };

  for (const value of [
    duplicate,
    proposal,
    acceptedReversal,
    acceptedConsume,
  ]) {
    value.cleanup();
    value.runtime.dispose();
  }

  publish("pass", details);
} catch (error) {
  publish("fail", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  });
}
