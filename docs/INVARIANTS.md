# Invariants

This document is normative. It records properties the project currently treats as non-negotiable.

The project is pre-v0.1. Only invariants justified at this stage are frozen here; detailed transition semantics remain subject to evidence.

## I-01 — Host-independent core

Core flow semantics must not depend on DOM, React, React Three Fiber, Three.js, Canvas, browser event objects, rendering objects, or rendering lifecycle APIs.

## I-02 — Single semantic owner

Flow semantics have one owner: the core runtime.

Adapters may normalize inputs and apply outputs, but must not maintain a second competing implementation of phase, transition, cooldown, lock, or request-acceptance semantics.

## I-03 — Deterministic observable evolution

Given the same core version, initial core state, configuration, ordered command sequence, and ordered `tick(dt)` sequence, the core must produce the same observable state sequence.

Host scheduling itself is outside this invariant until normalized into explicit commands and deltas.

## I-04 — Explicit request disposition

A flow request must have an observable and testable disposition. It must not be silently half-applied across core and adapter state.

The exact public representation of accepted/rejected/no-op outcomes is not frozen yet.

## I-05 — Host effects do not redefine semantics

DOM mutations, CSS state, R3F scene changes, animation systems, and other host effects are projections of runtime state. They must not redefine core transition truth.

## I-06 — Evidence precedes semantic widening

A change that widens observable semantics must be accompanied by evidence appropriate to the claim: traces, focused tests, counterexamples, or an ADR when architectural ownership changes.

## I-07 — No unsupported cross-host equivalence claim

The project may claim cross-host semantic equivalence only for behavior covered by shared core semantics and evidence. Host-specific event behavior must be described separately.

## Not yet frozen

The following are intentionally not invariants yet:

- exact phase index representation;
- exact cooldown timing model;
- exact behavior of huge `dt` values;
- reverse-during-transition policy;
- serialization/restore format;
- easing and animation ownership details;
- exact Wasm ABI;
- final npm package layout.

These require research before becoming normative.
