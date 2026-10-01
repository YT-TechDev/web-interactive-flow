import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const EXPECTED_NODE = "24.19.0";
const EXPECTED_INTEGRITY =
  "sha512-uwdHSxsfNFzgbDyGwj26U8TgG1tcCK6+P46bE2rxjA7HZyZDhkPk+mUYc/dXOeTC1fvQhIdQWhuNgPqems3IJg==";
const EXPECTED_WASM_SHA256 =
  "430cfc1549112427b5e3dfbe80e4c2634ad5cfe24b44fd12d8e6830b16f3a656";
const EXPECTED_PUBLIC_ROOT_EXPORTS = [
  "applyWheelNavigationIntent",
  "compileFlowModule",
  "createFlowRuntime",
  "createFrameScheduler",
];
const FORBIDDEN_GLOBALS = [
  "window",
  "document",
  "WheelEvent",
  "PointerEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "React",
  "THREE",
];
const CONFIG = {
  phases: ["alpha", "beta", "gamma", "delta"],
  initial: "alpha",
  transitionDuration: 10,
  cooldown: 5,
};

function assertNoBrowserOrRendererGlobals() {
  for (const name of FORBIDDEN_GLOBALS) {
    assert.equal(name in globalThis, false, name + " unexpectedly exists");
  }
}

function project(snapshot) {
  return {
    selected: snapshot.selected,
    transition:
      snapshot.transition === null
        ? null
        : {
            direction: snapshot.transition.direction,
            rawProgress: snapshot.transition.rawProgress,
          },
    cooldownActive: snapshot.cooldownActive,
    locked: snapshot.locked,
  };
}

let packageRoot;
let compiledModule;
let wasmBytes;

async function loadPublicArtifact() {
  if (packageRoot && compiledModule) {
    return { packageRoot, compiledModule, wasmBytes };
  }

  assert.equal(process.versions.node, EXPECTED_NODE);
  assertNoBrowserOrRendererGlobals();

  packageRoot = await import("web-interactive-flow");
  assertNoBrowserOrRendererGlobals();

  const wasmUrl = import.meta.resolve("web-interactive-flow/core.wasm");
  wasmBytes = await readFile(fileURLToPath(wasmUrl));
  assert.equal(wasmBytes.byteLength, 11441);
  assert.equal(
    createHash("sha256").update(wasmBytes).digest("hex"),
    EXPECTED_WASM_SHA256,
  );

  const response = new Response(wasmBytes, {
    headers: { "Content-Type": "application/wasm" },
  });
  compiledModule = await packageRoot.compileFlowModule(response);
  assert.equal(compiledModule instanceof WebAssembly.Module, true);
  assert.equal(response.bodyUsed, true);

  return { packageRoot, compiledModule, wasmBytes };
}

async function createRuntime() {
  const { packageRoot: api, compiledModule } = await loadPublicArtifact();
  return api.createFlowRuntime(compiledModule, CONFIG);
}

function makeExpectedRow(label, outcome, state) {
  return { label, outcome, state };
}

function settled(selected, cooldownActive = false, locked = false) {
  return { selected, transition: null, cooldownActive, locked };
}

function moving(
  selected,
  direction,
  rawProgress,
  cooldownActive = false,
  locked = false,
) {
  return {
    selected,
    transition: { direction, rawProgress },
    cooldownActive,
    locked,
  };
}

const EXPECTED_TRACE = [
  makeExpectedRow("initial", null, settled("alpha")),
  makeExpectedRow("Site A next()", { disposition: "accepted" }, moving("beta", "forward", 0)),
  makeExpectedRow("Site B previous() during transition", { disposition: "rejected" }, moving("beta", "forward", 0)),
  makeExpectedRow("tick(0)", null, moving("beta", "forward", 0)),
  makeExpectedRow("tick(5) partial", null, moving("beta", "forward", 0.5)),
  makeExpectedRow("tick(5) transition completion", null, settled("beta", true)),
  makeExpectedRow("Site B next() during cooldown", { disposition: "rejected" }, settled("beta", true)),
  makeExpectedRow("tick(5) cooldown expiry", null, settled("beta")),
  makeExpectedRow("Site B goTo(delta)", { disposition: "accepted" }, moving("delta", "forward", 0)),
  makeExpectedRow("tick(10)", null, settled("delta", true)),
  makeExpectedRow("tick(5)", null, settled("delta")),
  makeExpectedRow("Site B goTo(delta) same target", { disposition: "rejected" }, settled("delta")),
  makeExpectedRow("Site A next() at last boundary", { disposition: "rejected" }, settled("delta")),
  makeExpectedRow("Site A previous(); acknowledgment throws", { disposition: "accepted", effectFailure: true }, moving("gamma", "reverse", 0)),
  makeExpectedRow("tick(15)", null, settled("gamma")),
  makeExpectedRow("Site B goTo(alpha)", { disposition: "accepted" }, moving("alpha", "reverse", 0)),
  makeExpectedRow("tick(1000) large valid delta", null, settled("alpha")),
  makeExpectedRow("Site A previous() at first boundary", { disposition: "rejected" }, settled("alpha")),
  makeExpectedRow("lock()", null, settled("alpha", false, true)),
  makeExpectedRow("Site B next() while locked", { disposition: "rejected" }, settled("alpha", false, true)),
  makeExpectedRow("unlock()", null, settled("alpha")),
  makeExpectedRow("Site B goTo(omega)", { validationFailure: true }, settled("alpha")),
];

function runTrace(runtime, host) {
  const rows = [];
  const effects = { attempts: 0, successes: 0, failures: 0 };

  function record(label, outcome) {
    rows.push(makeExpectedRow(label, outcome, project(host.observe())));
  }

  function acknowledge(disposition, failAfterAcceptance = false) {
    if (disposition !== "accepted") {
      return false;
    }

    effects.attempts += 1;
    try {
      if (failAfterAcceptance) {
        throw new Error("test-local host acknowledgment failure");
      }
      effects.successes += 1;
      return false;
    } catch {
      effects.failures += 1;
      return true;
    }
  }

  function request(
    label,
    invokeRuntime,
    { failEffect = false, expectValidationFailure = false } = {},
  ) {
    let disposition;
    try {
      disposition = host.request(invokeRuntime);
    } catch (error) {
      if (!expectValidationFailure) {
        throw error;
      }
      assert.match(String(error?.message ?? error), /unknown phase identity/i);
      record(label, { validationFailure: true });
      return;
    }
    assert.equal(
      expectValidationFailure,
      false,
      label + " should have failed validation",
    );

    const effectFailure = acknowledge(disposition, failEffect);
    const outcome =
      effectFailure === true
        ? { disposition, effectFailure: true }
        : { disposition };
    record(label, outcome);
  }

  function tick(label, dt) {
    host.tick(dt);
    record(label, null);
  }

  record("initial", null);
  request("Site A next()", () => runtime.next());
  request("Site B previous() during transition", () => runtime.previous());
  tick("tick(0)", 0);
  tick("tick(5) partial", 5);
  tick("tick(5) transition completion", 5);
  request("Site B next() during cooldown", () => runtime.next());
  tick("tick(5) cooldown expiry", 5);
  request("Site B goTo(delta)", () => runtime.goTo("delta"));
  tick("tick(10)", 10);
  tick("tick(5)", 5);
  request("Site B goTo(delta) same target", () => runtime.goTo("delta"));
  request("Site A next() at last boundary", () => runtime.next());
  request(
    "Site A previous(); acknowledgment throws",
    () => runtime.previous(),
    { failEffect: true },
  );
  tick("tick(15)", 15);
  request("Site B goTo(alpha)", () => runtime.goTo("alpha"));
  tick("tick(1000) large valid delta", 1000);
  request("Site A previous() at first boundary", () => runtime.previous());
  host.lock();
  record("lock()", null);
  request("Site B next() while locked", () => runtime.next());
  host.unlock();
  record("unlock()", null);

  const beforeInvalidTarget = runtime.getSnapshot();
  request("Site B goTo(omega)", () => runtime.goTo("omega"), {
    expectValidationFailure: true,
  });
  assert.deepEqual(runtime.getSnapshot(), beforeInvalidTarget);

  assert.equal(effects.attempts, 4);
  assert.equal(effects.successes, 3);
  assert.equal(effects.failures, 1);

  return { rows, effects, host };
}

function createDirectHost(runtime) {
  return {
    request(invokeRuntime) {
      return invokeRuntime();
    },
    tick(dt) {
      runtime.tick(dt);
    },
    lock() {
      runtime.lock();
    },
    unlock() {
      runtime.unlock();
    },
    observe() {
      return runtime.getSnapshot();
    },
  };
}

function createInvalidationHost(runtime) {
  const observers = [
    { attached: true, snapshot: runtime.getSnapshot() },
    { attached: true, snapshot: runtime.getSnapshot() },
  ];

  function invalidateAttachedObservers() {
    for (const observer of observers) {
      if (observer.attached) {
        observer.snapshot = runtime.getSnapshot();
      }
    }
  }

  function throughSharedHostBoundary(operation) {
    try {
      return operation();
    } finally {
      invalidateAttachedObservers();
    }
  }

  return {
    request(invokeRuntime) {
      return throughSharedHostBoundary(invokeRuntime);
    },
    tick(dt) {
      throughSharedHostBoundary(() => runtime.tick(dt));
    },
    lock() {
      throughSharedHostBoundary(() => runtime.lock());
    },
    unlock() {
      throughSharedHostBoundary(() => runtime.unlock());
    },
    observe() {
      const current = runtime.getSnapshot();
      assert.deepEqual(observers[0].snapshot, current);
      assert.deepEqual(observers[1].snapshot, current);
      return observers[0].snapshot;
    },
  };
}

function createManualFrameHost(runtime) {
  const observers = [
    { attached: true, snapshot: runtime.getSnapshot() },
    { attached: true, snapshot: runtime.getSnapshot() },
  ];
  let frameCount = 0;

  function pullAttachedObservers() {
    for (const observer of observers) {
      if (observer.attached) {
        observer.snapshot = runtime.getSnapshot();
      }
    }
  }

  return {
    request(invokeRuntime) {
      try {
        return invokeRuntime();
      } finally {
        pullAttachedObservers();
      }
    },
    tick(dt) {
      runtime.tick(dt);
      frameCount += 1;
      pullAttachedObservers();
    },
    lock() {
      runtime.lock();
      pullAttachedObservers();
    },
    unlock() {
      runtime.unlock();
      pullAttachedObservers();
    },
    observe() {
      assert.deepEqual(observers[0].snapshot, runtime.getSnapshot());
      assert.deepEqual(observers[1].snapshot, runtime.getSnapshot());
      return observers[0].snapshot;
    },
    get frameCount() {
      return frameCount;
    },
  };
}

test("exact published package root and public Wasm export operate headlessly", async () => {
  const { packageRoot: api, compiledModule } = await loadPublicArtifact();

  assertNoBrowserOrRendererGlobals();
  assert.deepEqual(
    Object.keys(api).sort(),
    [...EXPECTED_PUBLIC_ROOT_EXPORTS].sort(),
  );
  assert.deepEqual(WebAssembly.Module.imports(compiledModule), []);

  const require = createRequire(import.meta.url);
  for (const framework of ["react", "@react-three/fiber", "three"]) {
    assert.throws(() => require.resolve(framework));
  }

  const lock = JSON.parse(
    await readFile(new URL("./package-lock.json", import.meta.url), "utf8"),
  );
  const lockedPackage = lock.packages["node_modules/web-interactive-flow"];
  assert.equal(lockedPackage.version, "0.2.0");
  assert.equal(lockedPackage.integrity, EXPECTED_INTEGRITY);
  assert.equal(lockedPackage.resolved, "https://registry.npmjs.org/web-interactive-flow/-/web-interactive-flow-0.2.0.tgz");
  const runtime = api.createFlowRuntime(compiledModule, CONFIG);
  assert.deepEqual(runtime.getSnapshot(), {
    selected: "alpha",
    transition: null,
    cooldownActive: false,
    locked: false,
  });
  runtime.dispose();
});

test("three tested host organizations produce the same 22-step semantic trace", async () => {
  const { packageRoot: api, compiledModule } = await loadPublicArtifact();
  const results = [];

  for (const makeHost of [
    (runtime) => createDirectHost(runtime),
    (runtime) => createInvalidationHost(runtime),
    (runtime) => createManualFrameHost(runtime),
  ]) {
    const runtime = api.createFlowRuntime(compiledModule, CONFIG);
    const host = makeHost(runtime);
    const result = runTrace(runtime, host);
    assert.deepEqual(result.rows, EXPECTED_TRACE);
    if ("frameCount" in host) {
      assert.equal(host.frameCount, 8);
    }
    runtime.dispose();
    assert.throws(() => runtime.next(), /disposed/);
    assert.throws(() => runtime.getSnapshot(), /disposed/);
    results.push(result.rows);
  }

  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test("two pull observers reattach to current state while Runtime lifetime stays owner-controlled", async () => {
  const runtime = await createRuntime();
  const observerA = {
    attached: true,
    snapshot: runtime.getSnapshot(),
    pulls: 1,
    notifications: 0,
  };
  const observerB = {
    attached: true,
    snapshot: runtime.getSnapshot(),
    pulls: 1,
    notifications: 0,
  };

  function invalidate() {
    for (const observer of [observerA, observerB]) {
      if (observer.attached) {
        observer.snapshot = runtime.getSnapshot();
        observer.notifications += 1;
      }
    }
  }

  function throughHostBoundary(operation) {
    try {
      return operation();
    } finally {
      invalidate();
    }
  }

  function detach(observer) {
    observer.attached = false;
  }

  function reattach(observer) {
    observer.attached = true;
    observer.snapshot = runtime.getSnapshot();
    observer.pulls += 1;
  }

  assert.equal(
    throughHostBoundary(() => runtime.next()),
    "accepted",
  );
  assert.deepEqual(observerA.snapshot, runtime.getSnapshot());
  assert.deepEqual(observerB.snapshot, runtime.getSnapshot());

  const aNotificationsBeforeDetach = observerA.notifications;
  detach(observerA);
  throughHostBoundary(() => runtime.tick(5));
  assert.equal(observerA.notifications, aNotificationsBeforeDetach);
  assert.deepEqual(observerB.snapshot.transition, {
    direction: "forward",
    rawProgress: 0.5,
  });
  reattach(observerA);
  assert.equal(observerA.pulls, 2);
  assert.deepEqual(observerA.snapshot, runtime.getSnapshot());

  const bNotificationsBeforeDetach = observerB.notifications;
  detach(observerB);
  throughHostBoundary(() => runtime.tick(5));
  assert.equal(observerB.notifications, bNotificationsBeforeDetach);
  assert.equal(observerA.snapshot.cooldownActive, true);
  reattach(observerB);
  assert.equal(observerB.pulls, 2);
  assert.deepEqual(observerB.snapshot, runtime.getSnapshot());

  throughHostBoundary(() => runtime.tick(5));
  assert.equal(observerA.snapshot.cooldownActive, false);
  assert.deepEqual(observerB.snapshot, runtime.getSnapshot());

  detach(observerA);
  detach(observerB);
  const detachedA = observerA.snapshot;
  const detachedB = observerB.snapshot;
  assert.equal(runtime.goTo("gamma"), "accepted");
  assert.deepEqual(observerA.snapshot, detachedA);
  assert.deepEqual(observerB.snapshot, detachedB);
  assert.deepEqual(project(runtime.getSnapshot()), moving("gamma", "forward", 0));

  runtime.tick(15);
  assert.deepEqual(project(runtime.getSnapshot()), settled("gamma"));
  reattach(observerA);
  reattach(observerB);
  assert.deepEqual(observerA.snapshot, runtime.getSnapshot());
  assert.deepEqual(observerB.snapshot, runtime.getSnapshot());
  assert.deepEqual(project(observerA.snapshot), settled("gamma"));

  runtime.dispose();
  assert.throws(() => runtime.next(), /disposed/);
  assert.throws(() => runtime.getSnapshot(), /disposed/);
});

test("out-of-band writes can stale host caches while Runtime remains current", async () => {
  const runtime = await createRuntime();
  const observerA = { attached: true, snapshot: runtime.getSnapshot() };
  const observerB = { attached: true, snapshot: runtime.getSnapshot() };

  function invalidateAttachedObservers() {
    for (const observer of [observerA, observerB]) {
      if (observer.attached) {
        observer.snapshot = runtime.getSnapshot();
      }
    }
  }

  function throughSharedBoundary(operation) {
    try {
      return operation();
    } finally {
      invalidateAttachedObservers();
    }
  }

  assert.equal(runtime.next(), "accepted");
  assert.deepEqual(project(observerA.snapshot), settled("alpha"));
  assert.deepEqual(project(observerB.snapshot), settled("alpha"));
  const directPull = runtime.getSnapshot();
  assert.deepEqual(project(directPull), moving("beta", "forward", 0));
  assert.deepEqual(project(observerA.snapshot), settled("alpha"));

  throughSharedBoundary(() => runtime.tick(15));
  assert.deepEqual(project(observerA.snapshot), settled("beta"));
  assert.deepEqual(project(observerB.snapshot), settled("beta"));

  assert.equal(
    throughSharedBoundary(() => runtime.goTo("delta")),
    "accepted",
  );
  assert.deepEqual(project(observerA.snapshot), moving("delta", "forward", 0));
  assert.deepEqual(project(observerB.snapshot), moving("delta", "forward", 0));
  throughSharedBoundary(() => runtime.tick(15));
  assert.deepEqual(project(observerA.snapshot), settled("delta"));
  assert.deepEqual(project(observerB.snapshot), settled("delta"));

  runtime.dispose();
});

test("two nominal tick owners add valid deltas; this remains a host misuse probe", async () => {
  const runtime = await createRuntime();

  assert.equal(runtime.next(), "accepted");
  runtime.tick(3);
  assert.ok(Math.abs(runtime.getSnapshot().transition.rawProgress - 0.3) < 1e-12);
  runtime.tick(3);
  assert.ok(Math.abs(runtime.getSnapshot().transition.rawProgress - 0.6) < 1e-12);

  runtime.dispose();
});
