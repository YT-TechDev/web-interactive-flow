# ADR-0005 — Browser monotonic time normalizes at the host boundary

Status: Accepted

## Context

The host-independent runtime consumes explicit valid integer `tick(dt)` inputs.

The repository-internal JavaScript semantic wrapper established in Issues #48 and #49 validates normalized time as exact non-negative signed-i32-compatible integer quanta before crossing the Wasm boundary.

A real browser frame loop does not naturally provide that representation. Browser timing APIs such as `performance.now()` and `requestAnimationFrame` expose monotonic high-resolution timestamps as JavaScript Numbers measured in milliseconds, and reported timestamps may contain fractional milliseconds.

Issue #51 selected browser-clock normalization as the next host frontier because a poor normalization policy can change the exact tick sequence observed by the core even when the core itself remains correct.

Issue #52 compared and falsified candidate normalization families, scale choices, lifecycle boundaries, long-gap handling, and visibility ownership.

## Decision

For the first browser/Web real-time host, normalize one consistent monotonic timestamp stream at the host boundary before calling the semantic runtime.

The selected boundary is:

```text
browser monotonic timestamp stream
        |
        v
host time normalizer
        |
        v
exact integer microsecond budget/chunks
        |
        v
existing JS semantic wrapper
        |
        v
unchanged MoonBit/Wasm core
```

Within one normalization epoch, the first accepted timestamp establishes the baseline and emits zero elapsed budget.

For a later accepted timestamp `t`:

```text
elapsedUs(t)
= floor((t - baselineTimestampMs) * 1000)

budgetUs_n
= elapsedUs(t_n) - elapsedUs(t_(n-1))
```

One browser-host normalization quantum is one microsecond:

```text
1000 quanta = 1 millisecond
```

This scale belongs to the first browser-host normalization policy. It is not a permanent universal core time invariant and it does not claim that browser clocks have one-microsecond accuracy or resolution.

Cumulative floor quantization is selected instead of independently quantizing each frame delta.

The reason is endpoint consistency. Independently rounding, flooring, or ceiling each fractional frame delta can make the total normalized elapsed time depend on frame segmentation. Cumulative quantization from one fixed epoch baseline gives:

```text
sum(budgetUs_i)
= elapsedUs(t_final) - elapsedUs(t_initial)
```

for the same epoch endpoints.

Floor is selected rather than cumulative nearest or ceiling because normalized elapsed time must not advance ahead of the elapsed value reported by the timestamp stream. Quantization lag relative to the observed timestamp remains less than one microsecond quantum.

A timestamp equal to the previous accepted timestamp produces zero normalized elapsed budget.

A timestamp lower than the previous accepted timestamp is a validation failure. The normalizer must not clamp, emit zero, or implicitly rebase, and rejection must not mutate accepted normalization state.

One normalization epoch consumes one consistent caller-defined monotonic timestamp stream/origin. Switching timestamp source or origin requires an explicit rebase into a new epoch.

An explicit rebase:

- validates the new timestamp;
- establishes a new epoch baseline;
- resets cumulative normalized elapsed to zero;
- emits no prior-gap elapsed budget;
- does not mutate core flow-semantic state.

Positive normalized budgets larger than one signed-i32 tick carrier are not clamped or dropped.

Instead, represent the exact budget as an ordered sequence of valid existing tick chunks:

```text
1 <= chunk <= 2_147_483_647
sum(chunks) == exact normalized budget
```

This does not claim that an oversized hypothetical single `tick(B)` call is valid. The host layer represents one exact normalized budget as multiple valid existing tick inputs with no semantic command interleaved.

The generic clock normalizer does not inspect `Document`, page visibility, requestAnimationFrame scheduling state, transition state, cooldown, lock, selected phase, direction, raw progress, or request eligibility.

A later DOM/frame-scheduler layer owns visibility and scheduling policy. For example, a host may later choose either to continue an epoch and consume a resume gap, or explicitly rebase to pause semantic lifecycle time across a chosen boundary. This ADR selects neither policy as a default.

## Evidence and constraints

- Issue #51 selected browser-clock normalization ahead of loader/package integration and real-time DOM scheduling.
- Issue #52 rejected independent per-delta quantization because normalized totals can depend on frame segmentation.
- Issue #52 found that baseline-relative cumulative floor quantization gives endpoint-consistent normalized elapsed budgets within one epoch.
- Issue #52 selected a fixed microsecond browser-host scale while preserving the current signed-i32 Wasm tick carrier through exact chunk decomposition.
- I-02 requires the core runtime to remain the single owner of flow semantics.
- I-03 explicitly places host scheduling outside core determinism until it is normalized into explicit commands and deltas.
- The pre-v0.1 behavioral contract requires valid normalized elapsed time to be finite, non-negative, and explicit.
- Browser clock precision or privacy coarsening remains an upstream property of the timestamp source. The normalizer only converts the observed Number sequence into exact integer host quanta.

## Consequences

The first browser real-time host can consume fractional browser timestamps without changing core lifecycle arithmetic or the current Wasm ABI.

Host-time normalization state is persistent host state, but it is not a second flow state machine. It owns only timestamp-baseline and cumulative-normalization information.

Replay claims for browser-time normalization must include the timestamp sequence and explicit rebase boundaries.

A later frame scheduler may choose visibility catch-up or pause/rebase policy without changing the generic normalizer contract.

A later host may require different normalization evidence or a different host unit. This ADR does not make microseconds a universal cross-host or core invariant.

The exact implementation API, package layout, requestAnimationFrame binding, visibility default, loader strategy, and public TypeScript surface remain open.

## Alternatives considered

### Independently quantize each frame delta

Rejected. Flooring, rounding, or ceiling each fractional delta independently can make total normalized elapsed time depend on frame segmentation.

### Use cumulative nearest or ceiling quantization

Rejected for the first browser host. Both can advance normalized lifecycle time ahead of the elapsed value reported by the timestamp stream, while no current requirement justifies early advancement.

### Use one millisecond per quantum

Rejected for the first browser host. It discards all reported sub-millisecond timestamp representation solely to obtain a larger single-call range, while exact chunk decomposition can preserve the current i32 carrier for long gaps.

### Make the scale caller-configurable

Rejected as premature. It would add public policy and cross-host comparison variability without a demonstrated consumer requirement.

### Keep fractional time and widen the core or ABI

Rejected. The selected host normalization contract works with the existing exact integer core and signed-i32 Wasm carrier.

### Put page visibility behavior into the normalizer

Rejected. Visibility is scheduler/host lifecycle policy, not generic timestamp representation normalization.
