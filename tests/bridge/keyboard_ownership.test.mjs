import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFlowRuntime } from "../../bridge/runtime.mjs";
import { applyKeyboardNavigationIntent } from "../../bridge/keyboard_ownership.mjs";

const artifactUrl = new URL(
  "../../_build/wasm/debug/build/core/core.wasm",
  import.meta.url,
);
const ownershipSourceUrl = new URL(
  "../../bridge/keyboard_ownership.mjs",
  import.meta.url,
);
const modulePromise = readFile(artifactUrl).then((bytes) =>
  WebAssembly.compile(bytes),
);

function makeEvent({ cancelable = true, order = [] } = {}) {
  let preventCount = 0;

  return {
    event: {
      cancelable,
      preventDefault() {
        preventCount += 1;
        order.push("preventDefault");
      },
    },
    get preventCount() {
      return preventCount;
    },
  };
}

function makeRuntime({
  nextDisposition = "accepted",
  previousDisposition = "accepted",
  order = [],
} = {}) {
  const calls = {
    next: 0,
    previous: 0,
  };

  return {
    runtime: {
      next() {
        calls.next += 1;
        order.push("request:next");
        return nextDisposition;
      },
      previous() {
        calls.previous += 1;
        order.push("request:previous");
        return previousDisposition;
      },
    },
    calls,
  };
}

test("KB01: accepted cancelable intent prevents only after semantic disposition", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const keyboard = makeEvent({ cancelable: true, order });

  const disposition = applyKeyboardNavigationIntent({
    runtime,
    event: keyboard.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(keyboard.preventCount, 1);
  assert.deepEqual(order, ["request:next", "preventDefault"]);
});

test("KB02: rejected intent preserves native default behavior", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({
    nextDisposition: "rejected",
    order,
  });
  const keyboard = makeEvent({ cancelable: true, order });

  const disposition = applyKeyboardNavigationIntent({
    runtime,
    event: keyboard.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "rejected");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(keyboard.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("KB03: non-cancelable event does not control semantic acceptance", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const keyboard = makeEvent({ cancelable: false, order });

  const disposition = applyKeyboardNavigationIntent({
    runtime,
    event: keyboard.event,
    intent: "next",
    preventDefault: true,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(keyboard.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("KB04: accepted intent remains unprevented when prevention is disabled", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const keyboard = makeEvent({ cancelable: true, order });

  const disposition = applyKeyboardNavigationIntent({
    runtime,
    event: keyboard.event,
    intent: "next",
    preventDefault: false,
  });

  assert.equal(disposition, "accepted");
  assert.deepEqual(calls, { next: 1, previous: 0 });
  assert.equal(keyboard.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("KB05: one normalized intent issues exactly one corresponding semantic request", () => {
  const next = makeRuntime();
  const nextKeyboard = makeEvent();

  assert.equal(
    applyKeyboardNavigationIntent({
      runtime: next.runtime,
      event: nextKeyboard.event,
      intent: "next",
      preventDefault: false,
    }),
    "accepted",
  );
  assert.deepEqual(next.calls, { next: 1, previous: 0 });

  const previous = makeRuntime();
  const previousKeyboard = makeEvent();

  assert.equal(
    applyKeyboardNavigationIntent({
      runtime: previous.runtime,
      event: previousKeyboard.event,
      intent: "previous",
      preventDefault: false,
    }),
    "accepted",
  );
  assert.deepEqual(previous.calls, { next: 0, previous: 1 });
});

test("KB06: ownership delegates without snapshot-based eligibility prediction", async () => {
  const source = await readFile(ownershipSourceUrl, "utf8");

  assert.doesNotMatch(source, /getSnapshot/);
  assert.doesNotMatch(
    source,
    /\.(?:selected|locked|transition|cooldownActive)\b/,
  );
});

test("KB07: ownership remains stateless and free of raw keyboard policy", async () => {
  const source = await readFile(ownershipSourceUrl, "utf8");

  for (const forbidden of [
    /deltaX/,
    /deltaY/,
    /deltaMode/,
    /threshold/i,
    /burst/i,
    /cooldown/i,
    /Date\.now/,
    /performance\.now/,
    /setTimeout/,
    /setInterval/,
    /addEventListener/,
    /removeEventListener/,
    /\bwindow\b/,
    /\bdocument\b/,
    /defaultPrevented/,
    /stopPropagation/,
    /stopImmediatePropagation/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("KB08: semantic request failure propagates without prevention", () => {
  const order = [];
  const failure = new Error("semantic request failed");
  const keyboard = makeEvent({ cancelable: true, order });
  const runtime = {
    next() {
      order.push("request:next");
      throw failure;
    },
    previous() {
      throw new Error("unexpected previous call");
    },
  };

  assert.throws(
    () =>
      applyKeyboardNavigationIntent({
        runtime,
        event: keyboard.event,
        intent: "next",
        preventDefault: true,
      }),
    (error) => error === failure,
  );

  assert.equal(keyboard.preventCount, 0);
  assert.deepEqual(order, ["request:next"]);
});

test("unsupported normalized intent fails before request or prevention", () => {
  const order = [];
  const { runtime, calls } = makeRuntime({ order });
  const keyboard = makeEvent({ cancelable: true, order });

  assert.throws(() =>
    applyKeyboardNavigationIntent({
      runtime,
      event: keyboard.event,
      intent: "forward",
      preventDefault: true,
    }),
  );

  assert.deepEqual(calls, { next: 0, previous: 0 });
  assert.equal(keyboard.preventCount, 0);
  assert.deepEqual(order, []);
});

test("actual semantic Runtime composition preserves rejection and accepted-only prevention", async () => {
  const module = await modulePromise;
  const runtime = createFlowRuntime(module, {
    phases: ["A", "B", "C"],
    initial: "A",
    transitionDuration: 100,
    cooldown: 20,
  });

  try {
    const boundaryKeyboard = makeEvent();
    assert.equal(
      applyKeyboardNavigationIntent({
        runtime,
        event: boundaryKeyboard.event,
        intent: "previous",
        preventDefault: true,
      }),
      "rejected",
    );
    assert.equal(boundaryKeyboard.preventCount, 0);

    const acceptedKeyboard = makeEvent();
    assert.equal(
      applyKeyboardNavigationIntent({
        runtime,
        event: acceptedKeyboard.event,
        intent: "next",
        preventDefault: true,
      }),
      "accepted",
    );
    assert.equal(acceptedKeyboard.preventCount, 1);

    const activeKeyboard = makeEvent();
    assert.equal(
      applyKeyboardNavigationIntent({
        runtime,
        event: activeKeyboard.event,
        intent: "next",
        preventDefault: true,
      }),
      "rejected",
    );
    assert.equal(activeKeyboard.preventCount, 0);
  } finally {
    runtime.dispose();
  }
});
