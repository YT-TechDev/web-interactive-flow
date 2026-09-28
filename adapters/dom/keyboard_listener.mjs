import { applyKeyboardNavigationIntent } from "../../bridge/keyboard_ownership.mjs";

export function bindKeyboardNavigation({
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
    throw new Error("invalid keyboard listener target");
  }

  if (typeof resolveIntent !== "function") {
    throw new Error("invalid keyboard intent resolver");
  }

  if (typeof preventDefault !== "boolean") {
    throw new Error("invalid preventDefault policy");
  }

  const handleKeyDown = (event) => {
    const intent = resolveIntent(event);
    if (intent === null || intent === undefined) return;

    applyKeyboardNavigationIntent({
      runtime,
      event,
      intent,
      preventDefault,
    });
  };

  target.addEventListener("keydown", handleKeyDown);
  let active = true;

  return function cleanupKeyboardNavigation() {
    if (!active) return;
    active = false;
    target.removeEventListener("keydown", handleKeyDown);
  };
}
