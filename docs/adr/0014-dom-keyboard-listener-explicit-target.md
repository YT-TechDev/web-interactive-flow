# ADR-0014 — First DOM keyboard listener uses explicit target and replaceable raw policy

Status: Accepted

## Context

ADR-0013 established the first DOM keyboard default-action ownership theorem for an already-normalized `next | previous` intent.

That theorem intentionally stopped before listener ownership. It did not select:

- where a keyboard listener is attached;
- how listener lifetime is owned;
- how raw `KeyboardEvent` values become normalized intents;
- whether repeat, composition, native controls, modifiers, or already-canceled events are declined;
- propagation behavior;
- overlapping-listener arbitration.

Issue #131 researched that next boundary independently rather than mechanically copying the existing wheel listener or the pinned React/R3F keyboard hook.

The research used:

- current DOM event-listener semantics;
- deterministic listener counterexamples;
- trusted Chrome/WebDriver keyboard input;
- actual WIF MoonBit/Wasm Runtime composition;
- a passive-listener mutant;
- nested explicit bindings on one bubbling event path;
- the pinned TypeScript/R3F implementation as behavioral evidence only.

The evidence supports a first keyboard listener that is deliberately policy-light.

## Decision

The first DOM keyboard listener requires an explicitly supplied and owned `EventTarget`.

It installs one ordinary bubbling `keydown` listener on that target.

For each delivered event, it passes the actual host event to a caller-supplied raw resolver.

The resolver may return:

```text
next
previous
decline
```

where decline is represented by the selected implementation's no-intent result.

A valid produced `next` or `previous` intent is delegated exactly once into the ADR-0013 normalized keyboard ownership boundary.

Conceptually:

```text
explicit EventTarget
      |
      | keydown
      v
caller-supplied resolver(KeyboardEvent)
      |
      +--> decline
      |      -> no semantic request
      |
      +--> next | previous
             |
             v
        ADR-0013 ownership
             |
             v
           Runtime
```

This ADR selects listener ownership and responsibility boundaries.

It does not freeze the final public function name, argument object shape, package export, framework hook, or raw keyboard policy.

### Listener target is explicit

The first listener does not silently choose or discover:

- `window`;
- `document`;
- `document.documentElement`;
- `document.body`;
- an inferred flow root;
- the currently focused element;
- a scroll container.

The caller owns the selected `EventTarget`.

Keyboard events from descendants may reach that target through normal DOM bubbling.

Events whose propagation path does not include that target are outside that binding's observation scope.

This preserves application-defined ownership boundaries and avoids treating the pinned reference's default `window` target as WIF authority.

### Listener lifetime is explicit

The binding owns the listener it installs.

Explicit cleanup removes that listener.

Cleanup is repeat-safe and does not remove:

- unrelated listeners on the same target;
- another independent WIF binding;
- application listeners.

DOM tree attachment does not define listener lifetime.

Detaching an element from the document does not itself count as cleanup.

The exact public cleanup representation remains an implementation/API detail so long as the observable ownership holds.

### Raw keyboard policy remains caller-owned

The listener passes the delivered host keyboard event to the resolver rather than embedding a WIF-wide raw-key policy.

The listener itself does not standardize:

- key lists;
- `KeyboardEvent.key` versus `KeyboardEvent.code`;
- repeat filtering;
- `isComposing` / IME filtering;
- modifier filtering;
- editable/actionable target classification;
- ignore selectors;
- native-control ownership;
- shortcut conventions;
- already-`defaultPrevented` arbitration.

Those observations may be used by caller policy before a normalized intent is produced.

A resolver decline issues no semantic request and therefore no ADR-0013 WIF default suppression.

Resolver failure or invalid normalized output must not be reclassified as a known semantic rejection.

### Semantic eligibility remains Runtime-owned

The listener does not inspect semantic state to predict request acceptance.

It does not use:

- `runtime.getSnapshot()`;
- selected phase;
- phase boundary;
- transition state;
- cooldown state;
- lock state.

One valid resolver result produces at most one corresponding normalized request through ADR-0013.

The Runtime's returned disposition remains the semantic authority.

### Keyboard does not inherit wheel's default-passive exception

The DOM platform's default-passive special case covers selected touch and wheel event types/targets, not `keydown`.

Qualified Chrome research confirmed that an ordinary keydown listener with listener options omitted can successfully perform ADR-0013 accepted-only prevention.

Therefore the first keyboard listener does not require wheel's explicit non-passive registration merely to avoid a platform default-passive behavior.

However, a listener registered with `passive: true` cannot successfully perform `preventDefault()`.

If a keyboard binding is configured to request ADR-0013 native-default suppression after acceptance, its listener context must not be passive.

The semantic request remains accepted even when a passive listener prevents default cancellation from succeeding.

### Existing defaultPrevented state is not universal semantic arbitration

The delivered event's `defaultPrevented` value is host event state.

The listener does not universally translate:

```text
defaultPrevented = true
```

into:

```text
decline
```

A caller-supplied resolver may choose that policy.

A different resolver may intentionally map the event.

Neither choice changes semantic ownership: a produced normalized intent is still decided by the Runtime.

### Propagation is not used as semantic deduplication

The first listener does not call:

- `stopPropagation()`;
- `stopImmediatePropagation()`.

Capture phase is not selected as a semantic deduplication mechanism.

DOM routing policy and semantic request eligibility remain separate concerns.

### Overlapping bindings do not have a single-delivery guarantee

The first listener explicitly does **not** guarantee one semantic request per DOM keyboard event when multiple WIF bindings overlap on one bubbling path.

Issue #131 recorded a trusted Chrome counterexample using one zero-duration/zero-cooldown Runtime.

One trusted `keydown` targeted at an inner bound element reached both an inner and outer WIF binding.

Observed sequence:

```text
inner binding:
  target = nested-inner
  currentTarget = nested-inner
  Runtime A -> B
  accepted
  defaultPrevented false -> true

outer binding:
  target = nested-inner
  currentTarget = nested-outer
  defaultPrevented before resolver = true
  Runtime B -> C
  accepted
```

The final selected phase was `C`.

Therefore:

> One bubbling keyboard event can produce multiple accepted semantic requests when independent bindings overlap.

This is not repaired by the first listener contract.

Overlapping-binding arbitration remains a separate host-policy frontier.

The project must not claim deduplication merely because an inner listener called `preventDefault()`.

## Evidence and constraints

Repository authority:

- I-01 keeps DOM/browser APIs outside the host-independent core.
- I-02 keeps semantic flow truth under one owner.
- I-05 prevents host effects from redefining semantic state.
- I-06 requires evidence before widening host policy.
- ADR-0002 places keyboard event integration in the DOM/Web adapter.
- ADR-0013 owns normalized keyboard request/default-action ordering.
- ADR-0012 provides analogous wheel-listener evidence but is not itself keyboard authority.

Issue #131 and PR #132 established in qualified Chrome 153 / ChromeDriver 153:

### Explicit target scope

With focus on an element inside the explicit root:

```text
event.target = explicit-neutral
event.currentTarget = explicit-root
resolver called once
Runtime A -> B
```

With focus on an unrelated outside element:

```text
explicit-root observations = 0
resolver-call delta = 0
Runtime unchanged
```

### Native-control decline remains resolver policy

Trusted button Space under the fixture's resolver:

```text
resolver -> decline
defaultPrevented = false
trusted button click = 1
Runtime unchanged
```

Trusted printable input:

```text
resolver -> decline
defaultPrevented = false
input value = "a"
trusted input event = 1
Runtime unchanged
```

These witnesses establish policy replaceability, not a universal native-control classifier.

### Ordinary versus passive listener

Ordinary keydown listener with options omitted:

```text
PageDown
Runtime A -> B
accepted
preventDefault attempted
defaultPrevented = true
scrollTop = 0
```

Explicit `passive: true` research mutant:

```text
PageDown
Runtime A -> B
accepted
preventDefault attempted
defaultPrevented = false
scrollTop = 113
```

This demonstrates that listener passivity affects browser-default cancellation but not semantic acceptance.

### Explicit cleanup

After explicit-root cleanup, later trusted input produced:

```text
binding observations = 0
resolver call count unchanged
Runtime unchanged
```

### DOM detachment

A real DOM target was detached and then given a synthetic event directly.

The detached target remained able to invoke its owned listener until explicit cleanup.

The event was intentionally untrusted and is used only as lifecycle evidence.

After cleanup, another synthetic event did not reach the removed binding.

No physical-keyboard claim is derived from this probe.

### Overlapping bindings

The nested trusted witness above proved two accepted semantic requests from one bubbling event under a valid Runtime configuration.

That behavior is recorded as an explicit non-guarantee rather than hidden through propagation cancellation.

## Reference classification

Pinned reference:

`YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`

Useful/platform-aligned evidence:

- uses bubbling `keydown`;
- supports caller-supplied element targets;
- removes listener through explicit lifecycle cleanup;
- direct target listener survives DOM detachment until cleanup.

Product/framework policy not imported:

- default target = `window`;
- React ref/effect lifecycle;
- default key arrays;
- repeat suppression;
- editable/actionable classification;
- `ignoreWhenTyping`;
- hook-local cooldown.

Behavior contradicted by current WIF semantic ownership:

- host-side lock/transition/phase-boundary prediction before semantic request.

## Consequences

A production listener can remain small.

It needs only to:

1. validate/own an explicit target and resolver;
2. install one keydown listener;
3. pass each delivered event to the resolver once;
4. decline when the resolver yields no intent;
5. delegate one valid intent to ADR-0013;
6. remove its own listener on cleanup.

This keeps raw input ergonomics replaceable without duplicating semantic flow rules.

Applications may choose conservative resolvers that decline:

- editable controls;
- actionable controls;
- repeated events;
- composing events;
- already-canceled events;
- modified shortcuts.

Those choices remain application/host policy, not built-in listener semantics.

Applications that create overlapping bindings must own the arbitration problem until a later WIF boundary is separately researched.

## Alternatives considered

### Default to window

Rejected for the first listener.

Trusted evidence shows an explicit root excludes unrelated focused controls while a global observer does not.

### Copy the wheel listener's explicit passive:false option

Not required.

The DOM default-passive special case does not include keydown, and ordinary keydown registration successfully canceled the qualified trusted default.

An implementation may remain explicit about non-passivity if later API evidence requires it, but wheel's requirement is not a keyboard theorem.

### Register passive:true

Rejected for a listener expected to request ADR-0013 prevention.

Qualified evidence showed semantic acceptance still occurred while preventDefault had no effect and native PageDown scrolling continued.

### Hard-code native-control, repeat, or composition guards

Rejected as first-listener mechanics.

Those are raw host policy before the normalized-intent seam.

### Automatically decline defaultPrevented events

Not selected.

The trusted nested witness demonstrates that an outer resolver can observe `defaultPrevented=true` and still intentionally produce a valid request.

Whether to decline remains resolver policy.

### Stop propagation to prevent duplicate requests

Rejected.

That would impose routing ownership to hide an overlapping-binding counterexample.

The first listener records the non-guarantee instead.

### Predict Runtime acceptance before delegating

Rejected.

This would duplicate semantic state and violate ADR-0013.

### Treat DOM detachment as cleanup

Rejected.

Listener lifetime belongs to the EventTarget/binding, not DOM connectivity.

## Deferred frontiers

This ADR does not select:

- a final production API/name/signature;
- package exports;
- default key mapping;
- native-control classification;
- repeat policy;
- real IME/composition policy;
- modifier policy;
- `defaultPrevented` policy;
- overlapping-binding arbitration;
- Shadow DOM/composed-path ownership;
- focus management;
- accessibility behavior;
- React keyboard integration;
- AbortSignal-based lifecycle API;
- broad cross-browser compatibility.
