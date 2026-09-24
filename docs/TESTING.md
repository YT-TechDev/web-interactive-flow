# Testing and Evidence

The project uses a falsification-first evidence model.

The first-runtime behavior under test is defined by [BEHAVIORAL_CONTRACT.md](BEHAVIORAL_CONTRACT.md).

## Behavioral traces

A behavioral trace is an ordered record of:

- initial semantic configuration/state;
- normalized commands;
- explicit valid `tick(dt)` inputs;
- observable semantic state and request dispositions.

The intended trace corpus may later live in a machine-readable fixture directory once its format is justified.

The exact fixture schema is intentionally not frozen.

## Semantic observation projection

The first differential oracle should compare only the semantic observations needed by a trace.

Conceptually:

```text
selected phase

transition:
  inactive
  OR active {
    direction
    raw progress
  }

cooldown gate
lock

request disposition when a request occurs
```

This is testing vocabulary, not a proposed runtime snapshot, MoonBit type, or Wasm ABI.

Do not require full reference snapshot equality.

In particular, the oracle must not freeze:

- `phaseIndex` representation;
- an idle `direction = none` sentinel;
- settled progress sentinels such as `0` or `1`;
- exact cooldown remaining time;
- JavaScript object enumeration;
- source history;
- presentation-eased progress.

## Existing TypeScript/R3F implementation

Where available, the existing implementation can act as a reference model for extracting candidate behavior.

It is not automatically normative.

The current research baseline is:

- `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`

A candidate behavior should be challenged for:

- framework-specific leakage;
- accidental implementation detail;
- ambiguity;
- boundary failures;
- stale documentation;
- behavior that should be corrected rather than preserved.

When reference progress is compared numerically, configure linear easing so the reference's public progress corresponds to raw lifecycle progress. Otherwise omit progress comparison when the claim does not require it.

## Differential validation

Once the MoonBit/Wasm runtime exists, shared traces should be executable against both the reference behavior and the new runtime where comparison is meaningful.

The comparison target is semantic behavior, not internal representation or host presentation.

## Initial bounded example corpus

The first oracle should cover these conceptual witnesses.

| ID | Witness |
| --- | --- |
| O01 | Adjacent forward acceptance: target selected immediately, active forward transition before positive time advances. |
| O02 | Adjacent reverse acceptance. |
| O03 | Direct non-adjacent forward acceptance with no synthesized intermediate selections. |
| O04 | Direct non-adjacent reverse acceptance with no synthesized intermediate selections. |
| O05 | Known-request rejection stability across first/last boundary, same selected target, lock, active re-entry, active reversal, and cooldown. |
| O06 | Valid time boundaries: zero delta, fractional positive time, exact transition completion, exact cooldown expiry, and post-expiry eligibility. |
| O07 | Leftover time crosses transition completion into cooldown, including split-versus-combined time budgets. |
| O08 | Lock/time orthogonality: lock gates requests but does not pause transition or cooldown time. |
| O09 | Zero-duration lifecycle collapse: selected target changes but no active transition/direction remains after acceptance; cooldown may already be active. |
| O10 | Settled-time idempotence: extra valid time after full settlement does not synthesize lifecycle state. |

The numbers and phase names used by a future fixture are not normative.

## Metamorphic/property layer

Example traces should be strengthened by properties.

### P01 — Rejection stability

A rejected/no-op known request preserves the semantic observation projection.

### P02 — Time segmentation equivalence

With no intervening commands, for valid non-negative `a` and `b`:

```text
rawLifecycle(tick(a + b))
==
rawLifecycle(tick(a); tick(b))
```

Presentation easing is excluded from this comparison.

### P03 — Direct-jump non-expansion

A direct accepted A-to-D request creates one accepted target selection and does not synthesize B/C accepted selections.

### P04 — Active raw-progress monotonicity

During one uninterrupted positive-duration transition, raw active progress does not decrease under valid positive ticks.

This does not apply to presentation-eased progress.

### P05 — Lock/time orthogonality

Given the same accepted transition and valid time budget, lock state does not change the raw transition/cooldown lifecycle endpoint. It changes request eligibility only.

## Browser host time-normalization properties

Browser timestamp normalization is host evidence, not part of the O01-O10/P01-P05 core semantic corpus.

For the first browser-host contract in [ADR-0005](adr/0005-browser-monotonic-time-normalization.md), implementation evidence should establish at least:

### T01 — Non-negative normalized budget

A nondecreasing accepted timestamp sequence never produces a negative normalized elapsed budget.

### T02 — Equal timestamp zero

Two equal consecutive accepted timestamps produce zero normalized elapsed budget.

### T03 — Endpoint/segmentation consistency

Within one uninterrupted normalization epoch, inserting intermediate timestamps between the same accepted start and final timestamps does not change total normalized elapsed quanta.

Per-sample budgets may differ; the total for the same epoch endpoints must not.

### T04 — Exact valid tick-chunk decomposition

Every positive chunk sent toward `tick(dt)` is an exact integer satisfying the current signed-i32 wrapper boundary, and the exact integer sum of the ordered chunks equals the normalized host budget.

No test should invent an oversized raw `tick(B)` call outside the current valid carrier.

### T05 — Deterministic replay

The same timestamp sequence, normalization policy, and explicit rebase points produce the same normalized budget/chunk sequence.

### T06 — Regression rejection is non-mutating

A timestamp lower than the previous accepted timestamp is rejected before accepted normalization state changes.

A subsequent valid timestamp must behave as though the rejected regression had not been accepted.

### T07 — Rebase epoch isolation

An explicit rebase starts a new normalization epoch and cannot silently consume elapsed time from the prior epoch.

### T08 — Exact-chunk semantic endpoint equivalence

For focused Runtime witnesses and with no semantic command interleaved, different valid exact chunk decompositions of the same normalized integer budget must reach the same semantic endpoint where the current bounded core properties justify the comparison.

This property strengthens host/carrier evidence; it must not be described as proof that an invalid oversized single `tick` call exists.

## Validation-boundary cases

The following are not part of the valid normalized trace corpus:

- negative elapsed time;
- non-finite elapsed time where representable;
- unknown/unresolvable targets;
- invalid core construction/configuration.

These are validation-failure cases under the behavioral contract.

A validation test may verify non-mutation or construction failure, but it must not reinterpret them as ordinary known-request rejection or import the reference JavaScript error surface.

## Host boundary cases

Host-specific research should separately consider cases such as:

- timestamp normalization and explicit epoch rebasing;
- browser visibility/frame scheduling policy;
- nested interactive regions;
- native-scroll release;
- event cancellation;
- focus/accessibility behavior;
- R3F frame sampling;
- React subscription/lifecycle behavior.

These are not part of the host-independent core oracle unless normalized into shared core commands and valid deltas.

## CI

CI is evidence that declared automated checks pass. It is not proof that the architecture or semantics are correct.

Required status checks will be enabled after the initial toolchain and check names are established.
