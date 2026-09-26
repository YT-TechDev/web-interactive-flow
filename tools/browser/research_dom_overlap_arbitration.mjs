import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_PORT = 9524;
const OVERALL_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CLEANUP_TIMEOUT_MS = 10_000;

const ROUTES = new Map([
  ["/", "tests/browser/dom-overlap-arbitration-research/index.html"],
  ["/fixture/main.mjs", "tests/browser/dom-overlap-arbitration-research/main.mjs"],
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

function createResearchServer() {
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
        throw new Error("overlap arbitration server has no address");
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
    "/tests/browser/keyboard-listener-research/main.mjs",
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
    throw new Error("overlap arbitration research exceeded overall timeout");
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
    "return window.__WIF_OVERLAP_ARBITRATION_CONTROL__." + expression,
    args,
    deadline,
  );
}

async function waitForReady(sessionId, deadline) {
  while (Date.now() < deadline) {
    const value = await execute(
      sessionId,
      "return window.__WIF_OVERLAP_ARBITRATION_RESEARCH__ ?? null;",
      [],
      deadline,
    );

    if (value?.state === "ready") return value;
    if (value?.state === "fail") {
      throw new Error("overlap fixture failed: " + JSON.stringify(value));
    }

    await delay(50);
  }

  throw new Error("overlap fixture did not become ready");
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

function labels(observations) {
  return observations.map((entry) => entry.label);
}

function statuses(observations) {
  return observations.map((entry) => entry.status);
}

async function main() {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const server = createResearchServer();
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
      "Overlap arbitration research browser: Chrome " +
        (session.capabilities?.browserVersion ?? "unknown"),
    );
    console.log(
      "Overlap arbitration research driver: " +
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

    await focus(sessionId, "same-target-next-first", deadline);
    await sendKey(sessionId, "same-target-next-first", "n", deadline);
    await delay(80);
    cases.sameTargetNextFirst = await snapshot(sessionId, deadline);

    assertRuntime(cases.sameTargetNextFirst.sameTargetNextFirst.runtime, "C");
    assert.deepEqual(
      labels(cases.sameTargetNextFirst.sameTargetNextFirst.observations),
      ["next-first:next", "next-first:previous"],
    );
    assert.deepEqual(
      statuses(cases.sameTargetNextFirst.sameTargetNextFirst.observations),
      ["accepted", "suppressed"],
    );

    for (const observation of
      cases.sameTargetNextFirst.sameTargetNextFirst.observations) {
      assert.equal(observation.isTrusted, true);
      assert.equal(observation.targetId, "same-target-next-first");
      assert.equal(observation.currentTargetId, "same-target-next-first");
    }

    await focus(sessionId, "same-target-previous-first", deadline);
    await sendKey(sessionId, "same-target-previous-first", "n", deadline);
    await delay(80);
    cases.sameTargetPreviousFirst = await snapshot(sessionId, deadline);

    assertRuntime(
      cases.sameTargetPreviousFirst.sameTargetPreviousFirst.runtime,
      "A",
    );
    assert.deepEqual(
      labels(
        cases.sameTargetPreviousFirst.sameTargetPreviousFirst.observations,
      ),
      ["previous-first:previous", "previous-first:next"],
    );
    assert.deepEqual(
      statuses(
        cases.sameTargetPreviousFirst.sameTargetPreviousFirst.observations,
      ),
      ["accepted", "suppressed"],
    );

    await focus(sessionId, "independent-inner", deadline);
    await sendKey(sessionId, "independent-runtimes", "n", deadline);
    await delay(80);
    cases.independentRuntimes = await snapshot(sessionId, deadline);

    assertRuntime(cases.independentRuntimes.independent.innerRuntime, "B");
    assertRuntime(cases.independentRuntimes.independent.outerRuntime, "Y");
    assert.deepEqual(
      labels(cases.independentRuntimes.independent.observations),
      ["independent-inner", "independent-outer"],
    );
    assert.deepEqual(
      statuses(cases.independentRuntimes.independent.observations),
      ["accepted", "accepted"],
    );

    const independentInnerObservation =
      cases.independentRuntimes.independent.observations[0];
    const independentOuterObservation =
      cases.independentRuntimes.independent.observations[1];

    assert.equal(independentInnerObservation.isTrusted, true);
    assert.equal(independentOuterObservation.isTrusted, true);
    assert.equal(independentInnerObservation.targetId, "independent-inner");
    assert.equal(independentInnerObservation.currentTargetId, "independent-inner");
    assert.equal(independentOuterObservation.targetId, "independent-inner");
    assert.equal(independentOuterObservation.currentTargetId, "independent-outer");
    assert.ok(
      independentInnerObservation.composedPath.includes("independent-inner"),
    );
    assert.ok(
      independentInnerObservation.composedPath.includes("independent-outer"),
    );

    await focus(sessionId, "same-runtime-inner", deadline);
    await sendKey(sessionId, "same-runtime-arbiter", "n", deadline);
    await delay(80);
    cases.sameRuntimeAcceptedOnly = await snapshot(sessionId, deadline);

    assertRuntime(cases.sameRuntimeAcceptedOnly.sameRuntime.runtime, "B");
    assert.deepEqual(
      labels(cases.sameRuntimeAcceptedOnly.sameRuntime.observations),
      ["same-runtime-inner", "same-runtime-outer"],
    );
    assert.deepEqual(
      statuses(cases.sameRuntimeAcceptedOnly.sameRuntime.observations),
      ["accepted", "suppressed"],
    );

    await focus(sessionId, "fallback-inner", deadline);
    await sendKey(sessionId, "rejected-inner-fallback", "n", deadline);
    await delay(80);
    cases.rejectedInnerFallback = await snapshot(sessionId, deadline);

    assertRuntime(cases.rejectedInnerFallback.fallback.runtime, "B");
    assert.deepEqual(
      labels(cases.rejectedInnerFallback.fallback.observations),
      ["fallback-inner", "fallback-outer"],
    );
    assert.deepEqual(
      statuses(cases.rejectedInnerFallback.fallback.observations),
      ["rejected", "accepted"],
    );

    await focus(sessionId, "propagation-stop", deadline);
    await sendKey(sessionId, "stop-propagation-mutant", "n", deadline);
    await delay(50);
    cases.stopPropagation = await snapshot(sessionId, deadline);
    assert.deepEqual(cases.stopPropagation.propagation.stop, [
      "wif-stop",
      "unrelated-same-target",
    ]);

    await focus(sessionId, "propagation-immediate", deadline);
    await sendKey(
      sessionId,
      "stop-immediate-propagation-mutant",
      "n",
      deadline,
    );
    await delay(50);
    cases.stopImmediatePropagation = await snapshot(sessionId, deadline);
    assert.deepEqual(cases.stopImmediatePropagation.propagation.immediate, [
      "wif-immediate",
    ]);

    cases.syntheticReuse = await control(
      sessionId,
      "runSyntheticReuseProbe();",
      [],
      deadline,
    );

    assert.equal(cases.syntheticReuse.eventIsTrusted, false);
    assert.equal(cases.syntheticReuse.firstDispatch, true);
    assert.equal(cases.syntheticReuse.secondDispatch, true);
    assertRuntime(cases.syntheticReuse.afterFirst, "B");
    assertRuntime(cases.syntheticReuse.afterSecond, "B");
    assert.deepEqual(
      statuses(cases.syntheticReuse.observations),
      ["accepted", "suppressed"],
    );

    const finished = await control(sessionId, "finish();", [], deadline);

    console.log(
      "DOM overlap arbitration research PASS:",
      JSON.stringify({ cases, finished }),
    );
  } finally {
    if (sessionId !== null) await deleteSession(sessionId);
    if (driver !== null) await terminateDriver(driver);
    await server.close();
  }
}

await main();
