import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const fixtureUrl = new URL("tests/browser/package-fixture/src/main.mjs", root);
const packageUrl = new URL("tests/browser/package-fixture/package.json", root);
const lockUrl = new URL("tests/browser/package-fixture/package-lock.json", root);
const configUrl = new URL("tests/browser/package-fixture/vite.config.mjs", root);
const harnessUrl = new URL("tools/browser/qualify_package_browser.mjs", root);
const browserUrl = new URL("tools/browser/qualify_real_browser.mjs", root);
const serverUrl = new URL("tools/browser/qualification_server.mjs", root);

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
  assert.equal(pkg.devDependencies.vite, "7.1.7");
  assert.equal(Object.keys(pkg.devDependencies).length, 1);
  const locked = JSON.parse(lock);
  assert.equal(locked.packages["node_modules/vite"].version, "7.1.7");
  assert.equal(locked.packages[""].devDependencies.vite, "7.1.7");
  assert.match(config, /assetsInlineLimit:\s*0/);
  assert.match(harness, /stagePackageArtifact\(/);
  assert.match(harness, /npm", \["pack"/);
  assert.match(harness, /npm", \["ci"/);
  assert.match(harness, /npm", \["run", "build"\]/);
  assert.match(harness, /assert\.deepEqual\(await readFile\(path\.join\(installed, "core\.wasm"\)\), await readFile\(path\.join\(stage, "core\.wasm"\)\)\)/);
  assert.match(harness, /assert\.deepEqual\(await readFile\(path\.join\(assets, wasmFiles\[0\]\)\), await readFile\(path\.join\(installed, "core\.wasm"\)\)/);
  assert.match(browser, /QUALIFICATION_TIMEOUT_MS/);
  assert.match(browser, /Qualification browser:/);
  assert.match(browser, /Qualification driver:/);
  assert.match(server, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(server, /path\.resolve\(root, relative\)/);
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
  ["03 packaged Wasm replacement", "harness", (s) => s.replace("assert.deepEqual(await readFile(path.join(installed, \"core.wasm\")),", "// provenance removed\nassert.notDeepEqual(Buffer.from('corrupt'),")],
  ["04 emitted Wasm replacement", "harness", (s) => s.replace("assert.deepEqual(await readFile(path.join(assets, wasmFiles[0])),", "assert.notDeepEqual(await readFile(path.join(assets, wasmFiles[0])),")],
  ["05 root imports R3F", "fixture", (s) => `${s}\nimport "@react-three/fiber";`],
  ["06 dev server", "harness", (s) => s.replace('["run", "build"]', '["run", "dev"]')],
  ["07 package-owned fetch", "fixture", (s) => s.replace("compileFlowModule(fetch(wasmUrl))", "compileFlowModule(wasmUrl)")],
  ["08 fake production seams", "fixture", (s) => s.replace("createFlowRuntime(module,", "fakeRuntime(")],
  ["09 source fallback", "server", (s) => `${s}\n// fallback bridge/runtime.mjs`],
  ["10 ranged Vite", "manifest", (s) => s.replace('"vite": "7.1.7"', '"vite": "^7.1.7"')],
  ["11 universal compatibility", "fixture", (s) => `${s}\n// universal bundler compatibility`],
  ["12 source instead of tarball", "harness", (s) => s.replace(/stagePackageArtifact\(/, "bypassRepositorySource(")],
];

for (const [name, field, mutate] of mutants) {
  test(`required mutant ${name} is detected`, () => {
    assert.throws(() => verifyWitness({ ...baseline, [field]: mutate(baseline[field]) }));
  });
}
