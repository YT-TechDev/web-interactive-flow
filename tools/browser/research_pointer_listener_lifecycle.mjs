import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9526;
const OVERALL_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const ROUTES = new Map([
  ["/", "tests/browser/pointer-listener-lifecycle-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/pointer-listener-lifecycle-research/main.mjs"],
  ["/bridge/runtime.mjs", "bridge/runtime.mjs"],
  ["/bridge/module_compiler.mjs", "bridge/module_compiler.mjs"],
  ["/bridge/internal.mjs", "bridge/internal.mjs"],
  ["/core.wasm", "_build/wasm/debug/build/core/core.wasm"],
]);

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function createFixtureServer() {
  const server = createServer(async (request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end("method not allowed");
      return;
    }

    const pathname = new URL(
      request.url ?? "/",
      "http://127.0.0.1",
    ).pathname;

    const relative = ROUTES.get(pathname);
    if (relative === undefined) {
      response.writeHead(404).end("not found");
      return;
    }

    const target = path.resolve(ROOT, relative);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      response.writeHead(404).end("not found");
      return;
    }

    try {
      if (!(await stat(target)).isFile()) throw new Error("not a file");

      response
        .writeHead(200, {
          "Content-Type":
            CONTENT_TYPES.get(path.extname(target)) ??
            "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(await readFile(target));
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });

      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("pointer listener lifecycle server has no address");
      }

      return "http://127.0.0.1:" + address.port;
    },

    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function assertServedProvenance(baseUrl) {
  for (const [route, relative] of ROUTES) {
    if (route === "/") continue;

    const response = await fetch(baseUrl + route, {
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 200, "route did not resolve: " + route);

    const expected = await readFile(path.join(ROOT, relative));
    const actual = Buffer.from(await response.arrayBuffer());

    assert.deepEqual(actual, expected, "served bytes changed: " + route);

    if (route === "/core.wasm") {
      assert.equal(response.headers.get("content-type"), "application/wasm");
    }
  }

  for (const forbidden of [
    "/tools/browser/research_pointer_listener_lifecycle.mjs",
    "/tests/research/pointer_listener_lifecycle_candidates.test.mjs",
    "/_build/wasm/debug/build/core/core.wasm",
  ]) {
    const response = await fetch(baseUrl + forbidden, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404, "unexpected route exposure: " + forbidden);
  }
}

function driverUrl(pathname) {
  return "http://127.0.0.1:" + DRIVER_PORT + pathname;
}

function remaining(deadline) {
  const value = deadline - Date.now();

  if (value <= 0) {
    throw new Error("pointer listener lifecycle research exceeded timeout");
  }

  return Math.min(value, REQUEST_TIMEOUT_MS);
}

async function webdriverRequest(
  method,
  pathname,
  body,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const response = await fetch(driverUrl(pathname), {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json();

  if (!response.ok || payload.value?.error) {
    throw new Error(
      "WebDriver request failed: " +
        method +
        " " +
        pathname +
        " " +
        JSON.stringify(payload.value ?? payload),
    );
  }

  return payload.value;
}

async function waitForDriver(deadline) {
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await webdriverRequest("GET", "/status", undefined, remaining(deadline));
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  throw lastError ?? new Error("ChromeDriver did not become ready");
}

async function createSession(deadline) {
  const value = await webdriverRequest(
    "POST",
    "/session",
    {
      capabilities: {
        alwaysMatch: {
          browserName: "chrome",
          "goog:chromeOptions": {
            args: [
              "--headless=new",
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--no-first-run",
              "--no-default-browser-check",
              "--window-size=900,1000",
            ],
          },
        },
      },
    },
    remaining(deadline),
  );

  assert.equal(typeof value.sessionId, "string");
  return value;
}

async function execute(sessionId, script, args, deadline) {
  return webdriverRequest(
    "POST",
    "/session/" + sessionId + "/execute/sync",
    { script, args },
    remaining(deadline),
  );
}

async function cdp(sessionId, cmd, params, deadline) {
  return webdriverRequest(
    "POST",
    "/session/" + sessionId + "/goog/cdp/execute",
    { cmd, params },
    remaining(deadline),
  );
}

async function control(sessionId, expression, args, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_POINTER_LISTENER_LIFECYCLE_CONTROL__." + expression,
    args,
    deadline,
  );
}

async function waitForReady(sessionId, deadline) {
  while (Date.now() < deadline) {
    const value = await execute(
      sessionId,
      "return window.__WIF_POINTER_LISTENER_LIFECYCLE_RESEARCH__ ?? null;",
      [],
      deadline,
    );

    if (value?.state === "ready") return value;
    if (value?.state === "fail") {
      throw new Error(
        "pointer listener fixture failed: " + JSON.stringify(value),
      );
    }

    await delay(50);
  }

  throw new Error("pointer listener lifecycle fixture did not become ready");
}

async function rectFor(sessionId, id, deadline) {
  return control(
    sessionId,
    "rect(arguments[0]);",
    [id],
    deadline,
  );
}

async function dispatchTouch(sessionId, type, points, deadline) {
  await cdp(
    sessionId,
    "Input.dispatchTouchEvent",
    {
      type,
      touchPoints: points,
    },
    deadline,
  );
}

async function beginTouch(sessionId, id, injectedId, deadline) {
  const rect = await rectFor(sessionId, id, deadline);
  const x = Math.round(rect.centerX);
  const y = Math.round(rect.centerY + 35);

  await dispatchTouch(
    sessionId,
    "touchStart",
    [{ x, y, id: injectedId }],
    deadline,
  );

  await delay(40);

  return { x, y };
}

async function moveTouch(
  sessionId,
  { x, y },
  injectedId,
  deltaY,
  deadline,
) {
  await dispatchTouch(
    sessionId,
    "touchMove",
    [{ x, y: y + deltaY, id: injectedId }],
    deadline,
  );

  await delay(40);
}

async function endTouch(sessionId, deadline) {
  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(100);
}

async function fullUpwardGesture(
  sessionId,
  id,
  injectedId,
  distance,
  deadline,
) {
  const start = await beginTouch(sessionId, id, injectedId, deadline);
  await moveTouch(sessionId, start, injectedId, -distance, deadline);
  await endTouch(sessionId, deadline);
}

function assertRuntime(snapshot, selected) {
  assert.equal(snapshot.selected, selected);
  assert.equal(snapshot.transition, null);
  assert.equal(snapshot.cooldownActive, false);
  assert.equal(snapshot.locked, false);
}

async function deleteSession(sessionId) {
  try {
    await webdriverRequest(
      "DELETE",
      "/session/" + sessionId,
      undefined,
      CLEANUP_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("WebDriver session cleanup failed:", error);
  }
}

async function terminateDriver(driver) {
  if (driver.exitCode !== null) return;

  driver.kill("SIGTERM");
  const exited = once(driver, "exit");
  const forceKill = delay(2_000).then(() => {
    if (driver.exitCode === null) driver.kill("SIGKILL");
  });

  await Promise.race([exited, forceKill]);
}

async function main() {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const server = createFixtureServer();
  let driver = null;
  let sessionId = null;

  try {
    const baseUrl = await server.start();
    await assertServedProvenance(baseUrl);

    driver = spawn("chromedriver", ["--port=" + DRIVER_PORT], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    driver.stdout.on("data", (chunk) =>
      process.stdout.write("[chromedriver] " + chunk),
    );
    driver.stderr.on("data", (chunk) =>
      process.stderr.write("[chromedriver] " + chunk),
    );

    await waitForDriver(deadline);
    const session = await createSession(deadline);
    sessionId = session.sessionId;

    console.log(
      "Pointer listener lifecycle browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Pointer listener lifecycle driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await cdp(
      sessionId,
      "Emulation.setTouchEmulationEnabled",
      { enabled: true, maxTouchPoints: 5 },
      deadline,
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    await waitForReady(sessionId, deadline);

    const cases = {};

    // B1 — explicit target scope.
    await control(
      sessionId,
      "resetObservations(arguments[0]);",
      ["scope"],
      deadline,
    );

    await fullUpwardGesture(sessionId, "scope", 101, 20, deadline);
    cases.scopeInside = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["scope"],
      deadline,
    );

    assert.ok(
      cases.scopeInside.observations.some(
        (event) =>
          event.isTrusted === true &&
          event.type === "pointerdown" &&
          event.currentTargetId === "scope",
      ),
      "explicit scope should observe trusted descendant pointer input",
    );

    const scopeObservationCount = cases.scopeInside.observations.length;

    await fullUpwardGesture(sessionId, "outside", 102, 20, deadline);

    cases.scopeOutside = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["scope"],
      deadline,
    );

    assert.equal(
      cases.scopeOutside.observations.length,
      scopeObservationCount,
      "explicit scope must not observe unrelated outside pointer stream",
    );

    // B2 / B5 / B6 — cleanup during active gesture.
    const beforeCleanupAll = await control(
      sessionId,
      "snapshotAll();",
      [],
      deadline,
    );

    assert.equal(beforeCleanupAll.css.cleanup, "none");

    const cleanupStart = await beginTouch(
      sessionId,
      "cleanup",
      201,
      deadline,
    );

    await moveTouch(
      sessionId,
      cleanupStart,
      201,
      -10,
      deadline,
    );

    cases.cleanupMidGesture = await control(
      sessionId,
      "cleanup(arguments[0]);",
      ["cleanup"],
      deadline,
    );

    assert.equal(cases.cleanupMidGesture.bindingActive, false);
    assert.ok(
      cases.cleanupMidGesture.policy.resets.includes("binding-cleanup"),
      "binding cleanup must abort accumulated host gesture state",
    );
    assert.deepEqual(cases.cleanupMidGesture.policy.activeIds, []);
    assert.equal(cases.cleanupMidGesture.policy.trackedPointerId, null);

    const unrelatedBeforeCompletion = (
      await control(sessionId, "snapshotAll();", [], deadline)
    ).unrelated;

    await moveTouch(
      sessionId,
      cleanupStart,
      201,
      -100,
      deadline,
    );
    await endTouch(sessionId, deadline);

    cases.cleanupAfterOldCompletion = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["cleanup"],
      deadline,
    );
    const unrelatedAfterOldCompletion = (
      await control(sessionId, "snapshotAll();", [], deadline)
    ).unrelated;

    assertRuntime(cases.cleanupAfterOldCompletion.runtime, "A");
    assert.equal(cases.cleanupAfterOldCompletion.decisions.length, 0);
    assert.deepEqual(cases.cleanupAfterOldCompletion.policy.activeIds, []);
    assert.equal(
      unrelatedAfterOldCompletion.pointerup,
      unrelatedBeforeCompletion.pointerup + 1,
      "unrelated listener should survive WIF binding cleanup",
    );

    const cleanupCssAfter = (
      await control(sessionId, "snapshotAll();", [], deadline)
    ).css.cleanup;
    assert.equal(cleanupCssAfter, "none");

    await control(
      sessionId,
      "rebind(arguments[0]);",
      ["cleanup"],
      deadline,
    );

    await fullUpwardGesture(sessionId, "cleanup", 202, 100, deadline);

    cases.cleanupFresh = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["cleanup"],
      deadline,
    );

    assertRuntime(cases.cleanupFresh.runtime, "B");
    assert.equal(cases.cleanupFresh.decisions.length, 1);
    assert.equal(cases.cleanupFresh.decisions[0].intent, "next");
    assert.equal(cases.cleanupFresh.decisions[0].disposition, "accepted");

    // B3 — target replacement during active gesture.
    const replacementStart = await beginTouch(
      sessionId,
      "replacement-a",
      301,
      deadline,
    );

    await moveTouch(
      sessionId,
      replacementStart,
      301,
      -10,
      deadline,
    );

    cases.replacementAtSwitch = await control(
      sessionId,
      "replaceToB();",
      [],
      deadline,
    );

    assert.equal(cases.replacementAtSwitch.targetId, "replacement-b");
    assert.ok(
      cases.replacementAtSwitch.policy.resets.includes("binding-cleanup"),
    );
    assert.deepEqual(cases.replacementAtSwitch.policy.activeIds, []);
    assert.equal(cases.replacementAtSwitch.policy.trackedPointerId, null);

    const replacementObservationCount =
      cases.replacementAtSwitch.observations.length;

    await moveTouch(
      sessionId,
      replacementStart,
      301,
      -110,
      deadline,
    );
    await endTouch(sessionId, deadline);

    cases.replacementOldCompleted = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["replacement"],
      deadline,
    );

    assertRuntime(cases.replacementOldCompleted.runtime, "A");
    assert.equal(cases.replacementOldCompleted.decisions.length, 0);
    assert.equal(
      cases.replacementOldCompleted.observations.length,
      replacementObservationCount,
      "old captured sequence must not leak into replacement target binding",
    );

    await fullUpwardGesture(
      sessionId,
      "replacement-b",
      302,
      100,
      deadline,
    );

    cases.replacementFresh = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["replacement"],
      deadline,
    );

    assertRuntime(cases.replacementFresh.runtime, "B");
    assert.equal(cases.replacementFresh.decisions.length, 1);
    assert.equal(cases.replacementFresh.decisions[0].intent, "next");
    assert.equal(
      cases.replacementFresh.decisions[0].disposition,
      "accepted",
    );

    // B4 — UA pointercancel is independent from application cleanup.
    await fullUpwardGesture(
      sessionId,
      "ua-auto",
      401,
      140,
      deadline,
    );

    cases.uaAuto = await control(
      sessionId,
      "snapshot(arguments[0]);",
      ["ua-auto"],
      deadline,
    );

    assertRuntime(cases.uaAuto.runtime, "A");
    assert.equal(cases.uaAuto.decisions.length, 0);
    assert.ok(
      cases.uaAuto.observations.some(
        (event) =>
          event.isTrusted === true &&
          event.type === "pointercancel",
      ),
      "browser-owned direct manipulation should expose trusted pointercancel",
    );
    assert.ok(
      cases.uaAuto.policy.resets.includes("pointercancel"),
      "pointercancel must reset accumulated host gesture state",
    );
    assert.deepEqual(cases.uaAuto.policy.activeIds, []);
    assert.equal(cases.uaAuto.policy.trackedPointerId, null);
    assert.ok(
      cases.uaAuto.scrollTop > 0,
      "touch-action:auto witness should retain native scrolling",
    );

    const finalState = await control(
      sessionId,
      "finish();",
      [],
      deadline,
    );

    assert.equal(finalState.css.scope, "none");
    assert.equal(finalState.css.outside, "none");
    assert.equal(finalState.css.cleanup, "none");
    assert.equal(finalState.css.replacementA, "none");
    assert.equal(finalState.css.replacementB, "none");
    assert.equal(finalState.css.uaAuto, "auto");

    console.log(
      "Trusted pointer listener lifecycle research PASS:",
      JSON.stringify({ cases, finalState }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
