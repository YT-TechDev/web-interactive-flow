# ADR-0025 — Reusable pointer recognizer boundary composes explicit host policies

Status: Accepted

## Context

ADR-0017 establishes the generic Pointer Events listener as lifecycle and normalized-request plumbing rather than gesture semantics.

ADR-0018 establishes a conditional accepted-only gesture-commit theorem: for a policy class that allows retry or reversal after semantic rejection and permits at most one accepted semantic navigation per active sequence, proposal emission is not commitment and authoritative Runtime `accepted` may consume the remaining sequence.

ADR-0019 places the minimum feedback seam synchronously at the originating pointer-listener request transaction.

ADR-0020 through ADR-0024 separately establish:

- one admitted single-pointer sequence lifecycle with sticky multi-pointer contamination and fresh-down restart;
- finite start-relative scalar displacement under a stable host-owned projection;
- threshold qualification as projected-unit host policy;
- orientation-relative sign-to-intent mapping as replaceable host policy;
- proposal timing as replaceable host policy.

Those decisions deliberately avoided selecting a production recognizer representation or universal UX defaults.

Issue #186 / PR #187 therefore tested the next architectural question:

> Are the accepted pointer authorities compositionally sufficient for a reusable host-side recognizer boundary, or does composition itself require new Runtime/listener semantics or premature default choices?

The research used production `bindPointerNavigation()` unchanged and a local research-only composition witness.

That helper is evidence, not the production API.

## Decision

The accepted pointer authorities are **compositionally sufficient** to express a reusable host-side accepted-only single-pointer recognizer boundary using explicit host-owned collaborators.

A representative ownership composition is:

```text
caller-owned admission
  -> ADR-0020 sequence lifecycle
  -> explicit scalar projection / ADR-0021 displacement
  -> explicit qualification / ADR-0022
  -> explicit sign mapping / ADR-0023
  -> explicit proposal timing / ADR-0024
  -> next | previous | no proposal
  -> generic production pointer listener
  -> Runtime disposition
  -> ADR-0018 accepted-only commitment
       via ADR-0019 synchronous feedback
```

This diagram records composable responsibility boundaries.

It is **not**:

- a required internal function-call order for every implementation;
- a public constructor/configuration schema;
- authority for the research helper shape;
- a selection of repository-wide gesture defaults.

### Recognizer state remains host policy

The reusable composition may own host-local state needed by the selected policy class, including:

- admitted participating pointer membership;
- tracked pointer identity;
- ADR-0020 valid/contaminated sequence state;
- one projected baseline for an active measurement;
- accepted-only commitment state;
- collaborator-local state where separately authorized.

That state does not become MoonBit/Wasm semantic state merely because the policies are composed.

Runtime remains unaware of:

- PointerEvent objects;
- pointer identity;
- pointerType;
- projected coordinates;
- displacement;
- threshold/comparator;
- mapping convention;
- proposal timing;
- host sequence contamination;
- gesture commitment.

### Generic pointer listener remains recognizer-agnostic

Production `bindPointerNavigation()` was used unchanged by the composition research.

The listener continues to own only its established boundary:

```text
delivered PointerEvent
  -> policy.handle(event)
  -> no proposal | next | previous
  -> corresponding Runtime request
  <- accepted | rejected
  -> synchronous feedback to the originating policy when supported
```

The listener does not need to understand or duplicate:

- admission policy;
- sequence membership;
- scalar projection;
- displacement;
- qualification;
- mapping;
- proposal timing;
- reversal;
- semantic commitment.

Therefore composition does not justify widening generic listener mechanics into a production recognizer.

### Runtime snapshots are not required for recognizer composition

The research Runtime witness mechanically failed if the recognizer attempted `getSnapshot()`.

The tested accepted-only composition required only:

- normalized `next | previous` proposal;
- authoritative returned `accepted | rejected` disposition.

This preserves ADR-0018/ADR-0019.

Host policy must not mirror Runtime phase, transition, cooldown, lock, or request-eligibility state to implement the recognized composition.

### Projection remains explicit host policy

Research reused one composition machinery with independent scalar projectors.

X-like and Y-like projection candidates both formed valid host-side measurements without changing the listener or Runtime boundary.

Research also preserved ADR-0023 covariance by changing projector orientation and sign mapping together while preserving the tested normalized intent relation.

Composition therefore does not require selecting:

- `clientX`;
- `clientY`;
- X or Y;
- one orientation;
- one coordinate frame.

ADR-0021 stability/finite-measurement requirements still apply.

### Qualification remains explicit host policy

Research reused the same composition machinery with different explicit qualification thresholds.

The same movement could qualify under one candidate and miss under another without changing listener or Runtime behavior.

Composition therefore does not require selecting:

- a numeric threshold;
- one comparator;
- one unit;
- symmetric/asymmetric bounds;
- fixed/adaptive policy globally.

ADR-0022 remains the authority for qualification ownership and evidence limits.

### Mapping remains explicit host policy

Research reused the same composition machinery with different explicit sign mappers.

Changing only the mapper changed normalized intent without changing measurement, listener, or Runtime state.

Composition therefore does not require a repository-wide positive/negative semantic mapping.

ADR-0023 remains the mapping authority.

### Proposal timing remains explicit host policy

Move-time and pointerup-time candidates reused the same composition machinery.

Their already-authorized observable timing differences remained intact.

Composition therefore does not require selecting one timing class as the WIF-wide default.

ADR-0024 remains the proposal-timing authority.

### Admission remains caller-owned host policy

Research reused the same composition machinery with different pointerType admission candidates.

A touch-only candidate and a mouse-only candidate each admitted its selected pointerType while non-admitted input produced no sequence-owned semantic proposal.

This demonstrates composability without standardizing a pointerType allowlist.

The result is bounded:

> recognizer composition can begin after explicit caller-owned admission without making pointerType policy part of Runtime or generic listener semantics.

This ADR does not establish touch, mouse, pen, or any combination as the default.

### ADR-0020 contamination remains intact under composition

A second admitted participating pointer contaminated the tested single-pointer candidate.

Dropping from two participating pointers back to one did not revive the candidate.

No semantic proposal leaked from the contaminated sequence.

Fresh recognition required participating membership to return to zero and a later fresh admitted `pointerdown`.

Therefore composition does not weaken ADR-0020 sequence identity or restart rules.

### Rejection may leave the conditional accepted-only composition uncommitted

The research preserved:

```text
eligible next
-> Runtime rejected
-> host candidate remains uncommitted

later opposite eligible movement
-> previous
-> Runtime accepted
-> host candidate commits
```

This does not create a universal reversal UX.

It demonstrates that the ADR-0018 conditional accepted-only policy can be composed with ADR-0020 through ADR-0024 without treating rejection as commitment or direction lock.

### Acceptance may consume the conditional accepted-only composition

For the researched ADR-0018 policy class, authoritative `accepted` feedback committed the host candidate and later eligible movement produced no second semantic request from the same active sequence.

This remains **conditional policy authority**.

It does not establish one-accepted-navigation-per-sequence as a universal WIF gesture rule.

Other recognizer policy classes require separate authority if they make different commitment/cardinality claims.

### Cancellation and application abort remain host reset boundaries

The composed research candidate reset host recognizer state on the already-authorized lifecycle paths:

- `pointercancel` for participating pointer state;
- listener cleanup invoking policy `abort()`.

Those resets required no fabricated Runtime request and no core state change.

Composition does not make cancellation a semantic Runtime event.

### Remaining defaults are not prerequisites for composition

Issue #186 attempted to find a semantic dependency that had to be standardized before the accepted pieces could compose.

None was observed for the tested boundary.

The research composed explicit collaborators without selecting repository-wide:

- projector/axis;
- threshold/comparator;
- sign mapping;
- move-time/pointerup-time behavior;
- pointerType allowlist.

Therefore those deferred choices are not blockers to the **ownership/composability theorem**.

They may still be necessary choices for a particular production recognizer configuration or future convenience API.

## Evidence and constraints

Issue #186 / PR #187 established the following bounded evidence:

- production `bindPointerNavigation()` remained unchanged;
- Runtime received only normalized semantic requests with no host-event metadata;
- Runtime snapshot access was mechanically forbidden by the research witness;
- multiple scalar projector conventions reused the same composition machinery;
- projector+mapper covariance remained composable;
- multiple qualification policies reused the same composition machinery;
- multiple sign mappers reused the same composition machinery;
- move-time and pointerup-time reused the same composition machinery;
- rejected disposition left the tested accepted-only candidate uncommitted and allowed a later opposite proposal;
- accepted disposition committed the tested accepted-only candidate and suppressed later eligible movement;
- ADR-0020 multi-pointer contamination remained sticky under the full candidate pipeline;
- `pointercancel` and listener abort reset host state without semantic fabrication;
- pointerType admission remained an explicit caller-owned collaborator.

Latest research qualification:

- PR #187 research head: `f45c0eb745e5b40d5815b53bdf1ab59f1e8d9420`;
- CI #318: success;
- differential-reference: success;
- repository MoonBit / real-Chrome Pointer Events / R3F / package / production-Web qualification: success;
- CodeRabbit final status: success;
- latest CodeRabbit review: no actionable comments;
- unresolved review threads: zero;
- PR #187 squash-merged as `f01fd9811599758d1ee3af770187ce235e1893b0`.

A generic CodeRabbit docstring-coverage warning on local research helpers did not identify a semantic defect and did not alter the research result.

## Consequences

The next production recognizer frontier does not require inventing new Runtime/core semantics merely to combine the accepted pointer policies.

A production implementation may remain entirely host-side and compose explicit collaborators while using the existing generic pointer-listener contract.

Production work must still independently justify:

- the concrete recognizer representation;
- which collaborators are required versus optional;
- configuration/validation surface;
- any chosen defaults;
- source/package placement;
- public API exposure, if any.

This ADR authorizes composition sufficiency and ownership only.

It does not authorize copying the research helper into production.

## Alternatives considered

### Require a monolithic fixed recognizer before composition can be considered valid

Rejected.

Research showed the accepted responsibilities can compose through explicit collaborators without selecting universal defaults.

A monolithic fixed recognizer would prematurely freeze policy.

### Move recognizer state into Runtime/core

Rejected.

No new semantic Runtime state was required, and doing so would leak DOM/Pointer Events concerns into the host-independent core.

### Move recognition semantics into the generic pointer listener

Rejected.

The production listener already composes with the researched policy while remaining normalized-intent/disposition plumbing.

Widening it would collapse established host-policy boundaries.

### Require one default projector, threshold, mapper, timing class, or pointerType allowlist before production work

Rejected as a composability requirement.

Those choices can remain explicit host collaborators.

A later production API may choose bounded defaults only with separate evidence and authority.

### Promote the research `createComposedPolicy()` helper directly

Rejected.

Its purpose was to test the theorem.

Its object shape, naming, state representation, and collaborator signatures are not production or public API authority.

## Deferred frontiers

This ADR does not select:

- production recognizer source representation;
- public constructor/factory/configuration API;
- collaborator function signatures;
- default projector/axis;
- default coordinate property/frame/unit;
- default threshold/comparator;
- default sign mapping;
- move-time or pointerup-time default;
- reversal or direction-locking default;
- universal retry/cardinality policy;
- pointerType allowlist/default;
- writing-mode behavior;
- RTL/LTR behavior;
- velocity/acceleration;
- native-control/ignore policy;
- preventDefault / native-scroll policy;
- default `touch-action`;
- pointer capture;
- Shadow DOM/composed-path ownership;
- accessibility/focus behavior;
- React integration;
- package export;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- that the research helper should become production code;
- one ideal production recognizer architecture;
- one ideal public API;
- physical touch/mouse/pen ergonomic equivalence;
- trusted physical-input equivalence to synthetic research events;
- cross-browser recognizer equivalence;
- accessibility suitability;
- universal one-request or one-accepted-navigation semantics;
- universal reversal behavior;
- velocity/duration recognition;
- native scrolling coexistence for a future production recognizer;
- pointer capture requirements;
- final package/distribution compatibility.
