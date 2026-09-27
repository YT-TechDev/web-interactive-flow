# Architecture Decision Records

ADRs record architectural decisions that should remain reviewable after implementation changes.

## Status values

- Proposed
- Accepted
- Superseded
- Rejected

## Required contents

Each ADR should state:

- context;
- decision;
- evidence or constraints;
- consequences;
- alternatives considered;
- status.

Accepted ADRs are repository authority below invariants and above architecture overview documents.

## Index

- [ADR-0001 — Host-independent MoonBit/Wasm core](0001-host-independent-moonbit-wasm-core.md)
- [ADR-0002 — DOM and R3F are host adapters](0002-dom-and-r3f-as-host-adapters.md)
- [ADR-0003 — Extract behavioral traces before porting](0003-behavioral-traces-before-porting.md)
- [ADR-0004 — Core owns raw progress; easing is presentation policy](0004-raw-progress-core-easing-presentation.md)
- [ADR-0005 — Browser monotonic time normalizes at the host boundary](0005-browser-monotonic-time-normalization.md)
- [ADR-0006 — First browser frame scheduler consumes delivered frame timestamps](0006-first-browser-frame-scheduler.md)
- [ADR-0007 — Browser Wasm acquisition terminates at a validated Module](0007-browser-wasm-module-acquisition.md)
- [ADR-0008 — DOM wheel default-action suppression follows semantic acceptance](0008-dom-wheel-default-action-ownership.md)
- [ADR-0009 — R3F frame consumers are read-only semantic observers](0009-r3f-frame-consumer-read-only.md)
- [ADR-0010 — First production R3F hook takes an explicit Runtime](0010-r3f-hook-explicit-runtime.md)
- [ADR-0011 — First distribution uses one package with isolated host subpaths](0011-first-package-export-topology.md)
- [ADR-0012 — First DOM wheel listener uses explicit target and replaceable intent policy](0012-dom-wheel-listener-explicit-target.md)
- [ADR-0013 — DOM keyboard default-action suppression follows semantic acceptance](0013-dom-keyboard-default-action-ownership.md)
- [ADR-0014 — First DOM keyboard listener uses explicit target and replaceable raw policy](0014-dom-keyboard-listener-explicit-target.md)
- [ADR-0015 — Overlapping DOM bindings have no implicit WIF arbitration](0015-no-implicit-dom-binding-arbitration.md)
- [ADR-0016 — Pointer Events are the first DOM direct-manipulation substrate](0016-pointer-events-direct-manipulation-substrate.md)
- [ADR-0017 — First Pointer Events listener owns explicit lifecycle and gesture-state abort](0017-pointer-events-listener-lifecycle.md)
- [ADR-0018 — Accepted-only pointer gesture commit observes Runtime disposition at the host boundary](0018-pointer-gesture-disposition-feedback.md)
- [ADR-0019 — Pointer listener synchronously routes Runtime disposition to the originating policy](0019-pointer-listener-synchronous-disposition-feedback.md)
- [ADR-0020 — Reusable single-pointer sequence lifecycle uses sticky contamination and fresh-down restart](0020-pointer-single-sequence-lifecycle.md)
- [ADR-0021 — Reusable pointer displacement is finite start-relative scalar displacement under stable projection](0021-pointer-start-relative-displacement.md)
- [ADR-0022 — Pointer threshold qualification is projected-unit host policy before Runtime request](0022-pointer-threshold-policy-boundary.md)
- [ADR-0023 — Pointer intent mapping is orientation-relative replaceable host policy](0023-pointer-intent-mapping-boundary.md)
- [ADR-0024 — Pointer proposal timing is replaceable host policy](0024-pointer-proposal-timing-boundary.md)
- [ADR-0025 — Reusable pointer recognizer boundary composes explicit host policies](0025-pointer-recognizer-composition-boundary.md)
- [ADR-0026 — First production accepted-only pointer recognizer remains internal host policy](0026-first-production-accepted-pointer-recognizer.md)
