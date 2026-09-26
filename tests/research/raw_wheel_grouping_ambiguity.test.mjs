import assert from "node:assert/strict";
import test from "node:test";

function groupByInactivity(events, inactivityMs) {
  const groups = [];

  for (const event of events) {
    const previousGroup = groups.at(-1);
    const previousEvent = previousGroup?.at(-1);

    if (
      previousEvent === undefined ||
      event.timeStamp - previousEvent.timeStamp > inactivityMs
    ) {
      groups.push([event]);
    } else {
      previousGroup.push(event);
    }
  }

  return groups;
}

function groupByTargetChange(events) {
  const groups = [];

  for (const event of events) {
    const previousGroup = groups.at(-1);
    const previousEvent = previousGroup?.at(-1);

    if (
      previousEvent === undefined ||
      event.targetId !== previousEvent.targetId
    ) {
      groups.push([event]);
    } else {
      previousGroup.push(event);
    }
  }

  return groups;
}

test("H5: one observable same-target trace admits different inactivity groupings", () => {
  const trace = [
    { timeStamp: 0, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
    { timeStamp: 150, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
  ];

  assert.equal(groupByInactivity(trace, 100).length, 2);
  assert.equal(groupByInactivity(trace, 200).length, 1);
});

test("H5: an arbitrary fixed inactivity boundary is discontinuous", () => {
  const justInside = [
    { timeStamp: 0, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
    { timeStamp: 200, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
  ];
  const justOutside = [
    { timeStamp: 0, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
    { timeStamp: 200.001, targetId: "flow-root", deltaY: 20, deltaMode: 0 },
  ];

  assert.equal(groupByInactivity(justInside, 200).length, 1);
  assert.equal(groupByInactivity(justOutside, 200).length, 2);
});

test("H5: same target does not identify whether repeated events are one or multiple gestures", () => {
  const observableTrace = [
    {
      timeStamp: 0,
      targetId: "flow-root",
      deltaY: 30,
      deltaMode: 0,
      momentum: false,
    },
    {
      timeStamp: 80,
      targetId: "flow-root",
      deltaY: 30,
      deltaMode: 0,
      momentum: false,
    },
  ];

  const oneGestureInterpretation = structuredClone(observableTrace);
  const twoGestureInterpretation = structuredClone(observableTrace);

  assert.deepEqual(oneGestureInterpretation, twoGestureInterpretation);
  assert.equal(groupByTargetChange(observableTrace).length, 1);
});

test("H5: target change can split a trace but cannot solve same-target gesture cardinality", () => {
  const targetChanged = [
    { timeStamp: 0, targetId: "child-a", deltaY: 20, deltaMode: 0 },
    { timeStamp: 50, targetId: "child-b", deltaY: 20, deltaMode: 0 },
  ];
  const sameTarget = [
    { timeStamp: 0, targetId: "child-a", deltaY: 20, deltaMode: 0 },
    { timeStamp: 50, targetId: "child-a", deltaY: 20, deltaMode: 0 },
  ];

  assert.equal(groupByTargetChange(targetChanged).length, 2);
  assert.equal(groupByTargetChange(sameTarget).length, 1);
});

test("H2/H5: raw accumulation across different deltaMode values has no unit-preserving sum", () => {
  const trace = [
    { deltaY: 40, deltaMode: 0 },
    { deltaY: 1, deltaMode: 1 },
  ];

  const naiveRawSum = trace.reduce((sum, event) => sum + event.deltaY, 0);
  const referenceConvertedSum = trace.reduce((sum, event) => {
    const multiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
    return sum + event.deltaY * multiplier;
  }, 0);

  assert.equal(naiveRawSum, 41);
  assert.equal(referenceConvertedSum, 56);
  assert.notEqual(naiveRawSum, referenceConvertedSum);
});

test("H5: sign reversal is an explicit grouping policy, not encoded gesture identity", () => {
  const trace = [
    { timeStamp: 0, targetId: "flow-root", deltaY: 30, deltaMode: 0 },
    { timeStamp: 40, targetId: "flow-root", deltaY: -10, deltaMode: 0 },
  ];

  assert.equal(groupByInactivity(trace, 200).length, 1);

  const directionGroups = [];
  for (const event of trace) {
    const previous = directionGroups.at(-1)?.at(-1);
    if (
      previous === undefined ||
      Math.sign(previous.deltaY) !== Math.sign(event.deltaY)
    ) {
      directionGroups.push([event]);
    } else {
      directionGroups.at(-1).push(event);
    }
  }

  assert.equal(directionGroups.length, 2);
});

test("H7: momentum=true can be filtered when exposed but does not identify non-momentum gesture boundaries", () => {
  const trace = [
    { deltaY: 30, momentum: false },
    { deltaY: 20, momentum: false },
    { deltaY: 10, momentum: true },
  ];

  const nonMomentum = trace.filter((event) => event.momentum !== true);

  assert.deepEqual(nonMomentum, [
    { deltaY: 30, momentum: false },
    { deltaY: 20, momentum: false },
  ]);
  assert.equal(nonMomentum.length, 2);
});
