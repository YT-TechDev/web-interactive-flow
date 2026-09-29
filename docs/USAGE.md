# Usage — v0.1.0

This guide describes the public package surface selected for `web-interactive-flow@0.1.0`.

It is consumer guidance derived from the accepted repository authority and qualified implementation. It does not widen the compatibility or stability claims in the repository.

## Install

```bash
npm install web-interactive-flow
```

React Three Fiber support is optional. The v0.1.0 release evidence directly qualifies `@react-three/fiber@9.8.0`; broader peer-version compatibility is not claimed yet.

## Public package surface

### Package root

```js
import {
  applyWheelNavigationIntent,
  compileFlowModule,
  createFlowRuntime,
  createFrameScheduler,
} from "web-interactive-flow";
```

### R3F subpath

```js
import { useFlowFrame } from "web-interactive-flow/r3f";
```

### Wasm asset

```js
import wasmUrl from "web-interactive-flow/core.wasm?url";
```

The `?url` form above is the directly qualified Vite consumer path. It is not a universal bundler guarantee.

Repository files under `bridge/` and `adapters/` are implementation details unless they are reachable through the package export map. In particular, the internal DOM adapters are not public package entry points in v0.1.0.

## Browser quick start

The application owns Wasm URL resolution and fetching. WIF consumes the resulting `Response`.

```js
import wasmUrl from "web-interactive-flow/core.wasm?url";
import {
  compileFlowModule,
  createFlowRuntime,
  createFrameScheduler,
} from "web-interactive-flow";

const module = await compileFlowModule(fetch(wasmUrl));

const runtime = createFlowRuntime(module, {
  phases: ["home", "about", "contact"],
  initial: "home",
  transitionDuration: 900_000,
  cooldown: 350_000,
});

const scheduler = createFrameScheduler({
  runtime,
  requestFrame: window.requestAnimationFrame.bind(window),
  cancelFrame: window.cancelAnimationFrame.bind(window),
  onFrame(snapshot) {
    render(snapshot);
  },
});

scheduler.start();

const disposition = runtime.next();

if (disposition === "accepted") {
  console.log("moving to", runtime.getSnapshot().selected);
}

function render(snapshot) {
  // Presentation is host-owned.
  // snapshot.transition?.rawProgress is semantic raw progress, not eased progress.
  console.log(snapshot);
}

// Later:
// scheduler.stop();
// runtime.dispose();
```

With the first browser scheduler, elapsed browser time is normalized to integer microsecond quanta before `runtime.tick(dt)`. Therefore values such as `900_000` represent 900 ms in that browser-host composition. This does not establish one universal time representation for every future host.

## Runtime configuration

`createFlowRuntime(module, config)` requires:

```js
const runtime = createFlowRuntime(module, {
  phases: ["A", "B", "C"],
  initial: "A",
  transitionDuration: 500_000,
  cooldown: 100_000,
});
```

Current validated constraints include:

- `phases` is a non-empty array of unique primitive strings;
- `initial` must name one configured phase;
- `transitionDuration` and `cooldown` are finite non-negative integer quanta;
- the supplied `WebAssembly.Module` must expose the qualified WIF ABI and no unexpected imports.

Invalid configuration or incompatible Wasm fails as validation rather than being converted into a normal rejected navigation request.

## Runtime requests

The runtime exposes:

```js
runtime.next();
runtime.previous();
runtime.goTo("contact");
```

Each valid known-phase request returns one of:

```text
"accepted"
"rejected"
```

The Runtime is authoritative for request eligibility. Host code should not duplicate transition, cooldown, lock, or boundary rules in order to predict whether a request will be accepted.

An unknown `goTo()` phase is a validation failure, not a normal `"rejected"` request.

## Locking

```js
runtime.lock();
runtime.unlock();
```

Lock state is semantic Runtime state. A host may choose when to call these methods, but it must not maintain a competing lock rule that redefines Runtime truth.

## Snapshots

```js
const snapshot = runtime.getSnapshot();
```

The current snapshot shape is:

```js
{
  selected: "about",
  transition: {
    direction: "forward",
    rawProgress: 0.25,
  },
  cooldownActive: false,
  locked: false,
}
```

When no transition is active, `transition` is `null`.

Important semantic detail: during an active transition, `selected` is the accepted semantic destination. It is not a claim that the DOM, camera, mesh, or other presentation has already visually occupied that destination.

Presentation code may ease or interpolate `rawProgress`, but eased values must not be fed back into semantic eligibility or lifecycle decisions.

## Time and scheduling

### Browser scheduler

`createFrameScheduler()` owns browser scheduling and time normalization only.

```js
const scheduler = createFrameScheduler({
  runtime,
  requestFrame: window.requestAnimationFrame.bind(window),
  cancelFrame: window.cancelAnimationFrame.bind(window),
  onFrame(snapshot) {
    render(snapshot);
  },
});

scheduler.start();
scheduler.stop();
```

It advances the Runtime using normalized browser frame timestamps and then emits one current snapshot to `onFrame`.

Calling `start()` while already running is a no-op. Calling `stop()` while stopped is also a no-op.

### Manual tick

A different host may drive time explicitly:

```js
runtime.tick(dt);
```

`dt` must be a finite non-negative integer quanta value accepted by the current bridge.

Do not drive the same Runtime from multiple competing lifecycle clocks.

## Wheel ownership helper

`applyWheelNavigationIntent()` consumes a normalized `"next"` or `"previous"` intent. It does not decide raw wheel thresholds, gesture accumulation, axis dominance, or device policy.

```js
import { applyWheelNavigationIntent } from "web-interactive-flow";

element.addEventListener(
  "wheel",
  (event) => {
    const intent = normalizeWheelForMyApplication(event);
    if (intent === null) return;

    const disposition = applyWheelNavigationIntent({
      runtime,
      event,
      intent,
    });

    console.log(disposition);
  },
  { passive: false },
);
```

The helper calls the Runtime first. It calls `event.preventDefault()` only when:

- the semantic request returns `"accepted"`;
- `preventDefault` is enabled;
- the event is cancelable.

Raw wheel policy remains host-owned.

## React Three Fiber

The v0.1.0 R3F integration is intentionally small and read-only.

```jsx
import { useFlowFrame } from "web-interactive-flow/r3f";

function FlowPresentation({ runtime }) {
  useFlowFrame(runtime, (snapshot, delta) => {
    // Read semantic state and apply R3F presentation effects.
    // delta is R3F host metadata; it does not advance WIF semantic time.
    updateScene(snapshot, delta);
  });

  return null;
}
```

`useFlowFrame(runtime, callback)`:

- reads exactly one current Runtime snapshot per delivered R3F frame;
- forwards the R3F `delta` to presentation code;
- does not call `runtime.tick()`;
- does not create, start, stop, or dispose the Runtime;
- does not make R3F the lifecycle clock.

A separate WIF lifecycle-time owner is still required when semantic transitions must advance.

## Cleanup

Runtime and scheduler ownership is explicit.

```js
scheduler.stop();
runtime.dispose();
```

After `runtime.dispose()`, subsequent Runtime operations fail. Dispose the Runtime only when the caller is finished with all consumers.

R3F hook unmounting does not dispose the Runtime.

## v0.1.0 boundaries

The first release does not claim:

- stable semver compatibility beyond the first v0.1.0 surface;
- universal Vite, Webpack, Next.js/Turbopack, SSR, or React Server Components compatibility;
- broad browser compatibility beyond directly qualified environments;
- broad R3F peer-version compatibility beyond the directly qualified evidence;
- TypeScript declarations;
- CommonJS/dual-package support;
- automatic Wasm fetching or URL selection;
- public DOM adapter exports;
- Provider/context APIs;
- final Wasm ABI or serialization format.

For contributor and architecture work, repository authority remains:

1. `docs/INVARIANTS.md`
2. accepted ADRs
3. `docs/ARCHITECTURE.md` and `docs/HOST_BOUNDARIES.md`
4. `docs/TESTING.md`
5. implementation

This usage guide summarizes that authority for consumers; it does not override it.
