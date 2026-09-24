const INT32_MAX = 2_147_483_647;
const QUANTA_PER_MILLISECOND = 1000;

function fail(message) {
  throw new Error(message);
}

function validateTimestamp(timestampMs) {
  if (
    typeof timestampMs !== "number" ||
    !Number.isFinite(timestampMs) ||
    timestampMs < 0
  ) {
    fail("invalid monotonic timestamp");
  }
}

function validateBudget(budgetUs) {
  if (
    typeof budgetUs !== "number" ||
    !Number.isSafeInteger(budgetUs) ||
    budgetUs < 0
  ) {
    fail("invalid normalized tick budget");
  }
}

function elapsedMicroseconds(timestampMs, baselineTimestampMs) {
  const elapsedUs = Math.floor(
    (timestampMs - baselineTimestampMs) * QUANTA_PER_MILLISECOND,
  );

  if (!Number.isSafeInteger(elapsedUs) || elapsedUs < 0) {
    fail("normalized elapsed time is outside the safe integer domain");
  }

  return elapsedUs;
}

export function createMonotonicTimeNormalizer() {
  let initialized = false;
  let baselineTimestampMs = 0;
  let previousTimestampMs = 0;
  let previousElapsedUs = 0;

  function observe(timestampMs) {
    validateTimestamp(timestampMs);

    if (!initialized) {
      initialized = true;
      baselineTimestampMs = timestampMs;
      previousTimestampMs = timestampMs;
      previousElapsedUs = 0;
      return 0;
    }

    if (timestampMs < previousTimestampMs) {
      fail("monotonic timestamp regressed");
    }

    const nextElapsedUs = elapsedMicroseconds(
      timestampMs,
      baselineTimestampMs,
    );

    if (nextElapsedUs < previousElapsedUs) {
      fail("normalized elapsed time regressed");
    }

    const budgetUs = nextElapsedUs - previousElapsedUs;
    validateBudget(budgetUs);

    previousTimestampMs = timestampMs;
    previousElapsedUs = nextElapsedUs;

    return budgetUs;
  }

  function rebase(timestampMs) {
    validateTimestamp(timestampMs);

    initialized = true;
    baselineTimestampMs = timestampMs;
    previousTimestampMs = timestampMs;
    previousElapsedUs = 0;

    return 0;
  }

  return {
    observe,
    rebase,
  };
}

export function* decomposeTickBudgetUs(budgetUs) {
  validateBudget(budgetUs);

  let remainingUs = budgetUs;

  while (remainingUs > INT32_MAX) {
    yield INT32_MAX;
    remainingUs -= INT32_MAX;
  }

  if (remainingUs > 0) {
    yield remainingUs;
  }
}
