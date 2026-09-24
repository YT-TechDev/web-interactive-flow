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
