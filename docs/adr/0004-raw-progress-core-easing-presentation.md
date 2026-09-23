# ADR-0004 — Core owns raw progress; easing is presentation policy

Status: Accepted

## Context

The behavioral reference computes raw transition progress from elapsed lifecycle time, then applies an arbitrary JavaScript easing function before exposing public progress.

Focused research in Issues #3 and #4 showed that request acceptance, transition completion, cooldown expiry, lock behavior, selected phase, and transition direction do not depend on eased progress. Raw elapsed time determines lifecycle completion.

Carrying arbitrary host easing callbacks into the MoonBit/Wasm semantic core would also create unnecessary determinism and boundary pressure. A host callback may close over mutable state or otherwise produce different output for the same raw progress.

At the same time, DOM and R3F consumers need a normalized transition position for interpolation.

## Decision

The host-independent core conceptually owns raw normalized transition progress for an active transition.

Presentation easing is not part of core flow semantics.

Hosts or presentation layers may transform raw progress for CSS, DOM, R3F, Three.js, or other visual effects, but eased output must not change or redefine core lifecycle truth.

Cross-host semantic equivalence concerns shared raw core state. It does not require hosts to use the same easing or produce identical visual interpolation.

## Evidence and constraints

- Issue #3 separated raw lifecycle time from presentation progress, including the zero-delta/custom-easing counterexample.
- Issue #4 found no core decision that depends on eased progress.
- Existing R3F consumers use progress as an interpolation input for visual effects.
- DOM/Web must remain a first-class consumer and must not inherit R3F-specific animation ownership.
- I-03 requires deterministic observable core evolution from core state/configuration, commands, and ticks.
- I-05 requires host effects not to redefine core semantics.

## Consequences

The first MoonBit/Wasm runtime proof does not need an arbitrary host-function easing callback.

The runtime may expose raw progress through whatever representation is later justified.

Presentation layers may share easing helpers in the future, but such helpers are not semantic owners.

A host may choose a different visual easing without changing the flow state.

The exact raw-progress numeric representation, inactive-state representation, easing helper API, and Wasm ABI remain open.

## Alternatives considered

### Keep arbitrary easing callbacks inside the core

Rejected for the initial architecture. It imports host callback semantics and determinism obligations without evidence that lifecycle truth needs them.

### Define a fixed MoonBit easing catalog or portable curve format now

Rejected as premature. No current semantic requirement justifies freezing animation policy or its ABI.

### Remove progress from the core entirely

Rejected for the current frontier. Raw normalized progress is a smaller shared semantic observation than exposing elapsed/duration bookkeeping to every host, and it supports both DOM and R3F consumers without host-specific assumptions.
