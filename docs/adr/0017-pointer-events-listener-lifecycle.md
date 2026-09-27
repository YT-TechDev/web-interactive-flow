# ADR-0017 — First Pointer Events listener owns explicit lifecycle and gesture-state abort

Status: Accepted

## Context

ADR-0016 selected Pointer Events as the first DOM direct-manipulation event substrate while deliberately leaving the production listener and gesture recognizer unresolved.

Issue #144 researched the next boundary.

The research separated three ownership layers:

1. listener mechanics;
2. stateful host gesture policy;
3. semantic Runtime state.

The central failure mode was stale cross-event gesture state surviving application-driven listener teardown.

A naive binding that removed DOM listeners but reused the same stateful gesture policy on another target could accept a later pointerup as completion of an old pointerdown sequence.

That counterexample shows that listener lifetime and gesture-state lifetime are related even though gesture interpretation itself remains replaceable host policy.

The research used:

- deterministic listener/lifecycle counterexamples;
- trusted Chrome-generated touch PointerEvents;
- explicit target scoping;
- active-gesture cleanup;
- target replacement during an active pointer sequence;
- browser pointercancel under native direct manipulation;
- unrelated-listener preservation;
- synthetic detached-target lifecycle evidence;
- production compileFlowModule();
- production createFlowRuntime();
- qualified MoonBit/Wasm.

## Decision

The first Pointer Events listener requires an explicitly supplied caller-owned EventTarget.

It installs listeners only for:

```text
pointerdown
pointermove
pointerup
pointercancel
```

Each delivered PointerEvent is forwarded to replaceable stateful host gesture policy.

That policy may:

- accumulate host gesture state;
- decline;
- reset;
- eventually produce at most one normalized next or previous intent for that delivered event.

A valid produced intent is submitted to the semantic Runtime exactly once.

Conceptually:

```text
explicit caller-owned EventTarget
      |
      +-- pointerdown
      +-- pointermove
      +-- pointerup
      +-- pointercancel
             |
             v
replaceable stateful host gesture policy
             |
             +--> decline / accumulate / reset
             |
             +--> next | previous
                    |
                    v
                  Runtime
```

Application-driven binding teardown must also terminate the active gesture-policy state.

This ADR defines ownership and lifecycle boundaries.

It does not freeze a final public listener function, controller type, reset/abort method name, gesture algorithm, package export, or framework integration.

### Listener target is explicit

The first Pointer Events listener does not silently select or discover:

- window;
- document;
- documentElement;
- body;
- a global root;
- the currently active element;
- the current scroll container.

The caller owns the EventTarget on which the binding is installed.

Trusted research established that a pointer stream within the explicit target was observed while an equivalent outside stream was not.

### Listener event set is bounded

The first binding installs the four lifecycle events:

- pointerdown;
- pointermove;
- pointerup;
- pointercancel.

Listener mechanics do not require Touch Events in parallel.

ADR-0016 already established that simultaneous PointerEvent and TouchEvent navigation bindings can double-observe one conceptual touch gesture.

### Gesture interpretation remains replaceable host policy

Listener mechanics do not embed one WIF-wide gesture recognizer.

The listener itself does not own:

- pointer identity tracking;
- coordinate accumulation;
- displacement thresholds;
- axis rules;
- diagonal policy;
- velocity or duration;
- reversal behavior;
- commit point;
- pointerType allowlists;
- multi-pointer policy;
- native-control classification;
- ignore selectors.

Those belong to replaceable host gesture policy before a normalized flow intent exists.

### Gesture policy may be stateful

Unlike wheel or keyboard raw resolvers, direct-manipulation gesture policy can legitimately accumulate state across multiple PointerEvents.

Examples include:

- tracked pointer identity;
- start and current coordinates;
- active-pointer count;
- invalidation state;
- cancellation state.

That host state remains outside the semantic Runtime.

The fact that policy is stateful creates an explicit lifecycle responsibility for the binding.

### Binding cleanup must terminate active gesture state

Removing DOM listeners alone is insufficient when policy carries cross-event state.

Issue #144 recorded the deterministic counterexample:

```text
target A:
  pointerdown
  gesture state accumulates

remove A listeners only
reuse same stateful policy on target B

target B:
  matching pointerup
  -> stale old gesture emits next
```

Therefore binding cleanup must terminate the active gesture-policy state before that policy can participate in a later binding.

The public lifecycle mechanism is not frozen.

A future API may expose a reset, abort, dispose, session boundary, or another equivalent mechanism if its observable behavior satisfies this theorem.

### Browser pointercancel and application cleanup are independent termination paths

Browser pointercancel remains a host lifecycle event under ADR-0016.

Application cleanup is a separate lifecycle event.

Both must terminate stale gesture accumulation.

Qualified trusted evidence established:

```text
touch-action:auto
trusted pointerdown
trusted pointermove
trusted pointercancel
native scroll proceeds
policy state reset
Runtime remains A
semantic decisions = 0
```

and independently:

```text
touch-action:none
trusted pointerdown
trusted pointermove
binding cleanup
policy state reset
Runtime remains A
semantic decisions = 0
```

Application teardown must not depend on the browser emitting pointercancel.

### DOM detachment is not cleanup

Listener lifetime belongs to the EventTarget and the binding, not to DOM connectivity.

The detached-target lifecycle probe intentionally used synthetic/untrusted PointerEvents.

After a target was removed from the DOM, direct dispatch still invoked its listener until explicit cleanup.

After cleanup, later direct dispatch no longer reached the binding.

This evidence is only about EventTarget/listener lifetime.

It is not trusted physical pointer-input evidence.

### Target replacement terminates old gesture state first

Replacing target A with target B while an old pointer stream is active must not permit the old gesture state to complete through the new binding.

Qualified trusted research observed:

```text
target A:
  pointerdown
  pointermove

cleanup A
gesture-policy reset
bind target B

complete old browser pointer sequence
Runtime remains A
semantic decisions = 0

fresh B gesture
next
Runtime A -> B
accepted
```

The exact browser routing of the old pointer stream is host behavior.

The required WIF theorem is that stale policy state does not survive target replacement.

### Cleanup is isolated and repeat-safe

Binding cleanup removes only the listeners installed by that binding.

It must not remove:

- unrelated host listeners;
- another independent WIF binding;
- browser-owned state outside the binding.

Repeated cleanup is safe.

Trusted research confirmed that unrelated pointer listeners continued receiving events after the WIF binding was removed.

### One delivered event produces at most one semantic request per binding

For one listener invocation:

```text
one PointerEvent
  -> policy handle once
  -> zero or one normalized intent
  -> zero or one Runtime request
```

The listener does not retry or replay because of:

- pointer capture state;
- cancelability;
- pointerType;
- touch-action;
- focus;
- Runtime snapshot fields.

Overlapping independent bindings remain governed by ADR-0015 and are not globally deduplicated.

### Listener mechanics do not predict semantic eligibility

The listener does not inspect:

- runtime.getSnapshot();
- selected phase;
- phase boundary;
- transition state;
- cooldown;
- lock state.

A produced next or previous intent is submitted to the Runtime.

The Runtime disposition remains semantic authority.

### Listener lifecycle does not mutate touch-action

ADR-0016 keeps direct-manipulation pan/zoom ownership under author/browser CSS.

Installing, cleaning up, rebinding, or replacing the Pointer Events listener does not silently rewrite touch-action.

Qualified evidence preserved computed CSS values across listener lifecycle changes.

### Explicit pointer capture is not required by the first listener theorem

ADR-0016 recorded qualified implicit pointer-capture behavior.

Issue #144 did not require a setPointerCapture() call to establish the listener/lifecycle theorem.

Therefore no explicit capture policy or public capture API is selected here.

### pointerType and multi-pointer handling remain gesture policy

The listener forwards raw PointerEvent host metadata to the replaceable gesture policy.

Listener mechanics do not impose one universal rule for:

- touch;
- mouse;
- pen;
- isPrimary;
- active-pointer count.

Pen behavior remains unqualified.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM/browser APIs outside the host-independent core.
- I-02 keeps semantic flow truth under one owner.
- I-05 prevents host effects from redefining semantic state.
- I-06 requires evidence before host-policy widening.
- ADR-0015 rejects hidden global arbitration between independent bindings.
- ADR-0016 selects Pointer Events, touch-action ownership, pointercancel semantics, and the substrate-level lifecycle boundary.

Issue #144 / PR #145 established the first listener/lifecycle evidence.

### Explicit scope

Trusted input inside the bound target was observed by the binding.

A comparable stream outside the bound target did not increase the binding's observation count.

### Active cleanup

During a trusted touch sequence under touch-action:none:

```text
pointerdown
pointermove
binding cleanup
gesture-policy reset
Runtime = A
semantic decisions = 0
```

The old browser sequence completed without producing a semantic request.

A fresh rebound sequence later produced:

```text
next
Runtime A -> B
accepted
```

### Target replacement

A trusted sequence began on target A.

A was cleaned up, policy state was reset, and target B was bound before the old sequence finished.

The old sequence produced no semantic request through B.

A fresh B sequence navigated normally.

### Unrelated listener preservation

After WIF cleanup, an unrelated pointer listener on the same target still observed later pointer events.

### touch-action preservation

Computed CSS remained unchanged across install, active input, cleanup, rebinding, and final teardown.

### DOM detachment

The synthetic detached-target witness established EventTarget listener lifetime independently from DOM attachment.

### Main-CI timing correction

PR #147 did not change pointer semantics.

It stabilized an existing browser research witness by waiting for prior browser-owned inertial scrolling to settle before taking the exact baseline for the next touch-action:none assertion.

The exact-equality theorem remained unchanged.

Post-merge main CI #262 passed.

## Consequences

The first production Pointer Events binding can remain policy-light.

It needs only to:

1. validate/own an explicit EventTarget;
2. install the four PointerEvent lifecycle listeners;
3. forward each event once to replaceable stateful gesture policy;
4. validate zero or one normalized intent;
5. submit one valid intent to the Runtime;
6. remove only its own listeners at cleanup;
7. terminate active gesture-policy state at cleanup.

The binding does not need to own one swipe algorithm.

Applications and later host adapters may evolve gesture policy independently of core semantics.

No new MoonBit/Wasm state or ABI is required.

## Alternatives considered

### Remove listeners without resetting gesture state

Rejected.

The stale target-replacement counterexample proves that cross-event policy state can survive listener teardown and later emit a request.

### Put pointer tracking directly in listener mechanics

Rejected as the first boundary.

That would freeze gesture interpretation into subscription code without evidence that WIF requires one recognizer.

### Treat pointercancel as the only reset path

Rejected.

Application-driven teardown can happen without pointercancel.

### Treat DOM detachment as cleanup

Rejected.

Listener ownership follows EventTarget/binding lifecycle, not connectivity.

### Rewrite touch-action during listener install

Rejected.

ADR-0016 assigns direct-manipulation ownership to author/browser CSS before the gesture begins.

### Require explicit setPointerCapture()

Not selected.

Current evidence does not require it.

### Predict Runtime eligibility before submitting a gesture result

Rejected.

That duplicates semantic ownership outside the Runtime.

## Deferred frontiers

This ADR does not select:

- final production listener/controller API;
- public reset/abort lifecycle name;
- swipe threshold;
- axis;
- diagonal or reversal behavior;
- velocity/duration;
- commit point;
- pointerType allowlist;
- multi-pointer policy;
- explicit capture API;
- native-control/ignore policy;
- default touch-action value;
- overscroll policy;
- Shadow DOM/composed-path ownership;
- overlap arbitration beyond ADR-0015;
- accessibility/focus behavior;
- React integration;
- package export;
- broad browser/device compatibility.

## Evidence limits

Current trusted browser evidence is bounded to the qualified Chrome/ChromeDriver environment and automation path already recorded by ADR-0016 and Issue #144.

Synthetic detached-target dispatch proves listener lifetime only.

It does not establish physical-device behavior, cross-browser equivalence, Safari/iOS compatibility, pen compatibility, or accessibility conformance.
