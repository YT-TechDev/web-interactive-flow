# ADR-0013 — DOM keyboard default-action suppression follows semantic acceptance

Status: Accepted

## Context

The host-independent WIF Runtime already owns semantic request eligibility for normalized flow commands.

ADR-0008 established the first DOM wheel default-action ownership rule: an already-normalized `next | previous` intent is submitted exactly once to the Runtime, and optional `preventDefault()` follows an `accepted` disposition rather than predicting semantic eligibility.

Keyboard input has a similar ownership question but a materially broader browser-default surface.

Issue #126 researched the first keyboard boundary using:

- current UI Events and HTML platform behavior;
- deterministic counterexamples;
- trusted Chrome/WebDriver input;
- actual WIF MoonBit/Wasm Runtime composition;
- the pinned TypeScript/R3F implementation as behavioral evidence rather than authority.

Research merged through #127 and #128 established that keyboard default actions depend on the key and focused target. Observed browser-native effects included:

- scrolling a focused scroll container;
- activating a button or link;
- changing a select control;
- inserting text;
- moving focus with Tab.

Canceling `keydown` suppressed those corresponding defaults in the qualified witness.

The same research also established that:

- `KeyboardEvent.key` and `KeyboardEvent.code` are distinct observations;
- repeat and composition state belong to host input, not flow semantics;
- a global/window listener observes focused controls outside a narrower flow root;
- semantic phase navigation does not itself imply focus movement;
- the pinned reference hook's lock/transition/boundary prediction and local cooldown duplicate or supplement behavior that WIF keeps under separate ownership.

The smallest justified keyboard theorem is therefore below raw key interpretation and above the semantic Runtime.

## Decision

For an already-normalized keyboard navigation intent, DOM default-action suppression follows the semantic Runtime disposition.

Conceptually:

```text
raw KeyboardEvent
       |
       v
host/caller ownership + mapping policy
       |
       +--> decline
       |      -> no semantic request
       |      -> no WIF default suppression
       |
       +--> next | previous
              |
              v
         Runtime request
              |
              +--> rejected
              |      -> no WIF default suppression
              |
              +--> accepted
                     -> optional preventDefault()
                        after disposition
                        when configured + cancelable
```

This ADR defines ownership and observable behavior. It does not freeze a final exported function, listener, hook, option name, or argument shape.

### Runtime disposition is the semantic authority

For one normalized `next` or `previous` intent, the ownership boundary issues exactly one corresponding semantic Runtime request.

The host layer must not predict whether that request will be accepted by inspecting or mirroring:

- selected phase or phase boundary;
- active transition state;
- cooldown state;
- lock state;
- another semantic snapshot field.

The Runtime remains the single owner of those rules.

A `rejected` semantic request does not trigger WIF `preventDefault()`.

If the semantic request fails before returning a disposition, the ownership boundary does not request native-default suppression.

### Accepted disposition is independent of cancelability

Keyboard event cancelability is browser-event state, not flow-semantic eligibility.

If the Runtime returns `accepted`, that request remains semantically accepted whether the associated event is cancelable or non-cancelable.

When prevention is enabled and the Runtime returned `accepted`, the ownership boundary may call `preventDefault()` only when the event reports that it is cancelable.

Failure to cancel a browser default does not retroactively turn semantic acceptance into rejection.

### Decline happens before semantic ownership

Raw keyboard policy may decline an event before an intent reaches this ownership boundary.

A decline issues:

- no Runtime request;
- no WIF default-action suppression request.

This permits host/application policy to preserve browser-native behavior for controls, editing contexts, composition, focus navigation, or other input it does not assign to WIF.

The exact decline policy is not selected by this ADR.

### One normalized intent produces one semantic request

The ownership boundary does not retry, queue, replay, or issue an additional semantic request based on:

- browser cancellation result;
- target type;
- focus state;
- key repeat;
- composition state;
- another host-side observation.

Any repeated or multiple raw key events are separate host-input observations. Whether they should produce normalized intents is decided before this boundary.

### Focus remains outside semantic flow ownership

A semantic request does not, by itself, move, restore, trap, or select DOM focus.

The first keyboard ownership theorem does not implement:

- focus movement after phase selection;
- focus restoration;
- roving tabindex;
- focus traps;
- automatic focus of newly selected content.

Browser-native focus behavior remains available when host policy declines the event or when a semantic request is rejected and therefore left unprevented.

Applications remain responsible for any intentional focus-management policy.

### Raw keyboard policy remains replaceable host policy

This ADR does not select or standardize:

- a default key list;
- `KeyboardEvent.key` versus `KeyboardEvent.code` as the mapping API;
- repeat handling;
- IME/composition handling or `isComposing`;
- modifier handling;
- editable/actionable target classification;
- selector/ignore APIs;
- native control ownership rules;
- shortcut conventions;
- physical keyboard layout assumptions.

The research evidence specifically prevents treating the pinned reference defaults as universal WIF keyboard semantics.

### Listener ownership remains a later boundary

This ADR does not select:

- an implicit or explicit listener target;
- `window`, `document`, or an element as a default;
- listener installation or cleanup API;
- capture versus bubble phase;
- propagation policy;
- already-`defaultPrevented` arbitration;
- React lifecycle or hook shape.

Issue #126 demonstrated that an explicit flow-root listener has a narrower observation scope than a global/window listener, but this ADR does not freeze the first production keyboard-listener contract.

### Accessibility conformance is not implied

Preserving browser-native behavior through host decline or semantic rejection is an important non-interference property.

It is not, by itself, evidence of:

- WCAG conformance;
- screen-reader support;
- complete keyboard accessibility;
- correct focus management;
- correct application shortcut design.

Those require separate application and accessibility evidence.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM/browser APIs outside the host-independent core.
- I-02 keeps semantic flow truth under one owner.
- I-05 prevents host effects from redefining semantic state.
- I-06 requires evidence before host-policy widening.
- I-07 prevents unsupported cross-host equivalence claims.
- ADR-0002 places keyboard integration in the DOM/Web host adapter.
- ADR-0008 provides the analogous accepted-only ownership pattern for normalized wheel intents.

Issue #126 research established in qualified Chrome 153 / ChromeDriver 153:

- unprevented PageDown on a focused scroller performed native scrolling; canceling the keydown prevented it;
- unprevented Space activated a focused button; canceling keydown suppressed that activation;
- unprevented Enter activated a focused link in the WebDriver witness;
- unprevented ArrowDown changed a focused select;
- unprevented printable input inserted text; canceling keydown suppressed insertion;
- unprevented Tab moved focus; canceling keydown preserved the prior focus;
- `key="a"` and `key="A"` shared `code="KeyA"` under modifier change;
- the WebDriver Enter action exposed `key="Enter"` with `code="NumpadEnter"`, demonstrating that effective meaning and physical-key identity must not be conflated;
- a global/window observer received a trusted key event from a control outside the explicit research flow root while that root did not;
- the classic WebDriver held-key probe did not reproduce physical key repeat and therefore does not justify repeat-rate behavior;
- the research environment did not establish a real IME composition witness.

The actual Runtime/Wasm witness established:

- at initial phase A, normalized `previous` returned `rejected`; the trusted PageUp event remained unprevented and native scroll proceeded;
- normalized `next` returned `accepted`; prevention followed the disposition and suppressed the corresponding native PageDown scroll;
- focus remained on the same scroller across both semantic cases;
- explicit host decline preserved native button activation and printable text input without issuing a Runtime request.

The pinned reference `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce` remains behavioral evidence.

Its useful evidence includes accepted-only prevention and protection of native editing/actionable targets.

Its exact default key arrays, repeat rule, typing policy, local cooldown, default window target, React lifecycle, and host-side semantic-state prediction are not imported by this ADR.

## Consequences

A later DOM keyboard adapter can use the semantic Runtime as the sole known-request eligibility owner.

Host policy may safely remain conservative:

- decline input it does not own;
- preserve native browser behavior on decline;
- submit normalized intents exactly once;
- preserve native browser behavior when the Runtime rejects;
- request default suppression only after semantic acceptance and only when cancellation is possible.

This allows raw keyboard ergonomics to evolve without changing core semantics or this ownership rule.

A later keyboard listener can be researched independently for target ownership, cleanup, propagation, repeat/composition policy, native-control classification, and public API ergonomics.

The first production implementation does not need to copy the pinned reference hook or move any DOM/focus/keyboard concepts into MoonBit/Wasm.

## Alternatives considered

### Prevent default before asking the Runtime

Rejected.

Keyboard `preventDefault()` can suppress scrolling, native activation, text input, focus movement, or composition-related behavior even when the semantic request should be rejected.

### Predict semantic eligibility from a Runtime snapshot

Rejected.

It duplicates phase-boundary, lock, transition, and cooldown rules in the DOM host and risks divergence from the semantic owner.

### Import the pinned reference keyboard hook

Rejected.

The reference combines key mapping, target policy, repeat handling, React lifecycle, semantic-state prediction, local cooldown, global-target defaults, and prevention. Those concerns are not jointly justified as WIF authority.

### Make event cancelability determine semantic acceptance

Rejected.

Cancelability is browser-event state. It cannot decide whether the semantic Runtime accepts a known flow request.

### Freeze the reference default key list

Rejected.

Issue #126 showed that identical key values can have different native meaning depending on the focused target, while `key` and `code` represent different keyboard concepts.

A default key map is product/host policy and requires separate evidence.

### Treat repeat or composition as core semantics

Rejected.

They describe host input delivery state, not the flow state machine.

### Make keyboard navigation own focus automatically

Rejected.

The research demonstrated browser-native focus behavior as an independent host effect, and no evidence justifies coupling semantic phase selection to automatic DOM focus movement.

### Use an implicit global/window listener by default

Not selected.

Research demonstrated broader event observation outside a narrower flow root. Listener target ownership requires its own contract before production.
