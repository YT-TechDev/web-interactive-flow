import assert from "node:assert/strict";
import {
  access,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import test, { after } from "node:test";

import React from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";

import { createFlowRuntime } from "../../../bridge/runtime.mjs";

const artifactUrl = new URL(
  "../../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const productionSourceUrl = new URL(
  "../../../adapters/r3f/use_flow_frame.mjs",
  import.meta.url,
);
const stageDirectoryUrl = new URL("./.wif-production-hook-stage/", import.meta.url);
const stagedSourceUrl = new URL(
  "./.wif-production-hook-stage/use_flow_frame.mjs",
  import.meta.url,
);
const fixturePackageUrl = new URL("./package.json", import.meta.url);
const fixtureLockUrl = new URL("./package-lock.json", import.meta.url);
const rootPackageUrl = new URL("../../../package.json", import.meta.url);

const productionSource = await readFile(productionSourceUrl, "utf8");

await rm(stageDirectoryUrl, { recursive: true, force: true });
await mkdir(stageDirectoryUrl, { recursive: true });
await writeFile(stagedSourceUrl, productionSource, "utf8");

assert.equal(
  await readFile(stagedSourceUrl, "utf8"),
  productionSource,
  "staged R3F hook source must exactly match production source",
);

const { useFlowFrame } = await import(
  `${stagedSourceUrl.href}?wif-production-hook=1`
);

after(async () => {
  await rm(stageDirectoryUrl, { recursive: true, force: true });
});

const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

function HookProbe({ runtime, callback, label }) {
  useFlowFrame(runtime, callback);
  return React.createElement("group", { name: label });
}

function createObservedRuntime(runtime) {
  let reads = 0;
  let lastSnapshot = null;

  return {
    getSnapshot() {
      reads += 1;
      lastSnapshot = runtime.getSnapshot();
      return lastSnapshot;
    },
    get reads() {
      return reads;
    },
    get lastSnapshot() {
      return lastSnapshot;
    },
  };
}

async function createRuntime(config) {
  return createFlowRuntime(await modulePromise, config);
}

test("H01-H05: production hook observes actual R3F frames without advancing semantics", async () => {
  const runtime = await createRuntime({
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 1_000_000,
    cooldown: 0,
  });
  const observedRuntime = createObservedRuntime(runtime);
  const observations = [];

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(HookProbe, {
      runtime: observedRuntime,
      label: "primary",
      callback(snapshot, delta) {
        observations.push({ snapshot, delta });
      },
    }),
  );

  try {
    assert.equal(runtime.next(), "accepted");
    const semanticBeforeR3FFrames = runtime.getSnapshot();

    const readsBeforeFirstFrame = observedRuntime.reads;
    await renderer.advanceFrames(1, 0.001);

    assert.equal(observedRuntime.reads - readsBeforeFirstFrame, 1);
    assert.equal(observations.length, 1);
    assert.equal(observations[0].snapshot, observedRuntime.lastSnapshot);
    assert.equal(observations[0].delta, 0.001);
    assert.deepEqual(observations[0].snapshot, semanticBeforeR3FFrames);
    assert.deepEqual(runtime.getSnapshot(), semanticBeforeR3FFrames);

    const readsBeforeSecondFrame = observedRuntime.reads;
    await renderer.advanceFrames(1, 7.5);

    assert.equal(observedRuntime.reads - readsBeforeSecondFrame, 1);
    assert.equal(observations.length, 2);
    assert.equal(observations[1].snapshot, observedRuntime.lastSnapshot);
    assert.equal(observations[1].delta, 7.5);
    assert.deepEqual(observations[1].snapshot, semanticBeforeR3FFrames);
    assert.deepEqual(runtime.getSnapshot(), semanticBeforeR3FFrames);
  } finally {
    await renderer.unmount();
    runtime.dispose();
  }
});

test("H06: production hook observes the latest callback after React rerender", async () => {
  const runtime = await createRuntime({
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 0,
  });
  const observedRuntime = createObservedRuntime(runtime);
  const calls = [];

  function callbackA(snapshot, delta) {
    calls.push({ callback: "A", snapshot, delta });
  }

  function callbackB(snapshot, delta) {
    calls.push({ callback: "B", snapshot, delta });
  }

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(HookProbe, {
      runtime: observedRuntime,
      label: "callback-freshness",
      callback: callbackA,
    }),
  );

  try {
    await renderer.advanceFrames(1, 0.01);
    assert.equal(calls.at(-1).callback, "A");

    await renderer.update(
      React.createElement(HookProbe, {
        runtime: observedRuntime,
        label: "callback-freshness",
        callback: callbackB,
      }),
    );

    const callsBeforeSecondFrame = calls.length;
    await renderer.advanceFrames(1, 0.02);

    assert.equal(calls.length, callsBeforeSecondFrame + 1);
    assert.equal(calls.at(-1).callback, "B");
    assert.equal(calls.at(-1).delta, 0.02);
  } finally {
    await renderer.unmount();
    runtime.dispose();
  }
});

test("H07: production hook observes the latest explicit Runtime after React rerender", async () => {
  const runtimeA = await createRuntime({
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 0,
  });
  const runtimeB = await createRuntime({
    phases: ["X", "Y"],
    initial: "X",
    transitionDuration: 100,
    cooldown: 0,
  });
  const observedA = createObservedRuntime(runtimeA);
  const observedB = createObservedRuntime(runtimeB);
  const selected = [];

  const callback = (snapshot) => {
    selected.push(snapshot.selected);
  };

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(HookProbe, {
      runtime: observedA,
      label: "runtime-freshness",
      callback,
    }),
  );

  try {
    await renderer.advanceFrames(1, 0.01);
    assert.equal(selected.at(-1), "A");
    const readsA = observedA.reads;

    await renderer.update(
      React.createElement(HookProbe, {
        runtime: observedB,
        label: "runtime-freshness",
        callback,
      }),
    );

    await renderer.advanceFrames(1, 0.02);

    assert.equal(selected.at(-1), "X");
    assert.equal(observedA.reads, readsA);
    assert.equal(observedB.reads, 1);

    assert.deepEqual(runtimeA.getSnapshot(), {
      selected: "A",
      transition: null,
      cooldownActive: false,
      locked: false,
    });
    assert.deepEqual(runtimeB.getSnapshot(), {
      selected: "X",
      transition: null,
      cooldownActive: false,
      locked: false,
    });
  } finally {
    await renderer.unmount();
    runtimeA.dispose();
    runtimeB.dispose();
  }
});

test("H08: multiple production-hook consumers remain read-only", async () => {
  const runtime = await createRuntime({
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 1_000_000,
    cooldown: 0,
  });
  const observedRuntime = createObservedRuntime(runtime);
  const first = [];
  const second = [];

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(HookProbe, {
        runtime: observedRuntime,
        label: "first",
        callback(snapshot, delta) {
          first.push({ snapshot, delta });
        },
      }),
      React.createElement(HookProbe, {
        runtime: observedRuntime,
        label: "second",
        callback(snapshot, delta) {
          second.push({ snapshot, delta });
        },
      }),
    ),
  );

  try {
    assert.equal(runtime.next(), "accepted");
    const semanticBeforeFrame = runtime.getSnapshot();
    const readsBeforeFrame = observedRuntime.reads;

    await renderer.advanceFrames(1, 4.25);

    assert.equal(observedRuntime.reads - readsBeforeFrame, 2);
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.deepEqual(first[0].snapshot, semanticBeforeFrame);
    assert.deepEqual(second[0].snapshot, semanticBeforeFrame);
    assert.equal(first[0].delta, 4.25);
    assert.equal(second[0].delta, 4.25);
    assert.deepEqual(runtime.getSnapshot(), semanticBeforeFrame);
  } finally {
    await renderer.unmount();
    runtime.dispose();
  }
});

test("H09: consumer unmount removes frame observation without disposing Runtime", async () => {
  const runtime = await createRuntime({
    phases: ["A", "B"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 0,
  });
  const observedRuntime = createObservedRuntime(runtime);
  let callbackCount = 0;

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(HookProbe, {
      runtime: observedRuntime,
      label: "temporary",
      callback() {
        callbackCount += 1;
      },
    }),
  );

  try {
    await renderer.advanceFrames(1, 0.01);
    assert.equal(callbackCount, 1);

    await renderer.update(
      React.createElement("group", { name: "consumer-removed" }),
    );
    await renderer.advanceFrames(1, 0.02);

    assert.equal(callbackCount, 1);

    assert.equal(runtime.next(), "accepted");
    assert.equal(runtime.getSnapshot().selected, "B");
  } finally {
    await renderer.unmount();
    runtime.dispose();
  }
});

test("H10/H11: production hook source preserves the narrow adapter boundary", () => {
  assert.match(
    productionSource,
    /import \{ useFrame \} from "@react-three\/fiber"/,
  );
  assert.match(
    productionSource,
    /useFrame\(\(_\, delta\) => \{[\s\S]*const snapshot = runtime\.getSnapshot\(\);[\s\S]*callback\(snapshot, delta\);/,
  );

  assert.equal(
    (productionSource.match(/getSnapshot\s*\(/g) ?? []).length,
    1,
  );
  assert.equal(
    (productionSource.match(/useFrame\s*\(/g) ?? []).length,
    1,
  );

  for (const forbidden of [
    /\.tick\s*\(/,
    /\.dispose\s*\(/,
    /\.next\s*\(/,
    /\.previous\s*\(/,
    /\.goTo\s*\(/,
    /\.lock\s*\(/,
    /\.unlock\s*\(/,
    /createContext/,
    /useContext/,
    /useState/,
    /useEffect/,
    /useRef/,
    /useMemo/,
    /useCallback/,
    /\btry\s*\{/,
    /\bcatch\s*\(/,
    /RootState/,
    /xrFrame/,
    /renderPriority/,
    /easing/i,
    /createFlowRuntime/,
    /createFrameScheduler/,
  ]) {
    assert.doesNotMatch(productionSource, forbidden);
  }

  assert.doesNotMatch(
    productionSource,
    /useFrame\(\(_\, delta\) => \{[\s\S]*\},\s*[1-9]/,
  );
});

test("H12: production source qualification stays exact and fixture-local", async () => {
  assert.equal(
    await readFile(stagedSourceUrl, "utf8"),
    productionSource,
  );

  const manifest = JSON.parse(await readFile(fixturePackageUrl, "utf8"));
  const lock = JSON.parse(await readFile(fixtureLockUrl, "utf8"));

  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.devDependencies, {
    "@react-three/fiber": "9.8.0",
    "@react-three/test-renderer": "9.1.1",
    react: "19.3.0",
    three: "0.186.1",
  });
  assert.deepEqual(lock.packages[""].devDependencies, manifest.devDependencies);

  await assert.rejects(access(rootPackageUrl));
});
