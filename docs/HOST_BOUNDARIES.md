# Host Boundaries

This document defines responsibility boundaries between the host-independent runtime and Web hosts.

## Core

The core may know about normalized flow concepts such as:

- a stable ordered phase domain;
- requests to move or target a known semantic phase;
- the selected phase / accepted target;
- explicit valid time deltas;
- transition state;
- raw normalized progress and direction;
- cooldown;
- lock state;
- request disposition;
- semantic validity constraints;
- observable runtime state.

The core must not directly know about:

- `Event`, `WheelEvent`, `PointerEvent`, or DOM nodes;
- `preventDefault()` or event propagation;
- native scrolling;
- CSS;
- React hooks or components;
- R3F hooks, raycasting, scene graphs, cameras, materials, or meshes;
- requestAnimationFrame or a particular rendering loop.

Core flow truth must not depend on presentation easing or animation curves.

## Bridge / normalization boundary

A bridge may translate host-facing identifiers, numbers, and API values into normalized core values.

A host value that cannot be normalized to a valid semantic command is a validation failure. It must not be reclassified as an ordinary known-request rejection.

Concrete exception/result/status-code representation remains open.

### Browser monotonic time normalization

For the first browser/Web real-time host, monotonic timestamp samples are normalized before `tick(dt)` according to [ADR-0005](adr/0005-browser-monotonic-time-normalization.md).

The browser-host normalizer owns only host-time representation state such as:

- epoch baseline timestamp;
- previous accepted timestamp;
- cumulative normalized elapsed time;
- exact decomposition of an oversized normalized budget into valid tick chunks.

That state is not flow-semantic state and must not become an independent owner of phase, transition, cooldown, lock, direction, raw progress, or request eligibility.

The selected first browser-host unit is one microsecond, produced by baseline-relative cumulative floor quantization. This is not a universal core time unit or a permanent cross-host invariant.

The generic normalizer remains independent of DOM scheduling and visibility APIs. A later Web scheduler owns any policy that chooses between consuming a resume gap and explicitly rebasing to pause elapsed host time.

### Browser frame scheduling

The first browser frame scheduler is host state governed by [ADR-0006](adr/0006-first-browser-frame-scheduler.md).

While the scheduler remains running, delivered frame timestamps remain in one ADR-0005 normalization epoch. Browser callback suspension alone does not trigger a rebase; the scheduler consumes the elapsed gap represented by the next delivered timestamp.

Explicit scheduler stop ends the current normalization epoch. A later restart establishes a new epoch on its first delivered frame and advances zero lifecycle time on that frame.

For one delivered frame, all exact normalized tick chunks are applied before one semantic snapshot is read and projected. Carrier chunking must not create extra host-frame observations.

The scheduler does not own semantic Runtime lifetime or flow semantics. It receives an existing semantic runtime, drives valid time through it, and observes semantic snapshots.

Visibility-aware pause/rebase remains later DOM/Web host policy. The first scheduler does not inspect document visibility or own input-event policy.

### Browser/Web Wasm Module acquisition

The first Web Wasm acquisition boundary is governed by [ADR-0007](adr/0007-browser-wasm-module-acquisition.md).

It accepts a caller-supplied `Response` or `Promise<Response>`, uses strict `WebAssembly.compileStreaming()`, reuses the existing WIF module compatibility validator, and returns a reusable `WebAssembly.Module`.

This acquisition state is bridge/host validation, not flow-semantic state.

The acquisition boundary does not create a `WebAssembly.Instance` or semantic Runtime. Fresh Instance creation remains owned by the semantic runtime wrapper.

The first compiler does not own `fetch()`, URLs, artifact/package paths, bundler behavior, retry policy, or Module caching. Those remain caller/application/package concerns.

Streaming response, MIME, status, CORS, CSP/environment, body-consumption, and compilation failures remain host acquisition failures. They must not be reclassified as known flow-request rejection.

The compiler depends on WebAssembly streaming/`Response` semantics only and must not introduce DOM, frame scheduling, visibility, or input-event ownership.

## DOM/Web adapter

The DOM adapter is expected to own host-specific policy and mechanics such as:

- wheel, touch, keyboard, pointer, and programmatic input collection;
- normalization from host events to flow commands;
- flow-root scoping;
- native-scroll coexistence;
- event ownership and `preventDefault()` decisions;
- nested interactive regions;
- focus and accessibility integration;
- browser frame/visibility scheduling policy;
- projecting runtime state into DOM-visible effects;
- DOM/CSS presentation easing or interpolation where desired.

Native-scroll coexistence is a research frontier. Do not encode an untested global event-capture policy as core semantics.

### First DOM wheel default-action ownership

The first wheel ownership boundary is governed by [ADR-0008](adr/0008-dom-wheel-default-action-ownership.md).

It receives an already-normalized `next` or `previous` intent and delegates exactly one corresponding request to the existing semantic Runtime. The Runtime's returned request disposition remains the sole authority for flow eligibility at this boundary.

Native-default suppression follows, rather than predicts, semantic disposition:

- a `rejected` semantic request does not call `preventDefault()`;
- an `accepted` request remains accepted independently of browser-event cancelability;
- when prevention is enabled, an accepted request may call `preventDefault()` only when the supplied event is cancelable;
- if the semantic request fails before returning a disposition, this boundary does not request native-default suppression.

Semantic request disposition, event cancelability, and successful browser default cancellation are distinct observations.

This first ownership boundary is stateless and does not define wheel delta interpretation, `deltaMode` conversion, thresholding, burst accumulation, gesture timing, local cooldown, listener/root selection, capture/bubble phase, already-`defaultPrevented` arbitration, nested-scroll inference, scroll-boundary release, Shadow DOM ownership, or propagation policy.

A future listener that intends to suppress a default action must execute in a listener context where the platform permits cancellation, including non-passive registration where applicable. The exact listener API remains open.

Rejected requests preserving native default behavior at this layer is not a claim of complete native-scroll coexistence. Determining which wheel events a future DOM adapter owns remains a separate host-policy frontier.

### First DOM wheel-listener boundary

The first DOM wheel-listener boundary is governed by [ADR-0012](adr/0012-dom-wheel-listener-explicit-target.md).

It layers listener ownership above the stateless ADR-0008 normalized-intent boundary without standardizing a raw wheel gesture algorithm.

The first listener boundary requires an explicitly supplied/owned DOM `EventTarget`. It does not silently select a global target or infer a flow root or scroll container.

Listener lifetime is explicit host ownership:

- the binding owns the listener it installs;
- cleanup removes the binding's listener;
- DOM detachment does not count as cleanup;
- the exact cleanup mechanism remains an implementation choice subject to evidence.

When the binding may request accepted-only native-default suppression, the wheel listener executes in an explicitly non-passive registration context. The project does not rely on target-specific passive defaults.

Raw `WheelEvent` interpretation remains replaceable host policy before ADR-0008. A resolver/policy may produce `next`, `previous`, or no intent. Decline or failure occurs before semantic request/default suppression. A valid produced intent is delegated exactly once to the ADR-0008 ownership layer.

The listener does not inspect or mirror semantic Runtime state to predict request eligibility. Boundary, lock, transition, cooldown, and same-target rules remain Runtime-owned.

Existing `defaultPrevented` state may be considered by caller-supplied host policy, but it is not semantic truth and is not a universal WIF deduplication signal.

The first listener does not call `stopPropagation()` or `stopImmediatePropagation()`, and capture phase is not used to establish semantic single-delivery ownership.

This first boundary explicitly does **not** guarantee deduplication when multiple WIF wheel bindings overlap on one bubbling event path. That ownership problem requires separate evidence.

The first listener boundary still does not select:

- raw `deltaX` / `deltaY` axis policy;
- `deltaMode` conversion constants;
- wheel thresholds or accumulation;
- burst/inactivity timing;
- input-local cooldown;
- one-navigation-per-burst behavior;
- ignored/actionable/editable target selectors;
- nested-scroll detection or scroll-boundary release;
- scroll chaining or `overscroll-behavior`;
- Shadow DOM ownership;
- touch/pointer/keyboard mapping;
- React DOM hook/component ergonomics;
- accessibility/focus policy;
- final public adapter API or package export.

Those remain later host-policy frontiers.


### First DOM keyboard default-action ownership

The first normalized keyboard ownership boundary is governed by [ADR-0013](adr/0013-dom-keyboard-default-action-ownership.md).

It receives an already-normalized `next` or `previous` intent associated with a keyboard host event and delegates exactly one corresponding request to the semantic Runtime.

The Runtime remains the sole owner of known-request eligibility:

- a `rejected` request does not trigger WIF native-default suppression;
- an `accepted` request remains semantically accepted independently of event cancelability;
- when prevention is enabled, an accepted request may call `preventDefault()` only when the supplied event is cancelable;
- a failure before semantic disposition does not request default suppression.

Raw keyboard ownership and mapping occur before this boundary.

A host policy may decline an event before any semantic request is issued. Decline produces no WIF default suppression, allowing browser-native editing, control activation, focus navigation, scrolling, composition, or other host behavior to remain available.

This ownership theorem does not select:

- a default key map;
- `KeyboardEvent.key` versus `KeyboardEvent.code`;
- repeat policy;
- IME/composition policy;
- modifier policy;
- editable/actionable target classification;
- selector or ignore APIs;
- listener target, installation, cleanup, capture, or propagation;
- global/window defaults;
- already-`defaultPrevented` arbitration;
- focus movement or restoration;
- roving tabindex or focus traps;
- React keyboard hooks/components;
- accessibility conformance.

Focus remains host/application/browser state. Semantic phase selection does not itself move or restore DOM focus.

The qualified Chrome/WebDriver research for ADR-0013 establishes bounded native-default and Runtime-disposition evidence only. It does not establish physical keyboard-repeat behavior, real IME coverage, keyboard-layout equivalence, broad browser compatibility, or accessibility certification.


### First DOM keyboard-listener boundary

The first DOM keyboard-listener boundary is governed by [ADR-0014](adr/0014-dom-keyboard-listener-explicit-target.md).

It layers listener ownership above the ADR-0013 normalized keyboard default-action boundary without standardizing a raw keyboard mapping algorithm.

The first keyboard listener requires an explicitly supplied/owned DOM `EventTarget`. It does not silently select `window`, `document`, an inferred flow root, the active element, or another global target.

Listener lifetime is explicit host ownership:

- the binding owns the keydown listener it installs;
- cleanup removes that binding's listener;
- cleanup is repeat-safe and must not remove unrelated listeners;
- DOM detachment does not count as cleanup.

For each delivered `keydown`, the listener passes the host event to caller-supplied raw policy. That resolver may decline or produce one normalized `next` / `previous` intent. A valid produced intent is delegated exactly once to ADR-0013.

The listener itself does not select or encode:

- default keys;
- `key` versus `code`;
- repeat handling;
- IME/composition handling;
- modifier handling;
- editable/actionable target classification;
- ignore selectors;
- native-control ownership;
- already-`defaultPrevented` arbitration.

The listener does not inspect semantic Runtime snapshots to predict request eligibility. Boundary, transition, cooldown, lock, and selected-phase rules remain Runtime-owned.

The first keyboard listener uses ordinary bubbling keydown routing. Keyboard does not inherit the wheel event system's top-level default-passive special case. A binding that may request ADR-0013 native-default suppression must not run its keydown handler as a passive listener, because `preventDefault()` cannot take effect in that context.

The listener does not call `stopPropagation()` or `stopImmediatePropagation()`, and capture phase is not used to manufacture semantic single-delivery ownership.

The first listener explicitly does **not** guarantee one semantic request per DOM event when multiple WIF keyboard bindings overlap on one bubbling path. Qualified trusted-browser research demonstrated one keydown producing two accepted requests through nested inner/outer bindings under a valid zero-duration/zero-cooldown Runtime.

Overlapping-binding arbitration, Shadow DOM/composed-path ownership, focus/accessibility policy, default raw keyboard policy, React ergonomics, final public API shape, and package export remain later host-policy frontiers.


### Overlapping DOM binding arbitration

Overlapping DOM binding behavior is governed by [ADR-0015](adr/0015-no-implicit-dom-binding-arbitration.md).

WIF does not implicitly arbitrate independently installed wheel, keyboard, or future DOM bindings merely because they observe the same host `Event`.

Independent bindings remain independent unless a later explicit arbitration contract is separately authorized.

Current DOM integration must not silently use any of the following as universal semantic ownership:

- `defaultPrevented`;
- first-observer Event claiming;
- first-produced-intent Event claiming;
- first-accepted global Event claiming;
- hidden first-accepted per-Runtime Event claiming;
- persistent Event-object WeakSet/WeakMap identity;
- Event mutation markers;
- process-global binding registries;
- `stopPropagation()` or `stopImmediatePropagation()`;
- capture-phase winner selection;
- implicit nearest-target or `composedPath()` winner selection.

The same host Event may validly reach different Runtime instances. An accepted request in one Runtime does not imply rejection or suppression in another Runtime.

A research-only per-Runtime accepted claim can suppress duplicate same-Runtime navigation, but it is not an implicit WIF rule. Trusted evidence showed that two opposite-intent bindings on the same EventTarget reach different final semantic phases when only listener registration order is reversed. DOM listener order is therefore not authorized as hidden semantic priority.

Event object identity is also not treated as a one-dispatch identifier. A synthetic Event object may be dispatched again after one dispatch completes, so persistent identity-based claims require additional explicit ownership evidence.

Applications that install overlapping bindings currently own arbitration. They may avoid overlap, make policies mutually exclusive, or coordinate ownership explicitly in application code.

If WIF later provides arbitration, the only surviving architectural direction from current research is an explicitly caller-owned arbitration domain/scope. Its API, participation rules, priority, dispatch identity, Runtime policy, path policy, and Shadow DOM behavior remain unselected.


### First DOM direct-manipulation substrate

The first DOM direct-manipulation event substrate is governed by [ADR-0016](adr/0016-pointer-events-direct-manipulation-substrate.md).

WIF selects Pointer Events for the first direct-manipulation host boundary.

This chooses event representation and lifecycle, not a WIF-wide swipe algorithm.

The host boundary remains:

```text
author CSS / browser
  touch-action
      |
      v
PointerEvent lifecycle
  pointerdown / pointermove
  pointerup | pointercancel
      |
      v
caller-owned gesture policy
      |
      +--> decline / canceled / invalid
      |      -> no semantic request
      |
      +--> next | previous
             |
             v
           Runtime
      owns semantic eligibility
```

Application/author CSS owns browser direct-manipulation panning/zooming policy through `touch-action`. WIF does not move `touch-action` into semantic Runtime state and does not use PointerEvent `preventDefault()` as the first pan-ownership mechanism.

A browser-canceled pointer sequence is a host lifecycle boundary. Accumulated gesture state for that sequence must not survive to produce stale semantic navigation.

Pointer identity and routing remain host data:

- `pointerId` is opaque browser-assigned identity;
- `isPrimary` does not prove only one pointer is active;
- pointer capture is host routing state;
- qualified Chrome exposed implicit capture on the actual hit target rather than on an observing ancestor listener;
- current evidence does not require explicit WIF `setPointerCapture()`.

Pointer Events unify touch, mouse, pen, and other pointer classes as an event substrate, but WIF does not thereby assign those pointer types one universal gesture policy.

The first boundary does not install simultaneous PointerEvent and TouchEvent navigation bindings by default. Qualified Chrome emitted both trusted streams for one injected touch sequence, and ADR-0015 prohibits silently hiding such overlap through global implicit deduplication.

The following remain host/application policy rather than ADR-0016 authority:

- gesture threshold;
- axis and diagonal policy;
- velocity/duration;
- reversal and commit-point policy;
- pointerType allowlist;
- multi-pointer policy;
- `isPrimary` filtering;
- explicit pointer capture;
- native-control/ignore policy;
- listener target/lifecycle API;
- default `touch-action` value;
- overscroll policy;
- Shadow DOM/composed-path ownership;
- focus/accessibility behavior;
- React direct-manipulation API;
- package export.

Once such caller-owned policy produces a normalized `next` or `previous`, the semantic Runtime remains the sole eligibility owner.

## React adapter

A React adapter may own lifecycle and subscription ergonomics, but not the flow state machine.

React state should not become an independent semantic source of truth.

## R3F adapter

An R3F adapter may own:

- `useFrame` or equivalent frame-loop binding;
- R3F event integration;
- scene, camera, object, or material mutations;
- presentation easing and visual interpolation from raw core progress;
- conversion between runtime state and 3D presentation.

R3F raycasting and event propagation remain R3F/host responsibilities.

### First R3F frame-consumer ownership

The first R3F frame-consumer boundary is governed by [ADR-0009](adr/0009-r3f-frame-consumer-read-only.md).

For one delivered R3F frame callback, the first contract reads one current semantic Runtime snapshot and exposes it to R3F presentation code. It does not call `runtime.tick()` and does not become a second transition/cooldown lifecycle clock.

R3F frame `delta` may be passed through as host/presentation metadata. In this first contract it is not WIF semantic lifecycle time.

Multiple R3F consumers are read-only views of one Runtime. Adding consumers must not accelerate lifecycle or create duplicated phase, transition, cooldown, lock, direction, or request-eligibility state.

R3F/Three.js scene, camera, object, and material mutations remain host effects. Presentation easing or scene-derived values must not redefine semantic transition completion, raw progress, selected phase, direction, cooldown, lock, or request disposition.

The selected semantic identity remains the accepted destination during an active transition; it is not visual occupancy.

This first boundary does not select frameloop-mode policy, `invalidate()`, render-priority takeover, XR scheduling, multiple Canvas roots, StrictMode behavior, visibility policy, R3F input/event integration, public React hooks, or package/export layout.

### First production R3F hook

The first production R3F hook is governed by [ADR-0010](adr/0010-r3f-hook-explicit-runtime.md).

Its Runtime is supplied explicitly by the caller. The hook does not discover a Runtime through context/provider fallback, construct or dispose a Runtime, or start/stop semantic lifecycle scheduling.

For one delivered R3F frame, the hook reads one current semantic snapshot and passes that unchanged snapshot plus the R3F frame `delta` to presentation code.

The first hook:

- does not expose R3F RootState or XR frame data;
- does not expose render priority and therefore uses the R3F default;
- does not mirror semantic state into React state;
- does not add a second WIF callback-ref/effect lifecycle;
- does not swallow presentation callback failures;
- does not treat Runtime replacement as disposal/scheduler ownership transfer.

After React re-render supplies a different Runtime or callback, subsequent delivered frames use the latest rendered values. Runtime lifetime remains caller-owned.

Provider/context transport, final package exports, peer dependency ranges, and exact client/RSC packaging strategy remain later frontiers.

## Cross-host rule

When DOM and R3F consumers receive equivalent normalized commands and valid deltas, shared semantic claims must be decided by the same core runtime.

Equivalent core input should produce equivalent selected phase, lifecycle, raw progress, direction, cooldown/lock state, and request disposition where those observations apply.

Hosts are not required to use the same easing or produce identical visual effects.

Differences caused by host event systems, timestamp normalization epochs, scheduling policy, or presentation policy must be documented as host behavior, not hidden as core differences.
