import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FIXTURE = path.join(
  ROOT,
  "tests/browser/direct-manipulation-research/index.html",
);
const DRIVER_PORT = 9524;
const OVERALL_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

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

    if (pathname !== "/") {
      response.writeHead(404).end("not found");
      return;
    }

    response
      .writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      })
      .end(await readFile(FIXTURE));
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });

      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("direct-manipulation research server has no address");
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

function driverUrl(pathname) {
  return "http://127.0.0.1:" + DRIVER_PORT + pathname;
}

function remaining(deadline) {
  const value = deadline - Date.now();
  if (value <= 0) {
    throw new Error("direct-manipulation research exceeded overall timeout");
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

async function reset(sessionId, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_DIRECT_MANIPULATION_RESEARCH__.reset();",
    [],
    deadline,
  );
}

async function snapshot(sessionId, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_DIRECT_MANIPULATION_RESEARCH__.snapshot();",
    [],
    deadline,
  );
}

async function rectFor(sessionId, id, deadline) {
  return execute(
    sessionId,
    "document.getElementById(arguments[0]).scrollIntoView({block:'center'}); return window.__WIF_DIRECT_MANIPULATION_RESEARCH__.rect(arguments[0]);",
    [id],
    deadline,
  );
}

async function dispatchTouch(sessionId, type, touchPoints, deadline) {
  await cdp(
    sessionId,
    "Input.dispatchTouchEvent",
    {
      type,
      touchPoints,
    },
    deadline,
  );
}

async function performVerticalTouchDrag(
  sessionId,
  id,
  {
    distance = 140,
    steps = 12,
    xOffset = 0,
    mutateAfterDown = false,
  } = {},
  deadline,
) {
  const rect = await rectFor(sessionId, id, deadline);

  if (mutateAfterDown) {
    await execute(
      sessionId,
      "return window.__WIF_DIRECT_MANIPULATION_RESEARCH__.enableMutationAfterPointerDown();",
      [],
      deadline,
    );
  }

  const startX = Math.round(rect.centerX);
  const startY = Math.round(rect.centerY + 45);

  await dispatchTouch(
    sessionId,
    "touchStart",
    [{ x: startX, y: startY, id: 1 }],
    deadline,
  );

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await dispatchTouch(
      sessionId,
      "touchMove",
      [
        {
          x: Math.round(startX + xOffset * progress),
          y: Math.round(startY - distance * progress),
          id: 1,
        },
      ],
      deadline,
    );
    await delay(18);
  }

  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(180);

  return snapshot(sessionId, deadline);
}

async function performCaptureEscape(sessionId, deadline) {
  const rect = await rectFor(sessionId, "none", deadline);
  const startX = Math.round(rect.centerX);
  const startY = Math.round(rect.centerY);

  await dispatchTouch(
    sessionId,
    "touchStart",
    [{ x: startX, y: startY, id: 11 }],
    deadline,
  );
  await delay(30);

  await dispatchTouch(
    sessionId,
    "touchMove",
    [{ x: 5, y: Math.max(10, startY - 60), id: 11 }],
    deadline,
  );
  await delay(40);

  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(80);

  return snapshot(sessionId, deadline);
}

async function performMultiTouch(sessionId, deadline) {
  const rect = await rectFor(sessionId, "none", deadline);
  const x = Math.round(rect.centerX);
  const y = Math.round(rect.centerY);

  await dispatchTouch(
    sessionId,
    "touchStart",
    [
      { x: x - 25, y, id: 21 },
      { x: x + 25, y, id: 22 },
    ],
    deadline,
  );
  await delay(40);

  await dispatchTouch(
    sessionId,
    "touchMove",
    [
      { x: x - 25, y: y - 35, id: 21 },
      { x: x + 25, y: y - 35, id: 22 },
    ],
    deadline,
  );
  await delay(40);

  await dispatchTouch(sessionId, "touchEnd", [], deadline);
  await delay(80);

  return snapshot(sessionId, deadline);
}

async function performMouseDrag(sessionId, deadline) {
  const rect = await rectFor(sessionId, "mouse", deadline);
  const x = Math.round(rect.centerX);
  const y = Math.round(rect.centerY);

  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "pointer",
          id: "mouse-control",
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
              y: y - 80,
              origin: "viewport",
            },
            { type: "pointerUp", button: 0 },
          ],
        },
      ],
    },
    remaining(deadline),
  );

  await delay(80);
  return snapshot(sessionId, deadline);
}

function eventsFor(state, id, type) {
  return state.pointerEvents.filter(
    (event) =>
      event.currentTargetId === id &&
      (type === undefined || event.type === type),
  );
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
      "Direct-manipulation research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Direct-manipulation research driver: " +
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

    const cases = {};

    await reset(sessionId, deadline);
    cases.auto = await performVerticalTouchDrag(
      sessionId,
      "auto",
      {},
      deadline,
    );

    assert.ok(
      eventsFor(cases.auto, "auto", "pointerdown").some(
        (event) =>
          event.isTrusted === true &&
          event.pointerType === "touch" &&
          event.isPrimary === true,
      ),
      "auto should receive a trusted primary touch pointerdown",
    );
    assert.ok(
      cases.auto.touchEvents.some(
        (event) =>
          event.currentTargetId === "auto" &&
          event.type === "touchstart" &&
          event.isTrusted === true,
      ),
      "one injected touch sequence should also expose trusted TouchEvent evidence in qualified Chrome",
    );
    assert.ok(
      cases.auto.regions.auto.scrollTop > 0,
      "touch-action:auto vertical gesture should permit native scrolling",
    );
    assert.ok(
      eventsFor(cases.auto, "auto", "pointercancel").length >= 1,
      "browser-owned direct manipulation should cancel the pointer stream",
    );

    await reset(sessionId, deadline);
    cases.none = await performVerticalTouchDrag(
      sessionId,
      "none",
      {},
      deadline,
    );

    assert.equal(cases.none.regions.none.touchAction, "none");
    assert.equal(
      cases.none.regions.none.scrollTop,
      0,
      "touch-action:none should suppress native direct-manipulation scrolling",
    );
    assert.ok(
      eventsFor(cases.none, "none", "pointermove").length >= 1,
      "touch-action:none should keep pointer movement observable",
    );
    assert.ok(
      eventsFor(cases.none, "none", "pointerup").length >= 1,
      "touch-action:none should complete the pointer stream",
    );
    assert.equal(
      eventsFor(cases.none, "none", "pointercancel").length,
      0,
      "touch-action:none witness should not be canceled for browser panning",
    );

    await reset(sessionId, deadline);
    cases.panY = await performVerticalTouchDrag(
      sessionId,
      "pan-y",
      {},
      deadline,
    );

    assert.equal(cases.panY.regions["pan-y"].touchAction, "pan-y");
    assert.ok(
      cases.panY.regions["pan-y"].scrollTop > 0,
      "touch-action:pan-y should permit the qualified vertical pan",
    );
    assert.ok(
      eventsFor(cases.panY, "pan-y", "pointercancel").length >= 1,
      "browser-owned pan-y gesture should cancel the pointer stream",
    );

    await reset(sessionId, deadline);
    cases.mutatedAfterDown = await performVerticalTouchDrag(
      sessionId,
      "mutate",
      { mutateAfterDown: true },
      deadline,
    );

    assert.equal(cases.mutatedAfterDown.regions.mutate.touchAction, "none");
    assert.ok(
      cases.mutatedAfterDown.regions.mutate.scrollTop > 0,
      "changing touch-action after pointerdown should not retroactively steal the active gesture from the browser",
    );
    assert.ok(
      eventsFor(
        cases.mutatedAfterDown,
        "mutate",
        "pointercancel",
      ).length >= 1,
      "mutated active auto gesture should still show browser takeover/cancellation",
    );

    await reset(sessionId, deadline);
    cases.captureEscape = await performCaptureEscape(sessionId, deadline);

    const escapeMoves = eventsFor(
      cases.captureEscape,
      "none",
      "pointermove",
    );
    assert.ok(escapeMoves.length >= 1);
    assert.ok(
      escapeMoves.some(
        (event) =>
          event.targetId === "none" &&
          event.hasCapture === true,
      ),
      "direct-manipulation pointer movement outside visual bounds should remain routed through implicit pointer capture in the qualified witness",
    );
    assert.ok(
      eventsFor(
        cases.captureEscape,
        "none",
        "gotpointercapture",
      ).length >= 1,
      "qualified direct-manipulation stream should expose implicit gotpointercapture",
    );
    assert.ok(
      eventsFor(
        cases.captureEscape,
        "none",
        "lostpointercapture",
      ).length >= 1,
      "capture should be released when the direct-manipulation stream ends",
    );

    await reset(sessionId, deadline);
    cases.multiTouch = await performMultiTouch(sessionId, deadline);

    const multiDowns = eventsFor(
      cases.multiTouch,
      "none",
      "pointerdown",
    ).filter((event) => event.pointerType === "touch");

    assert.ok(
      multiDowns.length >= 2,
      "multi-touch witness should expose at least two touch pointerdown events",
    );
    assert.ok(
      multiDowns.some((event) => event.isPrimary === true),
      "multi-touch witness should contain a primary pointer",
    );
    assert.ok(
      multiDowns.some((event) => event.isPrimary === false),
      "multi-touch witness should also contain a non-primary pointer",
    );

    await reset(sessionId, deadline);
    cases.mouse = await performMouseDrag(sessionId, deadline);

    assert.ok(
      eventsFor(cases.mouse, "mouse", "pointerdown").some(
        (event) =>
          event.isTrusted === true &&
          event.pointerType === "mouse",
      ),
      "mouse control should expose trusted pointerType=mouse",
    );
    assert.equal(
      cases.mouse.touchEvents.length,
      0,
      "mouse pointer control should not synthesize a TouchEvent stream",
    );

    console.log(
      "Trusted direct-manipulation pointer/touch research PASS:",
      JSON.stringify({ cases }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
