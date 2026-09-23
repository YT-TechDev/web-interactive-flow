# Pre-v0.1 Behavioral Contract

Status: Repository behavioral authority for the first runtime proof

This document records the smallest host-independent behavior justified by focused research in Issues #2 through #9.

It is intentionally narrower than a permanent invariant set. Future evidence may revise these semantics through the repository authority process. Until then, the first MoonBit/Wasm runtime proof and its differential oracle should implement and test this contract.

Behavioral reference used during research:

- `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`

The reference is evidence, not authority. JavaScript API shape, React/R3F scheduling, eased public progress, and exception behavior are not imported unless stated here.

## Phase domain and initialization

A valid core instance has:

- one non-empty ordered domain of distinct semantic phase identities;
- exactly one initially selected member of that domain.

The domain and its logical order are stable for the lifetime of the core instance.

A one-phase domain is valid. It has no eligible navigation to another phase.

The representation of phase identities is not frozen. Strings, numeric indexes, handles, enums, and other encodings remain implementation questions.

The semantic boundary requires an initial selected member. A higher-level API may later provide a convenience default such as selecting the first phase, but that default is not part of this core contract.

## Selected phase

The selected phase is the phase most recently selected by initialization or by an accepted navigation.

For a known eligible target:

- acceptance atomically changes the selected phase to that target;
- the selected phase identifies the accepted destination during a positive-duration transition;
- completion and cooldown do not change the selected phase again.

A rejected/no-op known request does not change the selected phase.

The selected phase must not be interpreted as current visual occupancy. Hosts may still be rendering or interpolating away from a prior phase.

Source identity may be used transiently while accepting a request, for example to derive direction or resolve source-sensitive policy. Persistent source history is not required by this contract.

## Known navigation request disposition

A normalized navigation request already identifies a known semantic phase or an adjacent operation within the configured ordered domain.

A valid known request is accepted only when it is eligible under the current core state.

The first runtime proof must preserve these researched v0.1 cases:

- adjacent next/previous navigation within bounds may be accepted;
- direct navigation to a different known phase may be accepted, including non-adjacent targets;
- direct non-adjacent navigation commits one target navigation and does not synthesize intermediate accepted selections;
- first-boundary previous and last-boundary next are rejected/no-op;
- targeting the already selected phase is rejected/no-op;
- navigation while locked is rejected/no-op;
- navigation while a transition is active is rejected/no-op, including repeated same-direction requests and attempted reversal;
- navigation while the core cooldown gate is active is rejected/no-op.

A rejected/no-op known request:

- does not partially mutate semantic state;
- does not reset or extend transition/cooldown lifecycle state;
- is not queued or replayed later.

The exact API representation of accepted/rejected disposition is not frozen.

## Transition lifecycle

A positive-duration accepted navigation creates an active transition.

While a transition is active, the core conceptually owns:

- the selected target;
- an active forward/reverse direction derived from the accepted source/target ordering;
- raw normalized transition progress.

Direction is a shared flow relation, not presentation easing. It remains stable while the positive-duration transition is active and has no active value once the transition is settled.

A zero-duration accepted navigation may settle synchronously in the accepting operation:

- the selected phase changes to the accepted target;
- no active transition remains afterward;
- no active direction remains afterward;
- configured cooldown may already be active.

The settled snapshot is not required to retain accepted-event history.

## Raw progress and presentation easing

Raw normalized transition progress is a core semantic concept for an active positive-duration transition.

Transition completion is decided by raw lifecycle time/progress, not by a presentation easing function.

Presentation easing is outside core flow semantics. A DOM, R3F, or other presentation layer may transform raw progress, but eased output must not redefine:

- request eligibility;
- transition completion;
- cooldown expiry;
- selected phase;
- direction;
- lock behavior.

The exact numeric representation of raw progress and its inactive-state representation are not frozen.

See ADR-0004.

## Explicit time progression

Valid normalized elapsed time is finite and non-negative in one consistent time domain.

Lifecycle time changes only through explicit normalized tick input.

For valid `dt`:

- `dt = 0` advances zero raw lifecycle time;
- positive time is consumed against the active transition first;
- transition completion occurs at the exact raw-duration boundary;
- configured core cooldown begins when the transition completes;
- any unconsumed positive time continues into cooldown in the same tick;
- time remaining after both transition and cooldown are exhausted has no further lifecycle effect;
- manual lock does not pause or cancel transition/cooldown time.

With no intervening commands, segmenting one valid elapsed-time budget does not change the raw lifecycle endpoint:

```text
lifecycle(tick(a + b))
==
lifecycle(tick(a); tick(b))
```

for valid non-negative `a` and `b`.

This property concerns raw lifecycle state, not presentation easing.

The concrete time unit and numeric representation are not frozen.

## Cooldown and lock

Cooldown is a core-owned request gate associated with transition lifecycle.

While the cooldown gate is active, otherwise-valid known navigation is ineligible.

Cooldown expires when its configured remaining lifecycle time reaches zero.

Lock is also core-owned request-gating state.

Lock and lifecycle time are orthogonal:

- locking blocks new eligible navigation;
- an already-active transition continues to advance while locked;
- cooldown continues to elapse while locked;
- unlocking does not replay requests that were rejected while locked.

The public representation of cooldown remaining time is not frozen.

## Validation boundary

Validation failure is distinct from valid known-request rejection.

Conceptually:

```text
host value
  -> normalize / validate
  -> known semantic command
  -> core request disposition
```

Examples outside the valid normalized semantic domain include:

- a target that cannot be resolved to exactly one configured semantic phase;
- negative elapsed time;
- non-finite elapsed time where the host numeric system permits it;
- empty phase domain;
- duplicate semantic phase identities;
- an initial selected identity outside the domain;
- lifecycle duration/cooldown values outside the finite non-negative time domain.

For an already-valid core instance, validation failure at an entrypoint must occur before semantic state mutation.

Invalid construction does not produce a valid runtime state.

The exact validation/error representation is not frozen. JavaScript exceptions and the reference implementation's negative-delta clamp are not part of this contract.

## Behavioral observation vocabulary

Differential validation should compare semantic observations rather than full reference snapshots.

The conceptual projection is:

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

This is test vocabulary, not a proposed runtime struct or Wasm ABI.

## Explicitly outside this contract

This document does not freeze or add semantics for:

- source-phase history;
- transition interruption or queues beyond the v0.1 rejection behavior above;
- route graphs or intermediate-route synthesis;
- serialization/restore;
- machine-readable trace serialization;
- public phase-index representation;
- Wasm ABI;
- JS/TS bridge API;
- React/R3F API;
- presentation easing utilities;
- animation timelines, springs, or physics;
- DOM event ownership, native scroll, focus, or accessibility policy.
