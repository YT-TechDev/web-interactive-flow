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
