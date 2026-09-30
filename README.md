# Web Interactive Flow

Web Interactive Flow (WIF) is a small interaction-flow runtime for Web applications. Its MoonBit/WebAssembly Runtime owns phase selection, request disposition, transitions, cooldown, lock, and semantic time. The application owns input interpretation, topology, scheduling lifetime, asset acquisition, and presentation.

## Source and npm status

The current repository source includes the accepted v0.2.0 target-capable wheel ownership boundary. npm release status is separate from source status. As checked on 2026-09-30, npm lists only **web-interactive-flow@0.1.0**. The tagged direct-target wheel intent described below is in repository source for v0.2.0 preparation; it is not in the published 0.1.0 artifact.

A repository commit or tag does not prove npm availability. Check the registry before selecting a version:

~~~sh
npm view web-interactive-flow versions --json
~~~

## Install

~~~sh
npm install web-interactive-flow
~~~

## Quick start

The application resolves and fetches the Wasm asset. The `?url` form below is qualified for the repository’s Vite path only.

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
    console.log(snapshot);
  },
});

scheduler.start();
const disposition = runtime.next();
console.log(disposition, runtime.getSnapshot());

// When this owner is finished:
scheduler.stop();
runtime.dispose();
~~~

For this browser scheduler, time values use integer microsecond quanta. The application must not advance one Runtime with both the scheduler and a competing clock.

## Public package surface

The package exports are intentionally narrow:

| Import | Public surface |
| --- | --- |
| `web-interactive-flow` | `compileFlowModule`, `createFlowRuntime`, `createFrameScheduler`, `applyWheelNavigationIntent` |
| `web-interactive-flow/r3f` | `useFlowFrame` |
| `web-interactive-flow/core.wasm` | Packaged Wasm asset |

There is no `./dom` subpath. Do not deep-import repository files such as `bridge/*` or `adapters/*`.

## Wheel navigation in the v0.2.0 source boundary

The existing `applyWheelNavigationIntent()` helper accepts adjacent intents and a tagged direct target:

~~~js
const adjacentIntent = "next"; // calls runtime.next()
const directTargetIntent = { type: "target", target: "next" }; // calls runtime.goTo("next")
~~~

A configured phase can itself be named `"next"` or `"previous"`, so a direct phase identity needs the `type: "target"` tag. Each valid helper call makes exactly one Runtime request. The Runtime’s `"accepted"` or `"rejected"` disposition is returned unchanged; unknown target identities are validation failures, not `"rejected"` requests. The helper requests `preventDefault()` only after `"accepted"`, when prevention is enabled and the event is cancelable.

WIF does not interpret wheel deltas or choose the application’s target mapping. Raw wheel policy, gesture thresholds, and application topology stay with the caller. This wheel contract does not add public pointer or keyboard ownership APIs.

## Ownership

| Concern | WIF Runtime | Host/application |
| --- | --- | --- |
| Selected phase, eligibility, disposition, transition, cooldown, lock, raw progress | Owns semantic truth | Reads snapshots; does not predict eligibility |
| Wheel deltas, gesture thresholds, direction-to-target mapping, application topology | — | Owns policy |
| DOM/R3F presentation and easing | Supplies semantic state | Owns rendering and visual effects |
| Wasm URL and fetch | Compiles a supplied response | Resolves the asset and fetches it |
| Runtime and scheduler lifetime | Provides operations | Creates, starts, stops, and disposes its owned instances |

## React Three Fiber

R3F support is optional and isolated at `web-interactive-flow/r3f`. `useFlowFrame(runtime, callback)` reads a snapshot and forwards R3F frame delta to presentation code. It does not call `runtime.tick()` or become the Runtime’s semantic clock.

~~~jsx
import { useFlowFrame } from "web-interactive-flow/r3f";

function FlowPresentation({ runtime }) {
  useFlowFrame(runtime, (snapshot, delta) => {
    updateScene(snapshot, delta);
  });
  return null;
}
~~~

## Documentation

- [Usage guide](docs/USAGE.md) — practical integration and cleanup
- [Public API](docs/PUBLIC_API.md) — concise public contract and ownership matrix
- [Changelog](CHANGELOG.md) — first release facts and v0.2.0 release preparation
- [Contributing and agent guidance](https://github.com/YT-TechDev/web-interactive-flow/blob/main/CONTRIBUTING.md) · [AGENTS.md](https://github.com/YT-TechDev/web-interactive-flow/blob/main/AGENTS.md)

## Qualified boundaries

Current evidence covers a copy-only package artifact, a framework-neutral root, the optional R3F subpath with the directly qualified @react-three/fiber 9.8.0 peer, and one locked Vite production-build / real-Chrome path. The Vite `?url` asset form is not a universal bundler guarantee. WIF does not claim universal browser or bundler compatibility, TypeScript declarations, CommonJS support, SSR/RSC support, stable semver compatibility beyond directly qualified evidence, or a finalized Wasm ABI or serialization format.

## Evidence and repository authority

WIF uses a falsification-first process: make an observable claim, test boundary cases, record evidence, then promote the result into repository authority. Green CI is necessary for automated checks but does not establish semantic correctness by itself.

The consumer documents summarize repository authority. They do not override it:

1. [Invariants](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/INVARIANTS.md)
2. [Accepted ADRs](https://github.com/YT-TechDev/web-interactive-flow/tree/main/docs/adr)
3. [Architecture](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/ARCHITECTURE.md) and [host boundaries](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/HOST_BOUNDARIES.md)
4. [Testing and evidence](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/TESTING.md)
5. Implementation

## Contributing and license

Focused contributions should include evidence for observable behavior changes and an ADR for architectural ownership changes. See [CONTRIBUTING.md](https://github.com/YT-TechDev/web-interactive-flow/blob/main/CONTRIBUTING.md). Licensed under MIT.
