# Web Interactive Flow

A deterministic, host-independent interaction-flow runtime for the Web, powered by MoonBit and WebAssembly.

> **Status:** v0.1.0 first-release source with qualified Web, R3F, package-artifact, real-browser, and external consumer evidence. The public npm identity is `web-interactive-flow`. Broad compatibility and stable semver beyond this first release are not claimed.

## Install

For published v0.1.x releases:

```bash
npm install web-interactive-flow
```

Registry publication is authoritative only for versions that actually exist on npm; repository tags or source metadata alone do not prove registry availability.

## What this project is

Web Interactive Flow separates interaction-flow semantics from the hosts that deliver input and render effects.

The MoonBit/Wasm core owns semantic truth. Web-facing bridges and host adapters normalize host input, advance the runtime through explicit time, and project observable runtime state into DOM, React Three Fiber, or other presentation layers without reimplementing flow semantics.

React Three Fiber is an important reference consumer, but it does not own the architecture. DOM/Web is a first-class target.

### MoonBit/Wasm and JavaScript responsibilities

MoonBit/Wasm owns flow semantics: selected phase, request disposition, transition lifecycle, raw progress/direction, cooldown, lock, and deterministic `tick(dt)` evolution.

JavaScript/Web owns host integration: Wasm acquisition, browser time normalization, frame scheduling, DOM/event normalization, and presentation effects. Host code may translate input into normalized commands, but it must not duplicate Runtime eligibility or lifecycle truth.

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

ADR-0027 selects the first public identity as `web-interactive-flow@0.1.0`. A repository tag is not treated as proof of publication; the registry artifact and its release provenance remain the publication evidence.

The package export map remains intentionally narrower than the repository source tree. Repository-qualified internal DOM adapters are **not** public package entry points in v0.1.0.

This first release identity does **not** establish broad package-manager/bundler compatibility or stable semver guarantees beyond the directly qualified evidence.

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

- stable public API or stable semver beyond the first v0.1.0 surface;
- broad npm/package-manager/bundler compatibility beyond directly qualified environments;
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
