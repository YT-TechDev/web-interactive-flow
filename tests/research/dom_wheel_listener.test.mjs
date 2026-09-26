import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFlowRuntime } from "../../bridge/runtime.mjs";
import { applyWheelNavigationIntent } from "../../bridge/wheel_ownership.mjs";

const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

function makeCancelableEvent() {
  let defaultPrevented = false;

  return {
    event: {
      cancelable: true,
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault() {
        defaultPrevented = true;
      },
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  };
}

test("research: duplicate delivery may advance twice when lifecycle settles synchronously", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });

  try {
    const wheel = makeCancelableEvent();

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: false,
      }),
      "accepted",
    );
    assert.equal(runtime.getSnapshot().selected, "B");

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: false,
      }),
      "accepted",
    );
    assert.equal(runtime.getSnapshot().selected, "C");
  } finally {
    runtime.dispose();
  }
});

test("research: defaultPrevented does not by itself deduplicate semantic delivery", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 0,
    cooldown: 0,
  });

  try {
    const wheel = makeCancelableEvent();

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: true,
      }),
      "accepted",
    );
    assert.equal(wheel.defaultPrevented, true);
    assert.equal(runtime.getSnapshot().selected, "B");

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: true,
      }),
      "accepted",
    );
    assert.equal(runtime.getSnapshot().selected, "C");
  } finally {
    runtime.dispose();
  }
});

test("research: active transition can mask duplicate delivery but is not a listener guarantee", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 0,
  });

  try {
    const wheel = makeCancelableEvent();

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: false,
      }),
      "accepted",
    );
    assert.equal(runtime.getSnapshot().selected, "B");

    assert.equal(
      applyWheelNavigationIntent({
        runtime,
        event: wheel.event,
        intent: "next",
        preventDefault: false,
      }),
      "rejected",
    );
    assert.equal(runtime.getSnapshot().selected, "B");
  } finally {
    runtime.dispose();
  }
});
