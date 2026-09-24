import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMonotonicTimeNormalizer,
  decomposeTickBudgetUs,
} from "../../bridge/clock.mjs";
import { createFlowRuntime } from "../../bridge/runtime.mjs";

const INT32_MAX = 2_147_483_647;

function collect(iterable) {
  return [...iterable];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl)
  .then((bytes) => WebAssembly.compile(bytes));

test("first observation establishes an epoch and equal timestamps emit zero", () => {
  const clock = createMonotonicTimeNormalizer();

  assert.equal(clock.observe(1234.5678), 0);
  assert.equal(clock.observe(1234.5678), 0);
});

test("monotonic fractional timestamps emit non-negative cumulative-floor budgets", () => {
  const clock = createMonotonicTimeNormalizer();
  const timestamps = [0, 0.0006, 0.0012, 0.0012, 0.0029];
  const budgets = timestamps.map((timestamp) => clock.observe(timestamp));

  assert.deepEqual(budgets, [0, 0, 1, 0, 1]);
  for (const budget of budgets) {
    assert.equal(Number.isSafeInteger(budget), true);
    assert.equal(budget >= 0, true);
  }
});

test("endpoint total is independent of inserted intermediate timestamps", () => {
  const direct = createMonotonicTimeNormalizer();
  assert.equal(direct.observe(0), 0);
  const directTotal = direct.observe(0.0012);

  const split = createMonotonicTimeNormalizer();
  assert.equal(split.observe(0), 0);
  const splitTotal = split.observe(0.0006) + split.observe(0.0012);

  assert.equal(directTotal, 1);
  assert.equal(splitTotal, 1);
  assert.equal(splitTotal, directTotal);

  const frameDirect = createMonotonicTimeNormalizer();
  frameDirect.observe(1000);
  const frameDirectTotal = frameDirect.observe(1016.6667);

  const frameSplit = createMonotonicTimeNormalizer();
  frameSplit.observe(1000);
  const frameSplitTotal =
    frameSplit.observe(1008.33335) +
    frameSplit.observe(1016.6667);

  assert.equal(frameSplitTotal, frameDirectTotal);
});

test("cumulative floor never advances before one full microsecond quantum", () => {
  const clock = createMonotonicTimeNormalizer();

  clock.observe(0);
  assert.equal(clock.observe(0.0006), 0);
  assert.equal(clock.observe(0.0010), 1);
});

test("tick-budget decomposition is exact and signed-i32 bounded", () => {
  const cases = [
    [0, []],
    [1, [1]],
    [INT32_MAX, [INT32_MAX]],
    [INT32_MAX + 1, [INT32_MAX, 1]],
    [
      2 * INT32_MAX + 7,
      [INT32_MAX, INT32_MAX, 7],
    ],
  ];

  for (const [budget, expected] of cases) {
    const chunks = collect(decomposeTickBudgetUs(budget));
    assert.deepEqual(chunks, expected);
    assert.equal(sum(chunks), budget);
    for (const chunk of chunks) {
      assert.equal(Number.isSafeInteger(chunk), true);
      assert.equal(chunk >= 1 && chunk <= INT32_MAX, true);
    }
  }

  assert.throws(() => collect(decomposeTickBudgetUs(-1)));
  assert.throws(() => collect(decomposeTickBudgetUs(0.5)));
  assert.throws(() => collect(decomposeTickBudgetUs(NaN)));
  assert.throws(() => collect(decomposeTickBudgetUs(Infinity)));
  assert.throws(() => collect(decomposeTickBudgetUs("1")));
});

test("deterministic replay includes explicit rebase boundaries", () => {
  function replay() {
    const clock = createMonotonicTimeNormalizer();
    return [
      clock.observe(10),
      clock.observe(10.1254),
      clock.observe(10.5009),
      clock.rebase(20),
      clock.observe(20.0006),
      clock.observe(20.0012),
    ];
  }

  assert.deepEqual(replay(), replay());
  assert.deepEqual(replay(), [0, 125, 375, 0, 0, 1]);
});

test("invalid timestamps and regressions fail without mutating accepted state", () => {
  for (const invalid of [
    -1,
    NaN,
    Infinity,
    -Infinity,
    "1",
    null,
    undefined,
  ]) {
    const clock = createMonotonicTimeNormalizer();
    assert.throws(() => clock.observe(invalid));
    assert.equal(clock.observe(10), 0);
  }

  const clock = createMonotonicTimeNormalizer();
  assert.equal(clock.observe(10), 0);
  assert.equal(clock.observe(10.0012), 1);

  assert.throws(() => clock.observe(9));

  // This remains below the previous accepted timestamp. It must still reject,
  // proving that the failed regression did not lower the accepted timestamp.
  assert.throws(() => clock.observe(10.0005));

  assert.equal(clock.observe(10.0024), 1);
});

test("unsafe cumulative microsecond elapsed fails without state mutation", () => {
  const clock = createMonotonicTimeNormalizer();
  clock.observe(0);

  const unsafeTimestampMs =
    Number.MAX_SAFE_INTEGER / 1000 + 1000;

  assert.throws(() => clock.observe(unsafeTimestampMs));

  assert.equal(clock.observe(0.0012), 1);
});

test("rebase starts an isolated epoch and consumes no prior gap", () => {
  const clock = createMonotonicTimeNormalizer();

  assert.equal(clock.observe(100), 0);
  assert.equal(clock.observe(100.5), 500);

  assert.equal(clock.rebase(200), 0);
  assert.equal(clock.observe(200), 0);
  assert.equal(clock.observe(200.25), 250);

  assert.equal(clock.rebase(50), 0);
  assert.equal(clock.observe(50.0012), 1);
});

test("rebase validates before replacing the current epoch", () => {
  const clock = createMonotonicTimeNormalizer();

  clock.observe(10);
  assert.equal(clock.observe(10.5), 500);

  assert.throws(() => clock.rebase(NaN));
  assert.equal(clock.observe(10.75), 250);
});

test("alternate exact i32 chunkings preserve a focused runtime endpoint", async () => {
  const module = await modulePromise;
  const config = {
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: INT32_MAX,
    cooldown: 1,
  };

  const a = createFlowRuntime(module, config);
  const b = createFlowRuntime(module, config);

  assert.equal(a.next(), "accepted");
  assert.equal(b.next(), "accepted");

  const budget = INT32_MAX + 1;
  const canonical = collect(decomposeTickBudgetUs(budget));
  const alternate = [INT32_MAX - 1, 2];

  assert.equal(sum(canonical), budget);
  assert.equal(sum(alternate), budget);

  for (const chunk of canonical) {
    a.tick(chunk);
  }
  for (const chunk of alternate) {
    b.tick(chunk);
  }

  assert.deepEqual(a.getSnapshot(), {
    selected: "B",
    transition: null,
    cooldownActive: false,
    locked: false,
  });
  assert.deepEqual(b.getSnapshot(), a.getSnapshot());

  a.dispose();
  b.dispose();
});
