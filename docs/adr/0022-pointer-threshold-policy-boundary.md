# ADR-0022 — Pointer threshold qualification is projected-unit host policy before Runtime request

Status: Accepted

## Context

ADR-0020 defines the reusable single-pointer sequence lifecycle.

ADR-0021 defines reusable pointer displacement as finite start-relative scalar displacement under one stable host-owned projection convention:

```text
delta = startProjected - currentProjected
```

That left threshold semantics unresolved.

Issue #174 / PR #175 researched whether a reusable threshold theorem could be promoted without freezing:

- a numeric default;
- one projected unit;
- one equality comparator;
- zero semantics;
- finite/non-negative validation;
- symmetric directional bounds;
- fixed versus adaptive threshold policy;
- sign-to-intent mapping;
- proposal timing.

The pinned legacy R3F implementation used default threshold `50`, finite non-negative validation, threshold `0`, strict crossing, exact-equality miss, and symmetric bounds.

Those legacy choices are behavioral evidence only.

The research supports a narrower ownership/unit theorem.

## Decision

Threshold qualification remains **host policy over ADR-0021 projected displacement**.

The reusable layering is:

```text
ADR-0020-valid sequence
  -> ADR-0021 finite projected displacement
  -> host threshold policy
  -> miss: no normalized intent
  -> cross: proposal eligibility only
  -> later mapping / proposal policy
  -> generic pointer listener
  -> Runtime disposition
```

Threshold comparison does not enter Runtime/core.

The generic pointer listener does not own threshold semantics.

### Numeric threshold meaning is relative to projected units

A numeric threshold is meaningful only relative to the scalar units in which ADR-0021 displacement is expressed, or through explicit host normalization/conversion.

Research counterexample:

```text
delta = 30
threshold = 40
-> miss

same movement relation under stable projection scale x2:
delta = 60
same numeric threshold = 40
-> cross
```

Therefore one numeric threshold does not have projection-independent meaning.

This ADR does not select:

- physical pixels;
- CSS pixels;
- viewport-relative units;
- normalized units;
- one universal coordinate scale.

### Coherent scaling is candidate algebra, not universal authority

For one tested strict magnitude candidate and positive scale `k`:

```text
delta' = k * delta
threshold' = k * threshold
```

preserved the tested crossing relation away from exact numeric-boundary representation effects.

This is useful algebraic evidence.

It does not establish one universal symmetric threshold gate.

### Host normalization remains possible, but exact-boundary equivalence is not guaranteed

Relative/normalized threshold policy may remain entirely host-owned.

For example, a host may compare normalized projected values under one stable extent without moving normalization into Runtime.

However PR #175 found an exact-boundary JavaScript floating-point counterexample.

Raw values:

```text
rawStart = 400
rawCurrent = 340
rawThreshold = 60

raw delta = 60
60 > 60
-> false
```

Separately normalized values produce a representational difference such that the normalized strict comparison becomes true.

Therefore:

- real-number scale coherence does not imply exact floating-point comparator equivalence;
- numeric representation is part of boundary behavior;
- exact equality remains explicit policy;
- arbitrary normalization must not be claimed to preserve exact threshold classification.

### Threshold miss is pre-request host behavior

Using the actual production pointer listener, a below-threshold displacement produced:

```text
no normalized intent
no Runtime request
```

A threshold miss is not a Runtime semantic rejection.

It exists before a normalized semantic request has been formed.

### Threshold crossing is proposal eligibility, not semantic acceptance

A threshold crossing may make a later host proposal eligible.

It does not itself establish:

- Runtime acceptance;
- semantic transition;
- gesture commitment.

ADR-0018 remains the authority for accepted-only semantic gesture commitment.

ADR-0019 remains the authority for synchronous request-origin-scoped disposition feedback.

Issue #174 used a recording Runtime stub only to prove listener forwarding of a supplied disposition string. That stub does not independently prove real Runtime rejection or unchanged semantic state.

### Fixed-threshold stability is conditional policy authority

Research showed:

```text
delta = 40

threshold = 50
-> miss

threshold = 30
-> cross
```

Changing only threshold can change qualification without new pointer movement.

Therefore, for a policy class that claims **one fixed movement boundary during an active measurement**, threshold sampling/stability must be explicit and the threshold must not silently drift inside that claimed fixed-boundary interval.

This is conditional authority.

It does not reject adaptive or dynamic threshold policy.

Adaptive/dynamic threshold remains a separate unselected policy class requiring separate evidence before adoption.

### Comparator choice remains unresolved

Strict and inclusive comparison diverge at equality:

```text
abs(delta) > threshold
abs(delta) >= threshold
```

With:

```text
delta = 50
threshold = 50
```

strict comparison misses while inclusive comparison crosses.

The pinned legacy implementation used strict crossing, but this research does not promote strict comparison as universal WIF authority.

### Zero semantics depend on comparator

For:

```text
delta = 0
threshold = 0
```

strict comparison misses while inclusive comparison crosses.

Therefore threshold-domain semantics and exact-equality comparator semantics cannot be frozen independently.

### Negative and non-finite threshold behavior is not ordinary minimum-distance behavior

For the tested strict magnitude candidate:

- `NaN` behaves as never-cross;
- `+Infinity` behaves as never-cross;
- `-Infinity` behaves as always-cross;
- a negative finite threshold can classify zero displacement as crossing.

These are degenerate/sentinel-like behaviors.

This ADR does not convert those observations into public API semantics or one repository-wide validation rule.

The legacy finite non-negative validation remains non-normative behavioral evidence.

### One symmetric threshold is not universal

Research used asymmetric directional bounds:

```text
positive threshold = 50
negative threshold = 100

delta = +60
-> positive side crosses

delta = -60
-> negative side misses
```

A symmetric `abs(delta) > 50` candidate classifies both as crossings.

Therefore one symmetric scalar threshold cannot be promoted as universal threshold authority.

This ADR does not select asymmetric thresholds either.

### Runtime and generic listener remain free of threshold state

Runtime receives no:

- threshold;
- displacement;
- comparator;
- directional bound;
- projected unit;
- normalization extent.

No Runtime snapshot is required for threshold qualification.

The generic pointer listener remains responsible only for its existing event/lifecycle/normalized-intent/disposition-routing boundary.

Threshold evaluation stays in replaceable host gesture policy.

## Evidence and constraints

Issue #174 / PR #175 established:

- one numeric threshold is not invariant under projection scaling;
- coherent displacement/threshold scaling preserves one tested candidate relation away from exact numeric boundaries;
- host-side normalization can represent relative threshold policy without Runtime ownership;
- exact normalized boundary classification can diverge because of floating-point representation;
- changing only threshold changes qualification;
- strict and inclusive comparators diverge at equality;
- zero semantics depend on comparator;
- negative/non-finite threshold values exhibit degenerate behavior in the tested candidate;
- asymmetric directional bounds falsify universal symmetry;
- threshold miss produces no Runtime call through the production pointer listener;
- threshold comparison requires no Runtime snapshot;
- Runtime requests carry no threshold/displacement metadata;
- no numeric default was justified.

Latest research qualification:

- PR #175 latest CI #299: success;
- research test step: success;
- differential-reference: success;
- repository browser/package/R3F qualification: success;
- CodeRabbit found two valid evidence-boundary gaps;
- commit `40faa86` addressed both;
- latest CodeRabbit review: no actionable comments;
- unresolved review threads: zero.

## Consequences

Later pointer gesture policy can use threshold qualification without moving threshold semantics into Runtime/core.

A host may select projected units and threshold policy together.

A later public API cannot safely expose a default numeric threshold without also qualifying the relevant unit/UX scope.

Exact threshold equality must remain observable policy rather than an accidental implementation detail.

Fixed-threshold policy can make its sampling interval explicit.

Adaptive threshold remains open rather than implicitly forbidden.

No new MoonBit/Wasm state, command, or ABI is required.

## Alternatives considered

### Promote legacy threshold 50

Not selected.

Its meaning depends on the legacy projection/unit/UX context.

### Promote strict comparison

Not selected.

Strict and inclusive behavior diverge observably at equality.

### Promote finite non-negative validation as WIF-wide authority

Not selected.

The research only establishes degenerate behavior of other values for one candidate comparator.

It does not establish the final public validation contract.

### Promote one symmetric threshold

Rejected as universal authority.

Asymmetric directional candidates produce observably different classifications.

### Put threshold semantics in Runtime

Rejected.

Threshold miss occurs before any normalized Runtime request.

### Put threshold comparison in generic pointer listener

Rejected.

The generic listener remains replaceable-policy plumbing, not gesture interpretation authority.

### Require dynamic threshold to be forbidden

Rejected.

Only a conditional fixed-threshold class was qualified.

Adaptive/dynamic threshold remains a separate research frontier.

## Deferred frontiers

This ADR does not select:

- numeric threshold default;
- legacy `50`;
- strict `>` or inclusive `>=`;
- exact equality semantics;
- zero semantics;
- one public threshold validation domain;
- NaN/Infinity sentinel behavior;
- symmetric or asymmetric bounds as default;
- fixed or adaptive threshold globally;
- one normalization scheme;
- coordinate property/frame/unit;
- X/Y default;
- diagonal interpretation;
- sign-to-intent mapping;
- reversal commitment;
- move-time versus pointerup proposal timing;
- velocity/acceleration;
- pointerType policy;
- production gesture recognizer;
- React integration;
- package export;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- physical-pixel or CSS-pixel threshold authority;
- viewport-relative threshold preference;
- one threshold suitable across devices;
- touch/mouse/pen threshold equivalence;
- devicePixelRatio or zoom invariance;
- physical-device gesture ergonomics;
- accessibility suitability;
- cross-browser gesture-feel equivalence;
- one ideal numeric threshold.
