import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const exec = promisify(execFile);
const fixture = fileURLToPath(
  new URL("../../tests/browser/dom_wheel_listener_research.html", import.meta.url),
);

async function dumpDom() {
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--dump-dom",
    pathToFileURL(fixture).href,
  ];
  const candidates = ["google-chrome", "chromium", "chromium-browser"];
  let lastError = null;

  for (const command of candidates) {
    try {
      const { stdout, stderr } = await exec(command, args, {
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (stderr.length > 0) process.stderr.write(stderr);
      return { command, stdout };
    } catch (error) {
      if (error?.code === "ENOENT") {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("no Chrome/Chromium executable found");
}

const { command, stdout } = await dumpDom();
const match = stdout.match(/data-wif-wheel-research="([^"]+)"/);
assert.ok(match, "real browser did not expose DOM wheel research results");

const results = JSON.parse(decodeURIComponent(match[1]));

assert.deepEqual(results.documentOmittedPassive, {
  defaultPrevented: false,
  dispatchResult: true,
});
assert.deepEqual(results.documentExplicitNonPassive, {
  defaultPrevented: true,
  dispatchResult: false,
});
assert.deepEqual(results.elementOmittedPassive, {
  defaultPrevented: true,
  dispatchResult: false,
});
assert.deepEqual(results.elementExplicitPassive, {
  defaultPrevented: false,
  dispatchResult: true,
});
assert.deepEqual(results.preventDefaultDoesNotStopPropagation, {
  order: ["child", "parent"],
  parentSawDefaultPrevented: true,
  finalDefaultPrevented: true,
});
assert.deepEqual(results.nestedListenersReceiveSameBubblingEvent, {
  order: ["child", "parent"],
  count: 2,
});
assert.deepEqual(results.detachedTargetRetainsListenerUntilCleanup, {
  count: 1,
});
assert.deepEqual(results.repeatedExplicitRemovalIsSafe, {
  count: 0,
});
assert.deepEqual(results.abortSignalCleanupIsSafe, {
  count: 0,
});

assert.deepEqual(results.windowObservesDescendantWheel, {
  count: 1,
});
assert.deepEqual(results.disjointSiblingTargetsStayScoped, {
  first: 1,
  second: 0,
});
assert.deepEqual(results.stopPropagationDoesNotStopSameTargetListeners, {
  order: ["child-first", "child-second"],
});
assert.deepEqual(results.stopImmediatePropagationSuppressesLaterListeners, {
  order: ["child-first"],
});
assert.deepEqual(results.defaultPreventedGateWorksOnlyWhenCancellationSucceeds, {
  parentRequests: 0,
});
assert.deepEqual(results.defaultPreventedGateFailsForNonCancelableEvent, {
  parentRequests: 1,
  defaultPrevented: false,
});
assert.deepEqual(results.defaultPreventedGateFailsWhenPreventionDisabled, {
  parentRequests: 1,
});
assert.deepEqual(results.captureChangesOrderButNotMultiplicity, {
  order: ["parent-capture", "child-bubble"],
});

console.log(
  "Real-browser DOM wheel listener research PASS:",
  JSON.stringify({ browserCommand: command, results }),
);
