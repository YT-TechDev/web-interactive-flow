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
