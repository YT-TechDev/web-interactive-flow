function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new Error(`invalid ${label}`);
  }
}

export function createAcceptedPointerRecognizer(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new Error("invalid pointer recognizer options");
  }

  const {
    admitPointer,
    project,
    qualify,
    mapIntent,
    shouldPropose,
  } = options;

  requireFunction(admitPointer, "pointer admission policy");
  requireFunction(project, "pointer projection policy");
  requireFunction(qualify, "pointer qualification policy");
  requireFunction(mapIntent, "pointer intent mapping policy");
  requireFunction(shouldPropose, "pointer proposal timing policy");

  const activePointerIds = new Set();

  let trackedPointerId = null;
  let contaminated = false;
  let baseline = null;
  let measurementReady = false;
  let committed = false;

  function clearMeasurement() {
    baseline = null;
    measurementReady = false;
  }

  function contaminate() {
    contaminated = true;
    clearMeasurement();
  }

  function reset() {
    activePointerIds.clear();
    trackedPointerId = null;
    contaminated = false;
    clearMeasurement();
    committed = false;
  }

  function canEvaluate(pointerId) {
    return (
      !contaminated &&
      !committed &&
      measurementReady &&
      pointerId === trackedPointerId
    );
  }

  function evaluate(event) {
    if (!canEvaluate(event.pointerId)) {
      return null;
    }

    const current = project(event);

    if (!Number.isFinite(current)) {
      return null;
    }

    const displacement = baseline - current;

    if (!Number.isFinite(displacement)) {
      return null;
    }

    if (!qualify(displacement)) {
      return null;
    }

    return mapIntent(displacement);
  }

  function handlePointerDown(event) {
    if (!admitPointer(event)) {
      return null;
    }

    if (activePointerIds.has(event.pointerId)) {
      contaminate();
      return null;
    }

    const startsFreshSequence = activePointerIds.size === 0;
    activePointerIds.add(event.pointerId);

    if (!startsFreshSequence) {
      contaminate();
      return null;
    }

    trackedPointerId = event.pointerId;
    contaminated = false;
    committed = false;

    const projected = project(event);

    if (Number.isFinite(projected)) {
      baseline = projected;
      measurementReady = true;
    } else {
      clearMeasurement();
    }

    return null;
  }

  function handlePointerCancel(event) {
    if (!activePointerIds.has(event.pointerId)) {
      return null;
    }

    activePointerIds.delete(event.pointerId);
    clearMeasurement();

    if (event.pointerId === trackedPointerId) {
      trackedPointerId = null;
    }

    if (activePointerIds.size === 0) {
      reset();
    } else {
      contaminated = true;
    }

    return null;
  }

  function handlePointerMove(event) {
    if (
      !activePointerIds.has(event.pointerId) ||
      !canEvaluate(event.pointerId) ||
      !shouldPropose(event)
    ) {
      return null;
    }

    return evaluate(event);
  }

  function handlePointerUp(event) {
    if (!activePointerIds.has(event.pointerId)) {
      return null;
    }

    const intent =
      canEvaluate(event.pointerId) &&
      shouldPropose(event)
        ? evaluate(event)
        : null;

    activePointerIds.delete(event.pointerId);

    if (activePointerIds.size === 0) {
      reset();
    } else if (event.pointerId === trackedPointerId) {
      trackedPointerId = null;
      contaminate();
    }

    return intent;
  }

  return {
    handle(event) {
      switch (event.type) {
        case "pointerdown":
          return handlePointerDown(event);
        case "pointermove":
          return handlePointerMove(event);
        case "pointerup":
          return handlePointerUp(event);
        case "pointercancel":
          return handlePointerCancel(event);
        default:
          return null;
      }
    },

    onDisposition(_intent, disposition) {
      if (
        disposition === "accepted" &&
        activePointerIds.size > 0 &&
        trackedPointerId !== null &&
        !contaminated
      ) {
        committed = true;
      }
    },

    abort() {
      reset();
    },
  };
}
