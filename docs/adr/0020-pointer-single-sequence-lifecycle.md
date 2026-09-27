# ADR-0020 — Reusable single-pointer sequence lifecycle uses sticky contamination and fresh-down restart

Status: Accepted

## Context

ADR-0016 selected Pointer Events as the first direct-manipulation substrate and established that pointer identity, pointer type, cancellation, and capture are host concerns.

ADR-0017 established the generic Pointer Events listener and application abort boundary.

ADR-0018 established a conditional semantic-commit theorem for accepted-only gesture policy.

ADR-0019 established synchronous request-origin-scoped Runtime disposition feedback to the originating policy.

Those decisions deliberately left one prerequisite unresolved before a reusable production gesture policy could be considered: what constitutes one reusable Pointer Events gesture sequence when more than one admitted pointer participates.

Issue #164 and PR #165 researched that sequence-lifecycle question independently of swipe threshold, axis, reversal, velocity, pointerType admission, native-control policy, pointer capture, and final recognizer API.

The research compared unsafe primary-only and first-pointer-only policies against a sticky single-pointer contamination model and separated host pointer membership from semantic gesture commitment.

## Decision

For a reusable host policy that intends to recognize **one admitted participating pointer at a time**, WIF adopts the following narrow sequence-lifecycle theorem.

### First admitted pointerdown may establish the candidate sequence

When no admitted participating pointer is active, one fresh admitted `pointerdown` may establish the candidate sequence and its tracked pointer.

This is host-policy state.

It does not create a semantic Runtime request by itself.

### A simultaneous second admitted pointer contaminates the sequence

If another admitted participating pointer becomes active before the current participating set returns to zero, the candidate single-pointer sequence becomes invalid.

That contamination is sticky for the lifetime of that participating set.

The invalid sequence must not emit a semantic navigation intent.

### Dropping from two participating pointers back to one does not revive the sequence

An invalid multi-pointer-contaminated sequence does not become valid merely because one pointer ends and one remains active.

The remaining already-down pointer is part of the contaminated sequence.

It is not silently promoted into a fresh gesture.

### Fresh restart requires zero participating membership plus a new pointerdown

The contaminated sequence resets after all admitted participating pointers from that sequence have terminated.

A later eligible sequence begins from a fresh admitted `pointerdown`.

An already-down remainder is never promoted into a fresh sequence without a new pointerdown.

### Cancellation does not promote another already-down pointer

If an active participating pointer is canceled while another admitted participating pointer remains down, the remaining pointer is not promoted into a new eligible sequence.

The current sequence remains invalid until participating membership reaches zero.

This is layered on ADR-0017: application abort remains a separate hard reset boundary and clears reusable gesture-policy state immediately.

### isPrimary is not single-pointer proof

`PointerEvent.isPrimary` must not be used as proof that only one pointer is participating.

ADR-0016 already established trusted browser evidence with simultaneous primary and non-primary touch pointers.

Issue #164 demonstrated that a primary-only policy can still complete a navigation candidate while a non-primary pointer participates.

### Pointer admission remains host policy

This ADR does not choose which PointerEvents participate.

A caller-owned policy may admit or decline events using host information such as `pointerType`.

The sequence theorem is defined **after admission**.

Therefore this ADR does not standardize:

- touch-only behavior;
- mouse behavior;
- pen behavior;
- a pointerType allowlist;
- isPrimary filtering as admission policy.

### pointerId is active-stream identity, not permanent gesture identity

`PointerEvent.pointerId` is treated as opaque browser-owned identity for the active pointer stream.

The reusable sequence theorem does not require:

- global permanent uniqueness;
- monotonic pointer ids;
- equality with device or automation ids;
- prevention of numeric id reuse after a completed sequence.

After a full policy reset, a fresh admitted pointerdown begins fresh state even if its numeric pointerId was used by an earlier completed sequence.

### Participating non-tracked terminal events matter to host membership

When active participating-pointer membership is used to determine whether a contaminated sequence may reset, `pointerup` or `pointercancel` for admitted non-tracked participants must update that membership.

Those pointers do not become semantic navigation owners.

This is host lifecycle bookkeeping only.

### Host sequence identity and semantic commitment are distinct

The reusable policy must keep these facts separate:

```text
host sequence lifecycle
  participating pointer membership
  tracked pointer
  valid / contaminated
  ended / reset

semantic gesture commitment
  uncommitted
  committed after accepted Runtime disposition
```

A semantic disposition does not rewrite host pointer membership.

Host pointer membership does not become Runtime semantic state.

A returned `accepted` disposition may cause an accepted-only policy under ADR-0018 to mark the semantic gesture committed while the pointer sequence remains host-active.

A returned `rejected` disposition leaves that semantic gesture uncommitted. A policy may clear its proposal state and later issue another policy-defined proposal while the same valid admitted sequence remains active.

### Runtime remains unaware of pointer sequence state

The semantic Runtime receives only normalized flow requests.

It does not receive:

- pointerId;
- PointerEvent objects;
- active-pointer sets;
- contamination state;
- tracked-pointer identity;
- gesture commitment objects.

The policy does not need Runtime snapshots to maintain sequence identity.

### Defensive malformed ordering is bounded host behavior

The research candidate safely handled the following state-machine inputs:

- move before down;
- up before down;
- cancel before down;
- duplicate down for an already-active pointer;
- duplicate terminal event after full reset.

Move/up/cancel before down did not invent a sequence.

Duplicate down for an already-active pointer invalidated the sequence rather than creating another valid sequence.

A duplicate terminal event after reset did not resurrect stale state.

These are bounded deterministic defensive properties.

This ADR does not claim every browser physically emits those orderings.

## Evidence and constraints

Repository authority:

- I-01 keeps pointer and gesture concepts outside the host-independent core.
- I-02 keeps semantic truth under the Runtime.
- I-05 prevents host state from redefining semantic state.
- I-06 requires evidence before widening host policy.
- ADR-0015 prohibits hidden implicit arbitration between overlapping DOM bindings.
- ADR-0016 owns Pointer Events substrate, pointer identity, pointer type, cancellation, capture, and touch-action boundaries.
- ADR-0017 owns generic pointer listener lifecycle and application abort.
- ADR-0018 owns the conditional accepted-only semantic commit theorem.
- ADR-0019 owns synchronous request-origin-scoped disposition routing.

Issue #164 / PR #165 supplied deterministic sequence-lifecycle evidence through the actual production `bindPointerNavigation()`.

### isPrimary counterexample

```text
primary pointer down
primary pointer candidate movement
non-primary pointer down
non-primary pointer up
primary pointer up
-> primary-only policy emits next
```

Therefore primary status alone does not detect multi-pointer participation.

### First-pointer-only counterexample

```text
pointer 1 down
pointer 1 candidate movement
pointer 2 down
pointer 2 up
pointer 1 up
-> next emitted
```

The first-pointer-only candidate never learned the sequence became multi-pointer contaminated.

### Sticky contamination trace

```text
pointer 1 down
pointer 2 down
-> invalid

pointer 2 up
pointer 1 remains
-> still invalid

pointer 1 up
-> active membership zero
-> reset

fresh pointer 3 down
-> new eligible sequence
```

### No silent promotion after cancellation

```text
pointer 1 down
pointer 2 down
-> invalid

pointer 1 cancel
pointer 2 remains down
-> tracked pointer none
-> still invalid
-> no semantic request

pointer 2 ends
-> reset

fresh pointer 3 down
-> eligible
```

### PointerId reuse trace

The same numeric pointerId was reused after complete sequence reset.

Each fresh pointerdown began independent host state and could independently produce a request.

No permanent identity theorem was required.

### Accepted semantic commitment trace

```text
pointer 1 active
next -> Runtime accepted
semantic committed = true
pointer 1 remains host-active

pointer 2 down
host sequence becomes contaminated
no second semantic request
```

Semantic commitment did not terminate or rewrite host membership.

### Rejected semantic commitment trace

After CodeRabbit identified a missing candidate-state assertion, PR #165 added:

```text
pointer 1 active
next -> Runtime rejected
semantic committed = false
proposal pending = false
pointer 1 remains host-active

later eligible move
-> next proposed again
-> Runtime rejected
```

This demonstrates that rejected semantic disposition and host sequence identity remain separate.

### Application abort trace

Application cleanup invoked policy abort and removed all active membership, tracked-pointer, contamination, and candidate state.

### Browser evidence reuse

No new browser fixture was added in #164.

ADR-0016 already owns trusted Chrome evidence for:

- simultaneous primary/non-primary touch pointers;
- opaque browser pointerId;
- pointercancel;
- implicit pointer capture.

Issue #164 discriminated policy-state semantics rather than re-proving those platform facts.

## Consequences

A future reusable single-pointer gesture policy can build on one explicit host sequence lifecycle without placing multi-pointer state in the Runtime or generic listener mechanics.

The policy may separately decide threshold, axis, reversal, timing, and pointer admission later.

A second admitted pointer cannot be treated as irrelevant if the policy claims single-pointer gesture semantics.

A contaminated sequence cannot become valid merely because its active count later falls back to one.

Fresh gesture eligibility is structurally tied to a fresh admitted pointerdown after the previous participating set ends.

Semantic accepted/rejected disposition remains orthogonal to host participating membership.

No new MoonBit/Wasm state, command, or ABI is required.

## Alternatives considered

### isPrimary as single-pointer proof

Rejected.

Simultaneous primary and non-primary pointers exist, and primary-only filtering does not observe contamination.

### Track only the first pointer

Rejected for the selected single-pointer policy class.

Ignoring later admitted participants permits stale navigation after a multi-pointer interval.

### Clear invalidation when active count returns to one

Rejected.

That revives a candidate that spans a multi-pointer interval without a fresh pointerdown.

### Promote another already-down pointer after cancel/up

Rejected.

That constructs a new gesture without a fresh pointerdown.

### Treat pointerId as permanent gesture identity

Rejected.

Only active-stream identity is required.

### Require explicit pointer capture

Not selected.

Sequence identity does not require capture ownership. ADR-0016 keeps capture as host routing state.

### Standardize touch-only admission

Not selected.

Pointer admission remains host policy.

### Put sequence state in Runtime or listener mechanics

Rejected.

Sequence identity is replaceable host gesture policy. Runtime remains semantic owner and the generic listener remains transaction/lifecycle plumbing.

## Deferred frontiers

This ADR does not select:

- displacement threshold;
- horizontal or vertical axis;
- diagonal interpretation;
- direction locking;
- reversal behavior;
- move-time versus pointerup proposal/commit strategy;
- velocity;
- duration;
- pointerType allowlist;
- mouse or pen product behavior;
- native editable/actionable/ignore classification;
- preventDefault policy;
- default touch-action;
- explicit pointer capture API;
- Shadow DOM/composed-path ownership;
- accessibility/focus behavior;
- production gesture recognizer representation;
- React integration;
- package export;
- core/Wasm state or ABI.
