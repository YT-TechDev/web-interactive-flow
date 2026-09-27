# ADR-0021 — Reusable pointer displacement is finite start-relative scalar displacement under stable projection

Status: Accepted

## Context

ADR-0016 selected Pointer Events as the first direct-manipulation substrate while deliberately leaving gesture threshold, axis, diagonal interpretation, reversal, proposal timing, pointerType policy, and final recognizer API replaceable.

ADR-0017 assigned listener/lifecycle mechanics without moving gesture interpretation into the generic listener.

ADR-0018 established a conditional accepted-only semantic-commit theorem.

ADR-0019 established synchronous request-origin-scoped Runtime disposition feedback.

ADR-0020 established the reusable single-pointer sequence lifecycle: sticky contamination after a second admitted participant, no silent promotion of an already-down remainder, and fresh-down restart only after participating membership returns to zero.

Those decisions left one narrower prerequisite before threshold or recognizer policy could be researched safely: **what displacement quantity is being measured, and under what preconditions is that measurement valid?**

Issue #168 / PR #169 researched candidate measurement algebra.

Issue #170 / PR #171 then attempted to falsify the implicit preconditions of that algebra, including ADR-0020 composition, projection-frame stability, non-finite values, finite subtraction overflow, cancellation/abort reset, and sign-to-intent separation.

The research supports a narrow host-policy measurement theorem without selecting a coordinate API, axis default, threshold, sign mapping, proposal timing, or production recognizer.

## Decision

For a valid host gesture-policy measurement, WIF adopts the following narrow theorem.

```text
Given:
  an ADR-0020-valid admitted single-pointer sequence,
  one stable host-owned scalar projection convention for the compared samples,
  a finite projected baseline,
  a finite projected current sample,
  and a finite computed difference,

define:
  delta = startProjected - currentProjected
```

`delta` is a reusable host-policy measurement of **orientation-relative start displacement in projected units**.

This theorem is conditional.

It does not convert arbitrary PointerEvents into navigation by itself.

### ADR-0020 sequence validity precedes displacement measurement

Displacement measurement is downstream of the reusable single-pointer sequence lifecycle.

A measurement-only policy that ignores later admitted pointers can preserve an old baseline across a multi-pointer interval and emit a stale proposal.

Therefore:

- a second admitted participant may contaminate the current sequence under ADR-0020;
- a contaminated sequence must not continue producing valid measurement-derived navigation proposals;
- fresh measurement eligibility follows fresh ADR-0020 sequence eligibility;
- measurement state does not replace or redefine sequence contamination state.

Sequence validity and measurement validity are separate host-policy facts.

### Projection convention must remain stable for compared samples

The projected baseline and projected current sample must be comparable under one stable scalar coordinate convention for the active measurement interval.

"Stable" means the compared samples use the same projection convention with respect to:

- origin;
- orientation;
- scale;
- scalar interpretation.

This ADR does **not** select that convention.

A host policy may choose, for example:

- an X-like scalar projection;
- a Y-like scalar projection;
- an inverted orientation;
- a translated scalar frame;
- a scaled scalar frame;
- another host-owned scalar projection.

The theorem is about displacement **inside the selected projected coordinate convention**.

It is not authority for one DOM coordinate property or one physical unit.

Changing projection origin, orientation, or scale between the baseline and current sample can manufacture or distort displacement even when the pointer itself has not moved.

Such projection drift is outside the valid theorem precondition.

### Static translation cancels

For one stable constant translation:

```text
(start + c) - (current + c)
= start - current
```

Therefore a stable constant offset does not change start-relative displacement.

This does not authorize mid-sequence offset drift.

### Stable scale/orientation remain deterministic in projected units

A stable scale or inverted orientation still produces deterministic signed displacement in the chosen projected units.

Scale changes the magnitude/unit relationship.

Orientation may invert the sign.

This ADR therefore does not claim:

- one threshold value works across projectors;
- projected units are physical pixels;
- projected units are device-independent;
- sign has one universal semantic meaning.

### Baseline, current sample, and computed displacement must be finite

A valid displacement requires all three to be finite numbers:

```text
Number.isFinite(startProjected)
Number.isFinite(currentProjected)
Number.isFinite(startProjected - currentProjected)
```

The third condition is independently necessary.

Two finite endpoints can still overflow subtraction:

```text
startProjected = Number.MAX_VALUE
currentProjected = -Number.MAX_VALUE

startProjected - currentProjected
-> Infinity
```

Therefore finite endpoints alone are not enough.

`NaN`, `Infinity`, `-Infinity`, or a non-finite computed difference must not become a valid directional displacement.

The exact validation/error/public representation remains deferred.

Measurement-invalid state must not be silently reinterpreted as:

- ADR-0020 sequence contamination;
- Runtime semantic rejection;
- accepted/no-op semantic disposition.

### Start-relative displacement is not per-event step displacement

Research falsified per-event step thresholding as equivalent measurement.

Example:

```text
start = 200
moves = 185, 170, 155, 140

each step = 15
final start-relative delta = +60
```

A later threshold policy may treat those measurements differently.

This ADR records the measured quantity only.

### Cumulative absolute path length is not directional displacement

Research also falsified cumulative absolute path length as equivalent directional measurement.

```text
200 -> 120 -> 200

absolute path = 160
final start-relative delta = 0
```

A pointer that returns to its projected start has zero final start-relative displacement even if it traveled a long path.

### Intermediate event density does not change deterministic endpoint displacement

For deterministic traces with the same projected baseline and current value:

```text
200 -> 120
```

and:

```text
200 -> 180 -> 160 -> 140 -> 120
```

both produce:

```text
delta = +80
```

This is an algebra/state-machine property only.

It does not establish browser coalescing, physical sampling, timing, latency, or performance equivalence.

### Measurement does not commit direction

A later sample may reverse the sign of current start-relative displacement:

```text
start = 100
sample = 40
delta = +60

later sample = 170
delta = -70
```

The measurement primitive reports the current displacement from the original projected baseline.

It does not remember an earlier threshold crossing as semantic commitment.

Gesture commitment remains later policy and, for accepted-only policy classes, remains governed by ADR-0018.

### Proposal timing is separate

Move-time and pointerup-only policies may evaluate the same start-relative displacement definition.

The difference between those policy classes is **when** they evaluate/propose, not the displacement algebra.

This ADR does not select move-time, pointerup-only, or another proposal/commit point.

### Displacement sign does not define universal next/previous mapping

The sign of `delta` is relative to the chosen projector orientation.

For the same physical movement:

```text
project = clientY
-> delta = +80

project = -clientY
-> delta = -80
```

Therefore this ADR does not define:

- positive -> next;
- negative -> previous;
- any universal orientation convention.

Sign-to-intent mapping remains replaceable host policy.

### Projection and finite validation remain host-policy concerns

The generic Pointer Events listener does not acquire:

- coordinate projection;
- projected baseline/current state;
- finite-value validation;
- displacement accumulation;
- threshold;
- sign-to-intent mapping;
- proposal timing.

The Runtime does not receive:

- PointerEvent;
- pointer coordinates;
- projector;
- coordinate-frame metadata;
- projected baseline/current values;
- finite-validation state;
- displacement objects.

Runtime receives only a later normalized semantic request.

No Runtime snapshot is required to compute displacement.

### Cancellation and application abort clear measurement state

`pointercancel` clears the stored measurement baseline/state for that sequence.

A stale later move from the canceled pointer must not produce a request.

After cancellation resets the sequence, a fresh eligible pointerdown on the same binding may establish a new baseline and later produce normalized intent.

Application abort/binding cleanup also terminates accumulated measurement state under ADR-0017.

After full reset, a later sequence may establish a different projection convention **before** capturing its new baseline.

The convention must then remain stable for samples compared within that active measurement interval.

## Evidence and constraints

Repository authority:

- I-01 keeps PointerEvent and projection/coordinate concepts outside the host-independent core.
- I-02 keeps semantic request acceptance under the Runtime rather than host displacement state.
- I-05 prevents host gesture measurement from redefining Runtime semantic truth.
- I-06 requires evidence before widening gesture semantics.
- ADR-0016 owns Pointer Events substrate and keeps gesture interpretation replaceable.
- ADR-0017 owns generic listener lifecycle and application abort.
- ADR-0018 owns the conditional accepted-only semantic-commit theorem.
- ADR-0019 owns synchronous origin-scoped disposition routing.
- ADR-0020 owns reusable single-pointer sequence validity.

Issue #168 / PR #169 established:

- per-step thresholding is not equivalent to start-relative displacement;
- path length is not directional displacement;
- deterministic endpoint displacement is independent of intermediate sample count;
- X/Y-like projectors can reuse the same displacement algebra;
- Euclidean magnitude loses directional sign;
- measurement can reverse sign without committing;
- move-time and pointerup-only policy classes can consume the same measurement;
- exact threshold equality remains unresolved;
- Runtime snapshots are unnecessary;
- projector, threshold parameter, and evaluation timing can remain composed around the measurement primitive.

Issue #170 / PR #171 established:

- measurement alone can reintroduce stale post-multi-pointer proposals;
- ADR-0020 composition suppresses them;
- changing projection origin/scale/orientation can manufacture displacement;
- stable translation cancels;
- stable alternate scale/orientation remains deterministic in projected units;
- non-finite baseline/current values are invalid measurement inputs;
- finite endpoint subtraction may still overflow;
- sequence contamination and measurement validity are distinct state;
- sign-to-intent mapping depends on projector orientation;
- projection validation remains host-local;
- cancellation and application abort clear baseline state;
- fresh same-binding restart after cancellation establishes a new baseline.

Latest research qualification:

- PR #169 CI #289: success.
- PR #169 CodeRabbit: no actionable comments.
- PR #171 latest CI #294: success.
- PR #171 CodeRabbit identified one cancellation-restart evidence gap; commit `0264c01` addressed it.
- PR #171 latest CodeRabbit status: success.
- unresolved review threads: zero.

## Consequences

A later reusable pointer gesture policy can depend on one explicit displacement quantity without importing coordinate state into the Runtime or generic listener.

Threshold research can now state exactly what quantity is compared.

Axis/default-projector research can remain separate because the theorem accepts a host-owned scalar projection convention.

Reversal research can distinguish current displacement sign from semantic commitment.

Proposal timing can remain separate from measurement algebra.

Invalid measurement values remain host validation/state and do not become semantic rejection.

No new MoonBit/Wasm state, command, or ABI is required.

## Alternatives considered

### Per-event step displacement

Rejected as equivalent measurement.

It can miss large total start displacement split across many small samples.

### Cumulative absolute path length

Rejected as equivalent directional displacement.

It remains large after an out-and-back trace whose final directional displacement is zero.

### Euclidean magnitude

Rejected as sufficient directional measurement.

Magnitude discards sign and cannot independently choose a directional semantic request.

### Dynamic projection convention

Rejected as a valid theorem precondition.

Changing origin/scale/orientation while comparing one baseline to later samples can manufacture/disrupt displacement.

### Universal clientY / vertical projection

Not selected.

The theorem accepts a host-owned scalar projection convention.

### Universal positive == next mapping

Rejected as measurement authority.

Projector orientation can invert displacement sign.

### Finite endpoints only

Rejected.

Subtraction may overflow to a non-finite difference.

### Put coordinate/measurement state in Runtime

Rejected.

No semantic Runtime state is needed to compute host displacement.

### Put coordinate/measurement logic in generic pointer listener

Rejected.

The listener remains lower-level transport/lifecycle plumbing with replaceable gesture policy.

## Deferred frontiers

This ADR does not select:

- `clientX`, `clientY`, or another DOM coordinate property;
- viewport/document/local coordinate frame;
- projection function/API shape;
- coordinate units;
- X/Y default;
- axis or diagonal interpretation;
- threshold numeric default;
- threshold equality comparator;
- sign-to-intent mapping;
- direction locking;
- reversal commitment;
- move-time versus pointerup proposal/commit strategy;
- velocity;
- duration;
- pointerType allowlist;
- mouse/pen product behavior;
- native editable/actionable/ignore classification;
- preventDefault policy;
- default `touch-action`;
- explicit pointer capture API;
- Shadow DOM/composed-path ownership;
- accessibility/focus behavior;
- production gesture recognizer representation;
- React integration;
- package export;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- CSS/layout-transform invariance;
- viewport/document/local coordinate equivalence;
- physical-pixel equivalence;
- devicePixelRatio independence;
- browser zoom independence;
- browser event-coalescing equivalence;
- physical-device sampling equivalence;
- cross-browser coordinate precision;
- device-independent gesture feel.
