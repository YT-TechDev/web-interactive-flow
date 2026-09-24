import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import test from "node:test";

import { createQualificationServer } from "../../tools/browser/qualification_server.mjs";

const fixtureUrl = new URL("./qualification_fixture.mjs", import.meta.url);
const harnessUrl = new URL(
  "../../tools/browser/qualify_real_browser.mjs",
  import.meta.url,
);
const serverUrl = new URL(
  "../../tools/browser/qualification_server.mjs",
  import.meta.url,
);

function rawRequest(baseUrl, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        method,
        path,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("qualification server is loopback, ephemeral, allowlisted, and MIME-correct", async () => {
  const server = createQualificationServer();

  try {
    const baseUrl = await server.start();
    const parsed = new URL(baseUrl);

    assert.equal(parsed.hostname, "127.0.0.1");
    assert.notEqual(parsed.port, "");

    const wasm = await rawRequest(baseUrl, "/core.wasm");
    assert.equal(wasm.status, 200);
    assert.equal(wasm.headers["content-type"], "application/wasm");

    const fixture = await rawRequest(baseUrl, "/qualification.mjs");
    assert.equal(fixture.status, 200);
    assert.match(fixture.headers["content-type"], /^text\/javascript/);

    const unknown = await rawRequest(baseUrl, "/README.md");
    assert.equal(unknown.status, 404);

    const traversal = await rawRequest(baseUrl, "/../../README.md");
    assert.equal(traversal.status, 404);

    const post = await rawRequest(baseUrl, "/core.wasm", "POST");
    assert.equal(post.status, 405);
  } finally {
    await server.close();
  }
});

test("Q05 fixture mechanically composes production seams and real Window rAF", async () => {
  const source = await readFile(fixtureUrl, "utf8");

  assert.match(
    source,
    /import \{ compileFlowModule \} from "\/bridge\/module_compiler\.mjs"/,
  );
  assert.match(
    source,
    /import \{ createFlowRuntime \} from "\/bridge\/runtime\.mjs"/,
  );
  assert.match(
    source,
    /import \{ createFrameScheduler \} from "\/bridge\/frame_scheduler\.mjs"/,
  );

  assert.match(source, /compileFlowModule\(fetch\("\/core\.wasm"\)\)/);
  assert.match(source, /createFlowRuntime\(/);
  assert.match(source, /createFrameScheduler\(/);
  assert.match(
    source,
    /window\.requestAnimationFrame\.bind\(window\)/,
  );
  assert.match(
    source,
    /window\.cancelAnimationFrame\.bind\(window\)/,
  );

  assert.doesNotMatch(source, /setTimeout\s*\(/);
  assert.doesNotMatch(source, /createMonotonicTimeNormalizer/);
  assert.doesNotMatch(source, /decomposeTickBudgetUs/);
});

test("Q06 harness has bounded timeout and cleanup ownership", async () => {
  const source = await readFile(harnessUrl, "utf8");

  assert.match(source, /const QUALIFICATION_TIMEOUT_MS = [0-9_]+/);
  assert.match(
    source,
    /const qualificationDeadline = Date\.now\(\) \+ QUALIFICATION_TIMEOUT_MS/,
  );
  assert.match(source, /remainingRequestTimeout\(qualificationDeadline\)/);
  assert.match(source, /while \(Date\.now\(\) < qualificationDeadline\)/);
  assert.match(source, /finally \{/);
  assert.match(source, /deleteWebDriverSession\(sessionId\)/);
  assert.match(source, /terminateDriver\(driver\)/);
  assert.match(source, /await server\.close\(\)/);
});

test("server implementation uses explicit route allowlist rather than filesystem URL resolution", async () => {
  const source = await readFile(serverUrl, "utf8");

  assert.match(source, /const ROUTES = new Map\(\[/);
  assert.match(source, /const route = ROUTES\.get\(url\.pathname\)/);
  assert.doesNotMatch(source, /readFile\([^\n]*req\.url/);
  assert.doesNotMatch(source, /path\.(join|resolve)\([^\n]*url/);
});
