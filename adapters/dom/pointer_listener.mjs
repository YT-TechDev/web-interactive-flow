const POINTER_EVENT_TYPES = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
];

export function bindPointerNavigation({
  target,
  runtime,
  policy,
}) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid pointer listener target");
  }

  if (
    policy === null ||
    typeof policy !== "object" ||
    typeof policy.handle !== "function" ||
    typeof policy.abort !== "function"
  ) {
    throw new Error("invalid pointer gesture policy");
  }

  const hasDispositionFeedback = "onDisposition" in policy;
  const onDisposition = hasDispositionFeedback
    ? policy.onDisposition
    : null;

  if (
    hasDispositionFeedback &&
    typeof onDisposition !== "function"
  ) {
    throw new Error(
      "invalid pointer gesture policy disposition feedback",
    );
  }

  const listeners = new Map();

  try {
    for (const type of POINTER_EVENT_TYPES) {
      const listener = (event) => {
        const intent = policy.handle(event);

        if (intent === null || intent === undefined) {
          return;
        }

        if (intent !== "next" && intent !== "previous") {
          throw new Error("invalid pointer navigation intent");
        }

        const request = intent === "next" ? runtime.next : runtime.previous;
        const disposition = request.call(runtime);

        if (hasDispositionFeedback) {
          onDisposition.call(policy, intent, disposition);
        }
      };

      listeners.set(type, listener);
      target.addEventListener(type, listener);
    }
  } catch (error) {
    for (const [type, listener] of listeners) {
      try {
        target.removeEventListener(type, listener);
      } catch {
        // Continue releasing every listener while preserving setup failure.
      }
    }

    try {
      policy.abort();
    } catch {
      // Preserve the setup failure.
    }
    throw error;
  }

  let active = true;

  return function cleanupPointerNavigation() {
    if (!active) {
      return;
    }

    active = false;

    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener);
    }

    policy.abort();
  };
}
