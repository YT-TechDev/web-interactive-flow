import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9520;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

const ROUTES = new Map([
  ["/", "tests/browser/nested-scroll-production/index.html"],
  ["/fixture/main.mjs", "tests/browser/nested-scroll-production/main.mjs"],
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
        throw new Error("explicit nested ownership server has no address");
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
    "/tests/dom/wheel_listener.test.mjs",
    "/tools/browser/research_nested_scroll_coexistence.mjs",
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
    throw new Error("explicit nested ownership qualification timed out");
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

async function getElement(sessionId, id, deadline) {
  const value = await execute(
    sessionId,
    "return document.getElementById(arguments[0]);",
    [id],
    deadline,
  );

  assert.ok(value && typeof value === "object");
  assert.equal(typeof value[ELEMENT_KEY], "string");
  return value;
}

async function readControl(sessionId, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__?.snapshot() ?? null;",
    [],
    deadline,
  );
}

async function performWheel(sessionId, element, id, deadline) {
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
              deltaX: 0,
              deltaY: 120,
              duration: 0,
              origin: element,
            },
          ],
        },
      ],
    },
    remaining(deadline),
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

function assertInitialRuntime(snapshot) {
  assert.equal(snapshot.selected, "A");
  assert.equal(snapshot.transition, null);
  assert.equal(snapshot.cooldownActive, false);
  assert.equal(snapshot.locked, false);
}

async function main() {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const server = createServerForFixture();
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
      "Explicit nested ownership browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Explicit nested ownership driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    let ready = null;
    while (Date.now() < deadline) {
      ready = await execute(
        sessionId,
        "return window.__WIF_EXPLICIT_NESTED_SCROLL__ ?? null;",
        [],
        deadline,
      );

      if (ready?.state === "ready") break;
      if (ready?.state === "fail") {
        throw new Error("fixture failed: " + JSON.stringify(ready.details));
      }

      await delay(50);
    }

    assert.equal(ready?.state, "ready");
    assertInitialRuntime(ready.details.snapshot);

    const nativeScroll = await getElement(
      sessionId,
      "native-scroll",
      deadline,
    );
    const flowOwned = await getElement(sessionId, "flow-owned", deadline);

    await execute(
      sessionId,
      "window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.setNativePosition('middle'); window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.resetEvents(); return true;",
      [],
      deadline,
    );

    const beforeMiddle = await readControl(sessionId, deadline);
    assertInitialRuntime(beforeMiddle.runtime);

    await performWheel(
      sessionId,
      nativeScroll,
      "explicit-native-middle",
      deadline,
    );
    await delay(120);

    const afterMiddle = await readControl(sessionId, deadline);

    assertInitialRuntime(afterMiddle.runtime);
    assert.ok(
      afterMiddle.nativeScrollTop > beforeMiddle.nativeScrollTop,
      "explicit native region should retain native scrolling",
    );
    assert.equal(afterMiddle.resolverCalls, beforeMiddle.resolverCalls + 1);
    assert.equal(afterMiddle.nativeDeclines, beforeMiddle.nativeDeclines + 1);
    assert.equal(afterMiddle.producedIntents, beforeMiddle.producedIntents);
    assert.ok(
      afterMiddle.observedEvents.some(
        (event) =>
          event.isTrusted === true &&
          event.defaultPrevented === false &&
          event.targetId === "native-scroll-content",
      ),
      "declined native event should remain unprevented",
    );

    await execute(
      sessionId,
      "window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.setNativePosition('end'); window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.resetEvents(); return true;",
      [],
      deadline,
    );

    const beforeBoundary = await readControl(sessionId, deadline);
    assert.equal(
      beforeBoundary.nativeScrollTop,
      beforeBoundary.nativeMaxScrollTop,
    );

    await performWheel(
      sessionId,
      nativeScroll,
      "explicit-native-boundary",
      deadline,
    );
    await delay(120);

    const afterBoundary = await readControl(sessionId, deadline);

    assertInitialRuntime(afterBoundary.runtime);
    assert.equal(
      afterBoundary.nativeScrollTop,
      beforeBoundary.nativeScrollTop,
    );
    assert.equal(
      afterBoundary.nativeDeclines,
      beforeBoundary.nativeDeclines + 1,
    );
    assert.equal(
      afterBoundary.producedIntents,
      beforeBoundary.producedIntents,
    );
    assert.ok(
      afterBoundary.observedEvents.some(
        (event) =>
          event.isTrusted === true &&
          event.defaultPrevented === false &&
          event.targetId === "native-scroll-content",
      ),
      "explicit native boundary should still decline without prevention",
    );

    await execute(
      sessionId,
      "window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.resetEvents(); return true;",
      [],
      deadline,
    );

    const beforeFlow = await readControl(sessionId, deadline);
    assertInitialRuntime(beforeFlow.runtime);

    await performWheel(
      sessionId,
      flowOwned,
      "explicit-flow-owned",
      deadline,
    );
    await delay(120);

    const afterFlow = await readControl(sessionId, deadline);

    assert.equal(afterFlow.runtime.selected, "B");
    assert.equal(afterFlow.runtime.transition, null);
    assert.equal(afterFlow.runtime.cooldownActive, false);
    assert.equal(afterFlow.runtime.locked, false);
    assert.equal(afterFlow.resolverCalls, beforeFlow.resolverCalls + 1);
    assert.equal(afterFlow.nativeDeclines, beforeFlow.nativeDeclines);
    assert.equal(afterFlow.producedIntents, beforeFlow.producedIntents + 1);
    assert.ok(
      afterFlow.observedEvents.some(
        (event) =>
          event.isTrusted === true &&
          event.defaultPrevented === true &&
          event.targetId === "flow-owned",
      ),
      "flow-owned accepted event should be prevented after Runtime acceptance",
    );

    const finished = await execute(
      sessionId,
      "return window.__WIF_EXPLICIT_NESTED_SCROLL_CONTROL__.finish();",
      [],
      deadline,
    );

    assert.equal(finished.snapshot.selected, "B");

    console.log(
      "Explicit nested-scroll production ownership PASS:",
      JSON.stringify({
        beforeMiddle,
        afterMiddle,
        beforeBoundary,
        afterBoundary,
        beforeFlow,
        afterFlow,
        finished,
      }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
