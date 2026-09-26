import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL(
  "./dom-listener-qualification/main.mjs",
  import.meta.url,
);
const harnessUrl = new URL(
  "../../tools/browser/qualify_dom_wheel_listener_browser.mjs",
  import.meta.url,
);
const packageServerUrl = new URL(
  "../../tools/browser/qualification_server.mjs",
  import.meta.url,
);
const packageSupportUrl = new URL(
  "../../tools/browser/package_qualification_support.mjs",
  import.meta.url,
);

test("DOM listener browser fixture uses production seams without raw gesture policy", async () => {
  const fixture = await readFile(fixtureUrl, "utf8");

  for (const required of [
    'from "/adapters/dom/wheel_listener.mjs"',
    'from "/bridge/module_compiler.mjs"',
    'from "/bridge/runtime.mjs"',
    "new WeakMap()",
    'new WheelEvent("wheel"',
    "bindWheelNavigation({",
    'compileFlowModule(fetch("/core.wasm"))',
    "createFlowRuntime(module",
  ]) {
    assert.ok(fixture.includes(required), `missing fixture seam: ${required}`);
  }

  for (const forbidden of [
    /addEventListener\(\s*["\']wheel["\']/,
    /removeEventListener\(\s*["\']wheel["\']/,
    /runtime\.(?:next|previous|goTo)\s*\(/,
    /event\.delta(?:X|Y|Mode)\b/,
    /threshold/i,
    /burst/i,
    /setTimeout/,
    /setInterval/,
    /stopPropagation/,
    /stopImmediatePropagation/,
  ]) {
    assert.doesNotMatch(fixture, forbidden);
  }
});

test("DOM listener qualification server exposes only the bounded source witness", async () => {
  const harness = await readFile(harnessUrl, "utf8");

  for (const requiredRoute of [
    '["/", "tests/browser/dom-listener-qualification/index.html"]',
    '["/fixture/main.mjs", "tests/browser/dom-listener-qualification/main.mjs"]',
    '["/adapters/dom/wheel_listener.mjs", "adapters/dom/wheel_listener.mjs"]',
    '["/bridge/wheel_ownership.mjs", "bridge/wheel_ownership.mjs"]',
    '["/bridge/runtime.mjs", "bridge/runtime.mjs"]',
    '["/bridge/module_compiler.mjs", "bridge/module_compiler.mjs"]',
    '["/bridge/internal.mjs", "bridge/internal.mjs"]',
    '["/core.wasm", "_build/wasm/debug/build/core/core.wasm"]',
  ]) {
    assert.ok(
      harness.includes(requiredRoute),
      `missing bounded route: ${requiredRoute}`,
    );
  }

  assert.doesNotMatch(harness, /qualification_server\.mjs/);
  assert.match(harness, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.match(harness, /"application\/wasm"/);
  assert.match(harness, /QUALIFICATION_TIMEOUT_MS = 90_000/);
  assert.match(harness, /WEBDRIVER_REQUEST_TIMEOUT_MS = 45_000/);
});

test("package-aware qualification keeps repository-source fallback forbidden", async () => {
  const server = await readFile(packageServerUrl, "utf8");
  const support = await readFile(packageSupportUrl, "utf8");

  assert.match(server, /validateQualificationRoutes\(allowedRoutes\)/);
  assert.match(support, /route === "\/core\.wasm"/);
  assert.match(support, /route\.startsWith\("\/bridge\/"\)/);
  assert.match(support, /route\.startsWith\("\/_build\/"\)/);
});
