import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { createQualificationServer } from "./qualification_server.mjs";

const QUALIFICATION_TIMEOUT_MS = 20_000;
const WEBDRIVER_REQUEST_TIMEOUT_MS = 5_000;
const DRIVER_PORT = 9515;

function driverUrl(pathname) {
  return `http://127.0.0.1:${DRIVER_PORT}${pathname}`;
}

async function webdriverRequest(method, pathname, body) {
  const response = await fetch(driverUrl(pathname), {
    method,
    headers: body === undefined
      ? undefined
      : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(WEBDRIVER_REQUEST_TIMEOUT_MS),
  });

  const payload = await response.json();
  if (!response.ok || payload.value?.error) {
    throw new Error(
      `WebDriver ${method} ${pathname} failed: ${JSON.stringify(payload.value ?? payload)}`,
    );
  }

  return payload.value;
}

async function waitForDriver() {
  const deadline = Date.now() + 5_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await webdriverRequest("GET", "/status");
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  throw lastError ?? new Error("ChromeDriver did not become ready");
}

async function createWebDriverSession() {
  const value = await webdriverRequest("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "chrome",
        "goog:chromeOptions": {
          args: [
            "--headless=new",
            "--no-sandbox",
            "--disable-dev-shm-usage",
          ],
        },
      },
    },
  });

  if (typeof value.sessionId !== "string") {
    throw new Error("WebDriver session did not return a session id");
  }

  return value;
}

async function deleteWebDriverSession(sessionId) {
  try {
    await webdriverRequest("DELETE", `/session/${sessionId}`);
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

async function main() {
  const server = createQualificationServer();
  let baseUrl = null;
  let driver = null;
  let sessionId = null;

  try {
    baseUrl = await server.start();

    driver = spawn("chromedriver", [`--port=${DRIVER_PORT}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    driver.stdout.on("data", (chunk) => {
      process.stdout.write(`[chromedriver] ${chunk}`);
    });
    driver.stderr.on("data", (chunk) => {
      process.stderr.write(`[chromedriver] ${chunk}`);
    });

    await waitForDriver();

    const session = await createWebDriverSession();
    sessionId = session.sessionId;

    const browserVersion = session.capabilities?.browserVersion ?? "unknown";
    const driverVersion =
      session.capabilities?.chrome?.chromedriverVersion ?? "unknown";

    console.log(`Qualification browser: Chrome ${browserVersion}`);
    console.log(`Qualification driver: ${driverVersion}`);

    await webdriverRequest(
      "POST",
      `/session/${sessionId}/url`,
      { url: `${baseUrl}/` },
    );

    const deadline = Date.now() + QUALIFICATION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await webdriverRequest(
        "POST",
        `/session/${sessionId}/execute/sync`,
        {
          script: "return window.__WIF_QUALIFICATION__ ?? null;",
          args: [],
        },
      );

      if (status?.state === "pass") {
        console.log(
          "Real-browser WIF qualification PASS:",
          JSON.stringify(status.details),
        );
        return;
      }

      if (status?.state === "fail") {
        throw new Error(
          `real-browser qualification failed: ${JSON.stringify(status.details)}`,
        );
      }

      await delay(100);
    }

    throw new Error(
      `real-browser qualification timed out after ${QUALIFICATION_TIMEOUT_MS} ms`,
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
