import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CHROME_TIMEOUT_MS = 30_000;

const routes = new Map([
  ["/", "tests/browser/dom-flow-host-qualification/index.html"],
  ["/fixture/main.mjs", "tests/browser/dom-flow-host-qualification/main.mjs"],
  ["/adapters/dom/flow_host.mjs", "adapters/dom/flow_host.mjs"],
  ["/adapters/dom/keyboard_listener.mjs", "adapters/dom/keyboard_listener.mjs"],
  ["/adapters/dom/wheel_listener.mjs", "adapters/dom/wheel_listener.mjs"],
  ["/adapters/dom/pointer_listener.mjs", "adapters/dom/pointer_listener.mjs"],
  [
    "/adapters/dom/accepted_pointer_recognizer.mjs",
    "adapters/dom/accepted_pointer_recognizer.mjs",
  ],
  ["/bridge/frame_scheduler.mjs", "bridge/frame_scheduler.mjs"],
  ["/bridge/clock.mjs", "bridge/clock.mjs"],
  ["/bridge/wheel_ownership.mjs", "bridge/wheel_ownership.mjs"],
  ["/bridge/keyboard_ownership.mjs", "bridge/keyboard_ownership.mjs"],
  ["/bridge/module_compiler.mjs", "bridge/module_compiler.mjs"],
  ["/bridge/runtime.mjs", "bridge/runtime.mjs"],
  ["/bridge/internal.mjs", "bridge/internal.mjs"],
  ["/core.wasm", "_build/wasm/debug/build/core/core.wasm"],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(
    request.url,
    "http://localhost",
  ).pathname;
  const relative = routes.get(pathname);
  if (relative === undefined) return response.writeHead(404).end();
  const extension = path.extname(relative);
  const type = extension === ".wasm"
    ? "application/wasm"
    : extension === ".html"
      ? "text/html"
      : "text/javascript";
  response
    .writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    })
    .end(await readFile(path.join(root, relative)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
try {
  const candidates = process.env.CHROME_BIN === undefined
    ? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    : [process.env.CHROME_BIN];
  let chrome = null;
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      chrome = candidate;
      break;
    } catch {
      // Try the next supported runner location.
    }
  }
  if (chrome === null) throw new Error("Chrome/Chromium executable not found");
  const child = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=3000",
    "--dump-dom",
    `http://127.0.0.1:${port}/`,
  ]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `Chrome qualification timed out after ${CHROME_TIMEOUT_MS} ms`,
        ),
      );
    }, CHROME_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  assert.equal(code, 0, stderr);
  const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(match, stdout);
  const encoded = match[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  const result = JSON.parse(encoded);
  assert.equal(result.state, "pass", JSON.stringify(result));
  assert.deepEqual(result.decisions, [
    ["next", "accepted"],
    ["next", "rejected"],
    ["previous", "accepted"],
    ["next", "accepted"],
  ]);
  assert.deepEqual(result.feedback, [["next", "accepted"]]);
  console.log("Production DOM flow host real-browser qualification PASS", result);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
