import assert from "node:assert/strict";
import test from "node:test";

import { createAcceptedPointerRecognizer } from "../../adapters/dom/accepted_pointer_recognizer.mjs";
import { bindPointerNavigation } from "../../adapters/dom/pointer_listener.mjs";

class RecordingTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    );
  }

  dispatch(event) {
    for (const listener of [
      ...(this.listeners.get(event.type) ?? []),
    ]) {
      listener.call(this, event);
    }
  }
}

function pointerEvent(
  type,
  {
    pointerId = 1,
    pointerType = "touch",
    clientX = 0,
    clientY = 0,
  } = {},
) {
  return {
    type,
    pointerId,
    pointerType,
    clientX,
    clientY,
  };
}

function createRuntime(dispositions = ["accepted"]) {
  const calls = [];
  let index = 0;

  function request(intent, args) {
    const disposition =
      dispositions[
        Math.min(index, dispositions.length - 1)
      ];
    index += 1;

    calls.push({
      intent,
      args,
      disposition,
    });

    return disposition;
  }

  return {
    calls,
    runtime: {
      next(...args) {
        return request("next", args);
      },

      previous(...args) {
        return request("previous", args);
      },

      getSnapshot() {
        throw new Error(
          "accepted pointer recognizer must not read Runtime snapshots",
        );
      },
    },
  };
}

const admitAll = () => true;
const projectY = (event) => event.clientY;
const moveTime = (event) =>
  event.type === "pointermove";
const pointerupTime = (event) =>
  event.type === "pointerup";

function qualifyAbove(threshold) {
  return (displacement) =>
    Math.abs(displacement) > threshold;
}

function positiveNext(displacement) {
  if (displacement === 0) {
    return null;
  }

  return displacement > 0
    ? "next"
    : "previous";
}

function positivePrevious(displacement) {
  if (displacement === 0) {
    return null;
  }

  return displacement > 0
    ? "previous"
    : "next";
}

function createPolicy(overrides = {}) {
  return createAcceptedPointerRecognizer({
    admitPointer: admitAll,
    project: projectY,
    qualify: qualifyAbove(40),
    mapIntent: positiveNext,
    shouldPropose: moveTime,
    ...overrides,
  });
}

function bind(policy, runtime) {
  const target = new RecordingTarget();
  const cleanup = bindPointerNavigation({
    target,
    runtime,
    policy,
  });

  return {
    target,
    cleanup,
  };
}

function dispatch(target, events) {
  for (const event of events) {
    target.dispatch(event);
  }
}

test("construction requires every explicit collaborator", () => {
  assert.throws(
    () => createAcceptedPointerRecognizer(),
    /invalid pointer recognizer options/,
  );

  const valid = {
    admitPointer: admitAll,
    project: projectY,
    qualify: qualifyAbove(40),
    mapIntent: positiveNext,
    shouldPropose: moveTime,
  };

  for (const key of Object.keys(valid)) {
    assert.throws(
      () =>
        createAcceptedPointerRecognizer({
          ...valid,
          [key]: null,
        }),
      /invalid/,
      key,
    );
  }
});

test("production recognizer composes through the unchanged pointer listener with normalized zero-argument Runtime requests", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
    ]);

    assert.deepEqual(calls, [
      {
        intent: "next",
        args: [],
        disposition: "accepted",
      },
    ]);
  } finally {
    cleanup();
  }
});

test("X-like and Y-like projectors reuse the same production recognizer source", () => {
  const candidates = [
    {
      project: (event) => event.clientX,
      down: pointerEvent(
        "pointerdown",
        {
          clientX: 200,
          clientY: 50,
        },
      ),
      move: pointerEvent(
        "pointermove",
        {
          clientX: 140,
          clientY: 50,
        },
      ),
    },
    {
      project: (event) => event.clientY,
      down: pointerEvent(
        "pointerdown",
        {
          clientX: 50,
          clientY: 200,
        },
      ),
      move: pointerEvent(
        "pointermove",
        {
          clientX: 50,
          clientY: 140,
        },
      ),
    },
  ];

  for (const candidate of candidates) {
    const policy = createPolicy({
      project: candidate.project,
    });
    const { runtime, calls } = createRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        candidate.down,
        candidate.move,
      ]);

      assert.deepEqual(
        calls.map(({ intent }) => intent),
        ["next"],
      );
    } finally {
      cleanup();
    }
  }
});

test("qualification remains an explicit collaborator with no production threshold default", () => {
  const observed = [];

  for (const threshold of [40, 80]) {
    const policy = createPolicy({
      qualify: qualifyAbove(threshold),
    });
    const { runtime, calls } = createRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
      ]);

      observed.push(
        calls.map(({ intent }) => intent),
      );
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(observed, [
    ["next"],
    [],
  ]);
});

test("intent mapping remains an explicit collaborator", () => {
  const observed = [];

  for (const mapIntent of [
    positiveNext,
    positivePrevious,
  ]) {
    const policy = createPolicy({
      mapIntent,
    });
    const { runtime, calls } = createRuntime();
    const { target, cleanup } =
      bind(policy, runtime);

    try {
      dispatch(target, [
        pointerEvent(
          "pointerdown",
          { clientY: 200 },
        ),
        pointerEvent(
          "pointermove",
          { clientY: 140 },
        ),
      ]);

      observed.push(
        calls.map(({ intent }) => intent),
      );
    } finally {
      cleanup();
    }
  }

  assert.deepEqual(observed, [
    ["next"],
    ["previous"],
  ]);
});

test("move-time and pointerup-time remain explicit timing collaborators", () => {
  const movePolicy = createPolicy({
    shouldPropose: moveTime,
  });
  const upPolicy = createPolicy({
    shouldPropose: pointerupTime,
  });
  const moveRuntime = createRuntime([
    "rejected",
  ]);
  const upRuntime = createRuntime([
    "rejected",
  ]);
  const moveBinding = bind(
    movePolicy,
    moveRuntime.runtime,
  );
  const upBinding = bind(
    upPolicy,
    upRuntime.runtime,
  );

  try {
    const down = pointerEvent(
      "pointerdown",
      { clientY: 200 },
    );
    const move = pointerEvent(
      "pointermove",
      { clientY: 140 },
    );
    const up = pointerEvent(
      "pointerup",
      { clientY: 140 },
    );

    moveBinding.target.dispatch(down);
    upBinding.target.dispatch(down);
    moveBinding.target.dispatch(move);
    upBinding.target.dispatch(move);

    assert.deepEqual(
      moveRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
    assert.deepEqual(upRuntime.calls, []);

    moveBinding.target.dispatch(up);
    upBinding.target.dispatch(up);

    assert.deepEqual(
      moveRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
    assert.deepEqual(
      upRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
  } finally {
    moveBinding.cleanup();
    upBinding.cleanup();
  }
});

test("rejection leaves the accepted-only sequence uncommitted while later acceptance consumes it", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime([
    "rejected",
    "accepted",
    "accepted",
  ]);
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 140 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 270 },
      ),
      pointerEvent(
        "pointermove",
        { clientY: 100 },
      ),
    ]);

    assert.deepEqual(
      calls.map(
        ({ intent, disposition }) => ({
          intent,
          disposition,
        }),
      ),
      [
        {
          intent: "next",
          disposition: "rejected",
        },
        {
          intent: "previous",
          disposition: "accepted",
        },
      ],
    );
  } finally {
    cleanup();
  }
});

test("second admitted pointer causes sticky contamination until zero membership and a fresh down", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 1,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointerdown",
        {
          pointerId: 2,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 1,
          clientY: 100,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 2,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 1,
          clientY: 80,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 1,
          clientY: 80,
        },
      ),
    ]);

    assert.deepEqual(calls, []);

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 3,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 3,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("duplicate down contaminates rather than creating a second valid sequence", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 4,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointerdown",
        {
          pointerId: 4,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 4,
          clientY: 100,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 4,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(calls, []);

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 4,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 4,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("pointercancel resets completed participation without fabricating a semantic request", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 5,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointercancel",
        {
          pointerId: 5,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 5,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(calls, []);

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 5,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 5,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("listener cleanup aborts recognizer state so rebinding the same policy requires a fresh down", () => {
  const policy = createPolicy();
  const firstRuntime = createRuntime();
  const first = bind(
    policy,
    firstRuntime.runtime,
  );

  first.target.dispatch(
    pointerEvent(
      "pointerdown",
      {
        pointerId: 6,
        clientY: 200,
      },
    ),
  );
  first.cleanup();

  const secondRuntime = createRuntime();
  const second = bind(
    policy,
    secondRuntime.runtime,
  );

  try {
    second.target.dispatch(
      pointerEvent(
        "pointermove",
        {
          pointerId: 6,
          clientY: 100,
        },
      ),
    );

    assert.deepEqual(
      secondRuntime.calls,
      [],
    );

    dispatch(second.target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 6,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 6,
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      secondRuntime.calls.map(
        ({ intent }) => intent,
      ),
      ["next"],
    );
  } finally {
    second.cleanup();
  }
});

test("pointerType admission remains caller-owned", () => {
  const policy = createPolicy({
    admitPointer: (event) =>
      event.pointerType === "touch",
  });
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 7,
          pointerType: "pen",
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 7,
          pointerType: "pen",
          clientY: 100,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 7,
          pointerType: "pen",
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(calls, []);

    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 8,
          pointerType: "touch",
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 8,
          pointerType: "touch",
          clientY: 100,
        },
      ),
    ]);

    assert.deepEqual(
      calls.map(({ intent }) => intent),
      ["next"],
    );
  } finally {
    cleanup();
  }
});

test("non-finite baseline, current sample, and subtraction never become directional proposals", () => {
  const policy = createPolicy();
  const { runtime, calls } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    dispatch(target, [
      pointerEvent(
        "pointerdown",
        {
          pointerId: 9,
          clientY: Number.NaN,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 9,
          clientY: 0,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 9,
          clientY: 0,
        },
      ),
      pointerEvent(
        "pointerdown",
        {
          pointerId: 10,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 10,
          clientY: Number.POSITIVE_INFINITY,
        },
      ),
      pointerEvent(
        "pointerup",
        {
          pointerId: 10,
          clientY: 200,
        },
      ),
      pointerEvent(
        "pointerdown",
        {
          pointerId: 11,
          clientY: Number.MAX_VALUE,
        },
      ),
      pointerEvent(
        "pointermove",
        {
          pointerId: 11,
          clientY: -Number.MAX_VALUE,
        },
      ),
    ]);

    assert.deepEqual(calls, []);
  } finally {
    cleanup();
  }
});

test("invalid mapper output remains a generic listener validation failure", () => {
  const policy = createPolicy({
    mapIntent: () => "sideways",
  });
  const { runtime } = createRuntime();
  const { target, cleanup } =
    bind(policy, runtime);

  try {
    target.dispatch(
      pointerEvent(
        "pointerdown",
        { clientY: 200 },
      ),
    );

    assert.throws(
      () =>
        target.dispatch(
          pointerEvent(
            "pointermove",
            { clientY: 100 },
          ),
        ),
      /invalid pointer navigation intent/,
    );
  } finally {
    cleanup();
  }
});
