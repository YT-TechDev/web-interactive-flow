import assert from "node:assert/strict";
import test from "node:test";

function referenceLikeKeyOnly(event) {
  if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
    return "next";
  }

  if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
    return "previous";
  }

  return null;
}

function conservativeHostGuard(event) {
  if (event.isComposing === true) return null;
  if (event.repeat === true) return null;
  if (event.nativeOwned === true) return null;
  return referenceLikeKeyOnly(event);
}

test("H1: Space key-only mapping cannot distinguish neutral and button ownership", () => {
  const neutral = { key: " ", nativeOwned: false };
  const button = { key: " ", nativeOwned: true };

  assert.equal(referenceLikeKeyOnly(neutral), "next");
  assert.equal(referenceLikeKeyOnly(button), "next");
});

test("H1: ArrowDown key-only mapping cannot distinguish flow region and select ownership", () => {
  const flow = { key: "ArrowDown", nativeOwned: false };
  const select = { key: "ArrowDown", nativeOwned: true };

  assert.equal(referenceLikeKeyOnly(flow), "next");
  assert.equal(referenceLikeKeyOnly(select), "next");
});

test("H2: editable-only classification cannot protect a non-editable button", () => {
  const button = {
    key: " ",
    editable: false,
    actionable: true,
  };

  const editableOnlyDecline = button.editable;
  assert.equal(editableOnlyDecline, false);
  assert.equal(referenceLikeKeyOnly(button), "next");
});

test("H3: repeat is host-input state ignored by a key-only map", () => {
  const initial = { key: "ArrowDown", repeat: false };
  const repeated = { key: "ArrowDown", repeat: true };

  assert.equal(referenceLikeKeyOnly(initial), "next");
  assert.equal(referenceLikeKeyOnly(repeated), "next");
  assert.equal(conservativeHostGuard({ ...repeated, nativeOwned: false }), null);
});

test("H4: composition is host-input state ignored by a key-only map", () => {
  const composing = {
    key: "ArrowDown",
    repeat: false,
    isComposing: true,
    nativeOwned: false,
  };

  assert.equal(referenceLikeKeyOnly(composing), "next");
  assert.equal(conservativeHostGuard(composing), null);
});

test("H5: key can change while physical code remains stable", () => {
  const unshifted = { key: "a", code: "KeyA", shiftKey: false };
  const shifted = { key: "A", code: "KeyA", shiftKey: true };

  assert.notEqual(unshifted.key, shifted.key);
  assert.equal(unshifted.code, shifted.code);
});

test("H5: one effective key meaning can arrive from different physical codes", () => {
  const standardEnter = { key: "Enter", code: "Enter" };
  const numpadEnter = { key: "Enter", code: "NumpadEnter" };

  assert.equal(standardEnter.key, numpadEnter.key);
  assert.notEqual(standardEnter.code, numpadEnter.code);
});

test("H6: cancelability cannot be semantic acceptance", () => {
  const acceptedCancelable = { disposition: "accepted", cancelable: true };
  const acceptedNonCancelable = { disposition: "accepted", cancelable: false };

  assert.equal(acceptedCancelable.disposition, acceptedNonCancelable.disposition);
  assert.notEqual(
    acceptedCancelable.cancelable,
    acceptedNonCancelable.cancelable,
  );
});

test("H7: semantic phase selection does not encode DOM focus", () => {
  const semanticState = { selected: "B" };
  const focusA = { ...semanticState, activeElement: "button-a" };
  const focusB = { ...semanticState, activeElement: "input-b" };

  assert.equal(focusA.selected, focusB.selected);
  assert.notEqual(focusA.activeElement, focusB.activeElement);
});

test("H8: explicit-root observation and global observation are different scopes", () => {
  const eventInsideRoot = { bubblesThrough: ["flow-root", "window"] };
  const eventOutsideRoot = { bubblesThrough: ["outside", "window"] };

  assert.equal(eventInsideRoot.bubblesThrough.includes("flow-root"), true);
  assert.equal(eventOutsideRoot.bubblesThrough.includes("flow-root"), false);
  assert.equal(eventOutsideRoot.bubblesThrough.includes("window"), true);
});
