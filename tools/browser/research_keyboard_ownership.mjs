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
  "tests/browser/keyboard-research/index.html",
);
const DRIVER_PORT = 9521;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const KEY = {
  TAB: "\uE004",
  ENTER: "\uE007",
  SHIFT: "\uE008",
  SPACE: "\uE00D",
  PAGE_DOWN: "\uE00F",
  ARROW_DOWN: "\uE015",
};

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
        throw new Error("keyboard research server has no address");
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
    throw new Error("keyboard research exceeded overall timeout");
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

async function resetAndFocus(sessionId, id, deadline) {
  const value = await execute(
    sessionId,
    "window.__WIF_KEYBOARD_RESEARCH__.reset(); return window.__WIF_KEYBOARD_RESEARCH__.focus(arguments[0]);",
    [id],
    deadline,
  );
  assert.equal(value, true, "failed to focus " + id);
}

async function setPreventRule(sessionId, targetId, key, deadline) {
  await execute(
    sessionId,
    "window.__WIF_KEYBOARD_RESEARCH__.setPreventRule(arguments[0], arguments[1]); return true;",
    [targetId, key],
    deadline,
  );
}

async function snapshot(sessionId, deadline) {
  return execute(
    sessionId,
    "return window.__WIF_KEYBOARD_RESEARCH__.snapshot();",
    [],
    deadline,
  );
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

async function sendShiftedA(sessionId, sourceId, deadline) {
  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "key",
          id: sourceId,
          actions: [
            { type: "keyDown", value: KEY.SHIFT },
            { type: "keyDown", value: "a" },
            { type: "keyUp", value: "a" },
            { type: "keyUp", value: KEY.SHIFT },
          ],
        },
      ],
    },
    remaining(deadline),
  );
}

async function sendHeldArrowProbe(sessionId, sourceId, deadline) {
  await webdriverRequest(
    "POST",
    "/session/" + sessionId + "/actions",
    {
      actions: [
        {
          type: "key",
          id: sourceId,
          actions: [
            { type: "keyDown", value: KEY.ARROW_DOWN },
            { type: "pause", duration: 700 },
            { type: "keyUp", value: KEY.ARROW_DOWN },
          ],
        },
      ],
    },
    remaining(deadline),
  );
}

function requireOneTargetEvent(state, targetId) {
  const events = state.rootEvents.filter((event) => event.targetId === targetId);
  assert.ok(events.length >= 1, "missing root keydown for " + targetId);
  return events[0];
}

function assertTrustedKeydown(event, { key, code, targetId }) {
  assert.equal(event.isTrusted, true);
  assert.equal(event.key, key);
  assert.equal(event.code, code);
  assert.equal(event.targetId, targetId);
  assert.equal(event.currentTargetLabel, "flow-root");
  assert.equal(event.cancelable, true);
  assert.equal(typeof event.repeat, "boolean");
  assert.equal(typeof event.isComposing, "boolean");
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
      "Keyboard research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Keyboard research driver: " +
        (session.capabilities?.chrome?.chromedriverVersion ?? "unknown"),
    );

    await webdriverRequest(
      "POST",
      "/session/" + sessionId + "/url",
      { url: baseUrl + "/" },
      remaining(deadline),
    );

    const cases = {};

    await resetAndFocus(sessionId, "neutral", deadline);
    await sendKey(sessionId, "neutral-arrow", KEY.ARROW_DOWN, deadline);
    await delay(80);
    cases.neutralArrow = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.neutralArrow, "neutral"),
      { key: "ArrowDown", code: "ArrowDown", targetId: "neutral" },
    );

    await resetAndFocus(sessionId, "scroller", deadline);
    await sendKey(sessionId, "scroller-page", KEY.PAGE_DOWN, deadline);
    await delay(250);
    cases.scrollerPageDown = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.scrollerPageDown, "scroller"),
      { key: "PageDown", code: "PageDown", targetId: "scroller" },
    );
    assert.ok(
      cases.scrollerPageDown.scrollerScrollTop > 0,
      "unprevented PageDown should scroll the focused native scroller",
    );

    await resetAndFocus(sessionId, "scroller", deadline);
    await setPreventRule(sessionId, "scroller", "PageDown", deadline);
    await sendKey(
      sessionId,
      "scroller-page-prevented",
      KEY.PAGE_DOWN,
      deadline,
    );
    await delay(250);
    cases.scrollerPageDownPrevented = await snapshot(sessionId, deadline);
    assert.equal(cases.scrollerPageDownPrevented.scrollerScrollTop, 0);
    assert.equal(
      requireOneTargetEvent(
        cases.scrollerPageDownPrevented,
        "scroller",
      ).defaultPrevented,
      true,
    );

    await resetAndFocus(sessionId, "button", deadline);
    await sendKey(sessionId, "button-space", KEY.SPACE, deadline);
    await delay(80);
    cases.buttonSpace = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.buttonSpace, "button"),
      { key: " ", code: "Space", targetId: "button" },
    );
    assert.equal(
      cases.buttonSpace.buttonClicks,
      1,
      "unprevented Space should activate the focused button",
    );

    await resetAndFocus(sessionId, "button", deadline);
    await setPreventRule(sessionId, "button", " ", deadline);
    await sendKey(sessionId, "button-space-prevented", KEY.SPACE, deadline);
    await delay(80);
    cases.buttonSpacePrevented = await snapshot(sessionId, deadline);
    assert.equal(cases.buttonSpacePrevented.buttonClicks, 0);
    assert.equal(
      requireOneTargetEvent(
        cases.buttonSpacePrevented,
        "button",
      ).defaultPrevented,
      true,
    );

    await resetAndFocus(sessionId, "link", deadline);
    await sendKey(sessionId, "link-enter", KEY.ENTER, deadline);
    await delay(80);
    cases.linkEnter = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.linkEnter, "link"),
      { key: "Enter", code: "Enter", targetId: "link" },
    );
    assert.equal(
      cases.linkEnter.linkClicks,
      1,
      "unprevented Enter should activate the focused link",
    );

    await resetAndFocus(sessionId, "select", deadline);
    await sendKey(sessionId, "select-arrow", KEY.ARROW_DOWN, deadline);
    await delay(80);
    cases.selectArrow = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.selectArrow, "select"),
      { key: "ArrowDown", code: "ArrowDown", targetId: "select" },
    );
    assert.equal(
      cases.selectArrow.selectedIndex,
      1,
      "unprevented ArrowDown should change the focused select",
    );

    await resetAndFocus(sessionId, "input", deadline);
    await sendKey(sessionId, "input-a", "a", deadline);
    await delay(80);
    cases.inputA = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.inputA, "input"),
      { key: "a", code: "KeyA", targetId: "input" },
    );
    assert.equal(cases.inputA.inputValue, "a");
    assert.ok(cases.inputA.inputEvents >= 1);

    await resetAndFocus(sessionId, "input", deadline);
    await setPreventRule(sessionId, "input", "a", deadline);
    await sendKey(sessionId, "input-a-prevented", "a", deadline);
    await delay(80);
    cases.inputAPrevented = await snapshot(sessionId, deadline);
    assert.equal(cases.inputAPrevented.inputValue, "");
    assert.equal(cases.inputAPrevented.inputEvents, 0);
    assert.equal(
      requireOneTargetEvent(cases.inputAPrevented, "input").defaultPrevented,
      true,
    );

    await resetAndFocus(sessionId, "tab-start", deadline);
    await sendKey(sessionId, "tab-native", KEY.TAB, deadline);
    await delay(80);
    cases.tabNative = await snapshot(sessionId, deadline);
    assertTrustedKeydown(
      requireOneTargetEvent(cases.tabNative, "tab-start"),
      { key: "Tab", code: "Tab", targetId: "tab-start" },
    );
    assert.equal(
      cases.tabNative.activeElementId,
      "tab-next",
      "unprevented Tab should move focus",
    );

    await resetAndFocus(sessionId, "tab-start", deadline);
    await setPreventRule(sessionId, "tab-start", "Tab", deadline);
    await sendKey(sessionId, "tab-prevented", KEY.TAB, deadline);
    await delay(80);
    cases.tabPrevented = await snapshot(sessionId, deadline);
    assert.equal(cases.tabPrevented.activeElementId, "tab-start");
    assert.equal(
      requireOneTargetEvent(
        cases.tabPrevented,
        "tab-start",
      ).defaultPrevented,
      true,
    );

    await resetAndFocus(sessionId, "neutral", deadline);
    await sendKey(sessionId, "plain-a", "a", deadline);
    await delay(50);
    cases.plainA = await snapshot(sessionId, deadline);

    await resetAndFocus(sessionId, "neutral", deadline);
    await sendShiftedA(sessionId, "shifted-a", deadline);
    await delay(50);
    cases.shiftedA = await snapshot(sessionId, deadline);

    const plainA = requireOneTargetEvent(cases.plainA, "neutral");
    const shiftedA = cases.shiftedA.rootEvents.find(
      (event) => event.targetId === "neutral" && event.code === "KeyA",
    );

    assert.ok(shiftedA, "missing shifted KeyA witness");
    assert.equal(plainA.key, "a");
    assert.equal(plainA.code, "KeyA");
    assert.equal(shiftedA.key, "A");
    assert.equal(shiftedA.code, "KeyA");
    assert.equal(shiftedA.shiftKey, true);

    await resetAndFocus(sessionId, "neutral", deadline);
    await sendHeldArrowProbe(sessionId, "repeat-probe", deadline);
    await delay(50);
    cases.repeatProbe = await snapshot(sessionId, deadline);
    assert.ok(
      cases.repeatProbe.rootEvents.some(
        (event) =>
          event.targetId === "neutral" &&
          event.key === "ArrowDown" &&
          event.isTrusted === true,
      ),
      "repeat probe should deliver at least one trusted ArrowDown",
    );

    await resetAndFocus(sessionId, "outside", deadline);
    await sendKey(sessionId, "outside-arrow", KEY.ARROW_DOWN, deadline);
    await delay(50);
    cases.outsideRoot = await snapshot(sessionId, deadline);
    assert.equal(
      cases.outsideRoot.rootEvents.length,
      0,
      "explicit flow root should not observe outside focused keydown",
    );
    assert.ok(
      cases.outsideRoot.windowEvents.some(
        (event) =>
          event.targetId === "outside" &&
          event.key === "ArrowDown" &&
          event.isTrusted === true,
      ),
      "global window observation should include the outside focused keydown",
    );

    console.log(
      "Trusted keyboard native-default research PASS:",
      JSON.stringify({ cases }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
