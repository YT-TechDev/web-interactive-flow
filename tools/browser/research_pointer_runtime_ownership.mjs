import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9525;
const OVERALL_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const ROUTES = new Map([
  ["/", "tests/browser/pointer-runtime-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/pointer-runtime-research/main.mjs"],
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
      if (!(await stat(target)).isFile()) {
        throw new Error("not a file");
      }

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
        throw new Error("pointer Runtime research server has no address");
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
    "/packages/r3f-interactive-flow/src/input/useTouchInput.ts",
    "/tools/browser/research_direct_manipulation_pointer_touch.mjs",
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
    throw new Error("pointer Runtime research exceeded overall timeout");
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
              "--window-size=900,900",
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
    "return window.__WIF_POINTER_RUNTIME_CONTROL__." + expression,
    args,
    deadline,
  );
}

async function waitForReady(sessionId, deadline) {
  while (Date.now() < deadline) {
    const value = await execute(
      sessionId,
      "return window.__WIF_POINTER_RUNTIME_RESEARCH__ ?? null;",
      [],
      deadline,
    );

    if (value?.state === "ready") return value;
    if (value?.state === "fail") {
      throw new Error("pointer Runtime fixture failed: " + JSON.stringify(value));
    }

    await delay(50);
  }

  throw new Error("pointer Runtime fixture did not become ready");
}

async function dispatchTouch(sessionId, type, touchPoints, deadline) {
  await cdp(
    sessionId,
    "Input.dispatchTouchEvent",
    { type, touchPoints },
    deadline,
  );
}

async function rectFor(sessionId, id, deadline) {
  return control(
    sessionId,
    "rect(arguments[0]);",
    [id],
    deadline,
  );
}

async function snapshot(sessionId, id, deadline) {
  return control(
    sessionId,
    "snapshot(arguments[0]);",
    [id],
    deadline,
  );
}

async function resetObservations(sessionId, id, deadline) {
  return control(
    sessionId,
    "resetObservations(arguments[0]);",
    [id],
    deadline,
  );
}

async function setTouchAction(sessionId, id, value, deadline) {
  return control(
    sessionId,
    "setTouchAction(arguments[0], arguments[1]);",
    [id, value],
    deadline,
  );
}

async function performTouchDrag(
  sessionId,
  id,
  {
    direction = "up",
    distance = 120,
    pointerId = 1,
    steps = 10,
  } = {},
  deadline,
) {
  const rect = await rectFor(sessionId, id, deadline);
  const x = Math.round(rect.centerX);
  const startY = Math.round(rect.centerY);
  const sign = direction === "up" ? -1 : 1;

  await dispatchTouch(
    sessionId,
    "touchStart",
    [{ x, y: startY, id: pointerId }],
    deadline,
  );

  for (let index = 1; index <= steps; index += 1) {
    const y = Math.round(
      startY + sign * distance * (index / steps),
    );
    await dispatchTouch(
      sessionId,
      "touchMove",
      [{ x, y, id: pointerId }],
      deadline,
    );
    await delay(18);
  }

  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(180);

  return snapshot(sessionId, id, deadline);
}

async function performMultiTouchThenEnd(sessionId, id, deadline) {
  const rect = await rectFor(sessionId, id, deadline);
  const x = Math.round(rect.centerX);
  const y = Math.round(rect.centerY);

  await dispatchTouch(
    sessionId,
    "touchStart",
    [
      { x: x - 30, y, id: 31 },
      { x: x + 30, y, id: 32 },
    ],
    deadline,
  );

  await delay(30);

  await dispatchTouch(
    sessionId,
    "touchMove",
    [
      { x: x - 30, y: y - 80, id: 31 },
      { x: x + 30, y: y - 80, id: 32 },
    ],
    deadline,
  );

  await delay(30);
  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(100);

  return snapshot(sessionId, id, deadline);
}

async function performMouseDrag(sessionId, id, deadline) {
  const rect = await rectFor(sessionId, id, deadline);
  const x = Math.round(rect.centerX);
  const y = Math.round(rect.centerY);

  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "pointer",
          id: "mouse-runtime-control",
          parameters: { pointerType: "mouse" },
          actions: [
            {
              type: "pointerMove",
              duration: 0,
              x,
              y,
              origin: "viewport",
            },
            { type: "pointerDown", button: 0 },
            {
              type: "pointerMove",
              duration: 80,
              x,
              y: y - 100,
              origin: "viewport",
            },
            { type: "pointerUp", button: 0 },
          ],
        },
      ],
    },
    remaining(deadline),
  );

  await delay(100);
  return snapshot(sessionId, id, deadline);
}

function assertRuntime(state, selected) {
  assert.equal(state.runtime.selected, selected);
  assert.equal(state.runtime.transition, null);
  assert.equal(state.runtime.cooldownActive, false);
  assert.equal(state.runtime.locked, false);
}

function assertGestureReset(state) {
  assert.deepEqual(state.gesture, {
    activeIds: [],
    trackedPointerId: null,
    startY: null,
    lastY: null,
    invalid: false,
  });
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
    console.error("WebDriver cleanup failed:", error);
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
      "Pointer Runtime research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Pointer Runtime research driver: " +
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

    await resetObservations(sessionId, "sequence", deadline);
    cases.browserOwned = await performTouchDrag(
      sessionId,
      "sequence",
      { direction: "up", pointerId: 1 },
      deadline,
    );

    assertRuntime(cases.browserOwned, "A");
    assertGestureReset(cases.browserOwned);
    assert.equal(cases.browserOwned.decisions.length, 0);
    assert.ok(
      cases.browserOwned.observations.some(
        (event) =>
          event.type === "pointercancel" &&
          event.isTrusted === true &&
          event.pointerType === "touch",
      ),
      "browser-owned touch-action:auto gesture should cancel the pointer stream",
    );
    assert.ok(
      cases.browserOwned.scrollTop > 0,
      "browser-owned touch-action:auto gesture should scroll natively",
    );

    const scrollAfterBrowserOwned = cases.browserOwned.scrollTop;
    const newTouchAction = await setTouchAction(
      sessionId,
      "sequence",
      "none",
      deadline,
    );
    assert.equal(newTouchAction, "none");

    await resetObservations(sessionId, "sequence", deadline);
    cases.freshOwned = await performTouchDrag(
      sessionId,
      "sequence",
      { direction: "up", pointerId: 2 },
      deadline,
    );

    assertRuntime(cases.freshOwned, "B");
    assertGestureReset(cases.freshOwned);
    assert.equal(cases.freshOwned.decisions.length, 1);
    assert.equal(cases.freshOwned.decisions[0].label, "sequence");
    assert.equal(cases.freshOwned.decisions[0].intent, "next");
    assert.equal(cases.freshOwned.decisions[0].disposition, "accepted");
    assert.equal(cases.freshOwned.decisions[0].eventType, "pointerup");
    assert.equal(cases.freshOwned.decisions[0].pointerType, "touch");
    assert.equal(cases.freshOwned.decisions[0].defaultPrevented, false);
    assert.equal(
      typeof cases.freshOwned.decisions[0].pointerId,
      "number",
      "PointerEvent.pointerId is browser-assigned identity and must not be equated with the CDP touch injection id",
    );
    assert.equal(
      cases.freshOwned.scrollTop,
      scrollAfterBrowserOwned,
      "touch-action:none fresh gesture should not add native scroll",
    );
    assert.ok(
      cases.freshOwned.observations.every(
        (event) => event.defaultPrevented === false,
      ),
      "research pointer ownership should not use PointerEvent preventDefault for panning ownership",
    );

    await resetObservations(sessionId, "rejected", deadline);
    cases.semanticRejected = await performTouchDrag(
      sessionId,
      "rejected",
      { direction: "down", pointerId: 3 },
      deadline,
    );

    assertRuntime(cases.semanticRejected, "A");
    assertGestureReset(cases.semanticRejected);
    assert.equal(cases.semanticRejected.decisions.length, 1);
    assert.equal(cases.semanticRejected.decisions[0].intent, "previous");
    assert.equal(
      cases.semanticRejected.decisions[0].disposition,
      "rejected",
    );
    assert.equal(
      cases.semanticRejected.decisions[0].defaultPrevented,
      false,
    );
    assert.equal(cases.semanticRejected.scrollTop, 0);

    await resetObservations(sessionId, "multi", deadline);
    cases.multiInvalid = await performMultiTouchThenEnd(
      sessionId,
      "multi",
      deadline,
    );

    assertRuntime(cases.multiInvalid, "A");
    assertGestureReset(cases.multiInvalid);
    assert.equal(cases.multiInvalid.decisions.length, 0);
    assert.ok(
      cases.multiInvalid.observations.some(
        (event) =>
          event.type === "pointerdown" &&
          event.pointerType === "touch" &&
          event.isPrimary === false,
      ),
      "multi-pointer invalidation witness should observe a non-primary touch pointer",
    );

    await resetObservations(sessionId, "multi", deadline);
    cases.multiFresh = await performTouchDrag(
      sessionId,
      "multi",
      { direction: "up", pointerId: 33 },
      deadline,
    );

    assertRuntime(cases.multiFresh, "B");
    assertGestureReset(cases.multiFresh);
    assert.equal(cases.multiFresh.decisions.length, 1);
    assert.equal(cases.multiFresh.decisions[0].intent, "next");
    assert.equal(cases.multiFresh.decisions[0].disposition, "accepted");

    await resetObservations(sessionId, "mouse", deadline);
    cases.mouseDecline = await performMouseDrag(
      sessionId,
      "mouse",
      deadline,
    );

    assertRuntime(cases.mouseDecline, "A");
    assertGestureReset(cases.mouseDecline);
    assert.ok(
      cases.mouseDecline.decisions.some(
        (decision) =>
          decision.reason === "pointer-type-decline" &&
          decision.pointerType === "mouse" &&
          decision.intent === null &&
          decision.disposition === null,
      ),
      "research policy should expose mouse pointer input without turning it into semantic navigation",
    );

    const finished = await control(
      sessionId,
      "finish();",
      [],
      deadline,
    );

    console.log(
      "Trusted pointer Runtime ownership research PASS:",
      JSON.stringify({ cases, finished }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
