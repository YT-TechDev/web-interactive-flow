# ADR-0016 — Pointer Events are the first DOM direct-manipulation substrate

Status: Accepted

## Context

The DOM/Web adapter already has evidence-backed boundaries for wheel and keyboard input, but direct-manipulation input remained unresolved.

The pinned TypeScript/R3F reference implements touch swipes with legacy Touch Events. That implementation is useful behavioral evidence, but current platform standards prefer Pointer Events for hardware-agnostic pointer input.

Issue #139 researched whether WIF should:

- mechanically port the reference Touch Events implementation;
- use Pointer Events as the first substrate;
- bind both event models;
- or defer substrate selection.

The research used:

- current Pointer Events and Touch Events platform specifications;
- deterministic gesture/lifecycle counterexamples;
- trusted Chrome-generated PointerEvent and TouchEvent streams from one injected touch sequence;
- CSS `touch-action` variants;
- pointer cancellation;
- implicit pointer capture;
- trusted multi-pointer input;
- a trusted mouse pointer control;
- actual WIF MoonBit/Wasm Runtime composition.

The evidence is sufficient to choose an event substrate and lifecycle ownership boundary without choosing a universal swipe recognizer.

## Decision

Pointer Events are the first WIF DOM direct-manipulation event substrate.

This decision selects host event representation and lifecycle only.

It does not select a default gesture algorithm.

Conceptually:

```text
author CSS / browser
  touch-action
      |
      v
PointerEvent lifecycle
  pointerdown
  pointermove
  pointerup | pointercancel
      |
      v
caller/application gesture policy
      |
      +--> decline / cancel / invalid
      |      -> no semantic request
      |
      +--> next | previous
             |
             v
           Runtime
      owns semantic eligibility
```

### Pointer Events are the first substrate

The first WIF direct-manipulation integration should observe Pointer Events rather than mechanically porting the pinned reference's Touch Events hook.

Legacy Touch Events remain behavioral/reference evidence.

The first WIF direct-manipulation boundary does not install simultaneous PointerEvent and TouchEvent navigation bindings by default.

Qualified Chrome emitted both trusted PointerEvents and trusted TouchEvents from one injected touch sequence.

Two WIF navigation bindings over both streams could therefore observe one conceptual user gesture twice.

ADR-0015 prohibits hiding such overlap through implicit global Event arbitration or deduplication.

Selecting Pointer Events avoids requiring a hidden cross-substrate ownership mechanism merely to construct the first boundary.

This decision does not make a universal claim that Touch Events never matter for compatibility. Any later TouchEvent fallback requires separate compatibility evidence and explicit overlap ownership.

### `touch-action` remains author/browser host authority

Direct-manipulation panning and zooming are not assigned to WIF by canceling pointer movement.

Application/author CSS declares browser direct-manipulation ownership through `touch-action`.

WIF does not move `touch-action` into MoonBit/Wasm semantic state.

The first direct-manipulation boundary does not treat PointerEvent `preventDefault()` as the primary pan-ownership mechanism.

Qualified Chrome evidence showed:

```text
touch-action: auto
  -> native scrolling
  -> pointercancel

touch-action: pan-y
  -> vertical native scrolling
  -> pointercancel

touch-action: none
  -> no native pan scroll
  -> pointer stream continues to pointerup
```

A WIF application that intends to own a direct-manipulation gesture must establish the appropriate CSS host policy before that gesture begins.

Changing computed `touch-action` from `auto` to `none` during pointerdown did not retroactively transfer the active gesture away from browser panning in the qualified witness.

The element ended with computed `touch-action:none`, while that same already-started sequence still scrolled and produced pointer cancellation.

Therefore a future recognizer must not depend on lazily changing `touch-action` only after it decides that movement looks like a WIF gesture.

This ADR does not select a universal `touch-action` value for every WIF consumer.

### `pointercancel` is a host lifecycle boundary

A pointer sequence canceled by the browser must not later commit stale WIF navigation from accumulated host gesture state.

Qualified browser-owned panning under `touch-action:auto` produced:

```text
pointerdown
pointermove...
pointercancel
```

The actual Runtime composition witness used a conservative research recognizer that reset its host gesture state on cancellation.

Observed after browser takeover:

```text
Runtime selected = A
semantic decisions = 0
gesture active pointer ids = []
tracked pointer = none
accumulated coordinates = cleared
```

A later fresh sequence could start from fresh state and navigate normally.

The required theorem is lifecycle reset on cancellation, not the particular research recognizer.

This ADR does not select when a future gesture recognizer commits navigation.

In particular, it does not authorize semantic commit on `pointerdown` merely because that is the first event in the sequence.

### Pointer identity is host identity

`PointerEvent.pointerId` is host/browser pointer identity.

It is opaque to WIF semantics.

WIF must not assume an external automation/device identifier is numerically equal to the resulting browser `pointerId`.

The research initially made that assumption and failed:

```text
DevTools injected touch id = 2
browser PointerEvent.pointerId = 3
```

The qualification was corrected to treat `pointerId` as browser-assigned identity.

`isPrimary` is also host pointer metadata.

It does not prove that only one pointer exists.

Trusted multi-pointer evidence contained one touch pointer with `isPrimary=true` and another simultaneous touch pointer with `isPrimary=false`.

Any single-pointer or multi-pointer gesture rule remains caller/application host policy.

### Pointer capture remains host routing state

Qualified direct-manipulation input exposed implicit pointer capture.

The actual hit-tested child target held capture while an ancestor listener observed the bubbling event.

Research initially expected capture on the observing ancestor and failed.

Actual evidence:

```text
event.target = none-content
event.currentTarget = none

event.target.hasPointerCapture(pointerId) = true
event.currentTarget.hasPointerCapture(pointerId) = false
```

Movement outside the original visual bounds remained routed to the captured target.

The stream exposed `gotpointercapture` and later `lostpointercapture`.

This establishes that listener ownership and capture ownership are distinct host concepts.

Current evidence does not require WIF to call `setPointerCapture()` explicitly for the first direct-manipulation boundary.

No public explicit-capture API or automatic capture policy is selected.

### `pointerType` remains raw host policy

Pointer Events unify touch, mouse, pen, and other pointer classes at one event substrate.

That does not mean all pointer types should automatically produce the same WIF navigation policy.

Qualified browser evidence included trusted:

```text
pointerType = touch
```

and trusted:

```text
pointerType = mouse
```

The research-only Runtime composition deliberately declined the mouse pointer and accepted selected touch sequences only to prove policy placement.

That specific allowlist is not selected as product behavior.

A future resolver may use `pointerType` as host policy input before producing a normalized flow intent.

Pen behavior remains unqualified.

### Gesture recognition remains replaceable host policy

This ADR does not define a WIF-wide swipe theorem.

It does not standardize:

- displacement threshold;
- horizontal or vertical axis;
- diagonal interpretation;
- direction locking;
- velocity;
- duration;
- reversal behavior;
- pointerdown/pointermove/pointerup commit point;
- pointerType allowlist;
- multi-pointer invalidation;
- `isPrimary` filtering;
- native-control classification;
- ignore selectors.

The research-only Runtime witness used a local threshold and one conservative lifecycle policy solely to create accepted/rejected semantic requests.

Those constants and rules are evidence infrastructure, not production authority.

### Runtime remains the semantic owner

Pointer lifecycle state remains outside semantic Runtime state.

When host/caller gesture policy eventually produces a normalized `next` or `previous` intent, semantic eligibility remains Runtime-owned.

The host must not infer semantic acceptance from:

- pointer type;
- pointer id;
- primary status;
- capture state;
- gesture completion;
- CSS touch-action;
- browser cancellation.

The qualified Runtime witness established both:

```text
research intent = next
Runtime A -> B
accepted
```

and:

```text
research intent = previous
Runtime at A
rejected
Runtime remains A
```

No PointerEvent cancellation was used to decide or rewrite either semantic disposition.

No pointer, touch, CSS, capture, or gesture concept enters the MoonBit/Wasm core.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM/browser APIs outside the host-independent core.
- I-02 keeps semantic flow truth under one owner.
- I-05 prevents host effects from redefining semantic state.
- I-06 requires evidence before host-policy widening.
- ADR-0002 places pointer/touch integration in the DOM/Web adapter.
- ADR-0015 prohibits hidden implicit arbitration across overlapping DOM bindings.

Issue #139 / PR #140 established in qualified Chrome 153 / ChromeDriver 153:

### Browser-owned direct manipulation

For `touch-action:auto`:

```text
trusted pointerType = touch
native scrollTop increased
pointercancel observed
lostpointercapture observed
```

For `touch-action:pan-y`, the qualified vertical pan similarly remained browser-owned and canceled the pointer stream.

### WIF-owned direct-manipulation host policy

For `touch-action:none`:

```text
native scrollTop remained unchanged
pointermove remained observable
pointerup completed
browser-pan pointercancel was not observed
```

This is host/CSS evidence only; it does not authorize one gesture mapping.

### Touch-action timing

A region began a gesture with `touch-action:auto`.

Its pointerdown handler changed the style to `none`.

The active gesture still scrolled natively and was canceled by the browser.

This establishes the timing boundary for the qualified environment.

### Trusted dual substrate delivery

One injected touch sequence produced both trusted PointerEvents and trusted TouchEvents in qualified Chrome.

That is direct counterevidence against treating simultaneous first-class bindings to both substrates as harmless.

### Multi-pointer

One trusted two-touch sequence exposed simultaneous primary and non-primary touch pointers.

`isPrimary` therefore cannot serve as a single-pointer-count theorem.

### Implicit capture

The browser exposed implicit target capture, routing movement outside visual bounds to the original hit target and releasing capture at stream completion.

The first failed capture assertion is part of the evidence because it distinguishes the pointer target from an ancestor listener target.

### Mouse control

Trusted mouse input appeared as PointerEvents with `pointerType=mouse` and did not emit a TouchEvent stream in the control witness.

PR #141 added actual Runtime/Wasm composition.

### Browser-owned cancellation before semantic request

```text
touch-action = auto
native scrollTop: 0 -> 131
pointercancel
Runtime remains A
decisions = 0
gesture state reset
```

### Fresh owned sequence

Before the fresh gesture the application set `touch-action:none`.

```text
research intent = next
Runtime A -> B
accepted
PointerEvent defaultPrevented = false
native scroll did not advance further
gesture state reset
```

### Semantic rejection

```text
research intent = previous
Runtime at A -> rejected
Runtime remains A
defaultPrevented = false
```

### Multi-pointer reset

The research recognizer issued no semantic request for its two-pointer sequence, cleared all host gesture state, and later accepted a fresh single-touch sequence normally.

This proves separation of host gesture lifecycle from Runtime semantics, not a universal multi-pointer policy.

## Reference classification

Pinned reference:

`YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`

Useful behavioral evidence includes:

- canceled touch gestures require state reset;
- multi-touch contamination is a real gesture-policy concern;
- browser TouchEvent cancelability may change;
- explicit host listener cleanup matters;
- nested/native ownership is host policy.

The following reference behavior is not imported:

- legacy Touch Events as the first WIF direct-manipulation substrate;
- fixed default threshold;
- fixed default axis;
- hook-local cooldown;
- default global/window target;
- React hook/effect lifecycle;
- editable/actionable classifiers;
- host-side semantic lock/transition/boundary prediction.

## Consequences

A future direct-manipulation adapter can build on one Pointer Events lifecycle without introducing TouchEvent/PointerEvent double handling.

Applications remain responsible for author CSS that assigns direct-manipulation pan/zoom ownership.

A future gesture resolver can evolve independently of core semantics.

Pointer cancellation must terminate accumulated host gesture state before a later fresh sequence.

Pointer identity, capture, device type, and multi-pointer observations remain host-level data.

No new MoonBit/Wasm state, ABI, or command is required merely to adopt the Pointer Events substrate.

## Alternatives considered

### Mechanically port legacy Touch Events

Rejected for the first substrate.

Current standards favor Pointer Events, and the qualified Pointer Events lifecycle was sufficient for WIF research needs.

The reference remains useful behavior evidence but does not own WIF architecture.

### Bind Pointer Events and Touch Events simultaneously

Rejected as the first default.

Qualified Chrome emitted both streams for one injected touch sequence.

Dual navigation bindings would introduce overlap requiring explicit ownership rather than hidden deduplication.

### Use PointerEvent preventDefault to own browser panning

Rejected.

Qualified behavior and platform semantics place direct-manipulation pan ownership under `touch-action`.

### Commit on pointerdown

Rejected as a universal rule.

The browser may later cancel that stream when native direct manipulation takes over.

### Treat isPrimary as single-pointer proof

Rejected.

Trusted multi-pointer evidence contained both primary and non-primary active touch pointers.

### Require explicit pointer capture

Not selected.

Implicit capture was sufficient in the qualified routing witness.

An explicit capture policy requires a separate routing need and evidence.

### Treat all pointer types identically

Not selected.

Pointer Events unify representation, not application gesture ownership.

### Adopt the research threshold/axis/multi-pointer rules

Rejected.

They exist only to create controlled evidence for semantic composition.

## Evidence limits

Current browser evidence is bounded to:

- Chrome 153.0.8010.52;
- ChromeDriver 153.0.8010.52;
- DevTools touch injection through ChromeDriver;
- WebDriver mouse-pointer input.

This ADR does not establish:

- universal browser/device compatibility;
- physical-device equivalence;
- Safari/iOS compatibility;
- pen behavior;
- universal implicit-capture behavior;
- a production gesture recognizer;
- a default `touch-action` value for all applications;
- Shadow DOM/composed-path ownership;
- focus/accessibility conformance;
- React direct-manipulation API;
- package export topology for pointer integration.
