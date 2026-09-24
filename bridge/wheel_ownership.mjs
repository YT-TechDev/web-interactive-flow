export function applyWheelNavigationIntent({
  runtime,
  event,
  intent,
  preventDefault = true,
}) {
  if (runtime === null || typeof runtime !== "object") {
    throw new Error("invalid semantic runtime");
  }

  if (intent !== "next" && intent !== "previous") {
    throw new Error("invalid normalized wheel intent");
  }

  const request = intent === "next" ? runtime.next : runtime.previous;
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

  const disposition = request.call(runtime);

  if (
    disposition === "accepted" &&
    preventDefault
  ) {
    event.preventDefault();
  }

  return disposition;
}
