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
