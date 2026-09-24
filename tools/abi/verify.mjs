import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const artifactPath = process.argv[2];
if (!artifactPath) {
  throw new Error("usage: node tools/abi/verify.mjs <wasm-artifact>");
}

const bytes = await readFile(artifactPath);
const module = await WebAssembly.compile(bytes);

const expectedFunctions = [
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

const exportDescriptors = WebAssembly.Module.exports(module);
const exportsByName = new Map(
  exportDescriptors.map((entry) => [entry.name, entry.kind]),
);
for (const name of expectedFunctions) {
  assert.equal(
    exportsByName.get(name),
    "function",
    `missing scalar Wasm function export: ${name}`,
  );
}

const importDescriptors = WebAssembly.Module.imports(module);
assert.deepEqual(
  importDescriptors,
  [],
  `unexpected Wasm imports can invalidate instance-isolation/coherence assumptions: ${JSON.stringify(importDescriptors)}`,
);

const instanceA = await WebAssembly.instantiate(module, {});
const instanceB = await WebAssembly.instantiate(module, {});
const instanceC = await WebAssembly.instantiate(module, {});

const a = instanceA.exports;
const b = instanceB.exports;
const c = instanceC.exports;

const OP_INVALID = 0;
const OP_OK = 1;
const REQUEST_INVALID = 0;
const REQUEST_REJECTED = 1;
const REQUEST_ACCEPTED = 2;
const TRANSITION_INACTIVE = 0;
const TRANSITION_FORWARD = 1;
const TRANSITION_REVERSE = 2;
const I32_MAX = 2_147_483_647;

function assertLiveState(
  runtime,
  { selected, transition, cooldown, locked, progress },
  label,
) {
  assert.equal(runtime.wif_abi_selected_token(), selected, `${label}: selected`);
  assert.equal(
    runtime.wif_abi_transition_state(),
    transition,
    `${label}: transition`,
  );
  assert.equal(
    runtime.wif_abi_cooldown_active(),
    cooldown ? 1 : 0,
    `${label}: cooldown`,
  );
  assert.equal(runtime.wif_abi_locked(), locked ? 1 : 0, `${label}: locked`);
  if (progress !== undefined) {
    assert.equal(runtime.wif_abi_raw_progress(), progress, `${label}: progress`);
  }
}

// Raw ABI lifecycle misuse is distinct from ordinary request rejection.
assert.equal(a.wif_abi_request_next(), REQUEST_INVALID);
assert.equal(a.wif_abi_tick(0), OP_INVALID);
assert.equal(a.wif_abi_dispose(), OP_INVALID);
assert.equal(a.wif_abi_init(0, 0, 0, 0), OP_INVALID);

// Two independent instances can use different normalized domains/configuration.
assert.equal(a.wif_abi_init(4, 0, 100, 20), OP_OK);
assert.equal(b.wif_abi_init(3, 2, 0, 30), OP_OK);
assert.equal(a.wif_abi_init(4, 0, 100, 20), OP_INVALID);

assertLiveState(
  a,
  {
    selected: 0,
    transition: TRANSITION_INACTIVE,
    cooldown: false,
    locked: false,
  },
  "A initial",
);
assertLiveState(
  b,
  {
    selected: 2,
    transition: TRANSITION_INACTIVE,
    cooldown: false,
    locked: false,
  },
  "B initial",
);

// Normalized target validation happens before the trusted core target path.
assert.equal(a.wif_abi_request_target(-1), REQUEST_INVALID);
assert.equal(a.wif_abi_request_target(4), REQUEST_INVALID);
assert.equal(a.wif_abi_request_target(0), REQUEST_REJECTED);

// Forward transition starts with exact raw zero progress.
assert.equal(a.wif_abi_request_next(), REQUEST_ACCEPTED);
assertLiveState(
  a,
  {
    selected: 1,
    transition: TRANSITION_FORWARD,
    cooldown: false,
    locked: false,
    progress: 0,
  },
  "A accepted forward",
);

// Mutating A does not mutate B.
assertLiveState(
  b,
  {
    selected: 2,
    transition: TRANSITION_INACTIVE,
    cooldown: false,
    locked: false,
  },
  "B isolated from A",
);

// Negative normalized time is rejected without advancing lifecycle.
assert.equal(a.wif_abi_tick(-1), OP_INVALID);
assert.equal(a.wif_abi_raw_progress(), 0);

// Valid-but-ineligible target remains Rejected, not Invalid.
assert.equal(a.wif_abi_request_target(0), REQUEST_REJECTED);
assert.equal(a.wif_abi_tick(25), OP_OK);
assert.equal(a.wif_abi_raw_progress(), 0.25);

assert.equal(a.wif_abi_set_locked(1), OP_OK);
assert.equal(a.wif_abi_locked(), 1);
assert.equal(a.wif_abi_request_target(2), REQUEST_REJECTED);

// Lock gates requests but does not pause lifecycle time.
assert.equal(a.wif_abi_tick(75), OP_OK);
assertLiveState(
  a,
  {
    selected: 1,
    transition: TRANSITION_INACTIVE,
    cooldown: true,
    locked: true,
  },
  "A transition completed while locked",
);

assert.equal(a.wif_abi_set_locked(0), OP_OK);
assert.equal(a.wif_abi_request_next(), REQUEST_REJECTED);
assert.equal(a.wif_abi_tick(20), OP_OK);
assert.equal(a.wif_abi_cooldown_active(), 0);

// Reverse direction is projected from core truth.
assert.equal(a.wif_abi_request_target(0), REQUEST_ACCEPTED);
assertLiveState(
  a,
  {
    selected: 0,
    transition: TRANSITION_REVERSE,
    cooldown: false,
    locked: false,
    progress: 0,
  },
  "A accepted reverse",
);

// Zero-duration acceptance settles synchronously and starts configured cooldown.
assert.equal(b.wif_abi_request_previous(), REQUEST_ACCEPTED);
assertLiveState(
  b,
  {
    selected: 1,
    transition: TRANSITION_INACTIVE,
    cooldown: true,
    locked: false,
  },
  "B zero-duration collapse",
);
assert.equal(b.wif_abi_tick(30), OP_OK);
assert.equal(b.wif_abi_cooldown_active(), 0);

// Selected i32 maximum lifecycle values remain valid exact normalized carriers.
assert.equal(c.wif_abi_init(2, 0, I32_MAX, I32_MAX), OP_OK);
assert.equal(c.wif_abi_request_next(), REQUEST_ACCEPTED);
assert.equal(c.wif_abi_tick(I32_MAX), OP_OK);
assert.equal(c.wif_abi_transition_state(), TRANSITION_INACTIVE);
assert.equal(c.wif_abi_cooldown_active(), 1);
assert.equal(c.wif_abi_tick(I32_MAX), OP_OK);
assert.equal(c.wif_abi_cooldown_active(), 0);

// Dispose is terminal for A and does not affect B.
assert.equal(a.wif_abi_dispose(), OP_OK);
assert.equal(a.wif_abi_request_next(), REQUEST_INVALID);
assert.equal(a.wif_abi_tick(0), OP_INVALID);
assert.equal(a.wif_abi_dispose(), OP_INVALID);

assert.equal(b.wif_abi_request_target(0), REQUEST_ACCEPTED);
assert.equal(b.wif_abi_selected_token(), 0);
assert.equal(b.wif_abi_cooldown_active(), 1);

console.log(
  JSON.stringify(
    {
      artifact: artifactPath,
      imports: importDescriptors,
      exports: exportDescriptors,
      instances: 3,
      result: "ok",
    },
    null,
    2,
  ),
);
