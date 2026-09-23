# Testing and Evidence

The project uses a falsification-first evidence model.

## Behavioral traces

A behavioral trace is an ordered record of:

- initial configuration/state;
- normalized commands;
- explicit `tick(dt)` inputs;
- observable snapshots or request dispositions.

The intended trace corpus will live in a machine-readable fixture directory once its format is justified.

Example conceptual trace:

```text
request(next)
tick(16)
tick(16)
request(next)
tick(300)
```

The exact fixture schema is intentionally not frozen yet.

## Existing TypeScript/R3F implementation

Where available, the existing implementation can act as a reference model for extracting candidate behavior.

It is not automatically normative.

A candidate behavior should be challenged for:

- framework-specific leakage;
- accidental implementation detail;
- ambiguity;
- boundary failures;
- behavior that should be corrected rather than preserved.

## Differential validation

Once the MoonBit/Wasm runtime exists, shared traces should be executable against both the reference behavior and the new runtime where comparison is meaningful.

The comparison target is observable behavior, not internal representation.

## Boundary cases

Relevant frontiers should consider cases such as:

- zero delta;
- very large delta;
- repeated requests;
- request during transition;
- request during cooldown;
- locked state;
- first/last phase boundaries;
- current-phase targeting;
- reverse direction;
- nested host regions;
- release to native scroll at host boundaries.

Not every case is required for every change; tests should match the semantic claim.

## CI

CI is evidence that declared automated checks pass. It is not proof that the architecture or semantics are correct.

Required status checks will be enabled after the initial toolchain and check names are established.
