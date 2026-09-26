import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertExactFileBytes,
  installLocalTarball,
  qualificationBuildRoot,
  validateQualificationRoutes,
} from "../../tools/browser/package_qualification_support.mjs";
import { createQualificationServer } from "../../tools/browser/qualification_server.mjs";

const root = new URL("../../", import.meta.url);
const fixtureUrl = new URL("tests/browser/package-fixture/src/main.mjs", root);
const packageUrl = new URL("tests/browser/package-fixture/package.json", root);
const lockUrl = new URL("tests/browser/package-fixture/package-lock.json", root);
const configUrl = new URL("tests/browser/package-fixture/vite.config.mjs", root);
const harnessUrl = new URL("tools/browser/qualify_package_browser.mjs", root);
const browserUrl = new URL("tools/browser/qualify_real_browser.mjs", root);
const serverUrl = new URL("tools/browser/qualification_server.mjs", root);
const QUALIFIED_VITE_VERSION = "7.3.6";
const MINIMUM_SAFE_ROLLUP_VERSION = "4.59.0";

function compareVersions(left, right) {
  const parse = (version) => {
    assert.match(version, /^\d+\.\d+\.\d+$/, `expected an exact semantic version, received ${version}`);
    return version.split(".").map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function verifyWitness({ fixture, manifest, lock, config, harness, browser, server }) {
  assert.match(fixture, /from "wif-package-qualification"/);
  assert.match(fixture, /from "wif-package-qualification\/core\.wasm\?url"/);
  assert.doesNotMatch(fixture, /(?:\.\.\/|\/)bridge\//);
  assert.doesNotMatch(fixture, /_build\//);
  assert.match(fixture, /compileFlowModule\(fetch\(wasmUrl\)\)/);
  assert.match(fixture, /createFlowRuntime\(/);
  assert.match(fixture, /createFrameScheduler\(/);
  assert.match(fixture, /runtime\.next\(\)/);
  assert.match(fixture, /snapshot\.selected !== "B"/);
  assert.match(fixture, /snapshot\.transition\?\.rawProgress !== 0/);
  assert.match(fixture, /snapshot\.transition\.rawProgress > 0/);
  assert.doesNotMatch(fixture, /(?:react|three|@react-three\/fiber)/i);
  assert.doesNotMatch(fixture, /data-wif-|--wif-|classList\.|\.style\./i);
  assert.doesNotMatch(fixture, /universal (?:bundler|vite) compatibility/i);

  const pkg = JSON.parse(manifest);
  assert.equal(pkg.devDependencies.vite, QUALIFIED_VITE_VERSION);
  assert.equal(Object.keys(pkg.devDependencies).length, 1);
  const locked = JSON.parse(lock);
  assert.equal(locked.packages["node_modules/vite"].version, QUALIFIED_VITE_VERSION);
  assert.equal(locked.packages[""].devDependencies.vite, QUALIFIED_VITE_VERSION);
  const rollupVersion = locked.packages["node_modules/rollup"].version;
  assert.ok(compareVersions(rollupVersion, MINIMUM_SAFE_ROLLUP_VERSION) >= 0,
    `resolved Rollup ${rollupVersion} must be >= ${MINIMUM_SAFE_ROLLUP_VERSION}`);
  assert.equal(locked.packages["node_modules/@rollup/rollup-linux-x64-gnu"].version, rollupVersion);
  assert.match(config, /assetsInlineLimit:\s*0/);
  assert.match(harness, /stagePackageArtifact\(/);
  assert.match(harness, /npm", \["pack"/);
  assert.match(harness, /npm", \["ci"/);
  assert.match(harness, /npm", \["run", "build"\]/);
  assert.match(harness, /installLocalTarball\(\{ run, consumerRoot: consumer, tarballPath: tarball \}\)/);
  assert.match(harness, /const qualifiedWasm = path\.join\(ROOT, "_build\/wasm\/debug\/build\/core\/core\.wasm"\)/);
  assert.match(harness, /assertExactFileBytes\(\s*qualifiedWasm,\s*path\.join\(installed, "core\.wasm"\)/);
  assert.match(harness, /assertExactFileBytes\([\s\S]*path\.join\(installed, "core\.wasm"\)[\s\S]*path\.join\(assets, wasmFiles\[0\]\)/);
  assert.match(harness, /const buildRoot = qualificationBuildRoot\(consumer\)/);
  assert.match(harness, /qualify_real_browser\.mjs"\), buildRoot/);
  assert.match(browser, /QUALIFICATION_TIMEOUT_MS/);
  assert.match(browser, /Qualification browser:/);
  assert.match(browser, /Qualification driver:/);
  assert.match(server, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(server, /routes\.get\(pathname\)/);
  assert.doesNotMatch(server, /_build|bridge\/runtime|core\.wasm/);
}

const baseline = {
  fixture: await readFile(fixtureUrl, "utf8"),
  manifest: await readFile(packageUrl, "utf8"),
  lock: await readFile(lockUrl, "utf8"),
  config: await readFile(configUrl, "utf8"),
  harness: await readFile(harnessUrl, "utf8"),
  browser: await readFile(browserUrl, "utf8"),
  server: await readFile(serverUrl, "utf8"),
};

test("B01-B10 package-aware production-browser contract", () => verifyWitness(baseline));

const mutants = [
  ["01 repository bridge import", "fixture", (s) => s.replace('from "wif-package-qualification"', 'from "../../../bridge/runtime.mjs"')],
  ["02 repository Wasm", "fixture", (s) => s.replace('"wif-package-qualification/core.wasm?url"', '"../../../_build/wasm/debug/build/core/core.wasm?url"')],
  ["05 root imports R3F", "fixture", (s) => `${s}\nimport "@react-three/fiber";`],
  ["06 dev server", "harness", (s) => s.replace('["run", "build"]', '["run", "dev"]')],
  ["07 package-owned fetch", "fixture", (s) => s.replace("compileFlowModule(fetch(wasmUrl))", "compileFlowModule(wasmUrl)")],
  ["08 fake production seams", "fixture", (s) => s.replace("createFlowRuntime(module,", "fakeRuntime(")],
  ["10 ranged Vite", "manifest", (s) => s.replace(`"vite": "${QUALIFIED_VITE_VERSION}"`, `"vite": "^${QUALIFIED_VITE_VERSION}"`)],
  ["11 universal compatibility", "fixture", (s) => `${s}\n// universal bundler compatibility`],
];

for (const [name, field, mutate] of mutants) {
  test(`required mutant ${name} is detected`, () => {
    assert.throws(() => verifyWitness({ ...baseline, [field]: mutate(baseline[field]) }));
  });
}

function httpRequest(baseUrl, pathname, method = "GET") {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const req = request({ hostname: url.hostname, port: url.port, path: pathname, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("D08/B08 server behavior is finite, build-output-only, and MIME-correct", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "wif-output-routes-"));
  await mkdir(path.join(output, "assets"));
  await writeFile(path.join(output, "index.html"), "index");
  await writeFile(path.join(output, "assets/app-123.js"), "app");
  await writeFile(path.join(output, "assets/core-123.wasm"), "wasm");
  await writeFile(path.join(output, "assets/unlisted.txt"), "secret");
  const routes = new Map([
    ["/", "index.html"],
    ["/assets/app-123.js", "assets/app-123.js"],
    ["/assets/core-123.wasm", "assets/core-123.wasm"],
  ]);
  const server = createQualificationServer(output, routes);
  try {
    const base = await server.start();
    assert.equal((await httpRequest(base, "/")).status, 200);
    assert.equal((await httpRequest(base, "/assets/app-123.js")).status, 200);
    const wasm = await httpRequest(base, "/assets/core-123.wasm");
    assert.equal(wasm.status, 200);
    assert.equal(wasm.type, "application/wasm");
    for (const route of [
      "/assets/unlisted.txt", "/unknown", "/bridge/runtime.mjs",
      "/_build/wasm/debug/build/core/core.wasm", "/core.wasm",
      "/..%2fREADME.md", "/%2e%2e/README.md",
    ]) assert.equal((await httpRequest(base, route)).status, 404, route);
    assert.equal((await httpRequest(base, "/", "POST")).status, 405);
  } finally {
    await server.close();
    await rm(output, { recursive: true, force: true });
  }
});

test("mutant 03: actual packaged Wasm corruption fails qualified-build provenance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wif-mutant-03-"));
  try {
    const qualified = path.join(root, "qualified.wasm");
    const packaged = path.join(root, "core.wasm");
    await writeFile(qualified, Buffer.from([0, 97, 115, 109]));
    await writeFile(packaged, await readFile(qualified));
    await writeFile(packaged, Buffer.from([0, 97, 115, 110]));
    await assert.rejects(assertExactFileBytes(qualified, packaged, "packaged provenance"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("mutant 04: actual emitted Wasm corruption fails installed-byte provenance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wif-mutant-04-"));
  try {
    const installed = path.join(root, "installed.wasm");
    const emitted = path.join(root, "emitted.wasm");
    await writeFile(installed, Buffer.from([0, 97, 115, 109]));
    await writeFile(emitted, await readFile(installed));
    await writeFile(emitted, Buffer.from([0, 97, 115, 108]));
    await assert.rejects(assertExactFileBytes(installed, emitted, "emitted provenance"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("mutant 09: an actual repository-source fallback route is rejected", () => {
  const routes = new Map([["/", "index.html"], ["/bridge/runtime.mjs", "../bridge/runtime.mjs"]]);
  assert.throws(() => validateQualificationRoutes(routes), /forbidden qualification route/);
});

test("mutant 12: directory/source install bypass is rejected and tarball is exact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wif-mutant-12-"));
  const tarball = path.join(root, "wif.tgz");
  await writeFile(tarball, "tarball");
  const calls = [];
  const run = async (...args) => calls.push(args);
  try {
    await assert.rejects(installLocalTarball({ run, consumerRoot: root, tarballPath: root }), /produced local npm tarball/);
    assert.equal(calls.length, 0);
    await installLocalTarball({ run, consumerRoot: root, tarballPath: tarball });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].at(-1), tarball);
    assert.equal(qualificationBuildRoot(root), path.join(root, "dist"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
