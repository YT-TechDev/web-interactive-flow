# Testing and Evidence

The project uses a falsification-first evidence model.

The first-runtime behavior under test is defined by [BEHAVIORAL_CONTRACT.md](BEHAVIORAL_CONTRACT.md).

## Behavioral traces

A behavioral trace is an ordered record of:

- initial semantic configuration/state;
- normalized commands;
- explicit valid `tick(dt)` inputs;
- observable semantic state and request dispositions.

The intended trace corpus may later live in a machine-readable fixture directory once its format is justified.

The exact fixture schema is intentionally not frozen.

## Semantic observation projection

The first differential oracle should compare only the semantic observations needed by a trace.

Conceptually:

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

This is testing vocabulary, not a proposed runtime snapshot, MoonBit type, or Wasm ABI.

Do not require full reference snapshot equality.

In particular, the oracle must not freeze:

- `phaseIndex` representation;
- an idle `direction = none` sentinel;
- settled progress sentinels such as `0` or `1`;
- exact cooldown remaining time;
- JavaScript object enumeration;
- source history;
- presentation-eased progress.

## Existing TypeScript/R3F implementation

Where available, the existing implementation can act as a reference model for extracting candidate behavior.

It is not automatically normative.

The current research baseline is:

- `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`

A candidate behavior should be challenged for:

- framework-specific leakage;
- accidental implementation detail;
- ambiguity;
- boundary failures;
- stale documentation;
- behavior that should be corrected rather than preserved.

When reference progress is compared numerically, configure linear easing so the reference's public progress corresponds to raw lifecycle progress. Otherwise omit progress comparison when the claim does not require it.

## Differential validation

Once the MoonBit/Wasm runtime exists, shared traces should be executable against both the reference behavior and the new runtime where comparison is meaningful.

The comparison target is semantic behavior, not internal representation or host presentation.

## Initial bounded example corpus

The first oracle should cover these conceptual witnesses.

| ID | Witness |
| --- | --- |
| O01 | Adjacent forward acceptance: target selected immediately, active forward transition before positive time advances. |
| O02 | Adjacent reverse acceptance. |
| O03 | Direct non-adjacent forward acceptance with no synthesized intermediate selections. |
| O04 | Direct non-adjacent reverse acceptance with no synthesized intermediate selections. |
| O05 | Known-request rejection stability across first/last boundary, same selected target, lock, active re-entry, active reversal, and cooldown. |
| O06 | Valid time boundaries: zero delta, fractional positive time, exact transition completion, exact cooldown expiry, and post-expiry eligibility. |
| O07 | Leftover time crosses transition completion into cooldown, including split-versus-combined time budgets. |
| O08 | Lock/time orthogonality: lock gates requests but does not pause transition or cooldown time. |
| O09 | Zero-duration lifecycle collapse: selected target changes but no active transition/direction remains after acceptance; cooldown may already be active. |
| O10 | Settled-time idempotence: extra valid time after full settlement does not synthesize lifecycle state. |

The numbers and phase names used by a future fixture are not normative.

## Metamorphic/property layer

Example traces should be strengthened by properties.

### P01 — Rejection stability

A rejected/no-op known request preserves the semantic observation projection.

### P02 — Time segmentation equivalence

With no intervening commands, for valid non-negative `a` and `b`:

```text
rawLifecycle(tick(a + b))
==
rawLifecycle(tick(a); tick(b))
```

Presentation easing is excluded from this comparison.

### P03 — Direct-jump non-expansion

A direct accepted A-to-D request creates one accepted target selection and does not synthesize B/C accepted selections.

### P04 — Active raw-progress monotonicity

During one uninterrupted positive-duration transition, raw active progress does not decrease under valid positive ticks.

This does not apply to presentation-eased progress.

### P05 — Lock/time orthogonality

Given the same accepted transition and valid time budget, lock state does not change the raw transition/cooldown lifecycle endpoint. It changes request eligibility only.

## Browser host time-normalization properties

Browser timestamp normalization is host evidence, not part of the O01-O10/P01-P05 core semantic corpus.

For the first browser-host contract in [ADR-0005](adr/0005-browser-monotonic-time-normalization.md), implementation evidence should establish at least:

### T01 — Non-negative normalized budget

A nondecreasing accepted timestamp sequence never produces a negative normalized elapsed budget.

### T02 — Equal timestamp zero

Two equal consecutive accepted timestamps produce zero normalized elapsed budget.

### T03 — Endpoint/segmentation consistency

Within one uninterrupted normalization epoch, inserting intermediate timestamps between the same accepted start and final timestamps does not change total normalized elapsed quanta.

Per-sample budgets may differ; the total for the same epoch endpoints must not.

### T04 — Exact valid tick-chunk decomposition

Every positive chunk sent toward `tick(dt)` is an exact integer satisfying the current signed-i32 wrapper boundary, and the exact integer sum of the ordered chunks equals the normalized host budget.

No test should invent an oversized raw `tick(B)` call outside the current valid carrier.

### T05 — Deterministic replay

The same timestamp sequence, normalization policy, and explicit rebase points produce the same normalized budget/chunk sequence.

### T06 — Regression rejection is non-mutating

A timestamp lower than the previous accepted timestamp is rejected before accepted normalization state changes.

A subsequent valid timestamp must behave as though the rejected regression had not been accepted.

### T07 — Rebase epoch isolation

An explicit rebase starts a new normalization epoch and cannot silently consume elapsed time from the prior epoch.

### T08 — Exact-chunk semantic endpoint equivalence

For focused Runtime witnesses and with no semantic command interleaved, different valid exact chunk decompositions of the same normalized integer budget must reach the same semantic endpoint where the current bounded core properties justify the comparison.

This property strengthens host/carrier evidence; it must not be described as proof that an invalid oversized single `tick` call exists.

## Browser frame-scheduler properties

Frame scheduling is host evidence, separate from the O01-O10/P01-P05 core corpus and the T01-T08 clock-normalization properties.

For the first browser scheduler contract in [ADR-0006](adr/0006-first-browser-frame-scheduler.md), implementation evidence should establish at least:

### F01 — First delivered frame establishes an epoch

The first delivered frame after start or restart advances zero lifecycle time but still produces exactly one semantic snapshot observation.

### F02 — Equal timestamp frame observes without advancing time

A delivered timestamp equal to the previous accepted frame timestamp produces no positive tick chunk but still produces exactly one semantic snapshot observation.

### F03 — Long-gap chunks precede one observation

All exact valid tick chunks representing one delivered frame's normalized budget are applied in order before one semantic snapshot is read and observed.

Chunk count must not change observer-call count.

### F04 — At most one pending frame request

A Running scheduler owns at most one pending frame request outside callback execution.

Calling start while already Running must not create a second loop.

### F05 — Stop cancellation and stale-callback inertness

Stopping a Running scheduler cancels its pending request when present.

A callback delivered after the scheduler is Stopped performs no tick, snapshot read, observer call, or reschedule.

### F06 — Restart begins a new normalization epoch

After explicit stop, a later start does not consume the stopped interval. Its first delivered timestamp establishes a fresh epoch and advances zero lifecycle time.

### F07 — Tick-before-snapshot ordering

For one delivered frame, all normalized tick chunks are applied before the semantic snapshot supplied to the observer is captured.

### F08 — Observer stop prevents rescheduling

If observer code stops the scheduler during a frame callback, that callback requests no subsequent frame.

### F09 — Frame failure stops and does not reschedule

A failure from normalization, chunking, runtime ticking, snapshot observation, or the observer stops scheduler driving, propagates the failure, and requests no next frame.

Runtime disposal is not implied.

### F10 — Scheduler isolation

Independent scheduler instances do not share normalization epoch state or pending-request ownership.


## Browser Wasm Module-acquisition properties

Wasm resource acquisition is host/bridge evidence, separate from the O/P core corpus, T clock-normalization properties, and F frame-scheduler properties.

For the first acquisition contract in [ADR-0007](adr/0007-browser-wasm-module-acquisition.md), implementation evidence should establish at least:

### L01 — Current WIF artifact success

The actual built WIF Wasm artifact, supplied through a successful `Response` with exact `application/wasm` Content-Type, compiles and is returned as a compatible `WebAssembly.Module`.

### L02 — Promise<Response> composition

A promise resolving to the same valid Response is accepted through the same compiler boundary, preserving direct caller composition with `fetch(url)` without making the compiler own fetch or URL policy.

### L03 — Unrelated valid Wasm is incompatible

A syntactically valid WebAssembly module that lacks the required WIF scalar exports may compile successfully but must be rejected by WIF compatibility validation before being returned as a qualified WIF Module.

### L04 — Imported module is incompatible

A syntactically valid WebAssembly module with imports must be rejected by the current zero-import WIF compatibility boundary.

### L05 — Streaming MIME failure stays closed

Valid Wasm bytes supplied with missing, wrong, or parameterized Content-Type must not be silently rescued by an implicit buffered fallback in the first compiler.

Tests should verify observable rejection without freezing platform error text.

### L06 — Non-ok Response fails

A non-ok Response containing otherwise-valid WIF bytes must fail acquisition rather than being compiled through an alternate path.

### L07 — Malformed Wasm fails compilation

Correct streaming response metadata does not make malformed bytes valid. Compilation failure must propagate as a host acquisition failure.

### L08 — Returned Module remains reusable and Runtime-isolated

One returned compatible Module can be passed to the existing semantic wrapper to create at least two independent Runtime instances whose semantic state does not alias.

### L09 — Acquisition creates no Instance or Runtime

Compiling and qualifying the resource alone does not initialize ABI lifecycle state, construct a semantic Runtime, start scheduling, or dispose anything.

### L10 — No fetch/URL/package assumption

The first compiler's implementation and tests require no repository-owned artifact URL, `fetch()` call, package-relative path, bundler rule, or Module cache.

Environment-specific browser CORS, CSP, network, and deployment behavior may require later browser integration evidence. Node or other non-browser automated tests must not be described as exhaustive proof of those browser policies.

## Real-browser composition qualification

Real-browser composition qualification is integration/environment evidence. It is separate from the O/P core corpus, T clock-normalization properties, F frame-scheduler properties, and L Wasm Module-acquisition properties.

The first browser qualification composes the existing production `compileFlowModule`, `createFlowRuntime`, and `createFrameScheduler` seams inside a real browser. It does not define a new production browser adapter or new flow semantics.

### Q01 — Actual streamed browser acquisition

A real browser fetches the actual built WIF `core.wasm` from the qualification server and passes the resulting promise or `Response` through production `compileFlowModule()`.

The Wasm response must use exact `application/wasm`.

### Q02 — Actual semantic Runtime composition

The returned compatible `WebAssembly.Module` is passed to production `createFlowRuntime()`, and one semantic navigation request is accepted.

### Q03 — First real frame establishes the normalization epoch

The navigation is accepted before scheduler start.

The production frame scheduler is then started with the real browser's bound `requestAnimationFrame` and `cancelAnimationFrame` functions.

The first successful observer snapshot for the active transition has raw progress exactly `0`, proving that the first delivered real frame establishes the ADR-0005 epoch without advancing lifecycle time.

### Q04 — Later real frame advances lifecycle

Within one bounded qualification timeout, a later real frame must prove positive lifecycle advancement.

The witness may observe either:

- an active transition with raw progress greater than `0`; or
- a later settled semantic state that can only be reached after positive normalized time was consumed.

Do not require an exact frame count, exact frame duration, exact refresh rate, or exact positive progress value.

### Q05 — Production seams only

The browser fixture imports and calls the repository production:

- `compileFlowModule`;
- `createFlowRuntime`;
- `createFrameScheduler`.

The fixture must not implement a second clock normalizer, tick-chunk decomposition policy, semantic runtime, or frame scheduler.

### Q06 — Bounded cleanup

The qualification harness has a bounded overall timeout.

On success or failure it tears down the browser session, browser-driver process, and local HTTP server. Failure must not leave the CI job waiting indefinitely.

### Q07 — Browser qualification provenance

CI records the browser and browser-driver versions used for the witness.

Those versions are qualification provenance only. They are not core semantic authority, a browser-version behavioral oracle, or an implicit stable version pin.

### Qualification harness boundaries

The first browser qualification is test-only.

Its local HTTP server must:

- bind to loopback only;
- expose an explicit allowlist of fixture, bridge-module, and built-Wasm routes;
- serve the Wasm artifact as exact `application/wasm`;
- serve ESM JavaScript with an appropriate JavaScript MIME type;
- avoid arbitrary repository filesystem traversal.

Qualification fixture routing does not define a production package, CDN, bundler, or artifact URL layout.

Existing runner-provided browser and driver tooling may be used when available. A third-party browser package or installation Action is not required merely to express this proof.

Browser/page module-load errors, unhandled failures, unexpected semantic observations, and qualification timeout are qualification failures.

This evidence does not establish:

- exact browser frame cadence or physical wall-clock equivalence;
- background-tab or page-visibility behavior;
- universal cross-browser compatibility;
- arbitrary CORS, CSP, network, or deployment configurations;
- DOM projection or input-event correctness.

## Real-DOM consumer qualification

Real-DOM consumer qualification is browser host evidence. It is separate from the O/P core corpus, T clock-normalization properties, F frame-scheduler properties, L Wasm Module-acquisition properties, Q real-browser production composition qualification, and W DOM wheel default-action ownership properties.

The purpose of this qualification is narrow:

> In the qualified real-browser environment, the existing production WIF Module compiler, semantic Runtime, and frame scheduler can drive an ordinary DOM consumer from semantic scheduler snapshots without adding a production DOM adapter, presentation schema, or second semantic owner.

The DOM element and its fixture-owned text/serialization format are test artifacts only. This section does not select a production DOM projection schema.

### D01 — Actual DOM consumer exists

The browser fixture owns at least one ordinary DOM element and mutates that element from the production frame scheduler's `onFrame(snapshot)` observation path.

A private JavaScript global alone is not sufficient DOM-consumer evidence.

### D02 — First DOM projection reflects the first semantic snapshot

The navigation request is accepted before scheduler start.

The first DOM projection represents the first production scheduler snapshot with:

- selected semantic target `B`;
- an active transition;
- raw progress exactly `0`.

This observation describes semantic selected-target and lifecycle state. It must not be described as proof that the user is already visually occupying phase `B`.

### D03 — Later DOM projection reflects lifecycle advancement

Within the bounded real-browser qualification window, WebDriver observes the actual DOM element showing semantic lifecycle advancement after D02.

The later DOM projection may represent either:

- an active transition with raw progress greater than `0`; or
- an inactive transition after positive lifecycle time has advanced the Runtime.

The qualification must not require an exact positive progress value, exact frame count, exact frame duration, or exact refresh rate.

### D04 — DOM readback is independent qualification evidence

The browser harness reads the actual DOM element when evaluating the DOM-consumer witness.

The private `window.__WIF_QUALIFICATION__` object may remain a completion, failure, cleanup, or diagnostic channel, but it is not sufficient semantic projection evidence by itself.

A fixture that reports `state: "pass"` while no qualifying DOM projection exists must fail this qualification.

### D05 — Production seams only

The browser fixture composes the repository production:

- `compileFlowModule`;
- `createFlowRuntime`;
- `createFrameScheduler`.

DOM projection consumes the semantic snapshot delivered by the production scheduler observer.

The fixture must not:

- implement a second clock normalizer;
- tick the Runtime from a separate DOM loop;
- add another requestAnimationFrame loop for semantic driving;
- fabricate semantic snapshot values for the DOM witness;
- manually replace the scheduler observation path with a separate polling source.

### D06 — Projection format is non-normative

The fixture-owned DOM element identity, element type, text content, and any serialization used by this qualification are test-local details.

This qualification does not select or freeze production:

- `data-*` attribute names;
- CSS custom-property names;
- class names;
- text/status serialization;
- numeric formatting precision;
- projection helper names or signatures;
- element ownership or replacement policy;
- per-frame mutation policy for applications.

A future production DOM projection API requires separate evidence.

### D07 — Selected semantic identity is not visual occupancy

The DOM qualification may project `snapshot.selected` because selected target is part of semantic Runtime state.

During an active transition, that selected identity remains the accepted destination and must not be reinterpreted as current visual occupancy.

Presentation interpolation, easing, and the meaning of visual position remain host/application concerns.

### D08 — Existing browser qualification bounds remain intact

The real-DOM consumer witness reuses the bounded real-browser qualification model.

It must not weaken existing guarantees for:

- overall qualification timeout;
- browser-session cleanup;
- browser-driver cleanup;
- loopback-only local server binding;
- explicit route allowlisting;
- exact Wasm MIME handling;
- browser/driver provenance logging.

The additional DOM witness must not turn browser-version provenance into semantic authority.

### Real-DOM qualification evidence boundaries

D01-D08 do not establish:

- a production DOM adapter API;
- a final DOM/CSS projection schema;
- presentation easing or animation policy;
- visual occupancy semantics;
- DOM mutation performance;
- accessibility or WCAG correctness;
- universal cross-browser compatibility;
- raw WheelEvent-to-intent normalization;
- listener/root ownership;
- nested-scroll or native-scroll coexistence;
- visibility-aware scheduling;
- package or npm export layout.

These remain later host-policy or distribution frontiers.

## DOM wheel default-action ownership properties

DOM wheel default-action ownership is host evidence, separate from the O/P core corpus, T clock-normalization properties, F frame-scheduler properties, L Wasm Module-acquisition properties, and Q real-browser composition qualification.

For the first normalized-wheel-intent ownership contract in [ADR-0008](adr/0008-dom-wheel-default-action-ownership.md), implementation evidence should establish at least:

### W01 — Accepted cancelable intent may suppress after disposition

For one already-normalized `next` or `previous` intent whose semantic Runtime request returns `accepted`, with prevention enabled and a cancelable host event, the ownership layer issues exactly one semantic request before making exactly one `preventDefault()` call.

The test must detect prevention that occurs before the semantic request returns.

### W02 — Rejected intent remains unprevented

If the semantic Runtime returns `rejected`, the ownership layer does not call `preventDefault()`, even when prevention is enabled and the host event is cancelable.

The host layer must not precompute semantic eligibility from phase boundaries, lock, transition, cooldown, or another snapshot field.

### W03 — Non-cancelable event does not control semantic acceptance

If the semantic Runtime returns `accepted` for a normalized intent associated with a non-cancelable event, the result remains `accepted` and no `preventDefault()` call is attempted.

Cancelability is not an input to core request eligibility.

### W04 — Prevention-disabled Accepted intent remains unprevented

If the semantic Runtime returns `accepted` and prevention is disabled, the ownership layer does not call `preventDefault()` regardless of event cancelability.

### W05 — Exactly one semantic request per normalized intent

One ownership-layer invocation for `next` calls the Runtime's next request exactly once; one invocation for `previous` calls the previous request exactly once.

No retry, replay, queue, or second request may be triggered by cancelability or prevention outcome.

### W06 — Semantic owner is not shadowed by snapshot prediction

The ownership layer delegates directly to the semantic Runtime and does not call `getSnapshot()` or maintain copies of selected phase, lock, transition, cooldown, or other request-gating state to predict disposition.

Mechanical evidence may be used to guard this ownership boundary.

### W07 — First ownership layer is stateless and delta-policy-free

The first ownership layer contains no persistent burst/timing/cooldown state and no raw wheel-delta policy.

Its implementation evidence must not introduce `deltaX`, `deltaY`, `deltaMode`, wheel-unit multipliers, thresholds, accumulation, inactivity timing, or ADR-0005/frame-clock reuse.

These concerns require separate host-input evidence before they are added.

### W08 — Failure before disposition does not suppress native default

If the semantic Runtime request throws or otherwise fails before returning `accepted` or `rejected`, the failure propagates according to the existing host error boundary and `preventDefault()` is not called.

This property does not freeze a new public error taxonomy.

### Wheel-ownership evidence boundaries

W01-W08 do not establish:

- how a raw WheelEvent becomes `next` or `previous`;
- listener target/root ownership;
- capture/bubble policy;
- passive-listener registration API;
- behavior for an already-`defaultPrevented` event;
- propagation policy;
- automatic nested-scroll detection or boundary release;
- universal native-scroll coexistence;
- touch, pointer, or keyboard input behavior;
- cross-browser input compatibility.

Those remain later host-policy frontiers.


## DOM keyboard default-action ownership properties

DOM keyboard ownership evidence is host evidence for the already-normalized-intent boundary in [ADR-0013](adr/0013-dom-keyboard-default-action-ownership.md).

It is separate from raw key mapping, listener lifecycle, focus management, accessibility policy, and the host-independent semantic corpus.

### KB01 — Runtime rejection preserves browser default ownership

For a valid normalized `next` or `previous` intent, if the semantic Runtime returns `rejected`, WIF does not call `preventDefault()`.

Browser-native behavior associated with that key event remains available.

The qualified Chrome witness demonstrates this with PageUp on a focused scroll container at the first semantic phase: normalized `previous` is rejected while native scrolling proceeds.

### KB02 — Runtime acceptance precedes optional prevention

For a valid normalized keyboard intent, semantic Runtime disposition is obtained before WIF requests native-default suppression.

When the Runtime returns `accepted`, prevention is enabled, and the event is cancelable, WIF may call `preventDefault()`.

The qualified Chrome witness demonstrates accepted `next` from phase A to B while the corresponding native PageDown scroll is suppressed.

### KB03 — Cancelability is not semantic eligibility

Event cancelability must not decide whether a normalized semantic request is accepted or rejected.

A non-cancelable host event associated with an accepted request remains semantically accepted even though WIF cannot request cancellation through `preventDefault()`.

Tests should keep semantic disposition and host cancellation observably distinct.

### KB04 — Host decline occurs before semantic request

A raw keyboard policy may decline an event before producing a normalized intent.

A decline issues no Runtime request and no WIF native-default suppression request.

Qualified browser evidence includes explicit decline preserving:

- Space activation on a button;
- printable text insertion in an input.

### KB05 — Native keyboard defaults are target-sensitive

Research evidence must not assume a key value alone establishes WIF ownership.

The trusted Chrome witness records target-specific native behavior including:

- PageDown scrolling on a focused scroll container;
- Space activation on a button;
- Enter activation on a link;
- ArrowDown changing a select control;
- printable-key text insertion;
- Tab focus movement.

Cancellation witnesses show that preventing `keydown` can suppress these native effects.

### KB06 — Key meaning and physical-key identity remain distinct

Research and future adapter tests must not treat `KeyboardEvent.key` and `KeyboardEvent.code` as interchangeable.

Qualified evidence includes:

- `key="a"` and `key="A"` sharing `code="KeyA"` under modifier change;
- a WebDriver Enter action exposing `key="Enter"` with `code="NumpadEnter"` in the qualified Chrome environment.

This evidence does not select a public mapping representation.

### KB07 — Focus remains outside semantic ownership

Semantic navigation does not itself move, restore, trap, or select DOM focus.

The qualified accepted/rejected Runtime witness preserves focus on the same scroll container while semantic disposition changes.

Native Tab focus movement and its cancellation are browser-host evidence, not Runtime flow state.

### KB08 — Listener scope and raw policy remain bounded

The first keyboard ownership theorem does not establish a production keyboard listener.

Research demonstrated that a global/window observer receives trusted keyboard input from a focused control outside a narrower flow root while the explicit root does not.

No default listener target, key map, repeat rule, IME/composition rule, modifier rule, actionable/editable classifier, ignore-selector API, propagation policy, or React keyboard API is authorized by KB01-KB08.

### DOM keyboard evidence boundaries

The current trusted-browser evidence is bounded to the qualified Chrome/ChromeDriver environment.

It does not establish:

- universal cross-browser keyboard behavior;
- physical keyboard repeat rate or repeat timing;
- real IME composition behavior;
- keyboard-layout equivalence;
- one canonical `key` or `code` mapping strategy;
- a default WIF key list;
- automatic focus movement/restoration;
- WCAG conformance or screen-reader certification;
- a production keyboard listener API;
- React keyboard hook/component ergonomics.

The classic WebDriver held-key probe produced only one observed non-repeat keydown and is not physical-repeat evidence.

The research environment did not create a real IME composition session. Standards evidence therefore constrains future composition policy, but current browser qualification does not claim IME coverage.


## DOM keyboard-listener properties

DOM keyboard-listener evidence is host lifecycle/routing evidence layered above the KB01-KB08 normalized keyboard ownership contract in [ADR-0013](adr/0013-dom-keyboard-default-action-ownership.md).

For the first listener boundary in [ADR-0014](adr/0014-dom-keyboard-listener-explicit-target.md), implementation evidence should establish at least:

### KBL01 — EventTarget ownership is explicit

The binding consumes an explicitly supplied/owned `EventTarget`.

It must not silently choose `window`, `document`, an inferred flow root, the currently focused element, or another global target.

Trusted browser evidence should show that a focused descendant on the explicit event path reaches the binding while an unrelated focused element outside that path does not.

### KBL02 — Binding owns exactly one keydown listener

One binding installs one ordinary `keydown` listener.

Listener count must not grow merely because one event is delivered.

The first listener does not establish capture-phase ownership.

### KBL03 — Cleanup is explicit, isolated, and repeat-safe

Cleanup removes only the listener installed by that binding.

Calling cleanup repeatedly must not remove unrelated listeners or another WIF binding.

A trusted event delivered after cleanup must no longer reach the cleaned-up binding.

DOM detachment is not cleanup.

A detached-target lifecycle witness may use synthetic dispatch if it is clearly labeled as lifecycle evidence rather than physical-keyboard evidence.

### KBL04 — Raw KeyboardEvent reaches replaceable resolver

The caller-supplied resolver receives the delivered host keyboard event before semantic request ownership.

Listener mechanics do not hard-code:

- key maps;
- `key` / `code` choice;
- repeat policy;
- composition policy;
- modifier policy;
- native-control classification;
- ignore selectors.

Synthetic repeat/composition models may prove policy placement, but must not be described as physical repeat or real IME evidence.

### KBL05 — Resolver decline/failure occurs before semantic request

A resolver decline produces no Runtime request and no WIF default-action suppression.

Resolver failure propagates or fails closed according to the implementation boundary before any semantic request is issued.

An invalid produced intent is a validation/policy failure, not an ordinary known-request rejection.

### KBL06 — One produced intent delegates exactly once

For one listener invocation, one valid `next` / `previous` resolver result produces exactly one corresponding ADR-0013 ownership call / Runtime request.

The listener does not retry or replay based on focus, cancelability, `defaultPrevented`, or semantic snapshot state.

### KBL07 — Keyboard passivity remains distinct from semantic acceptance

The first keyboard listener must not rely on wheel's top-level default-passive exception as though it applied to `keydown`.

Qualification should retain two browser witnesses when prevention matters:

1. ordinary keydown registration can successfully cancel the qualified default after accepted semantic disposition;
2. an explicit `passive: true` mutant still permits the semantic request to be accepted but prevents successful `preventDefault()` and leaves the native default available.

This proves that semantic acceptance and browser cancellation remain distinct.

### KBL08 — defaultPrevented remains resolver-visible host state

Listener mechanics do not universally translate `event.defaultPrevented === true` into semantic decline.

The resolver may choose to decline such an event or intentionally map it.

Qualification should preserve evidence that already-prevented state does not itself become Runtime semantic truth.

### KBL09 — Propagation is not semantic deduplication

The first listener does not call `stopPropagation()` or `stopImmediatePropagation()` to manufacture single-delivery ownership.

Capture phase is not selected as a deduplication mechanism.

Mechanical source evidence may guard these boundaries.

### KBL10 — Overlapping bindings have an explicit non-guarantee

Qualification must preserve a counterexample with overlapping explicit keyboard bindings on one bubbling path.

Under a valid zero-duration/zero-cooldown Runtime, one trusted key event can be observed by an inner and outer binding and produce two accepted semantic requests.

The qualified research witness observed:

```text
inner binding:
  Runtime A -> B
  accepted
  defaultPrevented false -> true

outer binding:
  receives same event
  defaultPreventedBefore = true
  Runtime B -> C
  accepted
```

Final selected phase: `C`.

A future implementation or documentation must not claim one semantic request per DOM keyboard event across overlapping bindings unless a separate ownership mechanism is researched and qualified.

### DOM keyboard-listener evidence boundaries

KBL01-KBL10 do not establish:

- one canonical raw key map;
- `key` versus `code` public mapping;
- physical repeat policy;
- real IME/composition behavior;
- modifier policy;
- native-control classifier;
- universal `defaultPrevented` arbitration;
- overlapping-binding deduplication;
- Shadow DOM/composed-path ownership;
- focus management;
- accessibility conformance;
- React hook/component API;
- AbortSignal public lifecycle API;
- final adapter name/signature;
- package export layout;
- broad cross-browser compatibility.

Those remain later host-policy, adapter-API, accessibility, or distribution frontiers.

## DOM wheel-listener properties

DOM wheel-listener evidence is host lifecycle/routing evidence layered above the W01-W08 normalized-intent ownership contract. It must not redefine semantic request eligibility or import a raw wheel gesture algorithm into the listener layer.

For the first listener boundary in [ADR-0012](adr/0012-dom-wheel-listener-explicit-target.md), implementation evidence should establish at least:

### E01 — EventTarget ownership is explicit

The binding consumes an explicitly supplied/owned `EventTarget`.

The production listener must not silently choose `window`, `document`, `document.documentElement`, `document.body`, an inferred flow root, or an automatically discovered scroll container.

A test should detect introduction of an implicit global/default target.

### E02 — One binding owns its listener lifecycle

One binding installs the wheel listener it owns and exposes/participates in an explicit cleanup lifecycle.

After cleanup, later wheel dispatch on that target must not enter the binding.

DOM detachment alone must not be treated as cleanup.

The exact public disposer shape and cleanup mechanism are not frozen by this property.

### E03 — Cleanup is isolated and repeat-safe

Cleaning up one binding must not remove unrelated listeners or another independent binding's listener.

Repeating the binding's cleanup must not reattach, duplicate, or invoke semantic work.

Evidence may qualify explicit `removeEventListener()`, `AbortSignal`, or another implementation, but must verify the observable ownership rather than assuming platform behavior.

### E04 — Suppression-capable listener registration is explicitly non-passive

When the binding is configured so that ADR-0008 may call `preventDefault()` after semantic acceptance, the installed wheel listener must be registered with explicit non-passive behavior.

The proof must detect reliance on omitted/default passive behavior.

This property does not require a prevention-disabled binding to use `passive: true` and makes no performance claim.

### E05 — Raw event policy runs before semantic ownership

For one delivered wheel event, the replaceable raw-event policy/resolver runs before any semantic request or native-default suppression request.

If that policy declines to produce an intent, the binding issues zero semantic requests and performs zero prevention.

The exact resolver callback/API shape is not frozen.

### E06 — Resolver failure or invalid intent is side-effect-free with respect to semantics

If the raw-event policy fails before producing a normalized intent, that failure occurs before semantic request/default suppression.

If it produces an unsupported intent, existing normalized-intent validation must fail before semantic request/default suppression.

Tests should detect a Runtime call or `preventDefault()` that occurs before resolver success and normalized-intent validation.

### E07 — One produced normalized intent delegates exactly once

For one resolver result of `next` or `previous`, the listener delegates exactly once to the ADR-0008 ownership path.

It must not retry, replay, fan out, or issue a second semantic request based on cancelability, cancellation state, cleanup state, or Runtime disposition.

Accepted-only prevention ordering remains governed by W01-W08.

### E08 — Listener does not predict Runtime eligibility

The production listener/resolver layer does not call `runtime.getSnapshot()` or maintain copies of selected phase, boundary position, lock, transition, cooldown, or request-eligibility state to predict whether navigation will be accepted.

The semantic Runtime remains the owner of known-request eligibility.

Mechanical source evidence may supplement behavioral evidence.

### E09 — Cancellation and propagation are not semantic deduplication

The first listener does not use `defaultPrevented` as semantic truth or a universal WIF deduplication flag.

It does not call `stopPropagation()` or `stopImmediatePropagation()` to claim semantic single-delivery ownership, and capture phase is not used as a deduplication mechanism.

A caller-supplied raw-event policy may choose to decline an already-default-prevented event, but that remains host policy outside Runtime semantics.

### E10 — Gesture policy and overlapping-binding guarantees remain explicitly bounded

The first listener implementation must not embed or freeze unqualified raw-wheel policy such as fixed `deltaMode` multipliers, thresholds, burst accumulation/timers, input-local cooldown, one-navigation-per-burst behavior, or target-ignore selectors merely to make the listener usable.

It must also not claim semantic single-delivery for multiple WIF bindings that overlap on one bubbling event path.

Qualification should retain a counterexample demonstrating that duplicate normalized-intent delivery can produce two accepted navigations under a valid zero-duration/zero-cooldown Runtime configuration.

### DOM wheel-listener evidence boundaries

E01-E10 do not establish:

- one canonical raw wheel-to-intent algorithm;
- device-independent wheel feel;
- threshold or burst defaults;
- native-scroll boundary release;
- automatic nested-scroll ownership;
- scroll chaining / `overscroll-behavior` policy;
- Shadow DOM event ownership;
- editable/actionable target policy;
- overlapping WIF-listener deduplication;
- touch/pointer/keyboard behavior;
- focus/accessibility policy;
- React DOM hook/component API;
- final public DOM adapter name/argument shape;
- package export layout;
- broad cross-browser compatibility.

Those remain later host-policy, adapter-API, or distribution frontiers.

## R3F frame-consumer properties

R3F frame-consumer evidence is host evidence, separate from the O/P core corpus, T clock-normalization properties, F browser frame-scheduler properties, L Wasm acquisition, Q real-browser composition, D real-DOM consumer qualification, and W DOM wheel ownership.

For the first read-only R3F frame-consumer contract in [ADR-0009](adr/0009-r3f-frame-consumer-read-only.md), implementation evidence should establish at least:

### R01 — One delivered R3F frame reads one coherent semantic snapshot

One frame-consumer invocation reads one current semantic Runtime snapshot and presents that single observation to its host callback/effect path.

The proof must detect fabricated semantic state or multiple independently interpreted semantic reads within one consumer invocation.

### R02 — R3F frame consumption does not tick the Runtime

The first R3F frame consumer does not call `runtime.tick()` and does not invoke another lifecycle-advancement path.

Delivered R3F frame callbacks are observation opportunities, not a second semantic clock.

### R03 — Multiple R3F consumers do not accelerate lifecycle

Adding or invoking more R3F frame consumers without additional input from the selected WIF lifecycle-time owner does not change semantic transition/cooldown state.

Consumer count must not affect lifecycle speed.

### R04 — R3F delta does not alter WIF semantic state

Different R3F `delta` values supplied to otherwise equivalent read-only frame-consumer invocations do not independently change selected phase, transition lifecycle, cooldown, lock, direction, raw progress, or request eligibility.

The frame delta may still be passed to presentation code as host metadata.

### R05 — Presentation may consume raw progress and host delta without feedback

A frame consumer may combine semantic snapshot fields such as raw progress with R3F host metadata to mutate scene-local presentation state.

Those host effects must not feed presentation-eased or scene-derived values back into semantic lifecycle or request rules.

### R06 — No duplicated flow state in R3F/React host state

The first frame-consumer boundary does not maintain competing copies of phase, transition, cooldown, lock, direction, or request-eligibility state to determine semantic truth.

Local refs may hold presentation-only state where the test clearly separates it from semantic ownership.

### R07 — Selected semantic identity is not visual occupancy

During an active transition, a projected selected identity is treated as the accepted destination and must not be asserted as current visual/camera/object occupancy.

### R08 — Scheduling and package nonclaims remain explicit

The first proof must not claim equivalent callback delivery or behavior across `frameloop="always"`, `"demand"`, `"never"`, XR, render-priority takeover, multiple Canvas roots, StrictMode, or hidden-page conditions unless separately evidenced.

It must not freeze final React hook/component APIs, dependency placement, package/workspace layout, or npm export names merely to prove read-only frame sampling.

### R3F frame-consumer evidence boundaries

R01-R08 do not establish:

- an R3F-owned WIF lifecycle clock;
- a public `useFlowFrame` API;
- React provider/subscription design;
- package/export layout;
- frameloop invalidation policy;
- render-priority policy;
- XR behavior;
- multiple-Canvas synchronization;
- R3F pointer/raycast input integration;
- universal scene projection schema;
- presentation easing API.

Those remain later host or distribution frontiers.

## First production R3F hook properties

First-hook evidence is adapter API evidence layered on top of the R01-R08 read-only R3F frame-consumer contract.

For the first explicit-Runtime hook in [ADR-0010](adr/0010-r3f-hook-explicit-runtime.md), implementation evidence should establish at least:

### H01 — Actual R3F invokes the production hook source

The proof mounts a component using the production hook under actual `@react-three/fiber` frame delivery.

A fake local frame callback or test-only reimplementation is insufficient.

### H02 — Exactly one semantic snapshot read per delivered hook frame

For one hook consumer and one delivered R3F frame, the production hook calls `runtime.getSnapshot()` exactly once.

It must not combine multiple independently-read semantic observations.

### H03 — Hook does not advance semantic lifecycle

The production hook does not call `runtime.tick()` or another lifecycle-advancement path.

R3F frame delta does not become WIF semantic time.

### H04 — Existing semantic snapshot is forwarded unchanged

The callback receives the same semantic snapshot object/value returned by the Runtime read for that frame.

The hook does not fabricate, rename, omit, ease, or project semantic fields into a competing R3F-specific semantic state.

### H05 — R3F delta is forwarded unchanged without semantic effect

The callback receives the delivered R3F frame delta.

Changing that delta while WIF semantic time is held fixed does not alter Runtime semantic state.

### H06 — Presentation callback freshness follows React re-render

When a component re-renders with a different presentation callback, the next delivered R3F frame invokes the latest callback.

The first hook does not require a second WIF-owned callback-ref/effect lifecycle to achieve this.

### H07 — Explicit Runtime freshness follows React re-render

When a component re-renders with a different Runtime argument, the next delivered R3F frame reads the new Runtime.

The hook does not dispose the previous Runtime or start lifecycle scheduling for the replacement Runtime.

### H08 — Multiple hook consumers remain read-only

Adding more production hook consumers for one Runtime does not change semantic lifecycle speed or Runtime state between WIF lifecycle-time inputs.

### H09 — Unmount removes observation without disposing Runtime

Unmounting a hook consumer stops that R3F frame subscription through normal R3F lifecycle behavior.

The Runtime remains caller-owned and usable after consumer unmount.

### H10 — Presentation callback failures propagate

If the presentation callback throws, the production hook does not swallow, translate, or convert the failure into semantic state.

This property does not freeze stable error wording or a public error class.

### H11 — First hook does not widen into deferred React/R3F policy

The production hook contains no:

- Runtime context/provider acquisition;
- React semantic-state mirror;
- public render-priority argument;
- R3F RootState/XR callback payload;
- Runtime construction/disposal;
- semantic scheduler/clock ownership;
- presentation-eased semantic feedback.

Mechanical evidence may guard these boundaries.

### H12 — Source qualification remains isolated from package authority

The exact production adapter source may be staged into the isolated R3F fixture so it resolves against that fixture's locked dependencies.

The proof must verify that the staged source originates from the production source.

This qualification does not create or require a root package manifest, final workspace topology, public export map, peer dependency range, or RSC packaging claim.

### First-hook evidence boundaries

H01-H12 do not establish:

- a public package-root `useFlowFrame` export;
- a React Runtime provider;
- context fallback;
- final TypeScript types;
- render-priority support;
- R3F RootState/XR forwarding;
- frameloop/invalidate policy;
- package/workspace layout;
- npm peer dependency ranges;
- `"use client"` preservation or Next.js/RSC compatibility.

Those remain later adapter/distribution frontiers.

## Package artifact and export properties

Package artifact evidence is distribution evidence. It is separate from the O/P core corpus and the T/F/L/Q/D/W/R/H host and adapter evidence.

For the first package topology in [ADR-0011](adr/0011-first-package-export-topology.md), implementation evidence should establish at least:

### K01 — Framework-neutral install/import isolation

A clean consumer fixture with no React or R3F installed can install the packed WIF artifact and import the package root successfully.

The root import must not require or resolve `@react-three/fiber`.

### K02 — Explicit R3F subpath

A separate consumer fixture with the selected qualified R3F host peer can import the package `./r3f` subpath and exercise the production `useFlowFrame` behavior against actual R3F.

The R3F adapter is not re-exported from the package root.

### K03 — Internal package paths remain encapsulated

Known implementation paths such as `bridge/internal.mjs` are not valid package-name imports.

The export map, not the repository file tree, defines the public package surface.

### K04 — Packaged Wasm export is byte-correct

The installed package's `./core.wasm` subpath resolves to the staged Wasm artifact.

Its bytes match the qualified Wasm build input used to construct the package.

### K05 — Wasm acquisition remains caller-owned

A consumer obtains/resolves the packaged Wasm resource, constructs its own `Response` or `Promise<Response>`, and passes it to production `compileFlowModule()`.

The package artifact introduces no implicit fetch, CDN, URL-selection, or global-cache behavior.

### K06 — Production source provenance is preserved

Copied production JavaScript modules used by package facades are byte-equivalent to the audited repository production sources unless the file is an explicitly generated facade/metadata file.

Copied Wasm is byte-equivalent to the qualified build artifact.

Package staging must not silently create a second implementation.

### K07 — Packed file set is explicitly bounded

The package construction/qualification inspects the `npm pack` artifact and verifies that only the authorized release files are present.

Repository tests, tools, generated research fixtures, MoonBit source, and unrelated project files are not accidentally published.

### K08 — Root facade contains no hidden R3F coupling

The root facade and all modules reachable solely from the root import contain no R3F adapter import and require no R3F peer to resolve.

A clean no-R3F consumer fixture is the primary behavioral witness; mechanical source/package-graph guards may supplement it.

### K09 — R3F remains an optional host peer

Package metadata must not make `@react-three/fiber` mandatory for framework-neutral install/use.

The first package qualification must keep exact test-fixture versions distinct from any later public compatibility-range claim.

No direct React or Three.js peer is added unless WIF production source imports or independently requires it.

### K10 — Distribution nonclaims remain explicit

The first package qualification does not establish:

- final package name;
- stable semver compatibility;
- broad R3F peer-version support;
- TypeScript declaration strategy;
- CommonJS/dual-package support;
- universal browser bundler handling for `.wasm`;
- provider/context;
- package split/workspace topology;
- package-owned network acquisition;
- RSC/`"use client"` compatibility.

Those require later distribution evidence.

### Package evidence boundaries

K01-K10 qualify one local packed artifact topology before publication.

They do not themselves authorize npm publishing or claim compatibility with package managers/bundlers that were not directly exercised.

## Package-aware real-browser qualification

Package-aware real-browser qualification is bounded integration and environment evidence layered on the K package-artifact evidence and the existing Q/D browser lifecycle discipline. It exercises an installed, locally packed artifact through one isolated production build; it does not define a new production API, distribution topology, browser adapter, or flow semantic.

### B01 — Installed package-root provenance

The browser application imports the installed local qualification package by package name and root export. It must not import repository `bridge/*.mjs` files. The installed dependency must come from the local npm tarball produced through the ADR-0011 copy-only staging path, rather than a source symlink or reconstructed fixture-local package.

### B02 — Public packaged Wasm asset boundary

The consumer obtains Wasm through the package's public `./core.wasm` export. Repository `_build/.../core.wasm` paths are not consumer inputs and must not be available as a fallback.

### B03 — Caller-owned browser acquisition

The application/build environment resolves the public asset URL. The caller obtains a `Response` or `Promise<Response>` and supplies it to production `compileFlowModule()`.

WIF must not select the URL, fetch automatically, introduce CDN policy, or own a global asset cache. This evidence preserves ADR-0007 rather than adding a package-owned acquisition helper.

### B04 — Production-build evidence

Qualification requires an actual Vite production build. Success that depends only on a Vite development server is insufficient.

Vite is isolated qualification infrastructure at one exact version with a committed lockfile. It is not a WIF runtime dependency, consumer requirement, or architectural owner.

### B05 — Emitted Wasm provenance

Production output must leave its emitted Wasm asset inspectable. Qualification may disable asset inlining and must compare the emitted asset's exact bytes, or a cryptographic digest of those exact bytes, with the installed package's `core.wasm`.

Preventing inlining and retaining an inspectable asset are fixture policy for this proof, not general WIF consumer requirements. The build must not mutate the Wasm artifact.

### B06 — Framework-neutral host isolation

The isolated consumer proves that the framework-neutral root Web package resolves and executes without React, React Three Fiber, or Three.js. Root package loading must not trigger hidden R3F resolution. This evidence does not widen into R3F browser qualification.

### B07 — Actual production WIF composition

The built browser application exercises production `compileFlowModule()`, `createFlowRuntime()`, and `createFrameScheduler()` with the packaged Wasm. It must construct a valid flow, accept a real semantic request, observe the accepted destination and a coherent first transition state, and then observe scheduler-driven lifecycle advancement.

A fake Runtime, fake scheduler, static fabricated snapshot, or module-loading-only witness is insufficient.

### B08 — Build-output-only browser serving

The real-browser server serves only files from production build output over a loopback-only listener. Repository source routes, including `bridge/*.mjs`, repository `_build/...`, and a repository-source `/core.wasm`, must not exist as fallbacks.

The harness preserves bounded overall and WebDriver-request timeouts, deterministic server/session/driver cleanup, real Chrome execution, and browser/driver provenance logging from the existing qualification discipline.

### B09 — Qualification-local presentation

DOM or `window` status markers used for browser observation belong only to the qualification fixture. They do not establish a production DOM projection API or a CSS, class, attribute, or custom-property schema.

The selected semantic identity remains the accepted destination during an active transition; it is not a statement of visual occupancy.

### B10 — Bounded compatibility claim

This proof establishes only one exact, lockfile-backed Vite qualification environment and the qualified real-Chrome environment. It does not establish:

- universal Vite compatibility;
- Webpack compatibility;
- Next.js or Turbopack compatibility;
- SSR or React Server Components compatibility;
- support for every browser;
- universal Wasm deployment behavior; or
- a final npm package name or version.

### Package-aware browser evidence boundaries

The required composition is:

```text
qualified repository build
  -> ADR-0011 copy-only staging
  -> local npm pack tarball
  -> isolated exact-locked Vite fixture
  -> installed package-root and public core.wasm imports
  -> caller-owned fetch and compileFlowModule(Response)
  -> createFlowRuntime and createFrameScheduler
  -> Vite production build
  -> exact emitted-Wasm provenance check
  -> build-output-only loopback server
  -> real Chrome/WebDriver
  -> observable semantic lifecycle advancement
```

Qualification must preserve package, Wasm, and server provenance mechanically. A passing browser marker alone is insufficient if repository-source fallback, a substituted artifact, dev-server behavior, hidden R3F coupling, ranged or unlocked tooling, or fabricated production seams could still satisfy the witness.

## Validation-boundary cases

The following are not part of the valid normalized trace corpus:

- negative elapsed time;
- non-finite elapsed time where representable;
- unknown/unresolvable targets;
- invalid core construction/configuration.

These are validation-failure cases under the behavioral contract.

A validation test may verify non-mutation or construction failure, but it must not reinterpret them as ordinary known-request rejection or import the reference JavaScript error surface.

## Host boundary cases

Host-specific research should separately consider cases such as:

- timestamp normalization and explicit epoch rebasing;
- browser visibility/frame scheduling policy;
- nested interactive regions;
- native-scroll release;
- event cancellation;
- focus/accessibility behavior;
- R3F frame sampling;
- React subscription/lifecycle behavior.

These are not part of the host-independent core oracle unless normalized into shared core commands and valid deltas.

## CI

CI is evidence that declared automated checks pass. It is not proof that the architecture or semantics are correct.

Required status checks will be enabled after the initial toolchain and check names are established.
