export function applyWheelNavigationIntent({
  runtime,
  event,
  intent,
  preventDefault = true,
}) {
  if (runtime === null || typeof runtime !== "object") {
    throw new Error("invalid semantic runtime");
  }

  const isTarget =
    intent !== null &&
    typeof intent === "object" &&
    intent.type === "target" &&
    Object.hasOwn(intent, "target");

  if (intent !== "next" && intent !== "previous" && !isTarget) {
    throw new Error("invalid normalized wheel intent");
  }

  const request = isTarget
    ? runtime.goTo
    : intent === "next"
      ? runtime.next
      : runtime.previous;
  if (typeof request !== "function") {
    throw new Error("invalid semantic runtime");
  }

  if (
    event === null ||
    typeof event !== "object" ||
    typeof event.cancelable !== "boolean" ||
    typeof event.preventDefault !== "function"
  ) {
    throw new Error("invalid wheel event");
  }

  if (typeof preventDefault !== "boolean") {
    throw new Error("invalid preventDefault policy");
  }

  // Target identity validation stays with Runtime.goTo(); it is not a rejection.
  const disposition = isTarget
    ? request.call(runtime, intent.target)
    : request.call(runtime);

  if (
    disposition === "accepted" &&
    preventDefault &&
    event.cancelable
  ) {
    event.preventDefault();
  }

  return disposition;
}
