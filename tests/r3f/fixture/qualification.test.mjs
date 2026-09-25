import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import React from "react";
import { useFrame } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";

import { createFrameScheduler } from "../../../bridge/frame_scheduler.mjs";
import { createFlowRuntime } from "../../../bridge/runtime.mjs";

const artifactUrl = new URL(
  "../../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const fixtureSourceUrl = new URL("./qualification.test.mjs", import.meta.url);
const fixturePackageUrl = new URL("./package.json", import.meta.url);
const fixtureLockUrl = new URL("./package-lock.json", import.meta.url);
const rootPackageUrl = new URL("../../../package.json", import.meta.url);

const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

function createDeterministicFrameHost() {
  let nextId = 0;
  const pending = new Map();

  function requestFrame(callback) {
    const id = nextId;
    nextId += 1;
    pending.set(id, callback);
    return id;
  }

  function cancelFrame(id) {
    pending.delete(id);
  }

  function deliverNext(timestampMs) {
    const next = pending.entries().next();
    assert.equal(next.done, false, "missing scheduled WIF frame");

    const [id, callback] = next.value;
    pending.delete(id);
    callback(timestampMs);
  }

  return {
    requestFrame,
    cancelFrame,
    deliverNext,
    get pendingCount() {
      return pending.size;
    },
  };
}

function createReadOnlyObserverRuntime(runtime) {
  let snapshotReads = 0;

  return {
    getSnapshot() {
      snapshotReads += 1;
      return runtime.getSnapshot();
    },
    tick() {
      throw new Error("R3F frame consumer must not advance WIF lifecycle");
    },
    get snapshotReads() {
      return snapshotReads;
    },
  };
}

function FrameProbe({
  runtime,
  label,
  observations,
}) {
  useFrame((_, delta) => {
    const snapshot = runtime.getSnapshot();

    observations.push({
      label,
      snapshot,
      delta,
      // Presentation-only derived data. It must never feed back into Runtime.
      presentationValue:
        (snapshot.transition?.rawProgress ?? 1) + delta,
    });
  });

  return React.createElement("group", { name: label });
}

function assertActiveDestination(snapshot, progress) {
  assert.equal(snapshot.selected, "B");
  assert.notEqual(snapshot.transition, null);
  assert.equal(snapshot.transition.direction, "forward");
  assert.equal(snapshot.transition.rawProgress, progress);
}

test("R01-R07: actual R3F useFrame is a read-only semantic consumer", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 1_000_000,
    cooldown: 0,
  });
  const observerRuntime = createReadOnlyObserverRuntime(runtime);
  const wifFrameHost = createDeterministicFrameHost();
  const schedulerObservations = [];
  const firstConsumer = [];
  const secondConsumer = [];

  const scheduler = createFrameScheduler({
    runtime,
    requestFrame: wifFrameHost.requestFrame,
    cancelFrame: wifFrameHost.cancelFrame,
    onFrame(snapshot) {
      schedulerObservations.push(snapshot);
    },
  });

  const renderer = await ReactThreeTestRenderer.create(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(FrameProbe, {
        runtime: observerRuntime,
        label: "first",
        observations: firstConsumer,
      }),
      React.createElement(FrameProbe, {
        runtime: observerRuntime,
        label: "second",
        observations: secondConsumer,
      }),
    ),
  );

  try {
    assert.equal(runtime.next(), "accepted");

    scheduler.start();
    assert.equal(wifFrameHost.pendingCount, 1);

    // The WIF scheduler owns semantic lifecycle time. Its first delivered
    // timestamp only establishes the normalization baseline.
    wifFrameHost.deliverNext(1_000);
    assert.equal(schedulerObservations.length, 1);
    assertActiveDestination(runtime.getSnapshot(), 0);

    const readsBeforeInitialR3FFrame = observerRuntime.snapshotReads;
    await renderer.advanceFrames(1, 0.001);

    assert.equal(
      observerRuntime.snapshotReads - readsBeforeInitialR3FFrame,
      2,
      "two R3F consumers should each read one coherent snapshot",
    );
    assert.equal(firstConsumer.length, 1);
    assert.equal(secondConsumer.length, 1);
    assertActiveDestination(firstConsumer[0].snapshot, 0);
    assertActiveDestination(secondConsumer[0].snapshot, 0);
    assert.equal(firstConsumer[0].delta, 0.001);
    assert.equal(secondConsumer[0].delta, 0.001);

    const semanticBeforeDeltaOnlyFrames = runtime.getSnapshot();

    // R3F delta is presentation metadata only. Widely different R3F deltas
    // must not advance WIF semantic time while the WIF scheduler is held still.
    await renderer.advanceFrames(1, 0.25);
    await renderer.advanceFrames(1, 10);

    assert.deepEqual(runtime.getSnapshot(), semanticBeforeDeltaOnlyFrames);
    assertActiveDestination(firstConsumer.at(-2).snapshot, 0);
    assertActiveDestination(firstConsumer.at(-1).snapshot, 0);
    assert.equal(firstConsumer.at(-2).delta, 0.25);
    assert.equal(firstConsumer.at(-1).delta, 10);
    assertActiveDestination(secondConsumer.at(-2).snapshot, 0);
    assertActiveDestination(secondConsumer.at(-1).snapshot, 0);

    // Only the production WIF scheduler advances the semantic lifecycle.
    wifFrameHost.deliverNext(1_500);
    assertActiveDestination(runtime.getSnapshot(), 0.5);

    const semanticBeforeIntermediateR3FFrame = runtime.getSnapshot();
    await renderer.advanceFrames(1, 3.5);

    assert.deepEqual(runtime.getSnapshot(), semanticBeforeIntermediateR3FFrame);
    assertActiveDestination(firstConsumer.at(-1).snapshot, 0.5);
    assertActiveDestination(secondConsumer.at(-1).snapshot, 0.5);
    assert.equal(firstConsumer.at(-1).delta, 3.5);
    assert.equal(secondConsumer.at(-1).delta, 3.5);

    // selected B means the scene is already visually occupying B.

    wifFrameHost.deliverNext(2_000);
    assert.deepEqual(runtime.getSnapshot(), {
      selected: "B",
      transition: null,
      cooldownActive: false,
      locked: false,
    });

    const semanticBeforeSettledR3FFrame = runtime.getSnapshot();
    await renderer.advanceFrames(1, 0.016);

    assert.deepEqual(runtime.getSnapshot(), semanticBeforeSettledR3FFrame);
    assert.deepEqual(firstConsumer.at(-1).snapshot, semanticBeforeSettledR3FFrame);
    assert.deepEqual(secondConsumer.at(-1).snapshot, semanticBeforeSettledR3FFrame);

    // R05: presentation-only derived values may use host delta without
    // feeding back into semantic truth.
    assert.equal(
      firstConsumer.at(-1).presentationValue,
      1 + 0.016,
    );
    assert.equal(
      secondConsumer.at(-1).presentationValue,
      1 + 0.016,
    );
  } finally {
    scheduler.stop();
    await renderer.unmount();
    runtime.dispose();
  }
});

test("R02/R06/R07/R08: fixture source preserves R3F ownership boundaries", async () => {
  const source = await readFile(fixtureSourceUrl, "utf8");

  assert.match(source, /import \{ useFrame \} from "@react-three\/fiber"/);
  assert.match(
    source,
    /import ReactThreeTestRenderer from "@react-three\/test-renderer"/,
  );
  assert.match(
    source,
    /useFrame\(\(_\, delta\) => \{[\s\S]*const snapshot = runtime\.getSnapshot\(\)/,
  );

  const frameProbeSource = source.slice(
    source.indexOf("function FrameProbe"),
    source.indexOf("function assertActiveDestination"),
  );

  assert.doesNotMatch(frameProbeSource, /\.tick\s*\(/);
  assert.equal(
    (frameProbeSource.match(/getSnapshot\s*\(/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(frameProbeSource, /useState\s*\(/);
  assert.doesNotMatch(frameProbeSource, /selected\s*=/);
  assert.doesNotMatch(frameProbeSource, /cooldownActive\s*=/);
  assert.doesNotMatch(frameProbeSource, /locked\s*=/);
  assert.match(
    source,
    /selected B is the accepted destination[\s\S]*does not treat it as visual occupancy/,
  );

  // This proof is about delivered R3F frame consumption only. It intentionally
  // contains no frameloop/invalidate/XR/priority/public-hook/package policy.
  for (const forbidden of [
    /invalidate\s*\(/,
    /frameloop\s*:/,
    /renderPriority/,
    /useFlowFrame/,
    /FlowProvider/,
    /package exports/i,
  ]) {
    assert.doesNotMatch(frameProbeSource, forbidden);
  }
});

test("R08: qualification dependencies stay exact, locked, and fixture-local", async () => {
  const manifest = JSON.parse(await readFile(fixturePackageUrl, "utf8"));
  const lock = JSON.parse(await readFile(fixtureLockUrl, "utf8"));

  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.devDependencies, {
    "@react-three/fiber": "9.8.0",
    "@react-three/test-renderer": "9.1.1",
    react: "19.3.0",
    three: "0.186.1",
  });

  for (const version of Object.values(manifest.devDependencies)) {
    assert.match(version, /^\d+(?:\.\d+){2}$/);
  }

  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(
    lock.packages[""].devDependencies,
    manifest.devDependencies,
  );

  for (const name of Object.keys(manifest.devDependencies)) {
    const packageEntry = lock.packages[`node_modules/${name}`];
    assert.equal(typeof packageEntry?.version, "string");
    assert.equal(typeof packageEntry?.resolved, "string");
    assert.equal(typeof packageEntry?.integrity, "string");
  }

  await assert.rejects(access(rootPackageUrl));
});
