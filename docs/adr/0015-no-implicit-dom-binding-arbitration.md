# ADR-0015 — Overlapping DOM bindings have no implicit WIF arbitration

Status: Accepted

## Context

ADR-0012 and ADR-0014 deliberately leave overlapping DOM listener ownership unresolved.

Both wheel and keyboard research established that one bubbling host event can reach multiple independently installed WIF bindings and can therefore produce multiple semantic requests.

Issue #135 tested whether WIF could safely repair that behavior with an implicit deduplication/arbitration rule.

The research compared:

- cancellation state;
- event propagation controls;
- first-observer event claims;
- first-produced-intent claims;
- first-accepted global claims;
- first-accepted per-Runtime claims;
- event-object identity;
- path proximity;
- capture-phase coordination;
- process-global registries;
- explicit caller-owned arbitration scopes.

No universal implicit mechanism survived the counterexamples without introducing hidden semantic priority, coupling independent Runtimes, suppressing valid fallback, or widening host event ownership.

## Decision

WIF does not implicitly arbitrate independently installed overlapping DOM bindings.

Independent bindings remain independent.

A host event may therefore reach more than one WIF binding and may produce more than one semantic request when the caller installs overlapping ownership.

This is an explicit architectural non-guarantee, not an implementation omission to be hidden by an unqualified dedup mechanism.

Current WIF DOM bindings must not silently add any of the following as universal arbitration:

- `event.defaultPrevented`;
- first-observer Event claiming;
- first-produced-intent Event claiming;
- first-accepted global Event claiming;
- first-accepted per-Runtime Event claiming;
- persistent WeakSet/WeakMap Event identity;
- Event mutation or hidden Symbol markers;
- process-global binding registries;
- `stopPropagation()`;
- `stopImmediatePropagation()`;
- capture-phase winner selection;
- implicit nearest-target or `composedPath()` winner selection.

### Event identity is not a global semantic ownership domain

One trusted bubbling keyboard event was observed by two nested bindings backed by independent Runtime instances.

Observed:

```text
inner Runtime:
  A -> B
  accepted

outer Runtime:
  X -> Y
  accepted
```

Both semantic state machines were valid and independent.

Therefore one Event object does not imply that exactly one Runtime may respond.

A global event claim would create hidden coupling between otherwise independent WIF Runtime instances.

### Observation is not ownership

The first binding to observe an event does not automatically own it.

Issue #135's deterministic counterexample showed:

```text
inner resolver -> decline
outer resolver -> next
```

A first-observer claim suppressed the outer request before any normalized intent or semantic acceptance existed.

Raw observation alone is insufficient ownership evidence.

### Producing an intent is not ownership

A resolver producing `next` or `previous` does not establish accepted semantic ownership.

Counterexample:

```text
Runtime initial = A

inner -> previous
Runtime -> rejected

outer -> next
Runtime -> accepted
```

A first-produced-intent claim incorrectly suppresses the valid outer fallback.

The Runtime disposition remains the semantic authority for each request.

### A global accepted claim couples independent Runtimes

Claiming the Event globally after one accepted request also fails.

An accepted request in one Runtime does not invalidate a request to a separate Runtime.

No process-global WIF rule may infer one semantic owner merely because one binding accepted first.

### Per-Runtime accepted-only arbitration is not implicit authority

A research-only per-Runtime accepted claim has useful bounded behavior.

For nested bindings sharing one Runtime:

```text
inner:
  A -> B
  accepted

outer:
  suppressed

final = B
```

It also permits a rejected inner request to fall through to an accepted outer request.

However, it fails as an implicit rule because it creates hidden listener-order semantics.

Two bindings were installed on the same EventTarget, used the same Runtime, received the same trusted event, and differed only in registration order.

When `next` was registered first:

```text
B -> C
final = C
```

When `previous` was registered first:

```text
B -> A
final = A
```

The later binding was suppressed in each case.

WIF has no authority that makes DOM listener registration order a semantic navigation priority.

Therefore per-Runtime accepted-only arbitration may be researched later inside an explicitly owned arbitration domain, but it is not a hidden default.

### Event object identity is not a one-dispatch token

Issue #135 sequentially dispatched the same synthetic Event object twice after the first dispatch had completed.

A persistent research-only `(Event, Runtime)` claim accepted the first dispatch and suppressed the second.

This evidence is intentionally synthetic and does not make a physical-input claim.

It demonstrates that persistent Event object identity alone is not sufficient evidence of one dispatch occurrence.

WIF must not treat a WeakSet/WeakMap keyed by Event identity as an implicit dispatch identifier.

### defaultPrevented is not arbitration

`event.defaultPrevented` reports successful browser default-action cancellation.

It does not report WIF semantic ownership.

Existing wheel evidence shows that cancellation state fails as a universal marker when:

- the event is non-cancelable;
- prevention is disabled;
- listener context prevents cancellation.

Keyboard evidence also shows that a later binding may intentionally receive `defaultPrevented=true` and still produce an accepted request.

### Propagation mutation is not semantic arbitration

`stopPropagation()` and `stopImmediatePropagation()` alter host event routing.

Trusted evidence showed:

```text
stopPropagation:
  WIF candidate runs
  unrelated same-target listener still runs

stopImmediatePropagation:
  WIF candidate runs
  unrelated same-target listener is suppressed
```

The first mechanism does not deduplicate same-target listeners.

The second takes broader host-listener ownership than current WIF authority permits.

Neither becomes a semantic arbitration primitive.

### Capture does not create ownership

Capture changes listener invocation order.

Existing browser evidence already established that changing capture/bubble order does not establish unique semantic ownership.

A capture coordinator would need additional policy about which downstream binding, resolver, Runtime, or application region should win.

That policy requires explicit authority and cannot be inferred from capture itself.

### Path proximity does not create one binding owner

`Event.composedPath()` provides routing information.

It does not define WIF semantic priority.

Nearest-target selection fails at least two counterexamples:

- multiple bindings can share the same nearest EventTarget;
- preselecting the nearest target can erase useful ancestor fallback if the nearest resolver declines.

Shadow DOM retargeting/composed-path policy remains separately unresolved.

This ADR does not freeze it merely to construct an arbitration rule.

### Application ownership remains explicit

Under current authority, applications that install overlapping WIF DOM bindings own the resulting arbitration problem.

Applications may:

- avoid overlap;
- make resolvers mutually exclusive;
- coordinate ownership explicitly in application code;
- choose another application-specific routing policy.

WIF does not silently override those choices.

## Possible future direction

Issue #135 found one plausible direction if WIF later needs an arbitration facility:

> an explicit caller-owned arbitration domain in which the caller deliberately declares which bindings compete.

Research models showed that separate explicit arbitration scopes can remain independent.

That result is not enough to authorize an API.

A future frontier must separately justify:

- how a scope/group is created and owned;
- which bindings join it;
- how winner priority is defined;
- whether claiming follows observation, intent production, or semantic acceptance;
- whether Runtime identity participates;
- how one dispatch is represented;
- behavior for same-target bindings;
- nested fallback;
- listener cleanup;
- Shadow DOM/composed-path behavior;
- independent application roots.

No coordinator, group, registry, WeakMap strategy, or public type is frozen by this ADR.

## Evidence and constraints

Repository authority:

- ADR-0008 and ADR-0013 keep browser default-action state distinct from semantic request disposition;
- ADR-0012 and ADR-0014 require explicit listener targets and already record overlap as a non-guarantee;
- the MoonBit/Wasm Runtime remains host-independent and owns semantic request eligibility.

Issue #135 / PR #136 established:

- first-observer claim suppresses valid fallback after resolver decline;
- first-intent claim suppresses valid fallback after Runtime rejection;
- global accepted claim couples independent Runtimes;
- trusted independent Runtimes can both accept one bubbling host event;
- per-Runtime accepted-only claim suppresses the known same-Runtime duplicate;
- that same candidate permits rejected-inner / accepted-outer fallback;
- trusted same-target registration-order reversal changes the selected semantic endpoint under the candidate;
- persistent Event identity suppresses a later synthetic redispatch;
- nearest-path ownership is ambiguous or can suppress fallback;
- stopPropagation is incomplete for same-target duplication;
- stopImmediatePropagation suppresses unrelated host listeners;
- explicit separate arbitration scopes do not couple in the research model.

Qualified browser evidence is bounded to Chrome 153 / ChromeDriver 153.

## Consequences

The first wheel and keyboard listeners remain small and independently composable.

They do not need a hidden shared registry.

Core semantics remain unchanged.

Consumers must not assume one semantic request per DOM event when bindings overlap.

Tests and documentation should preserve overlap counterexamples so a future refactor cannot accidentally claim deduplication merely because one configuration happens to reject a second request.

A future explicit arbitration API, if ever justified, must be opt-in and separately researched.

## Alternatives considered

### Use defaultPrevented as the winner marker

Rejected.

Cancellation success is not semantic ownership and is not universally available.

### First observer wins

Rejected.

It suppresses useful later policy after the first resolver declines.

### First produced intent wins

Rejected.

It suppresses useful later policy after the first semantic request is rejected.

### First accepted request wins globally

Rejected.

It couples independent Runtime instances.

### First accepted request wins per Runtime

Not adopted implicitly.

It has bounded utility but makes listener invocation/registration order a hidden semantic priority and fails persistent Event-identity redispatch.

### Nearest bound target wins

Rejected as a universal implicit rule.

Same-target bindings are ambiguous, nearest decline can erase fallback, and Shadow DOM ownership is not authorized.

### stopPropagation

Rejected.

It does not suppress later same-target listeners.

### stopImmediatePropagation

Rejected.

It suppresses unrelated host listeners and broadens routing ownership.

### Capture coordinator

Rejected as implicit ownership.

Capture changes order but does not decide application ownership.

### Process-global WIF binding registry

Rejected.

It would create hidden coupling across independent Runtime/application regions.

### Explicit caller-owned arbitration scope

Deferred as the only plausible WIF-owned direction identified by this research.

It requires a separate theorem and API study before implementation.
