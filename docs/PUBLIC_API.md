# Public API

## Status

This reference describes the current repository source boundary and summarizes accepted authority; it does not replace invariants or ADRs. The repository source includes the v0.2.0 target-capable wheel boundary; registry publication is separate. As checked on 2026-09-30, npm lists only `web-interactive-flow@0.1.0`; that published artifact does not include the tagged direct-target wheel extension. Check `npm view web-interactive-flow versions --json` before relying on a release.

## Package exports

| Import | Export |
| --- | --- |
| `web-interactive-flow` | `compileFlowModule`, `createFlowRuntime`, `createFrameScheduler`, `applyWheelNavigationIntent` |
| `web-interactive-flow/r3f` | `useFlowFrame` |
| `web-interactive-flow/core.wasm` | Packaged Wasm asset |

There is no `./dom` export. Repository paths under `bridge/` and `adapters/` are not public package imports. Do not deep-import them.

## createFlowRuntime

~~~js
const runtime = createFlowRuntime(module, {
  phases: ["A", "B", "C"],
  initial: "A",
  transitionDuration: 500_000,
  cooldown: 100_000,
});
~~~

The configuration has a non-empty `phases` array of unique primitive strings, an `initial` identity in that array, and finite non-negative integer time quanta for `transitionDuration` and `cooldown`. The current bridge accepts quanta from 0 through 2,147,483,647. Invalid configuration or an incompatible Wasm module is a validation failure.

The returned Runtime exposes:

- `next()`
- `previous()`
- `goTo(phase)`
- `lock()`
- `unlock()`
- `tick(dt)`
- `getSnapshot()`
- `dispose()`

The Runtime owns semantic eligibility and lifecycle state. The caller owns Runtime lifetime.

## Runtime requests

A valid known navigation request returns `"accepted"` or `"rejected"`.

- `next()` requests the next phase in the configured order.
- `previous()` requests the previous phase.
- `goTo(phase)` requests one configured phase directly.
- Same-target, boundary, active-transition, cooldown, and locked requests are known requests whose disposition is decided by the Runtime.
- An unknown `goTo()` phase is a validation failure, not `"rejected"`.

## Runtime state

`getSnapshot()` returns exactly these top-level fields:

~~~js
{
  selected,
  transition,
  cooldownActive,
  locked,
}
~~~

`selected` is the current semantic destination. `transition` is either `null` or an object with `direction` and `rawProgress`. These two fields exist only inside an active transition object. `cooldownActive` and `locked` are booleans.

During a transition, `selected` is the accepted semantic destination; it does not report visual occupancy. A snapshot is an observation, not an eligibility oracle for a later request.

## Time

`tick(dt)` advances the semantic Runtime by finite, non-negative integer time quanta accepted by the current bridge. In the qualified browser scheduler composition these are integer microsecond quanta normalized from delivered browser frame timestamps.

`createFrameScheduler({ runtime, requestFrame, cancelFrame, onFrame })` schedules Runtime ticks and emits snapshots. The caller starts and stops it. Use one lifecycle-time owner per Runtime; do not run a competing manual or browser clock for the same Runtime.

## Wheel ownership

The current repository source accepts these normalized intents in `applyWheelNavigationIntent({ runtime, event, intent, preventDefault })`:

~~~js
const adjacentIntent = "next";
const directTargetIntent = { type: "target", target: "contact" };
~~~

A bare phase string cannot name a direct target: a configured phase may be `"next"` or `"previous"`. The tag keeps that identity distinct from adjacent navigation.

Each valid helper invocation issues exactly one Runtime request and returns its disposition unchanged. The helper does not inspect snapshots to predict eligibility. An unknown target is validated by `runtime.goTo()` and throws before any host effect. Malformed helper arguments fail before a Runtime request.

`preventDefault` defaults to `true`. The helper calls the event’s `preventDefault()` only after an `"accepted"` disposition and only if the event is cancelable. Rejections and pre-disposition failures cause no default-action effect. A `preventDefault()` exception propagates after acceptance; it does not roll back or retry the Runtime request.

Raw wheel interpretation, thresholds, accumulation, axis/device policy, direction-to-target mapping, and application topology remain caller-owned. This target-capable wheel boundary does not widen pointer or keyboard APIs.

## R3F

`useFlowFrame(runtime, callback)` is a read-only observer. For each delivered R3F frame it reads a Runtime snapshot and passes that snapshot and R3F’s `delta` to the callback. It does not call `runtime.tick()` and is not the semantic clock.

## Wasm acquisition

The caller or bundler resolves the public `web-interactive-flow/core.wasm` asset and owns fetching it. `compileFlowModule(source)` consumes a `Response` or `Promise<Response>` as supported by the current implementation. The `?url` form is qualified for the current Vite path only.

~~~js
const module = await compileFlowModule(fetch(wasmUrl));
~~~

## Cleanup

Call `scheduler.stop()` for the scheduler owned by the caller and `runtime.dispose()` when no consumers need the Runtime. R3F hook unmounting does not dispose it.

## Non-public and deferred

- No `./dom` export or public internal DOM listener implementation.
- No package deep imports into `bridge/*` or `adapters/*`.
- No public pointer recognizer/listener API or public keyboard listener API.
- No Provider/context contract.
- No universal browser, bundler, or package-manager compatibility claim.
- No final Wasm ABI or serialization promise beyond accepted evidence.
- No TypeScript declaration, CommonJS, SSR, or React Server Components contract.
- No stable semver guarantee beyond directly qualified evidence.

## Ownership matrix

| Concern | WIF Runtime | Host/application |
| --- | --- | --- |
| Selected phase | Owns | Reads |
| Eligibility and request disposition | Owns | Uses returned disposition |
| Transition lifecycle | Owns | Presents observed state |
| Cooldown | Owns | Does not duplicate |
| Lock | Owns | Calls `lock()` / `unlock()` as application policy |
| Raw progress | Owns | May map to presentation easing |
| Wheel deltas and gesture thresholds | — | Owns |
| Application topology and target mapping | — | Owns |
| DOM/R3F presentation | — | Owns |
| Wasm URL and fetch | Compiles supplied response | Resolves asset and fetches |
| Runtime lifetime | Provides `dispose()` | Owns creation and disposal |
| Scheduler lifetime | Advances supplied Runtime | Owns start and stop |

## Integration rules

- MUST treat Runtime disposition as semantic authority.
- MUST NOT predict eligibility from `getSnapshot()`.
- MUST NOT deep-import bridge or adapter internals.
- MUST NOT create a second lifecycle clock for the same Runtime.
- MUST keep presentation easing out of semantic truth.
- MUST keep raw wheel and application-topology policy caller-owned.

## Where to go deeper

- [Usage guide](USAGE.md)
- [Root README](../README.md)
- [Changelog](../CHANGELOG.md)
- [Invariants](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/INVARIANTS.md)
- [ADRs](https://github.com/YT-TechDev/web-interactive-flow/tree/main/docs/adr)
- [Architecture](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/ARCHITECTURE.md)
- [Host boundaries](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/HOST_BOUNDARIES.md)
- [Testing and evidence](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/TESTING.md)
