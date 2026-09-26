# Web Interactive Flow

A deterministic, host-independent interaction-flow runtime for the Web, powered by MoonBit and WebAssembly.

> **Status:** pre-v0.1 research runtime with qualified Web, R3F, package-artifact, and real-browser evidence. No stable API, stable semver, npm publication, or broad compatibility guarantee is claimed yet.

## What this project is

Web Interactive Flow separates interaction-flow semantics from the hosts that deliver input and render effects.

The MoonBit/Wasm core owns semantic truth. Web-facing bridges and host adapters normalize host input, advance the runtime through explicit time, and project observable runtime state into DOM, React Three Fiber, or other presentation layers without reimplementing flow semantics.

React Three Fiber is an important reference consumer, but it does not own the architecture. DOM/Web is a first-class target.

```text
Host input
  wheel / touch / keyboard / pointer / programmatic requests
                |
                v
        Host adapter / bridge
                |
      normalized commands + valid dt
                |
                v
        MoonBit / Wasm core
        -------------------
        ordered phase domain
        selected phase / accepted target
        transition lifecycle
        raw progress / direction
        cooldown / lock
        request disposition
                |
                v
        observable semantic state
                |
        Host adapter / presentation
                |
          host effects / easing
                |
                v
DOM / React / R3F / future hosts
```

## Qualified capabilities

The current repository evidence establishes the following bounded capabilities:

- **Host-independent semantic core** — ordered phases, selected semantic target, transition lifecycle, raw progress and direction, cooldown, lock state, request disposition, validation boundaries, and explicit time progression live in the MoonBit/Wasm core.
- **JavaScript/Web bridge** — production bridge code exposes the qualified runtime without moving semantic ownership into JavaScript.
- **Browser time and scheduling** — browser monotonic time is normalized at the host boundary, and the first frame scheduler advances semantic time from delivered browser frame timestamps.
- **Caller-owned Wasm acquisition** — the caller resolves and fetches the Wasm resource and supplies a `Response` / `Promise<Response>` to `compileFlowModule()`; WIF does not own URL selection, automatic fetch, CDN policy, or a global asset cache.
- **DOM/Web integration** — DOM wheel default-action suppression follows semantic acceptance, and real DOM projection evidence is exercised through production runtime state.
- **Real-browser composition** — production compiler, Runtime, scheduler, and packaged Wasm have been exercised together in actual Chrome/WebDriver with bounded lifecycle and cleanup.
- **R3F integration** — R3F frame consumers are read-only semantic observers, and the first production hook is `useFlowFrame(runtime, callback)` with an explicit caller-owned Runtime.
- **Package boundary** — one logical package topology has been qualified with a framework-neutral root, an explicit `./r3f` host subpath, and a public `./core.wasm` asset boundary.
- **Packed-artifact qualification** — copy-only staging, local `npm pack`, exact locked consumer installation, production Vite build, emitted-Wasm byte provenance, build-output-only loopback serving, and real-Chrome execution have been exercised as one bounded qualification path.

These are evidence-backed properties of the current pre-v0.1 repository. They are not universal compatibility or production-readiness claims.

## Qualified package topology

The first distribution boundary currently qualifies this conceptual public surface:

```text
package root
  -> createFlowRuntime
  -> compileFlowModule
  -> createFrameScheduler
  -> applyWheelNavigationIntent

package ./r3f
  -> useFlowFrame

package ./core.wasm
  -> qualified Wasm asset
```

The framework-neutral root does not import the R3F adapter. R3F remains opt-in behind its explicit subpath, and Wasm acquisition remains caller-owned.

This topology is qualification evidence before publication; it does **not** establish a final npm package name, stable package version, or broad package-manager/bundler support.

## Evidence discipline

This repository is developed falsification-first.

Behavior is promoted in roughly this order:

```text
semantic claim
  -> observable behavior
  -> boundary and counterexample tests
  -> traces / invariants / ADRs
  -> implementation
  -> mutation / qualification evidence
```

The project uses focused behavioral traces, mutation tests, differential evidence against the existing TypeScript/R3F reference where appropriate, package-artifact provenance checks, and real-browser qualification.

Passing CI is necessary evidence for automated checks, but it is not treated as proof of semantic or architectural correctness.

See [Testing and evidence](docs/TESTING.md) for the current evidence properties and qualification boundaries.

## Current frontier

The project has moved beyond the initial architecture bootstrap: the host-independent core, browser bridge/scheduler path, DOM/Web evidence, R3F read-only adapter boundary, first production R3F hook, package topology, local package artifact, and package-aware real-browser production-build path have all been qualified.

The next frontiers remain intentionally evidence-driven. The project does not prematurely freeze or claim:

- stable public API or stable semver;
- npm publication or final package identity;
- final Wasm ABI or serialization format;
- universal Vite, Webpack, Next.js/Turbopack, SSR, or React Server Components compatibility;
- broad browser compatibility beyond directly qualified environments;
- final TypeScript declaration strategy;
- final React/R3F ergonomics, Provider/context design, render-priority policy, or peer-version ranges;
- presentation easing utilities or animation ownership beyond accepted authority;
- plugin architecture or WebGPU integration.

These remain open until repository evidence justifies stronger authority.

## Repository authority

Repository-owned authority is intentionally explicit for both humans and coding agents.

1. [Invariants](docs/INVARIANTS.md)
2. Accepted [ADRs](docs/adr/README.md)
3. [Architecture](docs/ARCHITECTURE.md) and [host boundaries](docs/HOST_BOUNDARIES.md)
4. [Testing and evidence](docs/TESTING.md)
5. Implementation
6. This README

The README summarizes current repository authority; it does not override it.

See [AGENTS.md](AGENTS.md) for agent-facing operating rules and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow.

## License

MIT.
