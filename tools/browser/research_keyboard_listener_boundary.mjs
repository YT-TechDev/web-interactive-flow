import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9523;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const KEY = {
  SPACE: "\uE00D",
  PAGE_DOWN: "\uE00F",
};

const ROUTES = new Map([
  ["/", "tests/browser/keyboard-listener-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/keyboard-listener-research/main.mjs"],
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

function createServerHarness() {
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
        throw new Error("keyboard listener research server has no address");
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
    "/adapters/dom/wheel_listener.mjs",
    "/bridge/wheel_ownership.mjs",
    "/tests/browser/keyboard-runtime-research/main.mjs",
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
    throw new Error("keyboard listener research exceeded overall timeout");
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

async function control(sessionId, expression, args, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_KEYBOARD_LISTENER_CONTROL__." + expression,
    args,
    deadline,
  );
}

async function waitForReady(sessionId, deadline) {
  while (Date.now() < deadline) {
    const value = await execute(
      sessionId,
      "return window.__WIF_KEYBOARD_LISTENER_RESEARCH__ ?? null;",
      [],
      deadline,
    );

    if (value?.state === "ready") return value;
    if (value?.state === "fail") {
      throw new Error("keyboard listener fixture failed: " + JSON.stringify(value));
    }

    await delay(50);
  }

  throw new Error("keyboard listener fixture did not become ready");
}

async function focus(sessionId, id, deadline) {
  const value = await control(
    sessionId,
    "focus(arguments[0]);",
    [id],
    deadline,
  );
  assert.equal(value, true, "failed to focus " + id);
}

async function sendKey(sessionId, sourceId, value, deadline) {
  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "key",
          id: sourceId,
          actions: [
            { type: "keyDown", value },
            { type: "keyUp", value },
          ],
        },
      ],
    },
    remaining(deadline),
  );
}

async function snapshot(sessionId, deadline) {
  return control(sessionId, "snapshot();", [], deadline);
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
  const server = createServerHarness();
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
      "Keyboard listener research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Keyboard listener research driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    await waitForReady(sessionId, deadline);

    const cases = {};

    await control(sessionId, "resetExplicitObservations();", [], deadline);
    await focus(sessionId, "explicit-neutral", deadline);
    await sendKey(sessionId, "explicit-owned", "n", deadline);
    await delay(80);

    cases.explicitOwned = await snapshot(sessionId, deadline);
    assertRuntime(cases.explicitOwned.explicit.runtime, "B");
    assert.equal(cases.explicitOwned.explicit.observations.length, 1);

    const explicitOwnedEvent = cases.explicitOwned.explicit.observations[0];
    assert.equal(explicitOwnedEvent.isTrusted, true);
    assert.equal(explicitOwnedEvent.targetId, "explicit-neutral");
    assert.equal(explicitOwnedEvent.currentTargetId, "explicit-root");
    assert.equal(explicitOwnedEvent.intent, "next");
    assert.equal(explicitOwnedEvent.disposition, "accepted");
    assert.equal(explicitOwnedEvent.defaultPreventedBefore, false);
    assert.equal(explicitOwnedEvent.defaultPreventedAfter, true);

    await control(sessionId, "resetExplicitObservations();", [], deadline);
    const beforeOutside = await snapshot(sessionId, deadline);
    await focus(sessionId, "outside-neutral", deadline);
    await sendKey(sessionId, "outside-root", "n", deadline);
    await delay(80);

    cases.outside = await snapshot(sessionId, deadline);
    assertRuntime(cases.outside.explicit.runtime, "B");
    assert.equal(cases.outside.explicit.observations.length, 0);
    assert.equal(
      cases.outside.explicit.resolverCalls,
      beforeOutside.explicit.resolverCalls,
    );

    await control(sessionId, "resetExplicitObservations();", [], deadline);
    await focus(sessionId, "explicit-button", deadline);
    const beforeButton = await snapshot(sessionId, deadline);
    await sendKey(sessionId, "declined-button-space", KEY.SPACE, deadline);
    await delay(100);

    cases.buttonDecline = await snapshot(sessionId, deadline);
    assertRuntime(cases.buttonDecline.explicit.runtime, "B");
    assert.equal(cases.buttonDecline.explicit.observations.length, 1);
    assert.equal(cases.buttonDecline.explicit.observations[0].intent, null);
    assert.equal(
      cases.buttonDecline.explicit.observations[0].defaultPreventedAfter,
      false,
    );
    assert.equal(
      cases.buttonDecline.explicit.buttonClicks,
      beforeButton.explicit.buttonClicks + 1,
    );

    await control(sessionId, "resetExplicitObservations();", [], deadline);
    await control(sessionId, "clearInput();", [], deadline);
    await focus(sessionId, "explicit-input", deadline);
    const beforeInput = await snapshot(sessionId, deadline);
    await sendKey(sessionId, "declined-input-a", "a", deadline);
    await delay(100);

    cases.inputDecline = await snapshot(sessionId, deadline);
    assertRuntime(cases.inputDecline.explicit.runtime, "B");
    assert.equal(cases.inputDecline.explicit.observations.length, 1);
    assert.equal(cases.inputDecline.explicit.observations[0].intent, null);
    assert.equal(
      cases.inputDecline.explicit.observations[0].defaultPreventedAfter,
      false,
    );
    assert.equal(cases.inputDecline.explicit.inputValue, "a");
    assert.equal(
      cases.inputDecline.explicit.inputEvents,
      beforeInput.explicit.inputEvents + 1,
    );

    await control(sessionId, "resetExplicitObservations();", [], deadline);
    const beforeCleanup = await snapshot(sessionId, deadline);
    await control(sessionId, "cleanupExplicit();", [], deadline);
    await focus(sessionId, "explicit-neutral", deadline);
    await sendKey(sessionId, "after-cleanup", "n", deadline);
    await delay(80);

    cases.afterCleanup = await snapshot(sessionId, deadline);
    assertRuntime(cases.afterCleanup.explicit.runtime, "B");
    assert.equal(cases.afterCleanup.explicit.bindingActive, false);
    assert.equal(cases.afterCleanup.explicit.observations.length, 0);
    assert.equal(
      cases.afterCleanup.explicit.resolverCalls,
      beforeCleanup.explicit.resolverCalls,
    );

    await control(sessionId, "resetNormalObservations();", [], deadline);
    await focus(sessionId, "normal-scroller", deadline);
    await sendKey(
      sessionId,
      "normal-page-down",
      KEY.PAGE_DOWN,
      deadline,
    );
    await delay(250);

    cases.normalPassiveDefault = await snapshot(sessionId, deadline);
    assertRuntime(cases.normalPassiveDefault.normal.runtime, "B");
    assert.equal(cases.normalPassiveDefault.normal.observations.length, 1);
    assert.equal(
      cases.normalPassiveDefault.normal.observations[0].preventAttempted,
      true,
    );
    assert.equal(
      cases.normalPassiveDefault.normal.observations[0].defaultPreventedAfter,
      true,
    );
    assert.equal(cases.normalPassiveDefault.normal.scrollTop, 0);

    await control(sessionId, "resetPassiveObservations();", [], deadline);
    await focus(sessionId, "passive-scroller", deadline);
    await sendKey(
      sessionId,
      "passive-page-down",
      KEY.PAGE_DOWN,
      deadline,
    );
    await delay(250);

    cases.explicitPassiveTrue = await snapshot(sessionId, deadline);
    assertRuntime(cases.explicitPassiveTrue.passive.runtime, "B");
    assert.equal(cases.explicitPassiveTrue.passive.observations.length, 1);
    const passiveEvent = cases.explicitPassiveTrue.passive.observations[0];
    assert.equal(passiveEvent.preventAttempted, true);
    assert.equal(passiveEvent.defaultPreventedBefore, false);
    assert.equal(passiveEvent.defaultPreventedAfter, false);
    assert.ok(
      cases.explicitPassiveTrue.passive.scrollTop > 0,
      "passive=true should leave native PageDown scrolling available",
    );

    await control(sessionId, "resetNestedObservations();", [], deadline);
    await focus(sessionId, "nested-inner", deadline);
    await sendKey(sessionId, "nested-double", "n", deadline);
    await delay(100);

    cases.nested = await snapshot(sessionId, deadline);
    assertRuntime(cases.nested.nested.runtime, "C");
    assert.equal(cases.nested.nested.observations.length, 2);

    const [inner, outer] = cases.nested.nested.observations;
    assert.equal(inner.isTrusted, true);
    assert.equal(outer.isTrusted, true);
    assert.equal(inner.targetId, "nested-inner");
    assert.equal(outer.targetId, "nested-inner");
    assert.equal(inner.currentTargetId, "nested-inner");
    assert.equal(outer.currentTargetId, "nested-outer");
    assert.equal(inner.disposition, "accepted");
    assert.equal(outer.disposition, "accepted");
    assert.equal(inner.defaultPreventedBefore, false);
    assert.equal(inner.defaultPreventedAfter, true);
    assert.equal(outer.defaultPreventedBefore, true);
    assert.equal(outer.defaultPreventedAfter, true);

    cases.detachedSynthetic = await control(
      sessionId,
      "runDetachedSyntheticProbe();",
      [],
      deadline,
    );

    assert.equal(cases.detachedSynthetic.isConnectedAfterRemoval, false);
    assert.equal(cases.detachedSynthetic.firstIsTrusted, false);
    assert.equal(cases.detachedSynthetic.resolverCallsAfterDetached, 1);
    assertRuntime(cases.detachedSynthetic.afterDetachedDispatch, "B");
    assert.equal(cases.detachedSynthetic.firstDefaultPrevented, true);
    assert.equal(cases.detachedSynthetic.firstDispatchResult, false);
    assert.equal(cases.detachedSynthetic.secondIsTrusted, false);
    assert.equal(
      cases.detachedSynthetic.resolverCallsAfterCleanupDispatch,
      1,
    );
    assertRuntime(cases.detachedSynthetic.afterCleanupDispatch, "B");
    assert.equal(cases.detachedSynthetic.secondDefaultPrevented, false);
    assert.equal(cases.detachedSynthetic.secondDispatchResult, true);

    const finished = await control(sessionId, "finish();", [], deadline);

    console.log(
      "Trusted keyboard listener boundary research PASS:",
      JSON.stringify({ cases, finished }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
