const INT32_MAX = 2_147_483_647;

export const REQUIRED_ABI_FUNCTIONS = [
  "wif_abi_init",
  "wif_abi_request_next",
  "wif_abi_request_previous",
  "wif_abi_request_target",
  "wif_abi_set_locked",
  "wif_abi_tick",
  "wif_abi_dispose",
  "wif_abi_selected_token",
  "wif_abi_transition_state",
  "wif_abi_raw_progress",
  "wif_abi_cooldown_active",
  "wif_abi_locked",
];

function fail(message) {
  throw new Error(message);
}

export function validateQuanta(value) {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > INT32_MAX
  ) {
    fail("invalid normalized quanta");
  }
  return value;
}

export function normalizeConfig(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    fail("invalid runtime config");
  }

  const sourcePhases = config.phases;
  if (!Array.isArray(sourcePhases)) {
    fail("phases must be an array");
  }
  if (sourcePhases.length < 1 || sourcePhases.length > INT32_MAX) {
    fail("invalid phase domain size");
  }

  const phases = sourcePhases.slice();
  const tokenByPhase = new Map();

  for (let token = 0; token < phases.length; token += 1) {
    const phase = phases[token];
    if (typeof phase !== "string") {
      fail("phase identities must be primitive strings");
    }
    if (tokenByPhase.has(phase)) {
      fail("duplicate phase identity");
    }
    tokenByPhase.set(phase, token);
  }

  if (typeof config.initial !== "string" || !tokenByPhase.has(config.initial)) {
    fail("initial phase is not configured");
  }

  return {
    phases,
    tokenByPhase,
    initialToken: tokenByPhase.get(config.initial),
    transitionDuration: validateQuanta(config.transitionDuration),
    cooldown: validateQuanta(config.cooldown),
  };
}

export function assertCompatibleModule(module) {
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 0) {
    fail("unexpected WebAssembly imports");
  }

  const declaredExports = new Map(
    WebAssembly.Module.exports(module).map((entry) => [entry.name, entry.kind]),
  );

  for (const name of REQUIRED_ABI_FUNCTIONS) {
    if (declaredExports.get(name) !== "function") {
      fail("missing required WebAssembly function export");
    }
  }
}

function assertAbiFunctions(abi) {
  if (abi === null || typeof abi !== "object") {
    fail("invalid ABI exports object");
  }

  for (const name of REQUIRED_ABI_FUNCTIONS) {
    if (typeof abi[name] !== "function") {
      fail("missing required ABI function");
    }
  }
}

function decodeRequestStatus(status) {
  if (status === 2) {
    return "accepted";
  }
  if (status === 1) {
    return "rejected";
  }
  fail("unexpected request status");
}

function assertOperationStatus(status) {
  if (status !== 1) {
    fail("unexpected operation status");
  }
}

function decodeBool(value) {
  if (value === 0) {
    return false;
  }
  if (value === 1) {
    return true;
  }
  fail("unexpected Bool carrier");
}

function decodeSelectedToken(value, phases) {
  if (!Number.isInteger(value) || value < 0 || value >= phases.length) {
    fail("selected token is outside configured domain");
  }
  return phases[value];
}

function decodeTransitionState(value) {
  if (value === 0) {
    return null;
  }
  if (value === 1) {
    return "forward";
  }
  if (value === 2) {
    return "reverse";
  }
  fail("unexpected transition carrier");
}

function decodeActiveProgress(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("unexpected active raw progress");
  }
  return value;
}

export function createSemanticRuntimeFromAbi(abiExports, normalizedConfig) {
  assertAbiFunctions(abiExports);

  const initStatus = abiExports.wif_abi_init(
    normalizedConfig.phases.length,
    normalizedConfig.initialToken,
    normalizedConfig.transitionDuration,
    normalizedConfig.cooldown,
  );
  assertOperationStatus(initStatus);

  let live = true;
  let abi = abiExports;
  let phases = normalizedConfig.phases;
  let tokenByPhase = normalizedConfig.tokenByPhase;

  function ensureLive() {
    if (!live || abi === null) {
      fail("runtime wrapper is disposed");
    }
  }

  function next() {
    ensureLive();
    return decodeRequestStatus(abi.wif_abi_request_next());
  }

  function previous() {
    ensureLive();
    return decodeRequestStatus(abi.wif_abi_request_previous());
  }

  function goTo(phase) {
    ensureLive();
    if (typeof phase !== "string" || !tokenByPhase.has(phase)) {
      fail("unknown phase identity");
    }
    return decodeRequestStatus(
      abi.wif_abi_request_target(tokenByPhase.get(phase)),
    );
  }

  function lock() {
    ensureLive();
    assertOperationStatus(abi.wif_abi_set_locked(1));
  }

  function unlock() {
    ensureLive();
    assertOperationStatus(abi.wif_abi_set_locked(0));
  }

  function tick(dt) {
    ensureLive();
    assertOperationStatus(abi.wif_abi_tick(dt));
  }

  function getSnapshot() {
    ensureLive();

    const selected = decodeSelectedToken(
      abi.wif_abi_selected_token(),
      phases,
    );
    const direction = decodeTransitionState(
      abi.wif_abi_transition_state(),
    );

    let transition = null;
    if (direction !== null) {
      transition = {
        direction,
        rawProgress: decodeActiveProgress(abi.wif_abi_raw_progress()),
      };
    }

    const cooldownActive = decodeBool(abi.wif_abi_cooldown_active());
    const locked = decodeBool(abi.wif_abi_locked());

    return {
      selected,
      transition,
      cooldownActive,
      locked,
    };
  }

  function dispose() {
    ensureLive();

    const currentAbi = abi;
    live = false;
    abi = null;
    phases = null;
    tokenByPhase = null;

    const status = currentAbi.wif_abi_dispose();
    assertOperationStatus(status);
  }

  return {
    next,
    previous,
    goTo,
    lock,
    unlock,
    tick,
    getSnapshot,
    dispose,
  };
}
