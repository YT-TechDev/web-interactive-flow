# ADR-0023 — Pointer intent mapping is orientation-relative replaceable host policy

Status: Accepted

## Context

ADR-0020 defines the reusable single-pointer sequence lifecycle.

ADR-0021 defines finite start-relative signed displacement under one stable host-owned scalar projection.

ADR-0022 defines threshold qualification as projected-unit host policy before any Runtime request.

Those decisions deliberately left one semantic translation unresolved: after an eligible signed displacement exists, what maps that host directional observation into normalized `next | previous` intent?

Issue #178 / PR #179 researched this boundary independently of:

- projector orientation;
- X/Y default;
- threshold default/comparator;
- proposal timing;
- reversal commitment;
- pointerType policy;
- writing-mode/layout behavior;
- production recognizer API.

The pinned legacy R3F implementation maps positive crossed displacement to `next` and negative crossed displacement to `prev`.

That legacy pair is behavioral evidence only.

The research supports a narrower host-policy theorem.

## Decision

Sign-to-intent mapping is **replaceable host policy** layered after ADR-0021 displacement and ADR-0022 threshold qualification.

```text
ADR-0020 valid sequence
  -> ADR-0021 finite signed displacement
  -> ADR-0022 threshold qualification
  -> host sign-to-intent mapping
  -> next | previous | no proposal
  -> generic pointer listener
  -> Runtime disposition
```

The mapper translates one eligible host directional observation into a normalized semantic intent or no proposal.

It does not decide Runtime semantic eligibility.

### Displacement sign has no universal semantic meaning

ADR-0021 displacement sign is relative to projector orientation.

Research preserved the same physical movement under opposite stable projectors:

```text
P
-> delta = +60

-P
-> delta = -60
```

With one unchanged candidate mapper:

```text
positive -> next
negative -> previous
```

the normalized proposal reversed.

Therefore this ADR does **not** define:

- positive -> next;
- negative -> previous;
- one universal projector orientation.

### Projector orientation and mapping are paired host conventions

Research inverted both projector and mapper:

```text
P:
  positive -> next
  negative -> previous

-P:
  positive -> previous
  negative -> next
```

For the tested movements in both physical directions, the normalized intent remained the same.

WIF therefore records the narrow covariance property:

> projector orientation and sign mapping may vary together while preserving the tested physical-to-normalized-intent relation.

This is a host-convention property.

It is not a universal physical-direction, layout, or UX theorem.

### Measurement, qualification, and mapping remain distinct responsibilities

One unchanged ADR-0021-style displacement value was consumed by different mappers and produced different normalized intents.

The displacement value itself did not change.

A below-threshold movement through production `bindPointerNavigation()` produced:

```text
no mapper invocation
no normalized intent
no Runtime request
```

Therefore these responsibilities remain distinct:

```text
measurement
threshold qualification
direction mapping
proposal timing
semantic commitment
```

A future asymmetric directional-threshold policy may compose those steps differently internally.

This ADR freezes ownership separation, not one implementation order.

### Zero must not be silently coerced into direction

Zero is neither positive nor negative directional displacement.

Research used an explicit zero path rather than a binary fallback such as:

```text
delta > 0 ? next : previous
```

which would silently map zero to one semantic side.

The authority is narrow:

> zero must not be accidentally interpreted as positive or negative direction by sign mapping.

This ADR does not freeze the public representation of zero/no-mapping.

ADR-0022 still owns unresolved threshold-zero and equality semantics.

### Mapping does not commit semantic gesture direction

Research preserved current directional reversal:

```text
+60 -> next
-70 -> previous
+60 -> next
```

The mapper reports the current eligible directional interpretation.

It does not remember an earlier proposal as semantic truth.

ADR-0018 remains the authority for accepted-only semantic gesture commitment.

ADR-0019 remains the authority for synchronous request-origin-scoped disposition routing.

### Stable mapping is conditional policy authority

Research demonstrated one active pointer sequence with:

- one baseline;
- one pointer id;
- unchanged current pointer coordinate;
- unchanged signed displacement.

Only the mapper changed:

```text
delta = +60
mapper A -> next

mapper changes

delta still = +60
mapper B -> previous
```

Changing only the mapper changed the later normalized proposal without displacement change.

Therefore, for a policy class that claims **one stable sign mapping during an active measurement**, mapping sampling/stability must be explicit and the mapping must not silently drift inside that claimed stable interval.

This is conditional authority.

It does not reject adaptive or dynamic mapping.

Adaptive/dynamic mapping remains a separate unselected policy class requiring separate evidence before adoption.

### Mapping need not be total or symmetric

Research used partial candidate mappers:

```text
positive-only:
+60 -> next
-60 -> no proposal

negative-only:
+60 -> no proposal
-60 -> previous
```

Therefore current evidence cannot universalize:

- total mapping;
- bijection;
- symmetric two-sided mapping.

This ADR does not select partial mapping as a default.

### Axis identity remains upstream of mapping

Independent X-like and Y-like scalar projections both produced:

```text
delta = +60
```

The same mapper consumed both without receiving axis identity and produced the same normalized intent.

Therefore a sign mapper need not know DOM axis identity.

This does not establish:

- equal UX across axes;
- physical X/Y equivalence;
- one default axis;
- diagonal policy.

### Runtime and generic pointer listener remain free of mapping state

The generic pointer listener receives only:

```text
next
previous
no proposal
```

from host policy.

It does not receive or interpret:

- displacement sign;
- displacement value;
- projector orientation;
- mapping convention;
- axis;
- threshold.

Runtime receives only normalized semantic flow requests.

It does not receive mapping metadata.

No Runtime snapshot is required to map an eligible signed host displacement.

A research recording Runtime returning `accepted` or `rejected` only demonstrated that mapping need not predict disposition and that the production listener routes the normalized request.

Actual Runtime acceptance/rejection and semantic commitment remain governed by existing authority.

## Evidence and constraints

Issue #178 / PR #179 established:

- the same physical movement may have opposite sign under opposite stable projectors;
- one unchanged mapper then produces opposite normalized proposals;
- jointly inverting projector and mapper preserved tested normalized intent;
- one measured displacement can feed independent mappers;
- below-threshold input reaches neither mapper nor Runtime;
- eligible displacement mapping remains separate from the tested threshold numeric value;
- zero is explicitly prevented from falling through to one directional branch;
- changing only mapping changes proposal for unchanged displacement;
- changing mapping inside one active sequence can change a later proposal while coordinate and displacement remain unchanged;
- reversal changes current mapping without creating mapping-level commitment;
- the same mapped intent can be routed without Runtime snapshot prediction;
- production listener receives only normalized intent;
- Runtime requests carry no sign/displacement/mapping/axis/threshold metadata;
- partial mappers falsify universal total/symmetric mapping;
- one mapper can consume equivalent X-like/Y-like scalar deltas without axis identity.

Latest research qualification:

- PR #179 latest CI #306: success;
- research test step: success;
- differential-reference: success;
- repository browser/package/R3F qualification: success;
- CodeRabbit identified one valid active-sequence mapping-drift evidence gap;
- commit `c8bac3f` addressed it;
- latest CodeRabbit incremental review: no actionable comments;
- CodeRabbit status: success;
- unresolved review threads: zero.

## Consequences

A reusable pointer gesture policy may translate eligible signed displacement into normalized flow intent without adding mapping state to Runtime or generic listener mechanics.

Hosts may pair projector orientation with their mapping convention.

A host may choose a different mapping convention without changing ADR-0021 measurement semantics.

Threshold policy can remain independently researched and configured.

Accepted-only commitment remains independent from current sign mapping.

A future production recognizer must make any claimed stable mapping interval explicit.

No new MoonBit/Wasm state, command, or ABI is required.

## Alternatives considered

### Universal positive -> next

Rejected as universal authority.

Projector inversion changes sign for the same physical movement.

### Universal negative -> previous

Rejected for the same reason.

### Bake mapping into displacement measurement

Rejected.

One measurement can feed multiple independent mappers.

### Put sign mapping in generic pointer listener

Rejected.

The listener remains normalized-intent transport/lifecycle/disposition plumbing.

### Put mapping/orientation metadata in Runtime

Rejected.

Runtime needs only normalized semantic requests.

### Treat zero as one directional side

Rejected as an implicit sign-mapping rule.

Zero must not accidentally fall through to positive/negative semantic direction.

### Require total symmetric mapping

Rejected as universal authority.

Partial candidate mappings are mechanically distinct and remain possible host policy.

### Require one stable mapping for all policy classes

Not selected.

Only a conditional stable-mapping policy class was qualified.

Adaptive/dynamic mapping remains open.

## Deferred frontiers

This ADR does not select:

- projector orientation;
- `clientX` or `clientY`;
- X/Y default;
- positive -> next;
- negative -> previous;
- total mapping;
- symmetric/bijective mapping;
- partial/one-sided mapping as default;
- fixed or adaptive mapping globally;
- threshold default/comparator;
- zero-threshold semantics;
- reversal commitment;
- move-time versus pointerup proposal timing;
- writing-mode mapping;
- RTL/LTR behavior;
- pointerType policy;
- production gesture recognizer;
- React integration;
- package export;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- swipe-up universally means next;
- swipe-left/right universally means next/previous;
- physical direction equivalence across writing modes or layouts;
- RTL/LTR navigation semantics;
- accessibility suitability;
- touch/mouse/pen direction equivalence;
- one-handed/device ergonomic preference;
- cross-host visual direction equivalence.
