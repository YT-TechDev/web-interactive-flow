import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { createQualificationServer } from "./qualification_server.mjs";

const QUALIFICATION_TIMEOUT_MS = 90_000;
const WEBDRIVER_REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_REQUEST_TIMEOUT_MS = 10_000;
const DRIVER_PORT = 9515;
const FIRST_DOM_OUTPUT_ID = "qualification-first-snapshot";
const LATEST_DOM_OUTPUT_ID = "qualification-latest-snapshot";

function parseProjectedSnapshot(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing ${label} DOM projection`);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid ${label} DOM projection JSON: ${String(error)}`);
  }

  if (snapshot === null || typeof snapshot !== "object") {
    throw new Error(`invalid ${label} DOM projection snapshot`);
  }

  return snapshot;
}

function assertDomQualificationEvidence(dom) {
  if (dom === null || typeof dom !== "object") {
    throw new Error("missing DOM qualification evidence");
  }

  const first = parseProjectedSnapshot(dom.first, "first");
  const latest = parseProjectedSnapshot(dom.latest, "latest");

  if (first.selected !== "B") {
    throw new Error("first DOM projection did not expose selected target B");
  }
  if (
    first.transition === null ||
    typeof first.transition !== "object" ||
    first.transition.rawProgress !== 0
  ) {
    throw new Error("first DOM projection did not expose active zero progress");
  }

  if (latest.selected !== "B") {
    throw new Error("latest DOM projection did not preserve selected target B");
  }

  const advanced =
    latest.transition === null ||
    (
      typeof latest.transition === "object" &&
      typeof latest.transition.rawProgress === "number" &&
      latest.transition.rawProgress > 0
    );

  if (!advanced) {
    throw new Error("latest DOM projection did not prove lifecycle advancement");
  }

  return { first, latest };
}

function driverUrl(pathname) {
  return `http://127.0.0.1:${DRIVER_PORT}${pathname}`;
}

function remainingRequestTimeout(deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error("real-browser qualification exceeded overall timeout");
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
    headers: body === undefined
      ? undefined
      : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json();
  if (!response.ok || payload.value?.error) {
    throw new Error(
      `WebDriver ${method} ${pathname} failed: ${JSON.stringify(payload.value ?? payload)}`,
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

async function main() {
  const qualificationDeadline = Date.now() + QUALIFICATION_TIMEOUT_MS;
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

    await waitForDriver(qualificationDeadline);

    const session = await createWebDriverSession(qualificationDeadline);
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
      remainingRequestTimeout(qualificationDeadline),
    );

    while (Date.now() < qualificationDeadline) {
      const observed = await webdriverRequest(
        "POST",
        `/session/${sessionId}/execute/sync`,
        {
          script: `
            const readOutput = (id) =>
              document.getElementById(id)?.textContent ?? null;

            return {
              qualification: window.__WIF_QUALIFICATION__ ?? null,
              dom: {
                first: readOutput("${FIRST_DOM_OUTPUT_ID}"),
                latest: readOutput("${LATEST_DOM_OUTPUT_ID}"),
              },
            };
          `,
          args: [],
        },
        remainingRequestTimeout(qualificationDeadline),
      );

      const status = observed?.qualification;

      if (status?.state === "pass") {
        const domEvidence = assertDomQualificationEvidence(observed?.dom);
        console.log(
          "Real-browser WIF qualification PASS:",
          JSON.stringify({
            ...status.details,
            domEvidence,
          }),
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
