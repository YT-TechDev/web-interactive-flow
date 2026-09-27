# ADR-0026 — First production accepted-only pointer recognizer remains internal host policy

Status: Accepted

## Context

ADR-0025 established that the accepted Pointer Events authorities are compositionally sufficient for a reusable host-side accepted-only single-pointer recognizer boundary.

It intentionally deferred the first production source representation, public/package API, collaborator signatures, and all repository-wide gesture defaults.

Issue #190 / PR #191 then implemented the first production recognizer source at:

`adapters/dom/accepted_pointer_recognizer.mjs`

The implementation was qualified through the unchanged production `bindPointerNavigation()` boundary, deterministic production tests, package-artifact exclusion evidence, and the repository-wide qualification workflow.

This ADR promotes only the minimum production boundary supported by that evidence.

It does not convert the current repository-internal factory into a stable consumer API.

## Decision

The first production accepted-only pointer recognizer is **internal DOM host policy**.

It remains outside the MoonBit/Wasm core and outside the generic Pointer Events listener.

The qualified production composition is:

```text
explicit caller-owned collaborators
  -> accepted-only pointer recognizer host state
  -> null | next | previous
  -> bindPointerNavigation()
  -> Runtime request
  <- accepted | rejected
  -> synchronous originating-policy feedback
```

The recognizer owns only host gesture state already authorized by ADR-0018 through ADR-0025.

Runtime remains the semantic acceptance authority.

### First production source representation

The qualified source currently lives at:

`adapters/dom/accepted_pointer_recognizer.mjs`

and currently exports the source-level factory:

`createAcceptedPointerRecognizer(options)`

This identifies the first repository production implementation.

It does **not** establish:

- a package export;
- a stable public name;
- a semver compatibility promise;
- a final constructor/factory/configuration schema;
- a TypeScript public type surface.

Future source refactoring may change internal representation so long as accepted behavior and authority remain satisfied.

### Explicit collaborators remain required

The first production recognizer requires explicit caller-owned functions for these roles:

- pointer admission;
- scalar projection;
- qualification;
- displacement-to-intent mapping;
- proposal timing.

The current source-level option names are:

- `admitPointer`;
- `project`;
- `qualify`;
- `mapIntent`;
- `shouldPropose`.

Those names document the qualified source, not a package-level API commitment.

No repository-wide default is selected for any collaborator.

### Sequence lifecycle remains host-owned

The production recognizer preserves ADR-0020:

- a fresh admitted `pointerdown` at zero participating membership starts one candidate;
- a second admitted participating pointer contaminates the candidate;
- duplicate admitted down for an active pointer also invalidates the single-pointer candidate defensively;
- contamination remains sticky while participating membership is non-zero;
- dropping back to one already-down pointer does not revive recognition;
- fresh recognition requires zero participating membership followed by a later admitted `pointerdown`.

Cancellation removes participating membership and does not fabricate a Runtime request.

If participation remains after cancellation, the sequence remains contaminated.

### Measurement validity is distinct from contamination

The production recognizer records one finite scalar baseline for a fresh candidate.

A non-finite baseline does not become:

- multi-pointer contamination;
- Runtime rejection;
- a directional proposal.

Non-finite current projection or non-finite start-relative subtraction also produces no directional proposal.

This preserves ADR-0021's finite-measurement boundary while keeping sequence identity and measurement validity as distinct host-policy facts.

### Qualification, mapping, and timing remain replaceable

The production source does not contain a built-in:

- threshold;
- comparator;
- axis;
- coordinate property;
- sign-to-intent convention;
- move-time/pointerup-time default.

The explicit collaborators continue to own those choices under ADR-0022 through ADR-0024.

The recognizer supplies finite start-relative displacement to qualification and mapping only when the selected timing policy allows proposal evaluation.

### Runtime disposition remains commitment authority

For the conditional ADR-0018 policy class:

- `rejected` does not commit the active valid sequence;
- later eligible movement may produce another policy-defined proposal, including an opposite mapped direction;
- `accepted` may commit the active sequence;
- later proposal opportunities in that same still-active sequence produce no second semantic proposal.

The recognizer does not read Runtime snapshots or mirror Runtime eligibility state.

Disposition reaches the originating recognizer synchronously through ADR-0019.

For a pointerup-time proposal, host participation may already be complete before feedback is delivered. In that case sequence state is already reset; no later proposal can leak from the completed sequence.

### Generic listener remains recognizer-agnostic

`bindPointerNavigation()` remains unchanged.

It continues to:

1. deliver the current PointerEvent to policy;
2. receive `null | undefined` as no proposal, or `next | previous` as normalized intent;
3. issue the corresponding Runtime request;
4. synchronously return Runtime disposition to the originating policy when supported.

The listener does not own or interpret:

- pointer admission;
- participating membership;
- projection;
- displacement;
- qualification;
- mapping;
- proposal timing;
- contamination;
- commitment.

`undefined` is treated as no proposal. Other non-normalized mapper outputs remain rejected at the generic listener's normalized-intent validation boundary rather than duplicating that validation inside the recognizer.

### Abort remains host reset

Listener cleanup invokes recognizer `abort()`.

Abort clears recognizer host state and does not issue a semantic Runtime request.

Reusing the same recognizer object after cleanup therefore requires a fresh admitted `pointerdown`.

### First package artifact remains unchanged

The production recognizer remains intentionally absent from the first package artifact governed by ADR-0011.

PR #191 added an explicit package qualification guard proving that:

`adapters/dom/accepted_pointer_recognizer.mjs`

is not staged into the current package artifact.

This ADR does not add:

- a root export;
- a DOM subpath;
- a package file;
- package metadata;
- package compatibility authority.

## Evidence and constraints

Issue #190 / PR #191 established:

- production source under `adapters/dom/`;
- five explicit required collaborator roles;
- construction failure when required collaborators are absent or non-functions;
- unchanged `bindPointerNavigation()` composition;
- normalized zero-argument Runtime requests with no host metadata;
- no Runtime snapshot dependency;
- independent X-like and Y-like projector use;
- independent qualification policies;
- independent mapping policies;
- move-time and pointerup-time timing policies;
- rejected proposal followed by later opposite proposal;
- accepted-only suppression after authoritative acceptance;
- sticky multi-pointer contamination;
- fresh-down restart only after zero membership;
- non-tracked participant cancellation does not revive the remaining pointer;
- duplicate-down invalidation;
- cancellation reset;
- cleanup/abort reset;
- caller-owned pointerType admission;
- non-finite measurement suppression;
- listener-owned invalid-intent validation;
- explicit absence from the first package artifact.

Final qualification:

- PR #191 final reviewed head: `49515274646f0e2d1b3c82979d0c8f0559b5c07b`;
- CI #324: success;
- production Pointer listener + recognizer qualification step: success;
- differential-reference: success;
- real-Chrome Pointer qualification: success;
- R3F/package/production-Web qualification: success;
- CodeRabbit initial actionable cancellation-branch gap: corrected;
- latest CodeRabbit incremental review: no actionable comments;
- unresolved review threads: zero;
- PR #191 squash-merged as `834fe1d5d4ea147ea2b363bc3d5c28744f8fc814`.

An earlier PR head produced green CI before the new recognizer test was wired into the workflow.

That result is **not** the qualification evidence for this ADR.

The evidence gap was detected before merge, CI was corrected in commit `b2b0747`, and the final reviewed head was requalified by CI #324 with the recognizer test explicitly executed.

## Consequences

WIF now has one qualified production accepted-only Pointer Events recognizer source while preserving explicit host-policy injection.

The next frontier does not need to re-prove that the accepted authorities can exist in production source.

Future work may independently investigate:

- package/public exposure;
- convenience/default policies;
- browser/device-specific integration;
- accessibility/native-scroll concerns.

Those frontiers must not infer their answers from the mere existence of this internal production module.

## Alternatives considered

### Keep the production recognizer only as implementation detail with no authority update

Rejected.

ADR-0025 explicitly left production representation deferred. After PR #191, leaving the new source boundary documented only in implementation would let lower-authority code become the de facto architectural reference before package/API work.

### Export the recognizer from the current package immediately

Rejected.

Package/public API was not researched by PR #191 and remains explicitly deferred.

### Move recognizer behavior into the generic pointer listener

Rejected.

That would violate ADR-0017, ADR-0019, ADR-0024, and ADR-0025 ownership boundaries.

### Move recognizer state into Runtime/core

Rejected.

No core semantic state is required, and Pointer Events remain host-specific.

### Add convenience defaults now

Rejected.

The production slice demonstrated that explicit collaborators are sufficient. It provided no evidence for one universal projector, threshold, mapper, timing policy, or pointerType allowlist.

## Deferred frontiers

This ADR does not select:

- package/public export;
- DOM package subpath;
- root-facade export;
- stable public recognizer name;
- final constructor/factory/configuration API;
- stable collaborator signatures;
- TypeScript declaration surface;
- projector/axis/coordinate defaults;
- threshold/comparator/unit defaults;
- sign-mapping defaults;
- proposal-timing default;
- pointerType default;
- universal reversal/direction-locking behavior;
- universal retry/cardinality policy outside the conditional ADR-0018 class;
- velocity/acceleration;
- native-control ignore policy;
- `preventDefault()`, native-scroll, or `touch-action` policy;
- pointer capture;
- Shadow DOM/composed-path ownership;
- writing-mode / RTL/LTR behavior;
- accessibility/focus policy;
- React/R3F integration;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- physical touch/mouse/pen ergonomic equivalence;
- cross-browser recognizer equivalence;
- accessibility suitability;
- one preferred gesture UX;
- one preferred threshold or axis;
- a publishable package API;
- compatibility with untested package managers/bundlers;
- native scrolling coexistence;
- pointer capture requirements.
