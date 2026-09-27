# ADR-0018 — Accepted-only pointer gesture commit observes Runtime disposition at the host boundary

Status: Accepted

## Context

ADR-0016 selected Pointer Events as the first DOM direct-manipulation substrate without selecting one WIF-wide gesture recognizer.

ADR-0017 then established the first Pointer Events listener/lifecycle boundary:

- the listener forwards each delivered PointerEvent once to replaceable stateful host gesture policy;
- policy may produce zero or one normalized `next` / `previous` intent for that delivered event;
- a valid intent is submitted to the semantic Runtime;
- binding cleanup terminates active gesture-policy state;
- listener mechanics do not own threshold, axis, reversal, pointer identity, or semantic eligibility.

ADR-0017 deliberately guarantees at most one Runtime request per delivered event. It does not guarantee at most one accepted navigation per pointer sequence.

Issue #152 researched whether a reusable stateful move-time gesture policy can provide that stronger gesture-level guarantee without learning the Runtime disposition.

The research used:

- the actual production Pointer Events listener;
- research-only alternative gesture policies;
- deterministic proposal-commit and no-feedback counterexamples;
- production `compileFlowModule()`;
- production `createFlowRuntime()`;
- qualified MoonBit/Wasm;
- a real-Chrome browser composition using explicitly synthetic/untrusted PointerEvents for this semantic-feedback frontier.

The browser fixture was intentionally not physical-input or browser-default-action evidence. Those concerns remain governed by ADR-0016 and ADR-0017.

## Decision

WIF adopts a conditional accepted-only gesture-commit theorem.

For a reusable stateful Pointer Events gesture policy that chooses all of these semantics:

1. one active pointer sequence may produce at most one **accepted semantic navigation**;
2. a Runtime rejection does not consume that pointer sequence;
3. policy may allow later retry or direction reversal within the same still-active sequence;

the policy must not treat proposal emission as gesture commitment.

Instead, commitment follows the authoritative Runtime `accepted` disposition.

Conceptually:

```text
PointerEvent sequence
      |
      v
stateful host gesture policy
      |
      +--> decline / accumulate / reset
      |
      +--> next | previous proposal
                 |
                 v
              Runtime
          accepted | rejected
                 |
                 v
        host disposition observation
                 |
                 +--> accepted
                 |      -> policy may commit/consume this sequence
                 |
                 +--> rejected
                        -> policy remains uncommitted for any
                           policy-defined retry/reversal
```

A policy that promises those semantics therefore requires a narrow host-layer mechanism to observe the Runtime disposition after its proposal is submitted.

This ADR does **not** select one public callback, method, transaction type, listener signature, controller shape, or package API for that observation.

### Runtime remains the sole semantic eligibility owner

Gesture policy does not predict whether a normalized request is semantically valid.

It does not inspect or mirror:

- selected phase;
- transition state;
- cooldown;
- lock state;
- Runtime snapshot state.

The policy proposes a normalized `next` or `previous`.

The Runtime alone decides whether that request is `accepted` or `rejected`.

Disposition feedback communicates that already-authoritative result. It does not create a second eligibility implementation.

### Proposal emission is not semantic commitment

Issue #152 recorded the counterexample:

```text
Runtime at C
same active pointer sequence

move
-> policy proposes next
-> Runtime rejects
-> semantic state remains C

later reverse movement
-> previous would be semantically valid
```

If policy marks the gesture committed merely because it emitted `next`, the later valid `previous` proposal is suppressed even though no semantic navigation occurred.

Therefore proposal emission is insufficient evidence of accepted-only gesture commitment.

### No feedback cannot guarantee one accepted navigation per move-time sequence

Issue #152 also recorded:

```text
Runtime A
zero transition / zero cooldown
same active pointer sequence

move #1
-> next
-> accepted
-> A -> B

move #2
-> next
-> accepted
-> B -> C
```

The existing listener remains correct under ADR-0017 because each delivered event produced only one request.

The counterexample establishes a distinct gesture-policy fact: a retry-capable move-time policy cannot know that its first proposal consumed the gesture unless some host-layer composition communicates the accepted disposition back to that policy.

### Rejection does not automatically consume the gesture

For accepted-only semantics, `rejected` means the semantic Runtime did not accept that proposal.

The qualified candidate preserved:

```text
Runtime C

next
-> rejected
policy remains uncommitted

same active sequence reverses

previous
-> accepted
-> C -> B
policy commits
```

This ADR does not require every gesture policy to support reversal or retry.

It establishes only that a policy which *does* promise retry/reversal after semantic rejection must not erase that possibility by treating rejection as acceptance.

### Acceptance may consume the remainder of the active sequence

The accepted-only candidate also established:

```text
Runtime A

next
-> accepted
-> A -> B
policy commits

later movement
later reversal
-> no second semantic request
```

For the conditional policy described by this ADR, one accepted request may consume the remainder of that active pointer sequence for WIF navigation.

This is not a universal WIF gesture rule. It is the consequence of choosing the one-accepted-navigation-per-sequence policy contract.

### Narrow disposition is sufficient

The research candidate needed only the returned semantic disposition:

```text
accepted | rejected
```

It did not need `runtime.getSnapshot()` or mirrors of semantic state.

Therefore a future host composition should not widen feedback to full Runtime snapshots merely to implement accepted-only gesture commitment.

### Runtime does not mutate gesture policy

The semantic Runtime remains unaware of:

- PointerEvent objects;
- gesture identity;
- pointer coordinates;
- gesture commitment;
- pointer cancellation;
- listener lifecycle.

Host composition may route the Runtime disposition back to host gesture policy.

The Runtime itself does not acquire a dependency on that policy or directly mutate its state.

### Listener mechanics do not become gesture semantics

ADR-0017 remains authoritative.

Listener mechanics still do not own:

- threshold;
- axis;
- diagonal policy;
- velocity/duration;
- direction reversal;
- pointer identity;
- multi-pointer policy;
- pointerType allowlists;
- gesture commitment.

A future composition may add a disposition-observation seam around or adjacent to request submission, but that does not justify moving gesture semantics into generic listener mechanics.

### Existing production listener is not invalidated

The current production listener has a deliberately lower-level contract:

```text
one delivered PointerEvent
  -> policy handle once
  -> zero or one normalized intent
  -> zero or one Runtime request
```

That contract does not promise one Runtime request or one accepted navigation per entire pointer gesture.

Issue #152 demonstrates when a stronger reusable gesture policy would need disposition observation.

It does not make the current listener semantically incorrect.

### Gesture termination remains governed by ADR-0017

Browser `pointercancel` and application-driven binding teardown remain independent gesture termination paths.

The accepted-only research candidate reset its gesture/commit state on both paths.

ADR-0018 does not redefine listener lifecycle or cancellation ownership.

### Runtime failure before disposition is not rejection

A thrown/invalid Runtime request path that yields no semantic disposition is distinct from a normal `rejected` result.

Host policy must not silently reinterpret failure-before-disposition as semantic rejection merely to drive gesture state.

Exact validation/error/public exception representation remains outside this ADR.

### Pointerup-only recognition remains a distinct policy

A pointerup-only recognizer can naturally avoid repeated move-time proposals by emitting no request until pointerup.

That does not establish pointerup-only recognition as WIF-wide authority.

Selecting it universally would freeze a gesture commit-point and UX policy that ADR-0016 and ADR-0017 intentionally left replaceable.

Move-time recognition remains a legitimate policy class and is present in the pinned behavioral reference.

## Evidence and constraints

Repository authority:

- I-01 keeps Pointer Events and gesture objects outside the host-independent core.
- I-02 keeps semantic eligibility and request acceptance under one semantic owner.
- I-04 requires valid normalized requests to have observable disposition.
- I-05 prevents host state from redefining semantic truth.
- I-06 requires evidence before widening observable semantics.
- ADR-0016 selects Pointer Events as substrate while leaving gesture policy replaceable.
- ADR-0017 assigns listener/lifecycle mechanics without selecting a gesture algorithm or commit point.

Issue #152 / PR #153 established the disposition-feedback evidence.

### R1 — duplicate accepted navigation without gesture-level feedback

Using production Runtime/Wasm with zero transition/cooldown:

```text
A -> B -> C
```

was observed from two move-time proposals in one research gesture.

### R2 — rejected next followed by valid reversal

Starting at C:

```text
next -> rejected
reverse
previous -> accepted
C -> B
```

was preserved by accepted-only feedback.

Proposal-time commit suppressed the valid reversal and remained at C.

### R3 — acceptance consumes the candidate gesture

Starting at A:

```text
next -> accepted -> B
later same-gesture move/reversal
-> no further semantic request
```

was established for the accepted-only candidate.

### Evidence limits

The browser composition used Chrome 153 / ChromeDriver 153 and synthetic/untrusted PointerEvents.

That fixture establishes semantic host-policy/Runtime composition against the actual Runtime/Wasm.

It does not establish:

- physical-device behavior;
- trusted input equivalence;
- browser default-action behavior;
- cross-browser equivalence;
- Safari/iOS compatibility;
- pen compatibility;
- accessibility conformance.

Those claims require separate evidence.

## Consequences

A later reusable pointer gesture policy may choose an accepted-only contract without duplicating Runtime eligibility state.

If it does, host composition must preserve the request transaction strongly enough to communicate the authoritative disposition back to the policy that proposed it.

That feedback can remain narrow and host-local.

No new MoonBit/Wasm semantic state is required.

No Runtime snapshot dependency is required.

The exact public API remains deferred.

## Alternatives considered

### Commit when policy emits a proposal

Rejected for accepted-only semantics.

Runtime rejection demonstrates that proposal emission is not semantic acceptance.

### Commit on every Runtime disposition

Rejected for accepted-only retry/reversal semantics.

Treating `rejected` as consumption reproduces the proposal-commit failure.

### Never commit and provide no feedback

Rejected for one-accepted-navigation-per-sequence move-time semantics.

One gesture can then produce multiple accepted navigations when Runtime becomes immediately eligible again.

### Let gesture policy inspect Runtime snapshots

Rejected.

This duplicates semantic eligibility knowledge in host policy and is unnecessary because the Runtime disposition alone is sufficient.

### Let Runtime mutate gesture-policy state directly

Rejected.

That would couple the host-independent semantic Runtime to host gesture concepts.

### Let generic listener mechanics own commitment

Rejected.

Commitment depends on gesture policy and would move threshold/reversal/gesture-sequence semantics into the wrong layer.

### Standardize pointerup-only recognition

Not selected.

It is a legitimate host policy that avoids repeated move-time proposals, but current evidence does not justify making its commit point universal.

## Deferred frontiers

This ADR does not select:

- a public disposition-feedback callback or method;
- a transaction/result object shape;
- a production reusable gesture recognizer;
- threshold;
- axis or diagonal rules;
- velocity or duration;
- exact reversal strategy;
- pointerType allowlist;
- multi-pointer policy;
- native-control/ignore policy;
- explicit pointer capture API;
- default `touch-action`;
- overscroll policy;
- Shadow DOM/composed-path ownership;
- accessibility/focus behavior;
- React integration;
- package export;
- broad browser/device compatibility;
- core/Wasm state or ABI changes.
