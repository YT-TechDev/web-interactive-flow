# ADR-0028 — Existing wheel ownership seam accepts tagged direct-target navigation

Status: Proposed

## Context

`web-interactive-flow@0.1.0` exposes one public DOM/browser ownership helper at the framework-neutral package root:

- `applyWheelNavigationIntent()`

ADR-0008 defines that helper's ownership theorem for already-normalized adjacent wheel intents:

```text
next | previous
  -> exactly one Runtime request
  -> Runtime disposition
  -> optional preventDefault() only after accepted
```

The semantic Runtime already supports a broader known-navigation domain through:

- `next()`;
- `previous()`;
- `goTo(knownTarget)`.

The Runtime remains the sole owner of request eligibility, and unknown direct targets remain validation failures rather than ordinary `rejected` dispositions.

Issue #209 researched the v0.2.0 DOM/Web host frontier using the internal DOM adapters and the external `YT-TechDev/WIF-UsagePage` consumer. The research initially considered public explicit-target DOM listener bindings, then an independent adversarial audit materially narrowed the recommended frontier.

The live UsagePage confirms one concrete consumer gap. It owns its raw wheel policy and 2D application topology. Horizontal navigation can use the existing public adjacent-intent helper, while vertical navigation resolves an application target and must currently duplicate the accepted-only effect ordering:

```text
runtime.goTo(target)
  -> observe disposition
  -> if accepted and event.cancelable
       -> preventDefault()
```

The consumer evidence does not justify moving its grid topology, wheel thresholds, burst policy, pointer policy, presentation, Runtime lifetime, or scheduler lifetime into WIF.

The research therefore converged on the smallest public widening that closes the demonstrated gap: make the existing wheel ownership seam target-capable without publishing listener bindings or creating a new `./dom` package boundary.

A direct target cannot safely share the existing bare-string namespace. Current phase identities are strings and may themselves be `"next"` or `"previous"`. A direct target therefore needs an unambiguous tagged representation.

Issue #210 tracks the production and release work following this ADR.

## Decision

The existing public root helper `applyWheelNavigationIntent()` is widened to accept one of three normalized navigation-intent forms:

```text
"next"

"previous"

{ type: "target", target: <configured phase identity> }
```

For the current Runtime boundary, `target` is the same primitive string phase identity accepted by `runtime.goTo(target)`.

This is an additive extension of the existing public helper. Existing `"next"` and `"previous"` callers retain their current meaning.

No new root export name is selected by this ADR.

No `./dom` subpath is selected by this ADR.

### Tagged direct-target representation

A direct target must use the tagged object form:

```js
{
  type: "target",
  target: phase,
}
```

A bare phase string is not a valid direct-target representation.

This preserves an unambiguous distinction between:

- the adjacent operation `"next"`;
- the adjacent operation `"previous"`;
- a configured phase whose identity may itself be `"next"` or `"previous"`.

The tagged object is a host/JavaScript representation only. It does not change the MoonBit/Wasm phase representation or ABI.

### Exactly one Runtime request

For one valid normalized intent, the helper issues exactly one corresponding Runtime request:

```text
"next"
  -> runtime.next()

"previous"
  -> runtime.previous()

{ type: "target", target }
  -> runtime.goTo(target)
```

It must not:

- inspect snapshots to predict eligibility;
- retry;
- queue;
- replay;
- synthesize intermediate targets;
- convert direct-target navigation into adjacent steps.

The exact Runtime disposition is returned unchanged.

### Validation remains distinct from disposition

Invalid normalized intent representation is host-boundary validation failure.

For a tagged target intent, the helper delegates target identity validation to the existing Runtime `goTo(target)` boundary.

An unknown/unconfigured target therefore remains a validation failure. It must not be caught and converted into `"rejected"`.

Known requests continue to use Runtime disposition:

- same target;
- adjacent boundary;
- active transition;
- cooldown;
- lock;

remain valid known requests whose acceptance or rejection is decided only by the Runtime.

If validation or Runtime invocation fails before a disposition is returned, the helper performs no accepted-only default-action effect.

This ADR does not freeze exact exception wording or a public error class.

### Accepted-only wheel default-action effect

ADR-0008's effect ordering remains unchanged for all three intent forms.

After exactly one Runtime request returns:

- `"rejected"` -> no WIF `preventDefault()` request;
- `"accepted"` with prevention disabled -> no WIF `preventDefault()` request;
- `"accepted"` with a non-cancelable event -> no WIF `preventDefault()` request;
- `"accepted"` with prevention enabled and a cancelable event -> call `preventDefault()` after the accepted disposition.

Event cancelability remains browser state, not semantic eligibility.

The helper does not claim that calling `preventDefault()` proves successful browser suppression in every listener context.

### Raw wheel policy remains caller-owned

This widening does not move raw wheel interpretation into WIF.

The caller remains responsible for policy such as:

- `deltaX` / `deltaY` interpretation;
- `deltaMode` conversion;
- axis/diagonal policy;
- thresholds;
- accumulation;
- burst grouping;
- inactivity timing;
- latching and reversal;
- Ctrl/Shift policy;
- ignored regions;
- existing-`defaultPrevented` policy;
- nested-scroll and boundary-release policy;
- application direction-to-target resolution.

A 2D or irregular application topology remains entirely outside WIF semantics.

The caller may resolve a host direction to:

- `"next"`;
- `"previous"`;
- a tagged known target;
- no WIF request.

### Package boundary

The package root remains the public entry point for this helper.

The root export set remains:

- `createFlowRuntime`;
- `compileFlowModule`;
- `createFrameScheduler`;
- `applyWheelNavigationIntent`.

This ADR widens the accepted normalized-intent domain of an existing root export; it does not add a new export name.

The following remain deferred:

- public wheel listener binding;
- public keyboard listener binding;
- public pointer listener binding;
- `./dom` package subpath;
- composed DOM input host;
- input + scheduler composition.

The package root remains free of React/R3F dependencies, and this decision does not alter Wasm acquisition ownership.

### Runtime and scheduler ownership

This helper does not:

- create a Runtime;
- dispose a Runtime;
- start or stop a scheduler;
- create a browser frame source;
- select a DOM listener target;
- install or remove listeners.

Runtime and scheduler lifetime remain caller-owned.

R3F remains a read-only presentation consumer under ADR-0009 and ADR-0010.

### Pointer and keyboard boundaries are not widened

This ADR does not generalize the existing internal keyboard or pointer ownership implementations.

In particular, it does not claim target-capable pointer disposition feedback.

Issue #209 identified direct-target pointer feedback as a separate qualification gap only if public pointer bindings become a later frontier.

That work is not required for the v0.2.0 frontier selected here.

## Evidence and constraints

Repository authority and evidence include:

- I-01 — host-independent core;
- I-02 — single semantic owner;
- I-04 — validation failure remains distinct from known-request disposition;
- I-05 — host effects do not redefine semantics;
- I-06 — evidence precedes semantic widening;
- ADR-0008 — wheel default-action suppression follows semantic acceptance;
- ADR-0011 — the package export map is a closed public boundary;
- ADR-0013 — the same accepted-only ownership principle is independently established for keyboard;
- ADR-0015 — overlapping DOM bindings have no implicit WIF arbitration;
- ADR-0019 — synchronous pointer disposition feedback is request-origin scoped, but remains outside this selected frontier;
- ADR-0027 — the first public package identity and release boundary;
- the existing semantic Runtime's `next()`, `previous()`, and `goTo()` behavior;
- Issue #209 Research 0–2, independent adversarial audit, and final convergence;
- live `WIF-UsagePage` evidence showing duplicated accepted-only effect logic specifically for direct-target wheel navigation.

The independent audit also established that a dispatcher-only abstraction would add little value because `runtime.goTo()` already performs direct dispatch. The reusable value lies in preserving the disposition-first host-effect ownership theorem for direct targets.

No MoonBit/Wasm semantic deficiency was identified.

## Consequences

A consumer with application-owned topology can resolve raw wheel input to a known target and use the same public ownership seam for both adjacent and direct navigation.

The consumer no longer needs to duplicate:

```text
goTo(target)
  -> inspect disposition
  -> accepted-only preventDefault()
```

The Runtime remains authoritative for:

- same-target rejection;
- boundary rejection;
- active-transition rejection;
- cooldown rejection;
- lock rejection;
- direct-target acceptance.

Unknown direct targets remain validation failures.

The public package does not commit to listener lifecycle APIs, EventTarget ownership, pointer feedback, keyboard mapping, scheduler composition, or a `./dom` subpath.

The change remains compatible with copy-only package staging because the existing root facade and production bridge module remain the public distribution path.

## Qualification requirements

Before release, production evidence must cover at least:

- existing `"next"` accepted and rejected behavior;
- existing `"previous"` accepted and rejected behavior;
- tagged direct known-target acceptance;
- tagged non-adjacent target acceptance without intermediate selections;
- tagged same-target rejection;
- tagged target rejection while transition-active;
- tagged target rejection during cooldown;
- tagged target rejection while locked;
- unknown tagged target validation failure;
- malformed tagged intent validation failure;
- accepted + cancelable event -> one post-disposition `preventDefault()`;
- accepted + non-cancelable event -> no `preventDefault()`;
- rejected request -> no `preventDefault()`;
- failure before disposition -> no `preventDefault()`;
- exactly one Runtime operation per valid helper invocation.

Package and real-browser qualification must exercise the released public seam rather than a repository-private substitute.

The external UsagePage should later dogfood the v0.2.0 seam while preserving its existing grid, raw gesture policy, presentation, Runtime ownership, and scheduler ownership.

## Alternatives considered

### Publish individual DOM listeners in v0.2.0

Not selected.

Issue #209's independent audit showed that listener publication freezes substantially more lifecycle and error-ordering behavior than is required to solve the observed consumer gap.

Wheel and keyboard listeners are thin wrappers over ownership helpers, while pointer listeners contain materially different lifecycle/feedback behavior.

A single public listener family is therefore not yet justified as one stable abstraction.

### Add a `./dom` package subpath

Deferred.

Unlike `./r3f`, the current DOM ownership seam has no optional framework peer requiring dependency isolation. The root already exposes `applyWheelNavigationIntent()`.

Adding the target-capable seam under `./dom` while retaining the existing root helper would create two public ownership paths or require premature deprecation.

### Add a generic dispatcher only

Not selected.

The Runtime already provides `goTo(target)`, `next()`, and `previous()`.

A dispatcher without the accepted-only host effect would mostly duplicate existing Runtime calls without removing the demonstrated consumer friction.

### Add a new generic host-effect callback API

Not selected for this frontier.

The evidence specifically demonstrates wheel default-action ownership. Generalizing immediately to arbitrary host effects would create a broader public abstraction without a second consumer or event-family qualification.

### Encode direct targets as bare strings

Rejected.

A valid phase identity can be `"next"` or `"previous"`. Bare strings therefore cannot distinguish direct-target identity from adjacent operation intent.

### Move direction/topology into core

Rejected.

Rows, columns, routes, wheel direction, and spatial adjacency are application/host policy and are not part of the ordered semantic phase-domain contract.

### Make the DOM host own the scheduler

Rejected.

The public scheduler already has explicit caller ownership, R3F is read-only, and there is no single-driver guard preventing duplicate semantic clocks.

## Deferred decisions

This ADR does not establish:

- public DOM listeners;
- `./dom`;
- direct-target keyboard ownership API;
- direct-target pointer disposition feedback;
- pointer recognizer publication;
- composed input hosts;
- default wheel thresholds or burst policy;
- automatic nested-scroll ownership;
- focus/accessibility policy;
- presentation easing or drag-preview utilities;
- TypeScript declarations;
- serialization/history/queue/interruption semantics;
- broad browser/bundler compatibility;
- stable semver promises beyond the directly qualified v0.2.0 boundary.
