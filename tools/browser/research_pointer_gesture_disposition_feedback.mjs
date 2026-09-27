import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9528;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const ROUTES = new Map([
  ["/", "tests/browser/pointer-gesture-feedback-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/pointer-gesture-feedback-research/main.mjs"],
  ["/adapters/dom/pointer_listener.mjs", "adapters/dom/pointer_listener.mjs"],
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
        throw new Error("gesture feedback server has no address");
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
  if (value <= 0) throw new Error("gesture feedback research timed out");
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

  assert.equal(typeof value.sessionId, "string");
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

async function waitForResult(sessionId, deadline) {
  while (Date.now() < deadline) {
    const value = await execute(
      sessionId,
      "return window.__WIF_POINTER_GESTURE_FEEDBACK_RESEARCH__ ?? null;",
      deadline,
    );

    if (value?.state === "pass") return value.details;
    if (value?.state === "fail") {
      throw new Error("fixture failed: " + JSON.stringify(value.details));
    }

    await delay(50);
  }

  throw new Error("gesture feedback fixture did not complete");
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

    driver = spawn("chromedriver", ["--port=" + DRIVER_PORT], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForDriver(deadline);

    const session = await createSession(deadline);
    sessionId = session.sessionId;

    console.log(
      "Gesture feedback research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Gesture feedback research driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    const cases = await waitForResult(sessionId, deadline);

    assertRuntime(cases.duplicate.runtime, "C");
    assert.deepEqual(cases.duplicate.decisions, [
      { intent: "next", disposition: "accepted" },
      { intent: "next", disposition: "accepted" },
    ]);

    assertRuntime(cases.proposal.runtime, "C");
    assert.deepEqual(cases.proposal.decisions, [
      { intent: "next", disposition: "rejected" },
    ]);
    assert.equal(cases.proposal.policy.committed, true);

    assertRuntime(cases.acceptedReversal.runtime, "B");
    assert.deepEqual(cases.acceptedReversal.decisions, [
      { intent: "next", disposition: "rejected" },
      { intent: "previous", disposition: "accepted" },
    ]);
    assert.deepEqual(cases.acceptedReversal.policy.dispositions, [
      { intent: "next", disposition: "rejected" },
      { intent: "previous", disposition: "accepted" },
    ]);
    assert.equal(cases.acceptedReversal.policy.committed, true);

    assertRuntime(cases.acceptedConsume.runtime, "B");
    assert.deepEqual(cases.acceptedConsume.decisions, [
      { intent: "next", disposition: "accepted" },
    ]);
    assert.equal(cases.acceptedConsume.policy.committed, true);

    for (const value of Object.values(cases)) {
      assert.equal(
        value.events.every((event) => event.isTrusted === false),
        true,
        "synthetic composition witness must remain explicitly untrusted",
      );
    }

    console.log(
      "Pointer gesture disposition feedback research PASS:",
      JSON.stringify(cases),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
