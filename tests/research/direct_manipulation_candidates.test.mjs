import assert from "node:assert/strict";
import test from "node:test";

function naiveDownCommit(state) {
  return { ...state, selected: state.selected + 1 };
}

function createGestureState() {
  return {
    activePointerId: null,
    startX: null,
    startY: null,
    invalid: false,
    committed: false,
  };
}

function reduceGesture(state, event) {
  if (event.type === "pointerdown") {
    if (state.activePointerId !== null) {
      return { ...state, invalid: true };
    }

    return {
      activePointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      invalid: false,
      committed: false,
    };
  }

  if (event.type === "pointercancel") {
    return createGestureState();
  }

  if (event.type === "pointerup" && event.pointerId === state.activePointerId) {
    return createGestureState();
  }

  return state;
}

test("DM-H4: committing semantic navigation on pointerdown cannot be undone by later pointercancel", () => {
  const runtimeLike = { selected: 0 };

  const afterDown = naiveDownCommit(runtimeLike);
  const afterCancel = { ...afterDown };

  assert.equal(afterDown.selected, 1);
  assert.equal(afterCancel.selected, 1);
});

test("DM-H5: isPrimary does not prove a gesture is single-pointer", () => {
  const pointers = [
    { pointerId: 1, pointerType: "touch", isPrimary: true },
    { pointerId: 2, pointerType: "touch", isPrimary: false },
  ];

  assert.equal(pointers.filter((pointer) => pointer.isPrimary).length, 1);
  assert.equal(pointers.length, 2);
});

test("DM-H6: pointercancel must clear accumulated gesture state before a fresh sequence", () => {
  let state = createGestureState();

  state = reduceGesture(state, {
    type: "pointerdown",
    pointerId: 7,
    clientX: 10,
    clientY: 100,
  });

  assert.equal(state.activePointerId, 7);
  assert.equal(state.startY, 100);

  state = reduceGesture(state, {
    type: "pointercancel",
    pointerId: 7,
  });

  assert.deepEqual(state, createGestureState());

  state = reduceGesture(state, {
    type: "pointerdown",
    pointerId: 8,
    clientX: 10,
    clientY: 250,
  });

  assert.equal(state.activePointerId, 8);
  assert.equal(state.startY, 250);
});

test("DM-H9: threshold crossing followed by reversal does not define one universal commit theorem", () => {
  const samples = [100, 40, 130];

  const firstDelta = samples[0] - samples[1];
  const finalDelta = samples[0] - samples[2];

  assert.ok(firstDelta > 50);
  assert.ok(finalDelta < 0);
});

test("DM-H8: pointerType is host policy input, not semantic flow state", () => {
  const sameMovement = [
    { pointerType: "touch", deltaY: 80 },
    { pointerType: "mouse", deltaY: 80 },
    { pointerType: "pen", deltaY: 80 },
  ];

  assert.deepEqual(
    sameMovement.map(({ deltaY }) => deltaY),
    [80, 80, 80],
  );
  assert.deepEqual(
    sameMovement.map(({ pointerType }) => pointerType),
    ["touch", "mouse", "pen"],
  );
});

test("DM-H7: pointer capture is routing state and need not alter Runtime eligibility", () => {
  const request = { intent: "next", disposition: "accepted" };

  const withoutCapture = { ...request, hasPointerCapture: false };
  const withCapture = { ...request, hasPointerCapture: true };

  assert.equal(withoutCapture.intent, withCapture.intent);
  assert.equal(withoutCapture.disposition, withCapture.disposition);
  assert.notEqual(
    withoutCapture.hasPointerCapture,
    withCapture.hasPointerCapture,
  );
});

test("DM-H11: dual TouchEvent and PointerEvent bindings can double-observe one conceptual gesture", () => {
  const observations = [
    { substrate: "pointer", gestureId: 1, intent: "next" },
    { substrate: "touch", gestureId: 1, intent: "next" },
  ];

  assert.equal(observations.length, 2);
  assert.equal(observations[0].gestureId, observations[1].gestureId);
  assert.equal(observations[0].intent, observations[1].intent);
});

test("DM-H3: touch-action policy can vary while semantic Runtime state remains identical", () => {
  const runtime = { selected: "A", locked: false };

  const auto = { runtime, touchAction: "auto" };
  const none = { runtime, touchAction: "none" };

  assert.deepEqual(auto.runtime, none.runtime);
  assert.notEqual(auto.touchAction, none.touchAction);
});

test("resolver decline remains before semantic request", () => {
  let runtimeCalls = 0;

  function dispatch(resolveIntent) {
    const intent = resolveIntent();

    if (intent === null) return "declined";

    runtimeCalls += 1;
    return "requested";
  }

  assert.equal(dispatch(() => null), "declined");
  assert.equal(runtimeCalls, 0);
});

test("semantic disposition remains independent of pointer lifecycle state", () => {
  const accepted = {
    disposition: "accepted",
    pointerType: "touch",
    isPrimary: true,
    hasPointerCapture: false,
  };
  const rejected = {
    disposition: "rejected",
    pointerType: "touch",
    isPrimary: true,
    hasPointerCapture: true,
  };

  assert.equal(accepted.disposition, "accepted");
  assert.equal(rejected.disposition, "rejected");
  assert.notEqual(
    accepted.hasPointerCapture,
    rejected.hasPointerCapture,
  );
});
