import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { stagePackageArtifact } from "../../tools/package/stage_package.mjs";

const execFile = promisify(execFileCallback);

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const R3F_FIXTURE_ROOT = path.join(REPOSITORY_ROOT, "tests/r3f/fixture");

// Qualification-only identity. This is not the final npm package name/version.
const PACKAGE_NAME = "wif-package-qualification";
const PACKAGE_VERSION = "0.0.0-qualification";
const R3F_PEER_VERSION = "9.8.0";

const EXPECTED_PRODUCTION_PATHS = [
  "bridge/runtime.mjs",
  "bridge/module_compiler.mjs",
  "bridge/frame_scheduler.mjs",
  "bridge/clock.mjs",
  "bridge/wheel_ownership.mjs",
  "bridge/internal.mjs",
  "adapters/r3f/use_flow_frame.mjs",
];

const EXPECTED_ROOT_FACADE =
  'export { createFlowRuntime } from "./bridge/runtime.mjs";\n' +
  'export { compileFlowModule } from "./bridge/module_compiler.mjs";\n' +
  'export { createFrameScheduler } from "./bridge/frame_scheduler.mjs";\n' +
  'export { applyWheelNavigationIntent } from "./bridge/wheel_ownership.mjs";\n';

const EXPECTED_R3F_FACADE =
  'export { useFlowFrame } from "./adapters/r3f/use_flow_frame.mjs";\n';

const EXPECTED_PACKED_FILES = [
  "LICENSE",
  "README.md",
  "adapters/r3f/use_flow_frame.mjs",
  "bridge/clock.mjs",
  "bridge/frame_scheduler.mjs",
  "bridge/internal.mjs",
  "bridge/module_compiler.mjs",
  "bridge/runtime.mjs",
  "bridge/wheel_ownership.mjs",
  "core.wasm",
  "index.mjs",
  "package.json",
  "r3f.mjs",
].sort();

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, options = {}) {
  return execFile(command, args, {
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
}

async function writeConsumerPackage(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function installTarball(directory, tarballPath) {
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--no-save",
      tarballPath,
    ],
    { cwd: directory },
  );
}

async function runNodeModule(directory, filename, source) {
  const scriptPath = path.join(directory, filename);
  await writeFile(scriptPath, source, "utf8");
  return run(process.execPath, [scriptPath], { cwd: directory });
}

test("K01-K10: local packed artifact preserves host isolation and provenance", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "wif-package-qualification-"),
  );
  const stageRoot = path.join(temporaryRoot, "stage");
  const packRoot = path.join(temporaryRoot, "pack");
  const webConsumerRoot = path.join(temporaryRoot, "web-consumer");
  const stagedR3fPackagePath = path.join(
    R3F_FIXTURE_ROOT,
    "node_modules",
    PACKAGE_NAME,
  );

  try {
    await stagePackageArtifact({
      destination: stageRoot,
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      r3fPeerVersion: R3F_PEER_VERSION,
    });

    // K06/K08/K09/K10: generated facades and manifest remain narrow,
    // qualification-only, and host-isolated.
    assert.equal(
      await readFile(path.join(stageRoot, "index.mjs"), "utf8"),
      EXPECTED_ROOT_FACADE,
    );
    assert.equal(
      await readFile(path.join(stageRoot, "r3f.mjs"), "utf8"),
      EXPECTED_R3F_FACADE,
    );

    const manifest = JSON.parse(
      await readFile(path.join(stageRoot, "package.json"), "utf8"),
    );

    assert.equal(manifest.name, PACKAGE_NAME);
    assert.equal(manifest.version, PACKAGE_VERSION);
    assert.equal(manifest.type, "module");
    assert.deepEqual(manifest.exports, {
      ".": "./index.mjs",
      "./r3f": "./r3f.mjs",
      "./core.wasm": "./core.wasm",
    });
    assert.deepEqual(manifest.peerDependencies, {
      "@react-three/fiber": R3F_PEER_VERSION,
    });
    assert.deepEqual(manifest.peerDependenciesMeta, {
      "@react-three/fiber": {
        optional: true,
      },
    });
    assert.equal(manifest.peerDependencies.react, undefined);
    assert.equal(manifest.peerDependencies.three, undefined);
    assert.equal(manifest.dependencies, undefined);

    assert.equal(
      await exists(path.join(REPOSITORY_ROOT, "package.json")),
      false,
      "qualification must not create a root package manifest",
    );

    for (const relativePath of EXPECTED_PRODUCTION_PATHS) {
      assert.deepEqual(
        await readFile(path.join(stageRoot, relativePath)),
        await readFile(path.join(REPOSITORY_ROOT, relativePath)),
        `${relativePath} must be copied byte-for-byte`,
      );
    }

    const builtWasmPath = path.join(
      REPOSITORY_ROOT,
      "_build/wasm/debug/build/core/core.wasm",
    );
    assert.deepEqual(
      await readFile(path.join(stageRoot, "core.wasm")),
      await readFile(builtWasmPath),
      "staged Wasm must match the qualified build artifact",
    );

    const stagingToolSource = await readFile(
      path.join(REPOSITORY_ROOT, "tools/package/stage_package.mjs"),
      "utf8",
    );
    for (const forbidden of [
      /\bfetch\s*\(/,
      /node:child_process/,
      /\b(?:esbuild|rollup|webpack|vite|babel|swc)\b/i,
      /transpil/i,
      /minif/i,
    ]) {
      assert.doesNotMatch(stagingToolSource, forbidden);
    }

    // K07: construct a real local npm tarball and inspect the packed allowlist.
    await mkdir(packRoot, { recursive: true });
    const { stdout: packStdout } = await run(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packRoot,
      ],
      { cwd: stageRoot },
    );

    const packResult = JSON.parse(packStdout);
    assert.equal(packResult.length, 1);

    const packed = packResult[0];
    const packedFiles = packed.files.map((entry) => entry.path).sort();
    assert.deepEqual(packedFiles, EXPECTED_PACKED_FILES);

    const tarballPath = path.join(packRoot, packed.filename);
    assert.equal(await exists(tarballPath), true);

    // K01/K03/K04/K05/K08/K09: clean framework-neutral consumer has no R3F.
    await writeConsumerPackage(webConsumerRoot);
    await installTarball(webConsumerRoot, tarballPath);

    assert.equal(
      await exists(
        path.join(
          webConsumerRoot,
          "node_modules",
          "@react-three",
          "fiber",
        ),
      ),
      false,
      "optional R3F peer must not be installed for Web-only consumption",
    );

    const webSmoke = `
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageRoot = await import("${PACKAGE_NAME}");
assert.deepEqual(Object.keys(packageRoot).sort(), [
  "applyWheelNavigationIntent",
  "compileFlowModule",
  "createFlowRuntime",
  "createFrameScheduler",
]);

let internalBlocked = false;
try {
  await import("${PACKAGE_NAME}/bridge/internal.mjs");
} catch (error) {
  internalBlocked = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
}
assert.equal(internalBlocked, true);

const wasmUrl = import.meta.resolve("${PACKAGE_NAME}/core.wasm");
const wasmBytes = await readFile(new URL(wasmUrl));

const module = await packageRoot.compileFlowModule(
  new Response(wasmBytes, {
    headers: { "Content-Type": "application/wasm" },
  }),
);

const runtime = packageRoot.createFlowRuntime(module, {
  phases: ["A", "B"],
  initial: "A",
  transitionDuration: 100,
  cooldown: 0,
});

try {
  assert.equal(runtime.next(), "accepted");
  const snapshot = runtime.getSnapshot();
  assert.equal(snapshot.selected, "B");
  assert.notEqual(snapshot.transition, null);
} finally {
  runtime.dispose();
}
`;

    await runNodeModule(webConsumerRoot, "web-smoke.mjs", webSmoke);

    const installedPackageRoot = path.join(
      webConsumerRoot,
      "node_modules",
      PACKAGE_NAME,
    );

    for (const relativePath of EXPECTED_PRODUCTION_PATHS) {
      assert.deepEqual(
        await readFile(path.join(installedPackageRoot, relativePath)),
        await readFile(path.join(REPOSITORY_ROOT, relativePath)),
        `packed ${relativePath} must preserve repository source bytes`,
      );
    }

    assert.deepEqual(
      await readFile(path.join(installedPackageRoot, "core.wasm")),
      await readFile(builtWasmPath),
      "installed package Wasm must match the qualified build artifact",
    );

    // K02: install the exact tarball into the already-qualified R3F host
    // fixture without persisting package/lock changes.
    assert.equal(
      await exists(
        path.join(
          R3F_FIXTURE_ROOT,
          "node_modules",
          "@react-three",
          "fiber",
          "package.json",
        ),
      ),
      true,
      "R3F qualification fixture must already be installed",
    );

    await installTarball(R3F_FIXTURE_ROOT, tarballPath);

    const r3fSmoke = `
import assert from "node:assert/strict";
import React from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useFlowFrame } from "${PACKAGE_NAME}/r3f";

const semanticSnapshot = {
  selected: "B",
  transition: {
    direction: "forward",
    rawProgress: 0.25,
  },
  cooldownActive: false,
  locked: false,
};

let reads = 0;
const observations = [];

const runtime = {
  getSnapshot() {
    reads += 1;
    return semanticSnapshot;
  },
};

function Probe() {
  useFlowFrame(runtime, (snapshot, delta) => {
    observations.push({ snapshot, delta });
  });

  return React.createElement("group", { name: "packed-r3f-probe" });
}

const renderer = await ReactThreeTestRenderer.create(
  React.createElement(Probe),
);

try {
  await renderer.advanceFrames(1, 0.5);

  assert.equal(reads, 1);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].snapshot, semanticSnapshot);
  assert.equal(observations[0].delta, 0.5);
} finally {
  await renderer.unmount();
}
`;

    await runNodeModule(
      R3F_FIXTURE_ROOT,
      ".wif-packed-r3f-smoke.mjs",
      r3fSmoke,
    );

    // K10: this qualification intentionally does not establish final package
    // naming, stable semver, broad R3F compatibility, TS/CJS/RSC support,
    // provider/context, or universal browser-bundler Wasm behavior.
  } finally {
    await rm(
      path.join(R3F_FIXTURE_ROOT, ".wif-packed-r3f-smoke.mjs"),
      { force: true },
    );
    await rm(stagedR3fPackagePath, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
