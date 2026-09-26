import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const QUALIFICATION_TIMEOUT_MS = 90_000;
const WEBDRIVER_REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_REQUEST_TIMEOUT_MS = 10_000;
const DRIVER_PORT = 9516;

const ROUTES = new Map([
  ["/", "tests/browser/dom-listener-qualification/index.html"],
  ["/fixture/main.mjs", "tests/browser/dom-listener-qualification/main.mjs"],
  ["/adapters/dom/wheel_listener.mjs", "adapters/dom/wheel_listener.mjs"],
  ["/bridge/wheel_ownership.mjs", "bridge/wheel_ownership.mjs"],
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

function assertRouteAuthority() {
  assert.deepEqual([...ROUTES.keys()], [
    "/",
    "/fixture/main.mjs",
    "/adapters/dom/wheel_listener.mjs",
    "/bridge/wheel_ownership.mjs",
    "/bridge/runtime.mjs",
    "/bridge/module_compiler.mjs",
    "/bridge/internal.mjs",
    "/core.wasm",
  ]);

  for (const [route, relative] of ROUTES) {
    assert.ok(route.startsWith("/"));
    assert.equal(path.isAbsolute(relative), false);
    assert.equal(relative.split(/[\\/]/).includes(".."), false);
  }
}

function createSourceQualificationServer() {
  assertRouteAuthority();

  const server = createServer(async (request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end("method not allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
    } catch {
      response.writeHead(400).end("bad request");
      return;
    }

    const relative = ROUTES.get(pathname);
    if (relative === undefined) {
      response.writeHead(404).end("not found");
      return;
    }

    const target = path.resolve(REPOSITORY_ROOT, relative);
    if (
      target !== REPOSITORY_ROOT &&
      !target.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
    ) {
      response.writeHead(404).end("not found");
      return;
    }

    try {
      if (!(await stat(target)).isFile()) {
        throw new Error("not a file");
      }

      const body = await readFile(target);
      response
        .writeHead(200, {
          "Content-Type":
            CONTENT_TYPES.get(path.extname(target)) ??
            "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(body);
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
        throw new Error("source qualification server has no TCP address");
      }

      return `http://127.0.0.1:${address.port}`;
    },

    async close() {
      if (!server.listening) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

async function assertServedProvenance(baseUrl) {
  for (const [route, relative] of ROUTES) {
    if (route === "/") {
      continue;
    }

    const response = await fetch(`${baseUrl}${route}`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200, `route did not resolve: ${route}`);

    const expected = await readFile(path.join(REPOSITORY_ROOT, relative));
    const actual = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(actual, expected, `served bytes changed: ${route}`);

    if (route === "/core.wasm") {
      assert.equal(
        response.headers.get("content-type"),
        "application/wasm",
        "core.wasm must be served with exact Wasm MIME",
      );
    }
  }

  for (const forbidden of [
    "/bridge/frame_scheduler.mjs",
    "/adapters/r3f/use_flow_frame.mjs",
    "/_build/wasm/debug/build/core/core.wasm",
    "/tests/dom/wheel_listener.test.mjs",
    "/tools/browser/qualify_real_browser.mjs",
  ]) {
    const response = await fetch(`${baseUrl}${forbidden}`, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404, `unexpected route exposure: ${forbidden}`);
  }
}

function driverUrl(pathname) {
  return `http://127.0.0.1:${DRIVER_PORT}${pathname}`;
}

function remainingRequestTimeout(deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error("DOM listener browser qualification exceeded overall timeout");
  }
  return Math.min(WEBDRIVER_REQUEST_TIMEOUT_MS, remaining);
}

async function webdriverRequest(
  method,
  pathname,
  body,
  timeoutMs = WEBDRIVER_REQUEST_TIMEOUT_MS,
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
      `WebDriver ${method} ${pathname} failed: ${JSON.stringify(
        payload.value ?? payload,
      )}`,
    );
  }

  return payload.value;
}

async function waitForDriver(deadline) {
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await webdriverRequest(
        "GET",
        "/status",
        undefined,
        remainingRequestTimeout(deadline),
      );
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        break;
      }
      await delay(100);
    }
  }

  throw lastError ?? new Error("ChromeDriver did not become ready");
}

async function createWebDriverSession(deadline) {
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
    remainingRequestTimeout(deadline),
  );

  if (typeof value.sessionId !== "string") {
    throw new Error("WebDriver session did not return a session id");
  }

  return value;
}

async function deleteWebDriverSession(sessionId) {
  try {
    await webdriverRequest(
      "DELETE",
      `/session/${sessionId}`,
      undefined,
      CLEANUP_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("WebDriver session cleanup failed:", error);
  }
}

async function terminateDriver(driver) {
  if (driver.exitCode !== null) {
    return;
  }

  driver.kill("SIGTERM");

  const exited = once(driver, "exit");
  const forceKill = delay(2_000).then(() => {
    if (driver.exitCode === null) {
      driver.kill("SIGKILL");
    }
  });

  await Promise.race([exited, forceKill]);
}

function assertInitialSnapshot(snapshot) {
  assert.deepEqual(snapshot, {
    selected: "A",
    transition: null,
    cooldownActive: false,
    locked: false,
  });
}

function assertActiveBSnapshot(snapshot) {
  assert.equal(snapshot.selected, "B");
  assert.deepEqual(snapshot.transition, {
    direction: "forward",
    rawProgress: 0,
  });
  assert.equal(snapshot.cooldownActive, false);
  assert.equal(snapshot.locked, false);
}

function assertBrowserEvidence(details) {
  assert.equal(details.targetIsElement, true);
  assert.equal(details.targetIsEventTarget, true);
  assertInitialSnapshot(details.initial);

  assert.equal(details.rejectedPrevious.dispatchResult, true);
  assert.equal(details.rejectedPrevious.defaultPrevented, false);
  assert.equal(details.rejectedPrevious.resolverCallDelta, 1);
  assertInitialSnapshot(details.rejectedPrevious.snapshot);

  assert.equal(details.acceptedNext.dispatchResult, false);
  assert.equal(details.acceptedNext.defaultPrevented, true);
  assert.equal(details.acceptedNext.resolverCallDelta, 1);
  assertActiveBSnapshot(details.acceptedNext.snapshot);

  assert.equal(details.activeRejectedNext.dispatchResult, true);
  assert.equal(details.activeRejectedNext.defaultPrevented, false);
  assert.equal(details.activeRejectedNext.resolverCallDelta, 1);
  assertActiveBSnapshot(details.activeRejectedNext.snapshot);

  assert.equal(details.declined.dispatchResult, true);
  assert.equal(details.declined.defaultPrevented, false);
  assert.equal(details.declined.resolverCallDelta, 1);
  assert.equal(details.declined.snapshotUnchanged, true);
  assertActiveBSnapshot(details.declined.snapshot);

  assert.equal(details.unrelated.dispatchResult, true);
  assert.equal(details.unrelated.defaultPrevented, false);
  assert.equal(details.unrelated.resolverCallDelta, 0);
  assert.equal(details.unrelated.snapshotUnchanged, true);
  assertActiveBSnapshot(details.unrelated.snapshot);

  assert.equal(details.cleanup.dispatchResult, true);
  assert.equal(details.cleanup.defaultPrevented, false);
  assert.equal(details.cleanup.resolverCallDelta, 0);
  assert.equal(details.cleanup.snapshotUnchanged, true);
  assert.equal(
    details.cleanup.resolverCallsAfterDispatch,
    details.cleanup.resolverCallsBeforeCleanup,
  );
  assertActiveBSnapshot(details.cleanup.snapshot);

  assert.equal(details.resolverCalls, 4);
  assert.equal(details.realWheelEventCalls, 4);
  assert.equal(details.currentTargetCalls, 4);
}

async function main() {
  const deadline = Date.now() + QUALIFICATION_TIMEOUT_MS;
  const server = createSourceQualificationServer();
  let baseUrl = null;
  let driver = null;
  let sessionId = null;

  try {
    baseUrl = await server.start();
    await assertServedProvenance(baseUrl);

    driver = spawn("chromedriver", [`--port=${DRIVER_PORT}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    driver.stdout.on("data", (chunk) => {
      process.stdout.write(`[chromedriver] ${chunk}`);
    });
    driver.stderr.on("data", (chunk) => {
      process.stderr.write(`[chromedriver] ${chunk}`);
    });

    await waitForDriver(deadline);

    const session = await createWebDriverSession(deadline);
    sessionId = session.sessionId;

    const browserVersion = session.capabilities?.browserVersion ?? "unknown";
    const driverVersion =
      session.capabilities?.chrome?.chromedriverVersion ?? "unknown";

    console.log(`DOM listener qualification browser: Chrome ${browserVersion}`);
    console.log(`DOM listener qualification driver: ${driverVersion}`);
    console.log(
      "DOM listener qualification routes:",
      JSON.stringify([...ROUTES.keys()]),
    );

    await webdriverRequest(
      "POST",
      `/session/${sessionId}/url`,
      { url: `${baseUrl}/` },
      remainingRequestTimeout(deadline),
    );

    while (Date.now() < deadline) {
      const observed = await webdriverRequest(
        "POST",
        `/session/${sessionId}/execute/sync`,
        {
          script:
            "return window.__WIF_DOM_LISTENER_QUALIFICATION__ ?? null;",
          args: [],
        },
        remainingRequestTimeout(deadline),
      );

      if (observed?.state === "pass") {
        assertBrowserEvidence(observed.details);
        console.log(
          "Real-browser production DOM wheel listener qualification PASS:",
          JSON.stringify(observed.details),
        );
        return;
      }

      if (observed?.state === "fail") {
        throw new Error(
          `real-browser DOM listener qualification failed: ${JSON.stringify(
            observed.details,
          )}`,
        );
      }

      await delay(100);
    }

    throw new Error(
      `DOM listener browser qualification timed out after ${QUALIFICATION_TIMEOUT_MS} ms`,
    );
  } finally {
    if (sessionId !== null) {
      await deleteWebDriverSession(sessionId);
    }
    if (driver !== null) {
      await terminateDriver(driver);
    }
    await server.close();
  }
}

await main();
