import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createSemanticRuntimeFromAbi,
  normalizeConfig,
} from "../../bridge/internal.mjs";
import { createFlowRuntime } from "../../bridge/runtime.mjs";

const INT32_MAX = 2_147_483_647;
const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl)
  .then((bytes) => WebAssembly.compile(bytes));

function config(overrides = {}) {
  return {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
    ...overrides,
  };
}

function makeFakeAbi() {
  const calls = {
    init: [],
    next: 0,
    previous: 0,
    target: [],
    locked: [],
    tick: [],
    dispose: 0,
    selected: 0,
    transition: 0,
    progress: 0,
    cooldown: 0,
    lockObservation: 0,
  };

  const state = {
    selected: 0,
    transition: 0,
    progress: 0,
    cooldown: 0,
    locked: 0,
  };

  const api = {
    wif_abi_init(...args) {
      calls.init.push(args);
      return 1;
    },
    wif_abi_request_next() {
      calls.next += 1;
      return 1;
    },
    wif_abi_request_previous() {
      calls.previous += 1;
      return 1;
    },
    wif_abi_request_target(token) {
      calls.target.push(token);
      return 1;
    },
    wif_abi_set_locked(value) {
      calls.locked.push(value);
      state.locked = value;
      return 1;
    },
    wif_abi_tick(value) {
      calls.tick.push(value);
      return 1;
    },
    wif_abi_dispose() {
      calls.dispose += 1;
      return 1;
    },
    wif_abi_selected_token() {
      calls.selected += 1;
      return state.selected;
    },
    wif_abi_transition_state() {
      calls.transition += 1;
      return state.transition;
    },
    wif_abi_raw_progress() {
      calls.progress += 1;
      return state.progress;
    },
    wif_abi_cooldown_active() {
      calls.cooldown += 1;
      return state.cooldown;
    },
    wif_abi_locked() {
      calls.lockObservation += 1;
      return state.locked;
    },
  };

  return { api, calls, state };
}

function fakeRuntime(overrides = {}) {
  const fake = makeFakeAbi();
  Object.assign(fake.api, overrides);
  const normalized = normalizeConfig(config({
    transitionDuration: 0,
    cooldown: 0,
  }));
  return {
    ...fake,
    runtime: createSemanticRuntimeFromAbi(fake.api, normalized),
  };
}

test("real artifact owns exact runtime-local String identity mapping", async () => {
  const module = await modulePromise;
  const phases = ["", "Intro", "intro", "\u00e9", "e\u0301"];
  const runtime = createFlowRuntime(module, {
    phases,
    initial: "",
    transitionDuration: 0,
    cooldown: 0,
  });

  phases[1] = "changed";

  assert.deepEqual(runtime.getSnapshot(), {
    selected: "",
    transition: null,
    cooldownActive: false,
    locked: false,
  });

  assert.equal(runtime.goTo("Intro"), "accepted");
  assert.throws(() => runtime.goTo("changed"));

  assert.equal(runtime.goTo("intro"), "accepted");
  assert.equal(runtime.goTo("\u00e9"), "accepted");
  assert.equal(runtime.goTo("e\u0301"), "accepted");

  runtime.dispose();
});

test("construction rejects invalid host representation before a wrapper exists", async () => {
  const module = await modulePromise;

  const invalidConfigs = [
    config({ phases: [] }),
    config({ phases: ["A", "A"] }),
    config({ phases: ["A", "B", "A"] }),
    config({ phases: ["A", 1] }),
    config({ initial: "missing" }),
    config({ transitionDuration: -1 }),
    config({ transitionDuration: 0.5 }),
    config({ transitionDuration: NaN }),
    config({ transitionDuration: Infinity }),
    config({ transitionDuration: -Infinity }),
    config({ transitionDuration: INT32_MAX + 1 }),
    config({ transitionDuration: "1" }),
    config({ cooldown: -1 }),
  ];

  for (const invalidConfig of invalidConfigs) {
    assert.throws(() => createFlowRuntime(module, invalidConfig));
  }
});

test("unrelated WebAssembly modules fail compatibility checking", () => {
  const emptyModule = new WebAssembly.Module(
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
  );

  assert.throws(() => createFlowRuntime(emptyModule, config()));
  assert.throws(() => createFlowRuntime({}, config()));
});

test("real artifact preserves request disposition and coherent active snapshots", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, config());

  assert.deepEqual(runtime.getSnapshot(), {
    selected: "A",
    transition: null,
    cooldownActive: false,
    locked: false,
  });

  assert.equal(runtime.next(), "accepted");
  assert.deepEqual(runtime.getSnapshot(), {
    selected: "B",
    transition: {
      direction: "forward",
      rawProgress: 0,
    },
    cooldownActive: false,
    locked: false,
  });

  assert.equal(runtime.next(), "rejected");
  assert.throws(() => runtime.goTo("missing"));

  runtime.tick(25);
  assert.equal(runtime.getSnapshot().transition.rawProgress, 0.25);

  runtime.lock();
  assert.equal(runtime.getSnapshot().locked, true);
  assert.equal(runtime.goTo("C"), "rejected");

  runtime.tick(75);
  assert.deepEqual(runtime.getSnapshot(), {
    selected: "B",
    transition: null,
    cooldownActive: true,
    locked: true,
  });

  runtime.unlock();
  assert.equal(runtime.next(), "rejected");

  runtime.tick(20);
  assert.equal(runtime.getSnapshot().cooldownActive, false);

  assert.equal(runtime.goTo("A"), "accepted");
  const mutable = runtime.getSnapshot();
  assert.equal(mutable.transition.direction, "reverse");

  mutable.selected = "mutated";
  mutable.transition.direction = "mutated";
  mutable.transition.rawProgress = 0.99;
  mutable.cooldownActive = true;
  mutable.locked = true;

  const fresh = runtime.getSnapshot();
  assert.equal(fresh.selected, "A");
  assert.equal(fresh.transition.direction, "reverse");
  assert.equal(fresh.transition.rawProgress, 0);
  assert.equal(fresh.cooldownActive, false);
  assert.equal(fresh.locked, false);
  assert.notEqual(fresh, mutable);
  assert.notEqual(fresh.transition, mutable.transition);

  runtime.dispose();
});

test("zero-duration, cooldown, and maximum i32 quanta cross the semantic wrapper", async () => {
  const module = await modulePromise;

  const zero = createFlowRuntime(module, config({
    phases: ["A", "B"],
    transitionDuration: 0,
    cooldown: 30,
  }));

  assert.equal(zero.next(), "accepted");
  assert.deepEqual(zero.getSnapshot(), {
    selected: "B",
    transition: null,
    cooldownActive: true,
    locked: false,
  });
  zero.tick(30);
  assert.equal(zero.getSnapshot().cooldownActive, false);
  zero.dispose();

  const maximum = createFlowRuntime(module, config({
    phases: ["A", "B"],
    transitionDuration: INT32_MAX,
    cooldown: 0,
  }));

  assert.equal(maximum.next(), "accepted");
  maximum.tick(INT32_MAX);
  assert.deepEqual(maximum.getSnapshot(), {
    selected: "B",
    transition: null,
    cooldownActive: false,
    locked: false,
  });
  maximum.dispose();
});

test("one compiled Module produces isolated semantic wrappers", async () => {
  const module = await modulePromise;

  const a = createFlowRuntime(module, config({
    phases: ["A", "B"],
    transitionDuration: 0,
    cooldown: 0,
  }));
  const b = createFlowRuntime(module, config({
    phases: ["A", "C"],
    transitionDuration: 0,
    cooldown: 0,
  }));

  assert.equal(a.goTo("B"), "accepted");
  assert.throws(() => b.goTo("B"));
  assert.deepEqual(b.getSnapshot(), {
    selected: "A",
    transition: null,
    cooldownActive: false,
    locked: false,
  });

  a.dispose();

  assert.equal(b.goTo("C"), "accepted");
  assert.equal(b.getSnapshot().selected, "C");
  b.dispose();
});

test("dispose is one-shot and all post-dispose operations fail", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, config({
    transitionDuration: 0,
    cooldown: 0,
  }));

  runtime.dispose();

  assert.throws(() => runtime.dispose());
  assert.throws(() => runtime.next());
  assert.throws(() => runtime.previous());
  assert.throws(() => runtime.goTo("B"));
  assert.throws(() => runtime.lock());
  assert.throws(() => runtime.unlock());
  assert.throws(() => runtime.tick(0));
  assert.throws(() => runtime.getSnapshot());
});

test("invalid JS quanta and unknown identity never reach fake raw ABI", () => {
  const { runtime, calls } = fakeRuntime();

  for (const value of [
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    INT32_MAX + 1,
    "1",
    null,
  ]) {
    assert.throws(() => runtime.tick(value));
  }
  assert.deepEqual(calls.tick, []);

  assert.throws(() => runtime.goTo("missing"));
  assert.deepEqual(calls.target, []);

  runtime.tick(0);
  assert.deepEqual(calls.tick, [0]);
  runtime.dispose();
});

test("raw Invalid and unknown request statuses fail closed", () => {
  for (const status of [0, 3, -1]) {
    const fake = fakeRuntime({
      wif_abi_request_next() {
        return status;
      },
    });
    assert.throws(() => fake.runtime.next());
    fake.runtime.dispose();
  }
});

test("raw Invalid and unknown operation statuses fail closed", () => {
  const invalidInit = makeFakeAbi();
  invalidInit.api.wif_abi_init = () => 0;
  assert.throws(() =>
    createSemanticRuntimeFromAbi(
      invalidInit.api,
      normalizeConfig(config({ transitionDuration: 0, cooldown: 0 })),
    ),
  );

  for (const status of [0, 2, -1]) {
    const fake = fakeRuntime({
      wif_abi_set_locked() {
        return status;
      },
    });
    assert.throws(() => fake.runtime.lock());
    fake.runtime.dispose();
  }
});

test("snapshot decoder rejects impossible raw carriers", () => {
  {
    const fake = fakeRuntime();
    fake.api.wif_abi_selected_token = () => 99;
    assert.throws(() => fake.runtime.getSnapshot());
    fake.runtime.dispose();
  }

  {
    const fake = fakeRuntime();
    fake.api.wif_abi_transition_state = () => 9;
    assert.throws(() => fake.runtime.getSnapshot());
    fake.runtime.dispose();
  }

  for (const progress of [1, 1.1, -0.1, NaN, Infinity]) {
    const fake = fakeRuntime();
    fake.api.wif_abi_transition_state = () => 1;
    fake.api.wif_abi_raw_progress = () => progress;
    assert.throws(() => fake.runtime.getSnapshot());
    fake.runtime.dispose();
  }

  {
    const fake = fakeRuntime();
    fake.api.wif_abi_cooldown_active = () => 2;
    assert.throws(() => fake.runtime.getSnapshot());
    fake.runtime.dispose();
  }

  {
    const fake = fakeRuntime();
    fake.api.wif_abi_locked = () => -1;
    assert.throws(() => fake.runtime.getSnapshot());
    fake.runtime.dispose();
  }
});

test("inactive snapshot does not read raw progress", () => {
  const fake = fakeRuntime();

  assert.deepEqual(fake.runtime.getSnapshot(), {
    selected: "A",
    transition: null,
    cooldownActive: false,
    locked: false,
  });
  assert.equal(fake.calls.progress, 0);

  fake.runtime.dispose();
});

test("unexpected raw dispose failure still leaves wrapper terminal", () => {
  const fake = makeFakeAbi();
  fake.api.wif_abi_dispose = () => 0;
  const runtime = createSemanticRuntimeFromAbi(
    fake.api,
    normalizeConfig(config({ transitionDuration: 0, cooldown: 0 })),
  );

  assert.throws(() => runtime.dispose());
  assert.throws(() => runtime.next());
  assert.throws(() => runtime.getSnapshot());
});

test("disposed fake wrapper never touches raw ABI again", () => {
  const fake = fakeRuntime();
  fake.runtime.dispose();

  const afterDispose = {
    next: fake.calls.next,
    previous: fake.calls.previous,
    target: fake.calls.target.length,
    locked: fake.calls.locked.length,
    tick: fake.calls.tick.length,
    dispose: fake.calls.dispose,
    selected: fake.calls.selected,
    transition: fake.calls.transition,
    progress: fake.calls.progress,
    cooldown: fake.calls.cooldown,
    lockObservation: fake.calls.lockObservation,
  };

  assert.throws(() => fake.runtime.dispose());
  assert.throws(() => fake.runtime.next());
  assert.throws(() => fake.runtime.previous());
  assert.throws(() => fake.runtime.goTo("B"));
  assert.throws(() => fake.runtime.lock());
  assert.throws(() => fake.runtime.unlock());
  assert.throws(() => fake.runtime.tick(0));
  assert.throws(() => fake.runtime.getSnapshot());

  assert.deepEqual(
    {
      next: fake.calls.next,
      previous: fake.calls.previous,
      target: fake.calls.target.length,
      locked: fake.calls.locked.length,
      tick: fake.calls.tick.length,
      dispose: fake.calls.dispose,
      selected: fake.calls.selected,
      transition: fake.calls.transition,
      progress: fake.calls.progress,
      cooldown: fake.calls.cooldown,
      lockObservation: fake.calls.lockObservation,
    },
    afterDispose,
  );
});
