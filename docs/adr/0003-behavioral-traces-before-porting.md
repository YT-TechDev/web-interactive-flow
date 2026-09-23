# ADR-0003 — Extract behavioral traces before porting

Status: Accepted

## Context

An existing TypeScript/R3F implementation already contains useful behavior such as transition and cooldown handling.

A mechanical source translation would risk preserving framework accidents, hiding ambiguous semantics, and producing false confidence that equivalent-looking code is behaviorally equivalent.

## Decision

Use the existing implementation as behavioral evidence.

Before implementing a semantic capability in MoonBit/Wasm:

1. observe the existing behavior;
2. separate host mechanics from flow semantics;
3. record candidate traces/invariants;
4. seek counterexamples and boundary behavior;
5. independently implement the justified semantics;
6. compare observable behavior where appropriate.

## Consequences

The new runtime is derived from evidence rather than syntax.

Existing behavior may be intentionally rejected when investigation shows it is accidental, ambiguous, or unsuitable for the host-independent core.
