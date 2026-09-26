# ADR-0012 — First DOM wheel listener uses explicit target and replaceable intent policy

Status: Accepted

## Context

ADR-0008 established the first DOM wheel default-action ownership rule for an already-normalized `next | previous` intent: semantic eligibility belongs to the Runtime, and optional native-default suppression follows an `accepted` disposition rather than predicting it.

That decision intentionally left listener installation, target ownership, passive registration, propagation, existing cancellation state, raw wheel normalization, thresholding, burst policy, and cleanup open.

Issue #109 researched the smallest listener boundary that can sit above ADR-0008 without importing the pinned TypeScript/R3F reference hook's unqualified gesture policy.

Research merged through #110, #111, and #112 used:

- current DOM/Wheel Events platform rules;
- actual Chrome evidence;
- actual WIF Runtime counterexamples;
- the pinned TypeScript/R3F implementation as evidence rather than authority.

The key counterexample is that the same bubbling wheel event can reach multiple listeners. `preventDefault()` does not stop propagation, and duplicate delivery of the same normalized intent can produce two accepted semantic navigations when transition duration and cooldown both settle synchronously. Listener correctness therefore cannot rely on an active transition accidentally rejecting a second request.

The first production listener boundary must remain narrower than a complete wheel gesture algorithm.

## Decision

The first DOM wheel-listener boundary has an explicit host-owned target, an explicitly-owned listener lifecycle, and a replaceable raw-event-to-normalized-intent policy.

Conceptually:

```text
caller-selected EventTarget
        |
        v
explicit wheel listener lifetime
        |
        v
replaceable WheelEvent -> intent policy
        |
        +--> decline / failure
        |      -> no semantic request
        |      -> no native-default suppression
        |
        +--> next | previous
               |
               v
       ADR-0008 ownership boundary
               |
               v
        semantic Runtime request
               |
               +--> rejected
               |      -> no suppression
               |
               +--> accepted
                      -> optional preventDefault()
                         after disposition
                         when configured + cancelable
```

This ADR defines ownership and observable behavior. It does not freeze the final exported function/class/hook name or argument shape.

### Explicit EventTarget ownership

The target is supplied explicitly by the caller or by an equivalently explicit host composition layer.

The first listener does not silently choose:

- `window`;
- `document`;
- `document.documentElement`;
- `document.body`;
- an inferred flow root;
- an automatically discovered scroll container.

A global target may still be deliberately supplied by a caller, but it is not an implicit default authorized by this ADR.

This keeps the first listener's event observation scope explicit and permits independent DOM regions without making WIF the owner of document-wide wheel input.

### Explicit listener lifetime

The binding owns the listener it installs and owns removing that listener.

DOM detachment is not listener cleanup.

A cleanup/disposal operation must remove only the listener installed by that binding and must be safe to perform more than once.

This ADR does not select the mechanism. Explicit `removeEventListener()`, `AbortSignal`, or another standards-compliant mechanism may be used if implementation evidence proves the required lifecycle.

The first listener does not freeze a React lifecycle or require a React hook.

### Non-passive registration when suppression may occur

If the binding is configured such that ADR-0008 may call `preventDefault()` after semantic acceptance, the listener must execute in an explicitly non-passive registration context.

The implementation must not rely on omitted/default passive behavior, because platform defaults differ by target and may make cancellation unavailable.

This requirement exists only to preserve the already-authorized accepted-only suppression path.

This ADR does not claim:

- that every listener should always be non-passive;
- that prevention-disabled listeners must use `passive: true`;
- any performance benefit or cost for either mode.

Those require separate evidence.

### Replaceable raw-event-to-intent policy

Raw `WheelEvent` interpretation occurs before ADR-0008 and remains replaceable host policy.

The policy may produce:

```text
next
previous
no intent / decline
```

A decline produces no semantic request and no native-default suppression request.

If the policy fails before producing an intent, that failure occurs before semantic request or suppression.

If the policy produces an invalid normalized intent, existing ADR-0008 validation rejects it before semantic request or suppression.

For a valid produced intent, the listener delegates exactly once to the existing ADR-0008 ownership layer.

The final resolver API shape is not frozen by this ADR.

### Runtime remains the semantic owner

The listener and raw-event policy do not predict semantic eligibility by reading or mirroring:

- selected phase or phase boundary;
- lock state;
- active transition state;
- cooldown state;
- request eligibility;
- another semantic snapshot field.

The Runtime remains the single owner of whether a known normalized request is `accepted` or `rejected`.

The listener must not import the pinned reference hook's host-side gating rules merely to avoid rejected requests.

### Existing defaultPrevented is host policy, not semantic truth

`event.defaultPrevented` is not a WIF semantic disposition and is not a universal event-deduplication mechanism.

A caller-supplied event-to-intent policy may choose to decline an event that is already default-prevented.

The first WIF listener does not hard-code that choice as semantic eligibility or use cancellation state as proof that another WIF binding has already processed the event.

Research showed that cancellation state is unavailable for non-cancelable events and is absent when native-default prevention is intentionally disabled.

### No propagation ownership

The first listener does not call:

- `stopPropagation()`;
- `stopImmediatePropagation()`.

It also does not use capture phase as a semantic single-delivery mechanism.

Research showed:

- `stopPropagation()` does not prevent later listeners on the same target;
- `stopImmediatePropagation()` can suppress unrelated later listeners and ancestors, which is broader host ownership than current WIF evidence justifies;
- capture changes delivery ordering but does not eliminate multiple listeners.

Propagation remains browser/host composition policy outside this first WIF listener boundary.

### Overlapping WIF bindings remain outside the theorem

The first listener theorem does not guarantee semantic single-delivery when multiple WIF wheel bindings overlap on one bubbling event path.

Research demonstrated that duplicate delivery can result in two accepted navigations when transition duration and cooldown are both zero.

Therefore the first listener must not claim that Runtime transition state, cooldown, `defaultPrevented`, or event propagation implicitly deduplicates overlapping bindings.

Applications that need overlapping wheel ownership require later evidence and policy.

Independent bindings on disjoint explicitly-owned targets remain compatible with this first boundary.

### Raw gesture constants remain deferred

This ADR does not select or import the pinned reference implementation's:

- threshold of 40;
- 200 ms burst inactivity interval;
- pixel multiplier 1;
- line multiplier 16;
- page multiplier 800;
- hook-local cooldown;
- one-navigation-per-burst behavior;
- target-change burst reset;
- ignored/actionable target selectors.

Wheel delta units and device behavior do not justify one cross-device gesture policy without separate research.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM and browser event APIs outside the MoonBit/Wasm core;
- I-02 keeps flow semantics under one semantic owner;
- I-05 keeps browser effects from redefining core truth;
- I-06 requires evidence before semantic or host-policy widening;
- I-07 prevents unsupported cross-host equivalence claims;
- ADR-0002 defines DOM/Web as a first-class host adapter;
- ADR-0008 defines normalized wheel-intent disposition and accepted-only default-action suppression.

Issue #109 research established:

- explicit global/window listeners observe wheel events from descendant regions;
- disjoint element targets can remain independently scoped;
- passive defaults cannot be relied on when cancellation may be required;
- DOM detachment does not remove a listener;
- `preventDefault()` does not stop propagation;
- `stopPropagation()` does not stop later same-target listeners;
- `stopImmediatePropagation()` suppresses more host listeners than current authority permits WIF to own;
- capture ordering does not establish unique ownership;
- `defaultPrevented` cannot universally deduplicate non-cancelable or prevention-disabled input;
- duplicate normalized-intent delivery can produce duplicate accepted navigation under valid Runtime configuration;
- a replaceable resolver can decline or fail before any semantic request or suppression while valid produced intents delegate exactly once to ADR-0008.

The pinned TypeScript/R3F wheel hook remains behavioral evidence. Its React lifecycle, Flow-state eligibility prediction, thresholds, burst timing, delta multipliers, local cooldown, and ignore policy are not imported.

## Consequences

A later production DOM adapter can install one bounded wheel listener without selecting device-feel constants or moving semantic eligibility into the DOM layer.

The listener can be qualified independently of the eventual raw-wheel gesture policy.

Consumers remain responsible for choosing the DOM region that the binding owns.

The project can later research:

- a concrete default wheel-intent resolver;
- nested/native-scroll coexistence;
- overlapping WIF listener ownership;
- React DOM ergonomics;
- additional input devices;

without revising core semantics or ADR-0008.

## Alternatives considered

### Implicit global/window listener

Rejected for the first boundary. It observes wheel input outside a narrower component/region and silently broadens host ownership.

### Import the pinned reference useWheelInput implementation

Rejected. It combines React lifecycle, semantic-state prediction, threshold/burst/device constants, local cooldown, ignore policy, and listener ownership. Those concerns have not been jointly justified as WIF policy.

### Use defaultPrevented as the built-in deduplication signal

Rejected. It only reports successful cancellation and fails as a universal ownership marker for non-cancelable or prevention-disabled events.

### Call stopPropagation()

Rejected. It does not prevent another listener on the same target and unnecessarily changes host event propagation.

### Call stopImmediatePropagation()

Rejected for the first boundary. It can suppress unrelated later listeners and ancestors, taking broader event-system ownership than current evidence justifies.

### Use capture phase to establish ownership

Rejected. Capture changes ordering but does not prove unique semantic delivery.

### Rely on active transition or cooldown to reject duplicate listener delivery

Rejected. Valid zero-duration/zero-cooldown configuration can accept both deliveries.

### Standardize raw delta normalization now

Deferred. Current evidence establishes the replaceable policy seam but not one correct cross-device threshold, multiplier, or burst algorithm.
