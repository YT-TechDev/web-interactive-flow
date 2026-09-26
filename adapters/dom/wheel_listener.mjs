import { applyWheelNavigationIntent } from "../../bridge/wheel_ownership.mjs";

export function bindWheelNavigation({
  target,
  runtime,
  resolveIntent,
  preventDefault = true,
}) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new Error("invalid wheel listener target");
  }

  if (typeof resolveIntent !== "function") {
    throw new Error("invalid wheel intent resolver");
  }

  if (typeof preventDefault !== "boolean") {
    throw new Error("invalid preventDefault policy");
  }

  const listenerOptions = preventDefault ? { passive: false } : undefined;

  const handleWheel = (event) => {
    const intent = resolveIntent(event);

    if (intent === null || intent === undefined) {
      return;
    }

    applyWheelNavigationIntent({
      runtime,
      event,
      intent,
      preventDefault,
    });
  };

  target.addEventListener("wheel", handleWheel, listenerOptions);

  let active = true;

  return function cleanupWheelNavigation() {
    if (!active) {
      return;
    }

    active = false;
    target.removeEventListener("wheel", handleWheel, listenerOptions);
  };
}
