import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stagePackageArtifact } from "../package/stage_package.mjs";
import {
  assertExactFileBytes,
  installLocalTarball,
  qualificationBuildRoot,
  validateQualificationRoutes,
} from "./package_qualification_support.mjs";

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = path.join(ROOT, "tests/browser/package-fixture");
const NAME = "wif-package-qualification";

async function run(command, args, cwd) {
  return exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
}

export async function qualifyPackageBrowser() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wif-vite-browser-"));
  try {
  const stage = path.join(temporaryRoot, "stage");
  const packs = path.join(temporaryRoot, "packs");
  const consumer = path.join(temporaryRoot, "consumer");
  await stagePackageArtifact({
    destination: stage, name: NAME, version: "0.0.0-qualification", r3fPeerVersion: "9.8.0",
  });
  const qualifiedWasm = path.join(ROOT, "_build/wasm/debug/build/core/core.wasm");
  const stagedWasm = path.join(stage, "core.wasm");
  const stagedBytes = await readFile(stagedWasm);
  const corruptPackagedBytes = Buffer.from(stagedBytes);
  corruptPackagedBytes[corruptPackagedBytes.length - 1] ^= 1;
  await writeFile(stagedWasm, corruptPackagedBytes);
  await assert.rejects(
    assertExactFileBytes(qualifiedWasm, stagedWasm, "mutant 03 packaged provenance"),
  );
  await writeFile(stagedWasm, stagedBytes);
  await assertExactFileBytes(qualifiedWasm, stagedWasm, "restored staged Wasm provenance");
  console.log("Mutant 03 detected: corrupted staged package Wasm rejected; baseline restored");

  await assert.rejects(
    installLocalTarball({ run, consumerRoot: consumer, tarballPath: stage }),
    /produced local npm tarball/,
  );
  console.log("Mutant 12 detected: staged-directory install bypass rejected; baseline unchanged");
  await mkdir(packs);
  const packed = JSON.parse((await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packs], stage)).stdout)[0];
  const tarball = path.join(packs, packed.filename);
  await cp(FIXTURE, consumer, { recursive: true });
  await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  await installLocalTarball({ run, consumerRoot: consumer, tarballPath: tarball });

  const installed = path.join(consumer, "node_modules", NAME);
  await assertExactFileBytes(
    qualifiedWasm,
    path.join(installed, "core.wasm"),
    "installed packaged Wasm must match the qualified repository build",
  );
  for (const forbidden of ["react", "@react-three", "three"]) {
    await assert.rejects(readFile(path.join(consumer, "node_modules", forbidden, "package.json")));
  }
  await run("npm", ["run", "build"], consumer);
  const assets = path.join(consumer, "dist", "assets");
  const wasmFiles = (await readdir(assets)).filter((name) => name.endsWith(".wasm"));
  assert.equal(wasmFiles.length, 1, "production build must emit exactly one inspectable Wasm asset");
  await assertExactFileBytes(
    path.join(installed, "core.wasm"),
    path.join(assets, wasmFiles[0]),
    "emitted Wasm must exactly match installed packaged Wasm",
  );
  const emittedWasm = path.join(assets, wasmFiles[0]);
  const emittedBytes = await readFile(emittedWasm);
  const corruptEmittedBytes = Buffer.from(emittedBytes);
  corruptEmittedBytes[corruptEmittedBytes.length - 1] ^= 1;
  await writeFile(emittedWasm, corruptEmittedBytes);
  await assert.rejects(
    assertExactFileBytes(path.join(installed, "core.wasm"), emittedWasm, "mutant 04 emitted provenance"),
  );
  await writeFile(emittedWasm, emittedBytes);
  await assertExactFileBytes(path.join(installed, "core.wasm"), emittedWasm, "restored emitted Wasm provenance");
  console.log("Mutant 04 detected: corrupted emitted Wasm rejected; baseline restored");

  assert.throws(
    () => validateQualificationRoutes(new Map([
      ["/", "index.html"],
      ["/bridge/runtime.mjs", "../bridge/runtime.mjs"],
    ])),
    /forbidden qualification route/,
  );
  console.log("Mutant 09 detected: repository-source fallback route rejected; baseline unchanged");

  const buildRoot = qualificationBuildRoot(consumer);
  assert.equal(buildRoot, path.join(consumer, "dist"));
  const browser = await run(process.execPath, [path.join(ROOT, "tools/browser/qualify_real_browser.mjs"), buildRoot], ROOT);
  process.stdout.write(browser.stdout);
  process.stderr.write(browser.stderr);
  console.log(`Package-aware qualification PASS (Vite 7.1.7; tarball ${path.basename(tarball)})`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await qualifyPackageBrowser();
}
