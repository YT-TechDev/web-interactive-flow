# Usage

This practical guide describes the current repository source boundary, including the v0.2.0 target-capable wheel ownership extension. For an export summary and ownership matrix, see [PUBLIC_API.md](PUBLIC_API.md). As checked on 2026-09-30, npm lists only web-interactive-flow@0.1.0; that published artifact does not include the tagged direct-target extension. Repository source and npm publication are separate.

## Install

~~~sh
npm install web-interactive-flow
npm view web-interactive-flow versions --json
~~~

Check the registry for the version you intend to use. A source checkout or tag does not establish that a version is published.

React Three Fiber is optional. The directly qualified package fixture used @react-three/fiber 9.8.0; broader peer-version compatibility is not claimed.

## Public package surface

~~~js
import {
  applyWheelNavigationIntent,
  compileFlowModule,
  createFlowRuntime,
  createFrameScheduler,
} from "web-interactive-flow";

import { useFlowFrame } from "web-interactive-flow/r3f";
import wasmUrl from "web-interactive-flow/core.wasm?url";
~~~

The root exposes the four named functions shown above. The `./r3f` subpath exposes only `useFlowFrame`; `./core.wasm` exposes the packaged Wasm asset. There is no `./dom` subpath. Repository files under `bridge/` and `adapters/` are not public imports, and package deep imports are unsupported.

The `?url` Wasm import is qualified for the current Vite fixture only. It is not a universal bundler guarantee.

## Wasm acquisition

The application or its bundler resolves the packaged Wasm asset and owns the fetch. `compileFlowModule()` accepts a `Response` or `Promise<Response>` as supported by the current implementation.

~~~js
import wasmUrl from "web-interactive-flow/core.wasm?url";
import { compileFlowModule } from "web-interactive-flow";

const module = await compileFlowModule(fetch(wasmUrl));
~~~

WIF does not select a URL, fetch automatically, apply CDN policy, or maintain a global asset cache.

## Browser quick start

~~~js
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
  console.log(runtime.getSnapshot().selected);
}

function render(snapshot) {
  // Presentation is host-owned. Raw progress remains semantic state.
  console.log(snapshot);
}

// When this owner is finished:
scheduler.stop();
runtime.dispose();
~~~

The `?url` form is qualified for the repository’s Vite path. The browser scheduler normalizes delivered browser timestamps to integer microsecond quanta before calling `runtime.tick(dt)`. Values such as `900_000` represent 900 ms in this scheduler composition.

## Runtime configuration

`createFlowRuntime(module, config)` uses this configuration shape:

~~~js
const runtime = createFlowRuntime(module, {
  phases: ["A", "B", "C"],
  initial: "A",
  transitionDuration: 500_000,
  cooldown: 100_000,
});
~~~

- `phases` is a non-empty array of unique primitive strings.
- `initial` must name one configured phase.
- `transitionDuration` and `cooldown` are finite, non-negative integer time quanta in the supported range.
- The supplied Wasm module must expose the qualified WIF ABI and no unexpected imports.

Invalid configuration or an incompatible module fails validation; it is not a rejected navigation request.

## Runtime requests

The Runtime exposes:

~~~js
runtime.next();
runtime.previous();
runtime.goTo("contact");
runtime.lock();
runtime.unlock();
~~~

Each valid known navigation request returns `"accepted"` or `"rejected"`. The Runtime decides eligibility, including phase boundaries, same-target requests, active transitions, cooldown, and lock. Do not predict acceptance from a snapshot or duplicate these rules in host code.

`goTo()` with an unknown phase identity is a validation failure. It does not return `"rejected"`.

## Request disposition vs validation failure

A disposition is the Runtime’s result for a valid known request:

- `"accepted"` means the Runtime accepted the request.
- `"rejected"` means it declined a valid known request under its current semantic state.

Validation failure means the input cannot form a valid Runtime request, such as an unknown phase identity or malformed helper input. Validation failures throw in the current JavaScript bridge; exact error classes and wording are not a public contract.

For a tagged wheel target, target identity validation occurs through `runtime.goTo(target)`. If that call fails, the helper performs no default-action effect.

## Snapshots

Read current Runtime state with `runtime.getSnapshot()`:

~~~js
{
  selected: "about",
  transition: {
    direction: "forward",
    rawProgress: 0.25,
  },
  cooldownActive: false,
  locked: false,
}
~~~

When no transition is active, `transition` is `null`. While a transition is active, `selected` is the accepted semantic destination; it does not claim that the DOM, camera, mesh, or other presentation has visually arrived.

Snapshots report current semantic state. They do not authorize host code to predict whether the next request will be accepted. Presentation may ease `rawProgress`, but eased values must not determine semantic eligibility or lifecycle completion.

## Time and scheduler ownership

`createFrameScheduler()` owns browser frame scheduling and time normalization for the supplied Runtime. It calls `runtime.tick(dt)` and then passes one current snapshot to `onFrame`.

~~~js
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
~~~

A different host may advance time explicitly with `runtime.tick(dt)`. The current bridge accepts finite, non-negative integer time quanta. Do not drive one Runtime from both the browser scheduler and another lifecycle clock. R3F’s frame delta is presentation metadata and does not advance WIF semantic time.

## Wheel ownership helper

The v0.2.0 source boundary extends `applyWheelNavigationIntent()` to accept one normalized intent:

~~~js
const normalizedIntents = [
  "next",
  "previous",
  { type: "target", target: "contact" },
];
~~~

A direct target is tagged because a configured phase identity may itself be `"next"` or `"previous"`:

~~~js
const adjacentIntent = "next"; // calls runtime.next()
const directTargetIntent = { type: "target", target: "next" }; // calls runtime.goTo("next")
~~~

The helper makes exactly one Runtime request per valid invocation and returns its disposition unchanged. It does not predict eligibility, retry, queue, replay, or synthesize adjacent steps.

~~~js
import { applyWheelNavigationIntent } from "web-interactive-flow";

const disposition = applyWheelNavigationIntent({
  runtime,
  event,
  intent: { type: "target", target: "contact" },
});
~~~

For `"accepted"`, the helper calls `event.preventDefault()` only when the `preventDefault` option is enabled (it defaults to `true`) and the supplied event is cancelable. For `"rejected"`, it does not call `preventDefault()`. Malformed helper inputs fail before a Runtime request; an unknown direct target fails through `runtime.goTo()` before any default-action effect. If `preventDefault()` throws after acceptance, the exception propagates; the accepted semantic request is not rolled back or retried.

The caller owns raw wheel interpretation, including delta handling, thresholds, accumulation, axis policy, gesture feel, and direction-to-target mapping. Application topology is also caller-owned. This helper does not add public pointer or keyboard ownership APIs.

## React Three Fiber

The optional `web-interactive-flow/r3f` subpath exposes `useFlowFrame(runtime, callback)`.

~~~jsx
import { useFlowFrame } from "web-interactive-flow/r3f";

function FlowPresentation({ runtime }) {
  useFlowFrame(runtime, (snapshot, delta) => {
    // Read semantic state and apply R3F presentation effects.
    // delta is host metadata; it does not advance WIF semantic time.
    updateScene(snapshot, delta);
  });
  return null;
}
~~~

The hook reads one current snapshot per delivered R3F frame and forwards R3F’s delta to the callback. It does not call `runtime.tick()`, create or dispose the Runtime, or become a semantic clock. A separate caller-owned lifecycle-time source is required when transitions must advance.

## Cleanup

Runtime and scheduler ownership stays with the application:

~~~js
scheduler.stop();
runtime.dispose();
~~~

Dispose the Runtime when all consumers are finished with it. After disposal, later Runtime operations fail. Unmounting the R3F hook does not dispose the Runtime.

## Compatibility and nonclaims

The directly qualified evidence covers one exact Vite package-consumer path, a real-Chrome package composition, and the directly qualified R3F fixture. It does not establish:

- universal browser, bundler, or package-manager compatibility;
- broad @react-three/fiber compatibility beyond the directly qualified 9.8.0 fixture;
- TypeScript declarations, CommonJS/dual-package support, SSR, or React Server Components support;
- a final Wasm ABI or serialization format;
- a public DOM listener, pointer, or keyboard API;
- stable semver compatibility beyond directly qualified evidence.

For deeper authority, see [INVARIANTS](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/INVARIANTS.md), [ADRs](https://github.com/YT-TechDev/web-interactive-flow/tree/main/docs/adr), [ARCHITECTURE](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/ARCHITECTURE.md), [HOST_BOUNDARIES](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/HOST_BOUNDARIES.md), and [TESTING](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/TESTING.md). This guide summarizes the repository authority; it does not override it.
