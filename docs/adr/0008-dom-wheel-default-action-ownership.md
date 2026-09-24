# ADR-0008 — DOM wheel default-action suppression follows semantic acceptance

Status: Accepted

## Context

The host-independent MoonBit/Wasm runtime already owns flow request eligibility and exposes synchronous semantic request disposition through the JavaScript Runtime wrapper.

For an already-normalized navigation intent, the wrapper can report whether the corresponding request was `accepted` or `rejected` without a DOM host reimplementing boundary, lock, active-transition, cooldown, or same-target rules.

After the real-browser production-composition qualification in Issues #68 through #72, Issue #73 researched the first DOM wheel/native-scroll ownership frontier.

Wheel input introduces a separate browser concern: a host may want an accepted flow-navigation request to suppress the browser's native default action. That suppression is not flow semantics. Browser event cancelability and listener passivity also do not determine whether the semantic Runtime may accept a navigation request.

Issue #73 found that the first useful theorem can be narrower than a wheel gesture adapter. It can accept an already-normalized `next` or `previous` intent and prove the ordering between semantic request disposition and optional native-default suppression without selecting wheel delta normalization, threshold, burst, root, or nested-scroll policy.

## Decision

The first DOM wheel ownership layer is stateless and consumes an already-normalized navigation intent:

```text
next | previous
```

For one supplied intent, it delegates exactly one corresponding request to the existing semantic Runtime:

```text
normalized intent
      |
      v
semantic Runtime request
      |
      +--> Rejected
      |      |
      |      v
      |   no native-default suppression request
      |
      +--> Accepted
             |
             +--> prevention disabled
             |      -> no suppression request
             |
             +--> prevention enabled
                    |
                    +--> event cannot be canceled
                    |      -> no suppression request
                    |
                    +--> event can be canceled
                           -> host may call preventDefault()
                              after Accepted disposition
```

### Semantic disposition owns eligibility

The DOM wheel ownership layer must not inspect a semantic snapshot or duplicate core state in order to predict whether a request should be accepted.

It must not independently decide eligibility from:

- selected phase or phase boundary;
- lock state;
- active transition state;
- cooldown state;
- any other flow-semantic gate.

The semantic Runtime remains the single owner of those rules.

A `rejected` request does not trigger `preventDefault()` in this ownership layer.

If the semantic Runtime fails before returning a request disposition, the ownership layer does not request native-default suppression.

### Cancelability is not semantic eligibility

Browser event cancelability is independent of semantic request disposition.

A non-cancelable event may still correspond to an `accepted` semantic request.

The ownership layer must not turn a semantically accepted request into rejection merely because the supplied host event cannot be canceled.

Likewise, a cancelable event does not imply that the semantic request is eligible.

### Prevention is a host effect

Native-default suppression is a DOM host effect.

When prevention is enabled and the semantic request returned `accepted`, the ownership layer may call `preventDefault()` only when the supplied event reports that it is cancelable.

Calling `preventDefault()` is a request to the browser event system. It is not itself proof that the browser default action was successfully suppressed in every listener context.

A future listener that relies on default-action suppression must execute in a context where the platform permits cancellation, including satisfying non-passive listener requirements where applicable. This ADR does not select the listener-registration API.

### Exactly one semantic request per normalized intent

One invocation of the ownership layer for one normalized `next` or `previous` intent issues exactly one corresponding semantic Runtime request.

It must not retry, queue, replay, or issue an additional request based on event cancelability or suppression outcome.

### Stateless ownership boundary

The first ownership layer has no persistent wheel gesture state.

It does not own:

- raw `deltaX`, `deltaY`, or `deltaMode` interpretation;
- pixel/line/page conversion;
- thresholding;
- burst accumulation;
- direction-reversal handling;
- gesture inactivity timers;
- hook-local cooldown;
- browser frame time or ADR-0005 normalization state.

Those are separate possible host-input policies and require their own evidence.

### Native-scroll and event-route policy remains open

This ADR does not select:

- Window, Document, Element, or flow-root listener targets;
- listener installation or cleanup API;
- capture versus bubble phase;
- behavior for events already marked `defaultPrevented`;
- `stopPropagation()` or `stopImmediatePropagation()`;
- automatic nested-scroll-container detection;
- release to native scrolling at a scroll boundary;
- scroll chaining or `overscroll-behavior` policy;
- Shadow DOM ownership;
- ignored/actionable/editable target policy;
- raw wheel gesture-to-intent mapping.

A surrounding future DOM adapter must decide whether an event belongs to WIF before presenting an event and normalized intent to this ownership boundary.

The first ownership layer therefore does not claim universal native-scroll coexistence.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM and event APIs outside the host-independent core.
- I-02 keeps flow semantics under one semantic owner.
- I-05 makes DOM/native-browser effects projections or consequences of semantic state rather than competing flow truth.
- ADR-0002 places DOM event integration in host adapters.
- The pre-v0.1 behavioral contract already defines accepted/rejected known-request semantics independently of browser events.
- Issue #73 selected this narrow ownership theorem after falsifying immediate threshold/burst, fixed delta-mode conversion, global event capture, and automatic nested-scroll inference.

Platform evidence used during Issue #73 includes:

- Wheel Events editor draft: https://w3c.github.io/uievents/split/wheel-events.html
- DOM Standard event cancellation/passive-listener rules: https://dom.spec.whatwg.org/
- MDN `addEventListener()` passive-listener guidance: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
- CSS Overscroll Behavior scroll-chaining model: https://www.w3.org/TR/css-overscroll-1/

Behavioral-reference evidence:

- `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce` demonstrates accepted-only prevention and preservation of semantic acceptance for non-cancelable wheel events.
- Its exact wheel threshold, burst timeout, delta-mode multipliers, React hook API, selector policy, and local cooldown are evidence from that implementation only and are not imported by this ADR.

## Consequences

A future DOM wheel adapter can delegate request eligibility to the existing semantic Runtime and decide native-default suppression afterward.

Rejected boundary, lock, transition, cooldown, and other ordinary semantic rejections do not suppress native browser behavior merely because a wheel-related intent reached this ownership layer.

The ownership theorem can be tested deterministically without selecting device-feel constants, a full DOM listener API, or nested-scroll heuristics.

Wheel intent derivation remains replaceable. A future threshold/burst or device-normalization policy can change without moving request eligibility out of the semantic Runtime.

This ADR does not itself provide a production wheel listener or a complete DOM consumer.

## Alternatives considered

### Call `preventDefault()` before asking the semantic Runtime

Rejected. A boundary, lock, transition, cooldown, or other rejected flow request could suppress native browser behavior even though WIF performed no navigation.

### Make event cancelability control semantic acceptance

Rejected. Event cancelability is browser-event state, not flow eligibility. A non-cancelable event may still correspond to an accepted flow request.

### Predict request eligibility from `getSnapshot()`

Rejected. It would duplicate semantic gating rules in the DOM adapter and race future semantic widening.

### Import the pinned R3F wheel algorithm

Rejected. Its threshold, line/page multipliers, burst timing, ignore rules, React lifecycle, and local cooldown have not been justified as WIF-wide host policy.

### Automatically infer nested scrollability before requesting navigation

Rejected for the first proof. Scroll-container detection, current boundary, scroll chaining, overscroll policy, event paths, and axis behavior form a broader host-policy frontier.

### Never suppress native default behavior

Not selected as the first ownership contract. Some DOM flow consumers may intentionally want accepted wheel-driven navigation to own the gesture. The selected boundary permits suppression only after semantic acceptance and only when configured and possible, without requiring every future adapter to enable it.
