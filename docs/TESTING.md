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


## Overlapping DOM binding arbitration properties

Overlap-arbitration evidence is host-composition evidence governed by [ADR-0015](adr/0015-no-implicit-dom-binding-arbitration.md).

It is shared by the wheel and keyboard listener boundaries.

The current contract is a negative one:

> independently installed overlapping WIF DOM bindings do not gain implicit semantic arbitration from Event identity, cancellation, propagation, listener order, Runtime identity, or path position.

### OA01 — defaultPrevented is not universal ownership

Tests must preserve counterexamples showing that `defaultPrevented` reports successful browser cancellation rather than WIF semantic ownership.

At minimum, evidence should retain cases where:

- cancellation cannot succeed;
- prevention is disabled;
- a later binding intentionally maps an already-default-prevented event.

### OA02 — observation and intent production do not claim the Event

Research evidence should preserve both:

```text
inner resolver declines
outer resolver can still produce a useful request
```

and:

```text
inner produces a normalized request that Runtime rejects
outer can still produce a different accepted request
```

A first-observer or first-produced-intent claim would erase these valid fallbacks.

### OA03 — independent Runtimes remain independent

One host Event may reach bindings backed by different Runtime instances.

Qualification should preserve a witness in which both Runtimes independently accept:

```text
Runtime 1: A -> B
Runtime 2: X -> Y
```

A global Event claim must not silently couple those state machines.

### OA04 — per-Runtime accepted-only arbitration is not an implicit theorem

Research may retain the bounded positive witness:

```text
same Runtime
inner accepted A -> B
outer suppressed
final B
```

and the rejection-fallback witness:

```text
inner previous at A -> rejected
outer next -> accepted
final B
```

But qualification must also preserve the same-target registration-order counterexample.

With the same target, same Runtime, same trusted event, and opposite intents:

```text
next registered first     -> final C
previous registered first -> final A
```

Only listener order changes.

A production implementation must not silently promote DOM listener order into semantic priority.

### OA05 — Event object identity is not a one-dispatch identifier

Research should preserve a synthetic lifecycle/arbitration witness in which the same Event object is dispatched twice after the first dispatch completes.

A persistent Event/Runtime identity claim that accepts the first dispatch and suppresses the second demonstrates why WeakSet/WeakMap Event identity alone cannot be treated as one-dispatch authority.

This evidence is synthetic and must not be described as trusted physical input.

### OA06 — path proximity does not identify one binding owner

Nearest-target/composed-path policies must retain counterexamples for:

- multiple bindings sharing the same nearest EventTarget;
- nearest resolver decline with a useful ancestor fallback.

No Shadow DOM or composed-path public policy is established by this evidence.

### OA07 — propagation mutation is not semantic arbitration

Tests should preserve:

- `stopPropagation()` does not suppress later same-target listeners;
- `stopImmediatePropagation()` suppresses unrelated later listeners.

A candidate that makes duplicate navigation disappear by broad host-listener suppression has widened event-system ownership rather than proved semantic arbitration.

### OA08 — capture changes order, not ownership

Capture-phase evidence must not be interpreted as semantic winner selection.

A capture coordinator would require additional policy about resolver priority, Runtime identity, nested ownership, and fallback.

### OA09 — no hidden process-global binding registry

Mechanical/source evidence for production DOM adapters should reject hidden global registries or Event-claim tables that coordinate otherwise independent bindings.

Any future shared coordination requires explicit repository authority.

### OA10 — explicit arbitration scope remains a future direction only

Research models may demonstrate independent explicit arbitration scopes without coupling.

That does not authorize a production API.

Future work must separately justify:

- scope/group ownership;
- binding participation;
- winner priority;
- semantic-acceptance policy;
- dispatch identity;
- same-target behavior;
- nested fallback;
- lifecycle;
- Shadow DOM behavior.

### Overlap-arbitration evidence boundaries

OA01-OA10 do not establish:

- a production arbitration coordinator;
- a WeakSet/WeakMap implementation strategy;
- Event mutation markers;
- a public arbitration-group API;
- a Runtime-keyed winner policy;
- listener-order priority;
- nearest-target priority;
- capture ownership;
- propagation takeover;
- Shadow DOM/composed-path ownership;
- one semantic request per DOM Event.

Under current authority, applications that install overlapping bindings own the arbitration problem.


## DOM direct-manipulation Pointer Events properties

Direct-manipulation evidence is DOM/Web host evidence governed by [ADR-0016](adr/0016-pointer-events-direct-manipulation-substrate.md).

It selects the first event substrate and lifecycle boundary only. It does not authorize one universal gesture recognizer.

### DM01 — Trusted PointerEvent lifecycle is primary evidence

Browser ownership claims must use browser-generated trusted PointerEvents where native panning, pointer cancellation, capture, or multi-pointer behavior matters.

Synthetic PointerEvents may supplement deterministic state-machine tests, but they are insufficient evidence for browser direct-manipulation ownership.

Qualification should record at least:

- `isTrusted`;
- event type;
- `pointerId`;
- `pointerType`;
- `isPrimary`;
- coordinates;
- cancelability/defaultPrevented;
- target/currentTarget;
- capture state where meaningful;
- relevant scroll position.

### DM02 — touch-action changes browser ownership without entering Runtime semantics

Qualified browser evidence must retain the contrast:

```text
touch-action:auto
  -> native scrolling occurs
  -> pointercancel may terminate the pointer stream

touch-action:none
  -> native pan scrolling is suppressed
  -> pointer movement remains observable
  -> pointerup completes
```

An axis-specific witness such as `pan-y` may further qualify browser behavior.

The proof must not replace this host/CSS ownership with PointerEvent `preventDefault()`.

### DM03 — touch-action policy must exist before the active gesture

Qualification should preserve the timing counterexample:

```text
gesture starts under touch-action:auto
pointerdown handler changes style to none
current gesture still scrolls natively
pointercancel still occurs
```

A future implementation must not claim that changing `touch-action` after gesture start retroactively transfers browser ownership.

### DM04 — pointercancel terminates accumulated host gesture state

A canceled pointer sequence must not produce a later stale semantic request from accumulated coordinates or pointer identity.

The qualified Runtime witness preserves:

```text
touch-action:auto
native scroll
pointercancel
Runtime unchanged
semantic request count = 0
gesture state reset
```

A later fresh pointer sequence must be able to start from clean host state.

The exact future commit point remains unselected.

### DM05 — Runtime disposition remains semantic authority

Once research/caller gesture policy produces a normalized intent, pointer lifecycle observations do not predict semantic eligibility.

Qualification preserves both:

```text
next
Runtime A -> B
accepted
```

and:

```text
previous at A
Runtime -> rejected
Runtime remains A
```

No pointer/touch/CSS/capture state may replace Runtime disposition.

### DM06 — multi-pointer state is host policy

Qualification must preserve a trusted sequence containing both:

```text
touch pointer: isPrimary = true
touch pointer: isPrimary = false
```

at the same time.

This prevents `isPrimary` from becoming a false single-pointer theorem.

Earlier research recognizers used multi-pointer invalidation only as evidence infrastructure. ADR-0020 now promotes one narrow reusable single-pointer theorem: a second admitted participant creates sticky contamination until participating membership returns to zero. Broader/default multi-pointer product policy remains unselected.

### DM07 — capture owner and listener observer remain distinct

Qualification must preserve evidence that implicit pointer capture belongs to the actual pointer target rather than automatically to an ancestor observing the bubbling event.

The qualified trace observed:

```text
event.target = child
event.currentTarget = ancestor

target.hasPointerCapture(pointerId) = true
currentTarget.hasPointerCapture(pointerId) = false
```

Movement outside visual bounds remained routed to the captured target, followed by capture release.

A future test must not infer capture ownership from listener `currentTarget`.

Current evidence does not require an explicit WIF `setPointerCapture()` call.

### DM08 — pointerId is opaque browser identity

Qualification must not assume that an external input-injection identifier equals `PointerEvent.pointerId`.

The research harness initially expected that equality and failed:

```text
injected touch id = 2
browser PointerEvent.pointerId = 3
```

Tests may compare pointer identity consistently within the browser event stream, but must not manufacture cross-layer identity equivalence.

### DM09 — dual PointerEvent/TouchEvent observation remains an overlap hazard

Qualified Chrome evidence must preserve that one injected touch sequence produced both trusted PointerEvents and trusted TouchEvents.

This evidence supports one first direct-manipulation WIF substrate.

A future implementation must not bind both streams as independent navigation sources and then claim deduplication through an implicit global Event registry; ADR-0015 forbids that architecture.

Legacy Touch Events remain reference/compatibility evidence only unless later authority explicitly adds a fallback.

### DM10 — pointerType remains raw host policy

Trusted controls should retain evidence that Pointer Events represent at least:

- qualified touch input with `pointerType="touch"`;
- qualified mouse input with `pointerType="mouse"`.

Selecting Pointer Events as a substrate does not authorize one gesture policy across touch, mouse, pen, and other pointer classes.

The first research Runtime witness may decline one pointer type to prove policy placement, but that choice is not a WIF-wide default.

### DM11 — no PointerEvent cancellation theorem for pan ownership

The qualified WIF-owned `touch-action:none` Runtime witness must remain valid without calling PointerEvent `preventDefault()`.

Observed:

```text
normalized research intent = next
Runtime accepted A -> B
PointerEvent defaultPrevented = false
native pan scroll did not advance
```

This distinguishes CSS direct-manipulation ownership from wheel/keyboard accepted-only default-action suppression.

### DM12 — evidence limits stay explicit

DM01-DM11 do not establish:

- a production swipe/gesture algorithm;
- threshold or axis defaults;
- velocity/duration policy;
- reversal policy;
- pointerdown/move/up commit policy;
- pointerType allowlist;
- general/default multi-pointer product policy beyond ADR-0020's narrow single-pointer sequence lifecycle;
- explicit capture policy;
- native-control classifier;
- listener target/lifecycle API;
- one universal `touch-action` value;
- overscroll policy;
- Shadow DOM/composed-path ownership;
- Safari/iOS compatibility;
- physical-device equivalence;
- pen behavior;
- universal implicit-capture behavior;
- accessibility conformance;
- React pointer/touch API;
- package export.

Those remain later host-policy, compatibility, accessibility, adapter-API, or distribution frontiers.


## Pointer Events listener/lifecycle properties

Pointer listener/lifecycle evidence is host adapter evidence governed by [ADR-0017](adr/0017-pointer-events-listener-lifecycle.md).

It is layered on the DM01-DM12 Pointer Events substrate evidence and does not define a production swipe recognizer.

### PL01 — listener target is explicit

The binding consumes an explicitly supplied/owned `EventTarget`.

It must not silently select `window`, `document`, another global target, or an inferred direct-manipulation root.

Trusted browser evidence should preserve that a pointer stream inside the explicit target is observed while a comparable outside stream is not.

### PL02 — installed event set is bounded

The first binding installs only:

- `pointerdown`;
- `pointermove`;
- `pointerup`;
- `pointercancel`.

The listener layer does not simultaneously install legacy TouchEvent navigation bindings.

### PL03 — listener mechanics forward raw PointerEvents once

For one delivered event, the listener invokes replaceable gesture policy once.

Listener mechanics do not interpret threshold, axis, velocity, pointerType, multi-pointer count, or commit policy.

A valid policy result produces at most one normalized semantic request for that listener invocation.

### PL04 — binding cleanup terminates active gesture-policy state

Removing DOM listeners alone is insufficient when policy accumulates cross-event state.

Qualification must preserve the stale-state counterexample:

```text
target A pointerdown
remove listeners only
reuse policy on target B
matching pointerup on B
-> stale old gesture can emit a request
```

The qualified binding lifecycle must terminate active policy state during teardown.

### PL05 — pointercancel and application cleanup are independent reset paths

Qualification must separately exercise:

- browser `pointercancel`;
- explicit application cleanup.

Both terminate accumulated host gesture state.

Application cleanup must not depend on a later browser pointercancel.

### PL06 — target replacement cannot carry stale gesture state

Trusted browser qualification should preserve:

```text
target A:
  pointerdown
  pointermove

cleanup A + reset policy
bind B
complete old browser sequence
Runtime unchanged
semantic decisions = 0

fresh B sequence
-> valid normalized intent
-> Runtime request
```

The old active sequence must not complete through replacement target B.

### PL07 — DOM detachment is not cleanup

A direct listener may remain attached to a detached EventTarget.

Synthetic direct dispatch may prove this lifecycle property if it is explicitly labeled untrusted.

Qualification must not reinterpret DOM connectivity as binding disposal.

### PL08 — cleanup is isolated and repeat-safe

Cleanup removes only listeners installed by that binding.

Repeated cleanup is safe.

Unrelated host listeners and independent WIF bindings remain intact.

### PL09 — listener lifecycle preserves author CSS and host routing policy

Installing, rebinding, and cleaning up the listener must not silently mutate author `touch-action`.

The first listener/lifecycle theorem does not require an explicit `setPointerCapture()` call.

Pointer capture remains host routing state under ADR-0016.

### PL10 — semantic ownership remains Runtime-owned

The listener does not inspect Runtime snapshots to predict semantic eligibility.

Mechanical evidence may guard against listener-side use of:

- selected phase;
- transition state;
- cooldown;
- lock state;
- `runtime.getSnapshot()`.

Once gesture policy produces `next` or `previous`, the Runtime disposition remains authoritative.

### Pointer listener/lifecycle evidence boundaries

PL01-PL10 do not establish:

- a final public listener/controller API;
- public reset/abort method naming;
- a production swipe algorithm;
- threshold/axis/velocity/reversal defaults;
- commit-point policy;
- pointerType allowlist;
- general/default multi-pointer product policy beyond ADR-0020's narrow single-pointer sequence lifecycle;
- explicit capture API;
- native-control/ignore policy;
- default `touch-action`;
- overscroll policy;
- Shadow DOM/composed-path ownership;
- overlap arbitration beyond ADR-0015;
- accessibility/focus policy;
- React pointer integration;
- package export;
- broad browser/device compatibility.

Those remain later host-policy, adapter-API, accessibility, compatibility, or distribution frontiers.

## Pointer gesture disposition-feedback properties

Pointer gesture disposition-feedback evidence is host-policy/Runtime composition evidence governed by [ADR-0018](adr/0018-pointer-gesture-disposition-feedback.md).

It is layered on ADR-0016 substrate evidence and ADR-0017 listener/lifecycle evidence.

These properties describe the conditional accepted-only policy class. They do not define one WIF-wide gesture recognizer.

### PG01 — proposal emission is not accepted-only gesture commitment

Qualification must preserve a semantic rejection counterexample.

A proposal-time-commit policy must be distinguishable from semantic acceptance:

```text
Runtime C
next proposal
-> rejected
policy already committed
reverse
-> valid previous proposal is suppressed
Runtime remains C
```

A policy that promises retry/reversal after rejection must not commit merely because it emitted an intent.

### PG02 — no feedback permits duplicate accepted navigation in move-time policy

With immediate Runtime eligibility, qualification must preserve:

```text
Runtime A
same active pointer sequence
move -> next -> accepted -> B
move -> next -> accepted -> C
```

This does not violate ADR-0017's one-request-per-delivered-event theorem.

It demonstrates that one-accepted-navigation-per-sequence is a separate gesture-policy property.

### PG03 — rejected disposition may preserve retry/reversal

For the accepted-only candidate:

```text
Runtime C
next -> rejected
policy remains uncommitted
reverse
previous -> accepted
C -> B
```

The policy may commit after the accepted reversal.

The exact reversal algorithm is not standardized by this property.

### PG04 — accepted disposition may consume the active sequence

For the accepted-only candidate:

```text
Runtime A
next -> accepted -> B
policy commits
later same-sequence movement/reversal
-> no second semantic request
```

This property is conditional on selecting the one-accepted-navigation-per-sequence policy contract.

### PG05 — disposition feedback is narrow

Qualification must be able to implement accepted-only commitment without reading Runtime snapshots.

The host-policy path may observe the authoritative:

```text
accepted | rejected
```

result.

It must not require policy-side mirrors of:

- selected phase;
- transition state;
- cooldown;
- lock state;
- `runtime.getSnapshot()`.

### PG06 — semantic and host ownership remain separated

The Runtime does not receive PointerEvent objects or gesture-policy state and does not directly mutate gesture policy.

Listener mechanics do not acquire:

- threshold;
- axis;
- reversal;
- gesture identity;
- commit-point semantics.

Disposition observation is host composition around the existing Runtime result, not a second semantic owner.

### PG07 — termination and failure remain distinct

`pointercancel` and application-driven binding cleanup reset active accepted-only gesture state under ADR-0017.

A Runtime failure/validation path that produces no disposition must remain distinct from normal `rejected` feedback.

Qualification must not silently convert failure-before-disposition into semantic rejection.

### PG08 — alternative recognizers remain policy choices

A pointerup-only policy may naturally emit at most one request because it waits until pointerup.

That is valid comparative evidence, not proof that pointerup-only recognition is a universal WIF default.

Move-time, pointerup-only, and other recognizers remain replaceable host policy unless separately standardized by evidence.

### Pointer gesture disposition-feedback evidence boundaries

PG01-PG08 do not establish:

- a final public feedback callback/method;
- a transaction/result API;
- a production reusable gesture recognizer;
- threshold/axis/velocity/duration defaults;
- a universal reversal algorithm;
- pointerType allowlist;
- general/default multi-pointer product policy beyond ADR-0020's narrow single-pointer sequence lifecycle;
- native-control/ignore classification;
- explicit capture API;
- default `touch-action`;
- Shadow DOM/composed-path ownership;
- accessibility/focus policy;
- React pointer integration;
- package export;
- physical-device equivalence;
- broad browser/device compatibility.

The actual Runtime/Wasm browser composition used synthetic/untrusted PointerEvents in Chrome 153 / ChromeDriver 153. It proves the semantic feedback composition only, not trusted physical-input or browser-default-action behavior.

## Pointer disposition-feedback placement properties

Pointer disposition-feedback placement evidence is governed by [ADR-0019](adr/0019-pointer-listener-synchronous-disposition-feedback.md).

It is layered on ADR-0017 listener/lifecycle authority and ADR-0018 accepted-only gesture feedback semantics.

These properties qualify transaction placement and ordering. They do not define a production gesture recognizer or final public feedback method.

### PS01 — feedback is request-origin scoped

Only a Runtime request issued because the current pointer policy produced a normalized intent may feed disposition back to that policy.

Qualification must preserve the shared-decoration counterexample:

```text
shared decorated Runtime
unrelated programmatic next
-> accepted
-> pointer policy notified
```

That behavior is invalid for pointer-origin feedback.

A direct request through the original Runtime outside the pointer binding must not notify pointer policy.

### PS02 — feedback is synchronous

For the first production placement, disposition feedback occurs in the same listener/request call stack after Runtime returns.

Qualification must preserve the deferred-feedback counterexample:

```text
gesture A accepted
feedback queued
pointercancel/reset
gesture B begins
old feedback delivered
-> B becomes committed
```

A future asynchronous seam requires separate identity/lifetime evidence.

### PS03 — intent plus disposition are sufficient

The feedback path must be able to preserve the accepted-only reversal trace with only:

```text
next | previous
+
accepted | rejected
```

It must not require the original PointerEvent.

### PS04 — Runtime snapshots remain unnecessary

Qualification must not require policy feedback to inspect or mirror:

- selected phase;
- transition;
- cooldown;
- lock;
- `runtime.getSnapshot()`.

Runtime remains the sole semantic eligibility owner.

### PS05 — listener routing does not own gesture interpretation

A listener-mediated candidate may route intent/disposition while policy alone owns:

- threshold;
- coordinates;
- pointer identity;
- reversal;
- accepted-only commit state.

Routing the transaction result must not introduce those semantics into generic listener mechanics.

### PS06 — Runtime failure before disposition produces no feedback

If a Runtime request fails before returning `accepted` or `rejected`, no semantic disposition feedback is delivered.

The failure must not be fabricated as `rejected`.

### PS07 — feedback failure does not rewrite semantic disposition

Qualification must preserve ordering:

```text
Runtime accepted
semantic state changed
feedback invoked
feedback throws
```

The later host-layer failure must remain distinguishable from semantic rejection.

### PS08 — proposal identity is not required for synchronous routing

A proposal/transaction object may be compared as research evidence, but the selected synchronous one-event/one-request placement must not require widening `policy.handle(event)` solely to attach identity unless new evidence demands it.

### PS09 — shared Runtime decoration is not the selected production seam

A strictly binding-local Runtime facade may prove composability, but qualification must distinguish it from a reusable/shared decorated Runtime.

The production placement should structurally preserve origin scope rather than rely on a general Runtime wrapper never escaping.

### Pointer disposition-feedback placement boundaries

PS01-PS09 do not establish:

- final feedback callback/method name;
- optional capability representation;
- exact error strings;
- final feedback-failure exception API;
- production gesture recognizer;
- threshold/axis/velocity/duration/reversal defaults;
- pointerType admission and multi-pointer behavior beyond ADR-0020's narrow single-pointer sequence lifecycle;
- native-control/ignore classification;
- explicit capture API;
- default `touch-action`;
- React pointer integration;
- package export;
- asynchronous feedback or transaction identity;
- core/Wasm changes.

## Pointer single-sequence lifecycle properties

Reusable single-pointer sequence-lifecycle evidence is governed by [ADR-0020](adr/0020-pointer-single-sequence-lifecycle.md).

These properties qualify a narrow host-policy state machine layered on ADR-0016 through ADR-0019.

They do not define a complete gesture recognizer.

### GS01 — isPrimary is not single-pointer proof

Qualification must preserve a counterexample where a primary pointer remains active while a non-primary admitted pointer also participates.

A policy that observes only primary events must not be treated as sufficient evidence that the sequence was single-pointer.

### GS02 — first-pointer-only ignoring exposes stale commit

Qualification must preserve the counterexample:

```text
pointer 1 down
pointer 1 candidate movement
pointer 2 down
pointer 2 up
pointer 1 up
-> stale navigation emitted
```

For a policy claiming single-pointer semantics, later admitted participating pointers cannot simply be ignored.

### GS03 — second admitted pointer creates sticky contamination

When a second admitted participating pointer becomes active before the current set reaches zero, the candidate sequence becomes invalid.

That invalidation remains sticky while any admitted participant from the contaminated set remains active.

### GS04 — two active to one active does not revive the sequence

After contamination, reducing participating membership from two to one must not restore eligibility.

The remaining already-down pointer does not become a fresh sequence.

### GS05 — fresh restart requires zero membership plus fresh pointerdown

A contaminated sequence may reset after admitted participating membership reaches zero.

The next eligible sequence begins from a later fresh admitted pointerdown.

No already-down remainder is promoted.

### GS06 — cancellation does not promote a remaining pointer

If a tracked participant is canceled while another admitted participant remains active, the remainder does not become a new eligible tracked pointer.

The contaminated sequence remains invalid until admitted participating membership reaches zero.

### GS07 — pointerId reuse after reset inherits no state

A fresh sequence may reuse a numeric pointerId previously observed in a completed sequence.

Qualification must show that prior tracked, candidate, contaminated, or commitment state does not carry across full reset.

No global/permanent pointerId theorem is required.

### GS08 — non-tracked participating terminal events update membership

If reset depends on active participating membership, `pointerup` and `pointercancel` from admitted non-tracked participants must be accounted for.

This bookkeeping must not produce semantic requests by itself.

### GS09 — pointer admission remains independent policy

Qualification may inject a participation predicate and show that the sequence theorem works without standardizing pointerType.

This property does not select touch, mouse, pen, or isPrimary product behavior.

### GS10 — explicit pointer capture is not required for sequence identity

The sequence theorem must not require `setPointerCapture()` or `releasePointerCapture()` merely to maintain host pointer membership.

Capture remains host routing state under ADR-0016.

### GS11 — semantic commitment and host membership remain separate

Accepted case for an accepted-only policy:

```text
pointer remains active
Runtime returns accepted
policy semantic commitment = true
host membership still active
```

Rejected case:

```text
pointer remains active
Runtime returns rejected
policy semantic commitment = false
proposal state cleared
later policy-defined proposal remains possible
```

Runtime disposition must not rewrite active-pointer membership.

### GS12 — application abort clears reusable sequence state

Application abort must immediately clear accumulated reusable gesture state.

Binding cleanup must terminate accumulated reusable gesture state before that policy can participate in a later binding.

At minimum this includes active membership, tracked-pointer identity, contamination, and candidate state.

### GS13 — malformed pre-sequence events do not invent a valid sequence

Bounded deterministic qualification may inject:

- move before down;
- up before down;
- cancel before down;
- duplicate down;
- duplicate terminal event.

The policy should not invent or resurrect a valid sequence from terminal/move input without a fresh admitted down.

Duplicate down for an already-active admitted pointer may conservatively invalidate the current sequence.

This property is defensive state-machine evidence, not physical-browser delivery authority.

### GS14 — Runtime remains free of pointer sequence state

Qualification must use the production listener while keeping Runtime requests free of:

- pointerId;
- PointerEvent objects;
- active-pointer sets;
- tracked pointer;
- contamination flags;
- gesture-state objects.

No Runtime snapshot read is required for sequence identity.

### Pointer single-sequence lifecycle evidence boundaries

GS01-GS14 do not establish:

- swipe threshold;
- x/y axis;
- diagonal policy;
- reversal behavior;
- move-time versus pointerup proposal strategy;
- velocity/duration;
- pointerType allowlist;
- mouse/pen behavior;
- native-control/ignore classification;
- preventDefault policy;
- default `touch-action`;
- explicit capture API;
- Shadow DOM/composed-path behavior;
- accessibility/focus policy;
- production recognizer API;
- React integration;
- package export;
- core/Wasm changes.

## Pointer displacement measurement properties

Reusable pointer displacement evidence is governed by [ADR-0021](adr/0021-pointer-start-relative-displacement.md).

These properties qualify only the host-policy measurement theorem layered after ADR-0020 sequence validity.

They do not define a threshold, direction mapping, proposal timing, or complete recognizer.

### PD01 — start-relative displacement differs from per-event step displacement

Qualification must preserve a trace where no individual movement step crosses a research threshold but total start-relative displacement does.

Example:

```text
200 -> 185 -> 170 -> 155 -> 140

per-step = 15
final start-relative delta = +60
```

The research threshold value is evidence infrastructure only, not a default.

### PD02 — path length is not directional displacement

Qualification must preserve an out-and-back trace:

```text
200 -> 120 -> 200

absolute path = 160
final start-relative delta = 0
```

A large traveled path must not be confused with final signed start displacement.

### PD03 — deterministic endpoint displacement is independent of intermediate sample count

Sparse and dense deterministic traces with identical projected baseline/current values must yield identical final start-relative displacement.

This property must not be generalized into browser coalescing, physical sampling, timing, or performance equivalence.

### PD04 — displacement is downstream of ADR-0020 sequence validity

Qualification must preserve both:

1. a naive measurement-only policy that can emit a stale proposal after an ignored second-pointer interval;
2. an ADR-0020-composed policy that suppresses measurement-derived intent after contamination until participating membership reaches zero and a fresh admitted pointerdown begins.

Measurement validity must not replace sequence contamination semantics.

### PD05 — projection convention is stable across compared samples

Qualification must show that changing projection origin, scale, or orientation between baseline and current sample can manufacture or distort displacement.

Authority is limited to samples compared under one stable scalar projection convention.

This property does not select a DOM coordinate frame.

### PD06 — stable translation cancels

A stable constant translation applied to both baseline and current sample must preserve displacement:

```text
(start + c) - (current + c)
= start - current
```

This does not authorize mid-sequence translation drift.

### PD07 — stable scale/orientation remain deterministic in projected units

Qualification may show that stable scale/orientation produces deterministic signed displacement.

It must keep explicit that:

- scale changes magnitude/units;
- orientation may invert sign;
- one threshold or sign mapping cannot be generalized across projectors from this evidence.

### PD08 — baseline, current sample, and computed difference are finite

A valid measurement must require all of:

```text
finite startProjected
finite currentProjected
finite (startProjected - currentProjected)
```

Qualification must preserve evidence for:

- NaN baseline rejection;
- ±Infinity baseline rejection;
- non-finite current sample rejection;
- finite endpoints whose subtraction overflows to a non-finite result.

Exact validation/error representation remains outside this property.

### PD09 — sequence validity and measurement validity remain distinct

A non-finite baseline may make displacement measurement unavailable without inventing ADR-0020 multi-pointer contamination.

Qualification must not collapse measurement invalidity into Runtime semantic rejection either.

### PD10 — sign-to-intent mapping remains separate host policy

Qualification must preserve that the same physical movement under stable opposite projector orientations yields opposite displacement signs.

Therefore this theorem does not define:

```text
positive -> next
negative -> previous
```

or the reverse.

### PD11 — measurement does not commit direction

A later sample may reverse current signed start-relative displacement.

Qualification must distinguish displacement observation from semantic gesture commitment.

For accepted-only policy classes, semantic commitment remains governed separately by ADR-0018.

### PD12 — move-time and pointerup-only policies may share one measurement definition

Qualification must preserve that both timing classes can evaluate:

```text
delta = startProjected - currentProjected
```

The measurement theorem does not select when an intent is proposed.

### PD13 — Runtime and generic listener remain free of coordinate/displacement state

Qualification must use the production pointer listener while ensuring Runtime requests receive no:

- PointerEvent;
- pointer coordinates;
- projector;
- coordinate-frame metadata;
- projected values;
- displacement object;
- finite-validation state.

No Runtime snapshot read is required.

The generic listener must not acquire coordinate projection, finite validation, threshold, mapping, or proposal-timing semantics.

### PD14 — cancellation clears baseline and permits fresh restart

After `pointercancel`:

- old projected baseline is cleared;
- stale old-pointer movement cannot produce a request;
- a fresh eligible pointerdown on the same binding may establish a new baseline;
- later valid movement may produce normalized intent.

### PD15 — application abort clears baseline and permits a later projection convention

Binding cleanup/application abort terminates accumulated measurement state.

A later fully fresh sequence may establish a different projection convention before capturing its new baseline.

The new convention must remain stable across samples compared inside that active measurement.

### Pointer displacement evidence boundaries

PD01-PD15 do not establish:

- `clientX` / `clientY` authority;
- viewport/document/local coordinate equivalence;
- coordinate units;
- X/Y default;
- diagonal interpretation;
- threshold numeric default;
- exact threshold comparator;
- sign-to-intent mapping;
- direction locking;
- reversal commitment;
- move-time vs pointerup proposal/commit default;
- velocity/duration;
- pointerType allowlist;
- physical-device sampling behavior;
- browser coalescing behavior;
- CSS/layout-transform invariance;
- devicePixelRatio/zoom independence;
- cross-browser coordinate precision;
- production recognizer API;
- React integration;
- package export;
- core/Wasm changes.

## Pointer threshold policy properties

Pointer threshold qualification evidence is governed by [ADR-0022](adr/0022-pointer-threshold-policy-boundary.md).

These properties qualify only threshold ownership/unit behavior layered after ADR-0021 displacement.

They do not define a numeric default, comparator, validation API, symmetry rule, sign mapping, proposal timing, or production recognizer.

### PT01 — one numeric threshold is not projection-scale invariant

Qualification must preserve a case where the same numeric threshold classifies the same movement relation differently after a stable projection scale change.

Example:

```text
delta = 30
threshold = 40
-> miss

scaled delta = 60
same threshold = 40
-> cross
```

No universal projected unit is inferred.

### PT02 — coherent scaling is bounded candidate evidence

For a tested candidate, scaling both displacement and threshold by the same positive factor may preserve the crossing relation away from exact numeric-boundary representation effects.

This property must not be generalized into universal symmetric-threshold authority.

### PT03 — host normalization does not require Runtime ownership

Qualification may express relative threshold policy through stable host normalization.

Runtime must not receive normalization extent, projected unit metadata, or threshold values.

This property does not select viewport/layout normalization.

### PT04 — exact normalized boundary classification may diverge numerically

Qualification must preserve the floating-point boundary witness:

```text
rawStart = 400
rawCurrent = 340
rawThreshold = 60

raw strict comparison:
60 > 60
-> false

stableExtent = 400
normalized comparison:
(400 / 400 - 340 / 400) > (60 / 400)
0.15000000000000002 > 0.15
-> true
```

See PTH-H3 in `tests/research/pointer_threshold_semantics.test.mjs`.

This property prevents claims that arbitrary normalization preserves exact threshold equality semantics.

### PT05 — changing only threshold can change qualification

With displacement unchanged, qualification must distinguish different threshold values.

For a policy class claiming one fixed threshold during an active measurement, threshold sampling/stability must therefore be explicit.

Adaptive/dynamic threshold remains outside this property.

### PT06 — strict and inclusive comparators diverge at equality

Qualification must preserve:

```text
delta = threshold

abs(delta) > threshold
-> miss

abs(delta) >= threshold
-> cross
```

No comparator is selected as repository-wide default.

### PT07 — zero semantics depend on comparator

Qualification must preserve the `delta = 0`, `threshold = 0` distinction between strict and inclusive comparison.

Threshold-domain semantics must not be frozen independently of equality/comparator policy.

### PT08 — negative/non-finite threshold values are degenerate for the tested magnitude candidate

Qualification must preserve explicit observations for NaN, +Infinity, -Infinity, and negative finite threshold values.

These observations must not be rewritten into one WIF-wide public validation contract.

### PT09 — symmetric threshold is not universal

Qualification must preserve an asymmetric directional-bound counterexample where one sign crosses and the opposite sign of equal magnitude misses.

This property does not select asymmetric thresholds as default.

### PT10 — threshold miss produces no Runtime request

Using production `bindPointerNavigation()`, a below-threshold host policy result must produce no normalized intent and no Runtime call.

A threshold miss is not semantic `rejected`.

### PT11 — threshold crossing is not semantic acceptance authority

Threshold-crossing host policy may produce a normalized intent, but semantic acceptance/rejection and accepted-only commitment remain governed by ADR-0018/ADR-0019.

A recording Runtime stub may prove disposition forwarding only; it must not be described as independent proof of real Runtime semantic rejection.

### PT12 — Runtime and generic listener remain free of threshold state

Qualification must keep threshold evaluation inside replaceable host policy.

Runtime requests must contain no:

- threshold;
- displacement;
- comparator;
- directional bound;
- projected unit;
- normalization extent.

No Runtime snapshot is required.

The generic pointer listener must not acquire threshold comparison semantics.

### Pointer threshold evidence boundaries

PT01-PT12 do not establish:

- numeric threshold default;
- legacy `50`;
- strict or inclusive comparator;
- exact equality default;
- zero default semantics;
- public finite/non-negative validation;
- NaN/Infinity sentinel API;
- symmetric/asymmetric default;
- fixed/adaptive threshold default;
- coordinate property/frame/unit;
- X/Y default;
- diagonal policy;
- sign-to-intent mapping;
- reversal commitment;
- proposal timing;
- velocity/acceleration;
- pointerType policy;
- physical-device ergonomics;
- accessibility suitability;
- cross-browser gesture-feel equivalence;
- production recognizer API;
- React integration;
- package export;
- core/Wasm changes.

## Pointer intent-mapping properties

Pointer sign-to-intent mapping evidence is governed by [ADR-0023](adr/0023-pointer-intent-mapping-boundary.md).

These properties qualify only the host mapping boundary layered after ADR-0021 displacement and ADR-0022 threshold qualification.

They do not define a projector orientation, axis default, semantic sign default, total mapper, proposal timing, or production recognizer.

### IM01 — one sign does not have projector-independent semantic meaning

Qualification must preserve the same physical movement under opposite stable projectors yielding opposite displacement signs.

With one unchanged mapper, normalized proposal must therefore be able to reverse.

This property prevents `positive -> next` from becoming universal authority.

### IM02 — jointly inverted projector and mapper may preserve normalized intent

Qualification must preserve tested movements where:

```text
P + mapper A
```

and:

```text
-P + inverted mapper B
```

produce the same normalized intent.

This is orientation/mapping covariance evidence only.

It does not define one physical-direction UX rule.

### IM03 — one measured displacement can feed independent mappers

Qualification must preserve one unchanged signed displacement consumed by at least two independent mapping conventions that produce different normalized intents.

Measurement must not be rewritten merely because semantic mapping differs.

### IM04 — threshold miss reaches neither mapper nor Runtime

Using production `bindPointerNavigation()`, below-threshold movement must be able to produce:

```text
no mapper invocation
no normalized intent
no Runtime request
```

This preserves threshold qualification and sign mapping as distinct host-policy responsibilities.

### IM05 — zero does not silently fall through to one sign branch

Qualification must explicitly distinguish zero from positive and negative directional displacement.

A binary fallback that maps every non-positive value to one semantic direction is insufficient evidence.

The final public zero/no-mapping representation remains deferred.

### IM06 — changing only mapping changes proposal

Qualification must preserve an unchanged eligible displacement interpreted by two different mappers with different normalized results.

It must also preserve the stronger active-sequence witness:

- same pointer;
- same baseline;
- same current coordinate;
- same displacement;
- mapper changes between observations;
- later normalized proposal changes.

For a policy class claiming one stable mapping during an active measurement, stability must therefore be explicit.

Adaptive/dynamic mapping remains outside this property.

### IM07 — current mapping is not semantic commitment

Qualification must preserve reversal such as:

```text
+60 -> next
-70 -> previous
+60 -> next
```

without mapping-level commitment state.

For accepted-only policy classes, semantic commitment remains governed by ADR-0018.

### IM08 — mapping does not predict Runtime disposition

Qualification may use recording Runtime responses to prove that one mapped normalized request is routed without Runtime snapshot prediction.

Recording stubs must not be described as independent proof of real Runtime semantic rejection.

Actual semantic disposition authority remains ADR-0018/ADR-0019 and the Runtime.

### IM09 — generic pointer listener forwards normalized intent to Runtime

The listener receives pointer events and passes them to `policy.handle(event)`.

Using production `bindPointerNavigation()`, qualification must keep the listener unaware of:

- displacement sign;
- displacement value;
- projector orientation;
- mapper;
- axis;
- threshold.

The listener forwards only normalized `next | previous` produced by policy to Runtime.

### IM10 — Runtime receives no mapping metadata

Runtime requests must contain no:

- sign;
- displacement;
- projector orientation;
- mapping convention;
- axis;
- threshold.

No Runtime snapshot is required for sign mapping.

### IM11 — total or symmetric mapping is not universal

Qualification must preserve partial mapper counterexamples such as positive-only and negative-only mappings.

This property does not select partial mapping as default.

### IM12 — axis identity remains upstream

Equivalent scalar deltas produced by independent X-like and Y-like projectors may be consumed by the same mapper without axis identity.

This property does not establish equal UX or physical semantics across axes.

### Pointer intent-mapping evidence boundaries

IM01-IM12 do not establish:

- projector orientation;
- `clientX` / `clientY`;
- X/Y default;
- diagonal policy;
- positive -> next;
- negative -> previous;
- total/symmetric/bijective mapper;
- partial/one-sided mapper default;
- fixed/adaptive mapping default;
- threshold default/comparator;
- zero-threshold semantics;
- reversal commitment;
- proposal timing;
- writing-mode behavior;
- RTL/LTR mapping;
- pointerType policy;
- accessibility suitability;
- device ergonomic preference;
- production recognizer API;
- React integration;
- package export;
- core/Wasm changes.


## Pointer proposal-timing properties

Pointer proposal-timing evidence is governed by [ADR-0024](adr/0024-pointer-proposal-timing-boundary.md).

These properties qualify only the host timing boundary layered around otherwise eligible normalized pointer proposals.

They do not select a move-time/pointerup-time default, reversal commitment, request-cardinality policy, or production recognizer.

### PTM01 — move-time and pointerup-time are observably distinct

Qualification must preserve at least one sequence that crosses the tested eligibility boundary before pointerup.

Under otherwise equivalent measurement/qualification/mapping:

- move-time may issue a normalized request on the qualifying move;
- pointerup-time issues no request until the terminal pointerup opportunity.

This property does not prefer either class.

### PTM02 — timing does not redefine displacement, qualification, or mapping

Qualification must be able to reuse the same start-relative displacement algebra, threshold qualifier, and sign mapper under both timing classes.

Equivalent eligible displacement may produce the same normalized intent despite different proposal event boundaries.

### PTM03 — proposal event does not establish Runtime acceptance

Qualification must keep proposal timing independent from Runtime disposition.

A recording Runtime may return `accepted` or `rejected` for the same routed normalized request without changing timing policy.

Recording stubs establish separation/routing only; actual Runtime eligibility remains existing semantic authority.

### PTM04 — move-time proposal does not itself commit the gesture

Qualification must preserve an uncommitted move-time case where a rejected proposal can be followed by later qualifying movement, including a later opposite mapped direction.

Accepted-only commitment remains a separate policy governed by ADR-0018/ADR-0019.

### PTM05 — cancellation can distinguish timing classes

Qualification must preserve a threshold-crossing sequence cancelled before pointerup where:

- move-time may already have emitted a proposal;
- pointerup-time does not manufacture a terminal pointerup proposal from `pointercancel`.

This does not define a universal cancellation UX beyond host lifecycle authority.

### PTM06 — changing only timing can change request schedule/cardinality

For identical delivered pointer samples and unchanged measurement/qualification/mapping, qualification must preserve at least one case where move-time and pointerup-time produce different Runtime request schedules or counts.

This property does not define the final cardinality contract.

### PTM07 — generic pointer listener remains timing-agnostic

Using production `bindPointerNavigation()`, qualification must keep the listener unaware of:

- move-time versus pointerup-time;
- displacement;
- threshold;
- mapping;
- reversal;
- semantic commitment.

The listener forwards only normalized intent returned for the currently delivered event.

### PTM08 — Runtime receives no timing or PointerEvent metadata

Runtime requests must carry no proposal-timing class, PointerEvent object, event type, or pointer coordinate.

No Runtime snapshot is required to choose proposal timing.

### PTM09 — terminal reversal remains distinct from timing

Qualification must preserve a sequence where an earlier eligible move direction differs from the terminal eligible direction.

Move-time may expose the earlier direction while pointerup-time may expose the terminal direction.

This evidence must not be generalized into reversal commitment or direction-locking authority.

### PTM10 — accepted-only move-time composition does not require pointerup-only timing

Qualification must include both accepted and rejected disposition controls for the same move-time policy class.

After `accepted` feedback, an accepted-only research policy may commit and suppress later proposals.

Under otherwise equivalent `rejected` feedback, it must remain uncommitted and may continue to surface later eligible proposals.

This proves only that one-request/one-accepted-navigation behavior can be composed from timing plus commitment policy; it does not select that composition as the production recognizer.

### Pointer proposal-timing evidence boundaries

PTM01-PTM10 do not establish:

- move-time default;
- pointerup-time default;
- another default proposal event;
- universal request cardinality;
- reversal commitment;
- direction locking;
- retry policy;
- velocity/acceleration;
- threshold default/comparator;
- projector orientation;
- X/Y or diagonal policy;
- sign-to-intent default;
- pointerType policy;
- writing-mode behavior;
- RTL/LTR mapping;
- physical-device equivalence;
- accessibility suitability;
- native-scroll / `touch-action` policy;
- pointer capture policy;
- production recognizer API;
- React integration;
- package export;
- core/Wasm changes.


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
