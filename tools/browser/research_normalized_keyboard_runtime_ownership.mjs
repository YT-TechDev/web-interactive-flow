import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9522;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const KEY = {
  SPACE: "\uE00D",
  PAGE_UP: "\uE00E",
  PAGE_DOWN: "\uE00F",
};

const ROUTES = new Map([
  ["/", "tests/browser/keyboard-runtime-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/keyboard-runtime-research/main.mjs"],
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
        throw new Error("keyboard Runtime research server has no address");
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
    "/bridge/wheel_ownership.mjs",
    "/adapters/dom/wheel_listener.mjs",
    "/tests/browser/keyboard-research/index.html",
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
    throw new Error("keyboard Runtime research exceeded overall timeout");
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

async function control(sessionId, script, args, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_KEYBOARD_RUNTIME_CONTROL__." + script,
    args,
    deadline,
  );
}

async function snapshot(sessionId, deadline) {
  return control(sessionId, "snapshot();", [], deadline);
}

async function resetObservations(sessionId, deadline) {
  await control(sessionId, "resetObservations();", [], deadline);
}

async function focus(sessionId, id, deadline) {
  const result = await control(
    sessionId,
    "focus(arguments[0]);",
    [id],
    deadline,
  );
  assert.equal(result, true, "failed to focus " + id);
}

async function setScrollerTop(sessionId, value, deadline) {
  return control(
    sessionId,
    "setScrollerTop(arguments[0]);",
    [value],
    deadline,
  );
}

async function clearInput(sessionId, deadline) {
  return control(sessionId, "clearInput();", [], deadline);
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

async function waitForReady(sessionId, deadline) {
  while (Date.now() < deadline) {
    const state = await execute(
      sessionId,
      "return window.__WIF_KEYBOARD_RUNTIME_RESEARCH__ ?? null;",
      [],
      deadline,
    );

    if (state?.state === "ready") return state;
    if (state?.state === "fail") {
      throw new Error("fixture failed: " + JSON.stringify(state.details));
    }

    await delay(50);
  }

  throw new Error("keyboard Runtime fixture did not become ready");
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

function assertRuntime(snapshot, selected) {
  assert.equal(snapshot.selected, selected);
  assert.equal(snapshot.transition, null);
  assert.equal(snapshot.cooldownActive, false);
  assert.equal(snapshot.locked, false);
}

function onlyDecision(state) {
  assert.equal(state.decisions.length, 1);
  return state.decisions[0];
}

function onlyObservedEvent(state) {
  assert.equal(state.observedEvents.length, 1);
  return state.observedEvents[0];
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
      "Keyboard Runtime research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Keyboard Runtime research driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    const ready = await waitForReady(sessionId, deadline);
    assertRuntime(ready.details.runtime, "A");

    const cases = {};

    await resetObservations(sessionId, deadline);
    await focus(sessionId, "flow-scroller", deadline);
    const rejectedStartTop = await setScrollerTop(
      sessionId,
      500,
      deadline,
    );
    assert.ok(rejectedStartTop > 0);

    const beforeRejected = await snapshot(sessionId, deadline);
    assertRuntime(beforeRejected.runtime, "A");

    await sendKey(
      sessionId,
      "runtime-rejected-page-up",
      KEY.PAGE_UP,
      deadline,
    );
    await delay(250);

    cases.rejectedPrevious = await snapshot(sessionId, deadline);
    assertRuntime(cases.rejectedPrevious.runtime, "A");

    const rejectedDecision = onlyDecision(cases.rejectedPrevious);
    assert.deepEqual(rejectedDecision, {
      key: "PageUp",
      targetId: "flow-scroller",
      intent: "previous",
      disposition: "rejected",
      preventedByOwnership: false,
    });

    const rejectedEvent = onlyObservedEvent(cases.rejectedPrevious);
    assert.equal(rejectedEvent.isTrusted, true);
    assert.equal(rejectedEvent.key, "PageUp");
    assert.equal(rejectedEvent.defaultPrevented, false);
    assert.equal(rejectedEvent.activeElementId, "flow-scroller");
    assert.ok(
      cases.rejectedPrevious.scrollerScrollTop < beforeRejected.scrollerScrollTop,
      "Runtime rejection should leave native PageUp scrolling available",
    );

    await resetObservations(sessionId, deadline);
    await focus(sessionId, "flow-scroller", deadline);
    await setScrollerTop(sessionId, 0, deadline);

    const beforeAccepted = await snapshot(sessionId, deadline);
    assertRuntime(beforeAccepted.runtime, "A");
    assert.equal(beforeAccepted.scrollerScrollTop, 0);

    await sendKey(
      sessionId,
      "runtime-accepted-page-down",
      KEY.PAGE_DOWN,
      deadline,
    );
    await delay(250);

    cases.acceptedNext = await snapshot(sessionId, deadline);
    assertRuntime(cases.acceptedNext.runtime, "B");

    const acceptedDecision = onlyDecision(cases.acceptedNext);
    assert.deepEqual(acceptedDecision, {
      key: "PageDown",
      targetId: "flow-scroller",
      intent: "next",
      disposition: "accepted",
      preventedByOwnership: true,
    });

    const acceptedEvent = onlyObservedEvent(cases.acceptedNext);
    assert.equal(acceptedEvent.isTrusted, true);
    assert.equal(acceptedEvent.key, "PageDown");
    assert.equal(acceptedEvent.defaultPrevented, true);
    assert.equal(acceptedEvent.activeElementId, "flow-scroller");
    assert.equal(
      cases.acceptedNext.scrollerScrollTop,
      0,
      "accepted ownership should suppress the native PageDown scroll",
    );

    await resetObservations(sessionId, deadline);
    await focus(sessionId, "native-button", deadline);

    const buttonBefore = await snapshot(sessionId, deadline);
    await sendKey(
      sessionId,
      "runtime-decline-button-space",
      KEY.SPACE,
      deadline,
    );
    await delay(100);

    cases.declinedButton = await snapshot(sessionId, deadline);
    assertRuntime(cases.declinedButton.runtime, "B");

    const buttonDecision = onlyDecision(cases.declinedButton);
    assert.equal(buttonDecision.intent, null);
    assert.equal(buttonDecision.disposition, null);
    assert.equal(buttonDecision.preventedByOwnership, false);

    const buttonEvent = onlyObservedEvent(cases.declinedButton);
    assert.equal(buttonEvent.isTrusted, true);
    assert.equal(buttonEvent.key, " ");
    assert.equal(buttonEvent.defaultPrevented, false);
    assert.equal(buttonEvent.activeElementId, "native-button");
    assert.equal(
      cases.declinedButton.buttonClicks,
      buttonBefore.buttonClicks + 1,
      "declined button Space should retain native activation",
    );

    await resetObservations(sessionId, deadline);
    await clearInput(sessionId, deadline);
    await focus(sessionId, "native-input", deadline);

    const inputBefore = await snapshot(sessionId, deadline);
    await sendKey(
      sessionId,
      "runtime-decline-input-a",
      "a",
      deadline,
    );
    await delay(100);

    cases.declinedInput = await snapshot(sessionId, deadline);
    assertRuntime(cases.declinedInput.runtime, "B");

    const inputDecision = onlyDecision(cases.declinedInput);
    assert.equal(inputDecision.intent, null);
    assert.equal(inputDecision.disposition, null);
    assert.equal(inputDecision.preventedByOwnership, false);

    const inputEvent = onlyObservedEvent(cases.declinedInput);
    assert.equal(inputEvent.isTrusted, true);
    assert.equal(inputEvent.key, "a");
    assert.equal(inputEvent.defaultPrevented, false);
    assert.equal(inputEvent.activeElementId, "native-input");
    assert.equal(cases.declinedInput.inputValue, "a");
    assert.equal(
      cases.declinedInput.inputEvents,
      inputBefore.inputEvents + 1,
      "declined printable key should retain native text input",
    );

    const finished = await control(sessionId, "finish();", [], deadline);
    assertRuntime(finished.runtime, "B");

    console.log(
      "Normalized keyboard Runtime ownership research PASS:",
      JSON.stringify({ cases, finished }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
