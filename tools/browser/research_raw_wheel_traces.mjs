import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FIXTURE = path.join(ROOT, "tests/browser/raw-wheel-research/index.html");
const DRIVER_PORT = 9518;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const WEBDRIVER_CONTROL_KEY = "\uE009";

function createServerForFixture() {
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

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    }).end(await readFile(FIXTURE));
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });

      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("raw wheel research server has no address");
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
    throw new Error("raw wheel research exceeded overall timeout");
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
            ],
          },
        },
      },
    },
    remaining(deadline),
  );

  if (typeof value.sessionId !== "string") {
    throw new Error("WebDriver session did not return a session id");
  }

  return value;
}

async function execute(sessionId, script, deadline) {
  return webdriverRequest(
    "POST",
    "/session/" + sessionId + "/execute/sync",
    { script, args: [] },
    remaining(deadline),
  );
}

async function getTargetElement(sessionId, deadline) {
  const value = await execute(
    sessionId,
    'return document.getElementById("wheel-target");',
    deadline,
  );

  assert.ok(value && typeof value === "object");
  assert.equal(typeof value[ELEMENT_KEY], "string");
  return value;
}

async function resetTrace(sessionId, deadline) {
  await execute(
    sessionId,
    "window.__WIF_RAW_WHEEL_TRACE__.reset(); return true;",
    deadline,
  );
}

async function readTrace(sessionId, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_RAW_WHEEL_TRACE__.snapshot();",
    deadline,
  );
}

async function performWheel(
  sessionId,
  element,
  { deltaX, deltaY, duration = 0, id },
  deadline,
) {
  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "wheel",
          id,
          actions: [
            {
              type: "scroll",
              x: 0,
              y: 0,
              deltaX,
              deltaY,
              duration,
              origin: element,
            },
          ],
        },
      ],
    },
    remaining(deadline),
  );
}

async function performCtrlWheel(
  sessionId,
  element,
  { deltaX, deltaY, id },
  deadline,
) {
  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "key",
          id: id + "-keyboard",
          actions: [
            { type: "keyDown", value: WEBDRIVER_CONTROL_KEY },
            { type: "pause", duration: 0 },
            { type: "keyUp", value: WEBDRIVER_CONTROL_KEY },
          ],
        },
        {
          type: "wheel",
          id: id + "-wheel",
          actions: [
            { type: "pause", duration: 0 },
            {
              type: "scroll",
              x: 0,
              y: 0,
              deltaX,
              deltaY,
              duration: 0,
              origin: element,
            },
            { type: "pause", duration: 0 },
          ],
        },
      ],
    },
    remaining(deadline),
  );
}

async function releaseActions(sessionId, deadline) {
  await webdriverRequest(
    "DELETE",
    "/session/" + sessionId + "/actions",
    undefined,
    remaining(deadline),
  );
}

function assertCommonEvent(event, { ctrlKey = false } = {}) {
  assert.equal(event.isTrusted, true);
  assert.equal(event.deltaMode, 0);
  assert.equal(event.ctrlKey, ctrlKey);
  assert.equal(event.shiftKey, false);
  assert.equal(event.altKey, false);
  assert.equal(event.metaKey, false);
  assert.equal(event.targetId, "wheel-content");
  assert.equal(event.currentTargetId, "wheel-target");
  assert.equal(typeof event.cancelable, "boolean");
  assert.equal(typeof event.timeStamp, "number");
  assert.ok(event.timeStamp >= 0);
}

function summarizeTrace(trace) {
  return {
    eventCount: trace.events.length,
    events: trace.events,
    scrollTop: trace.scrollTop,
    scrollLeft: trace.scrollLeft,
    viewport: trace.viewport,
  };
}

async function collectCase(
  sessionId,
  element,
  spec,
  deadline,
) {
  await resetTrace(sessionId, deadline);
  await performWheel(sessionId, element, spec, deadline);
  await delay(100);
  const trace = await readTrace(sessionId, deadline);

  assert.ok(trace.events.length >= 1, spec.id + " produced no wheel events");
  for (const event of trace.events) {
    assertCommonEvent(event);
  }

  return summarizeTrace(trace);
}

async function collectCtrlWheelCase(
  sessionId,
  element,
  spec,
  deadline,
) {
  await resetTrace(sessionId, deadline);
  const before = await readTrace(sessionId, deadline);

  try {
    await performCtrlWheel(sessionId, element, spec, deadline);
    await delay(100);
    const after = await readTrace(sessionId, deadline);

    assert.ok(after.events.length >= 1, spec.id + " produced no wheel events");
    for (const event of after.events) {
      assertCommonEvent(event, { ctrlKey: true });
    }

    return {
      ...summarizeTrace(after),
      viewportBefore: before.viewport,
      viewportAfter: after.viewport,
      viewportChanged:
        JSON.stringify(before.viewport) !== JSON.stringify(after.viewport),
    };
  } finally {
    await releaseActions(sessionId, deadline);
  }
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
  const server = createServerForFixture();
  let driver = null;
  let sessionId = null;

  try {
    const baseUrl = await server.start();

    driver = spawn("chromedriver", ["--port=" + DRIVER_PORT], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    driver.stdout.on("data", (chunk) => process.stdout.write("[chromedriver] " + chunk));
    driver.stderr.on("data", (chunk) => process.stderr.write("[chromedriver] " + chunk));

    await waitForDriver(deadline);

    const session = await createSession(deadline);
    sessionId = session.sessionId;

    console.log(
      "Raw wheel research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Raw wheel research driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    const element = await getTargetElement(sessionId, deadline);

    const cases = {};
    for (const spec of [
      { id: "y-small-positive", deltaX: 0, deltaY: 1 },
      { id: "y-small-negative", deltaX: 0, deltaY: -1 },
      { id: "x-small-positive", deltaX: 1, deltaY: 0 },
      { id: "diagonal", deltaX: 5, deltaY: 7 },
      { id: "y-large", deltaX: 0, deltaY: 120 },
      { id: "y-duration", deltaX: 0, deltaY: 120, duration: 120 },
    ]) {
      cases[spec.id] = await collectCase(
        sessionId,
        element,
        spec,
        deadline,
      );
    }

    assert.ok(
      cases["y-small-positive"].events.some((event) => event.deltaY > 0),
    );
    assert.ok(
      cases["y-small-negative"].events.some((event) => event.deltaY < 0),
    );
    assert.ok(
      cases["x-small-positive"].events.some((event) => event.deltaX > 0),
    );
    assert.ok(
      cases.diagonal.events.some(
        (event) => event.deltaX !== 0 && event.deltaY !== 0,
      ),
    );

    const ctrlModified = await collectCtrlWheelCase(
      sessionId,
      element,
      {
        id: "ctrl-y-positive",
        deltaX: 0,
        deltaY: 120,
      },
      deadline,
    );

    assert.ok(ctrlModified.events.every((event) => event.ctrlKey === true));

    const momentumExposure = Object.fromEntries(
      Object.entries(cases).map(([name, trace]) => [
        name,
        trace.events.map((event) => ({
          supported: event.momentumSupported,
          value: event.momentum,
        })),
      ]),
    );

    console.log(
      "Trusted virtualized raw wheel traces PASS:",
      JSON.stringify({ cases, ctrlModified, momentumExposure }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
