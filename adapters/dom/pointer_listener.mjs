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

  const listeners = new Map();

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
      request.call(runtime);
    };

    listeners.set(type, listener);
    target.addEventListener(type, listener);
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
