import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { stagePackageArtifact } from "../package/stage_package.mjs";

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = path.join(ROOT, "tests/browser/package-fixture");
const NAME = "wif-package-qualification";

async function run(command, args, cwd) {
  return exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "wif-vite-browser-"));
try {
  const stage = path.join(temporaryRoot, "stage");
  const packs = path.join(temporaryRoot, "packs");
  const consumer = path.join(temporaryRoot, "consumer");
  await stagePackageArtifact({
    destination: stage, name: NAME, version: "0.0.0-qualification", r3fPeerVersion: "9.8.0",
  });
  await mkdir(packs);
  const packed = JSON.parse((await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packs], stage)).stdout)[0];
  const tarball = path.join(packs, packed.filename);
  await cp(FIXTURE, consumer, { recursive: true });
  await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], consumer);
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--no-save", tarball], consumer);

  const installed = path.join(consumer, "node_modules", NAME);
  assert.deepEqual(await readFile(path.join(installed, "core.wasm")), await readFile(path.join(stage, "core.wasm")));
  for (const forbidden of ["react", "@react-three", "three"]) {
    await assert.rejects(readFile(path.join(consumer, "node_modules", forbidden, "package.json")));
  }
  await run("npm", ["run", "build"], consumer);
  const assets = path.join(consumer, "dist", "assets");
  const wasmFiles = (await readdir(assets)).filter((name) => name.endsWith(".wasm"));
  assert.equal(wasmFiles.length, 1, "production build must emit exactly one inspectable Wasm asset");
  assert.deepEqual(await readFile(path.join(assets, wasmFiles[0])), await readFile(path.join(installed, "core.wasm")), "emitted Wasm must exactly match installed packaged Wasm");

  const browser = await run(process.execPath, [path.join(ROOT, "tools/browser/qualify_real_browser.mjs"), path.join(consumer, "dist")], ROOT);
  process.stdout.write(browser.stdout);
  process.stderr.write(browser.stderr);
  console.log(`Package-aware qualification PASS (Vite 7.1.7; tarball ${path.basename(tarball)})`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
