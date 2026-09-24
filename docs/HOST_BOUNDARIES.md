# Host Boundaries

This document defines responsibility boundaries between the host-independent runtime and Web hosts.

## Core

The core may know about normalized flow concepts such as:

- a stable ordered phase domain;
- requests to move or target a known semantic phase;
- the selected phase / accepted target;
- explicit valid time deltas;
- transition state;
- raw normalized progress and direction;
- cooldown;
- lock state;
- request disposition;
- semantic validity constraints;
- observable runtime state.

The core must not directly know about:

- `Event`, `WheelEvent`, `PointerEvent`, or DOM nodes;
- `preventDefault()` or event propagation;
- native scrolling;
- CSS;
- React hooks or components;
- R3F hooks, raycasting, scene graphs, cameras, materials, or meshes;
- requestAnimationFrame or a particular rendering loop.

Core flow truth must not depend on presentation easing or animation curves.

## Bridge / normalization boundary

A bridge may translate host-facing identifiers, numbers, and API values into normalized core values.

A host value that cannot be normalized to a valid semantic command is a validation failure. It must not be reclassified as an ordinary known-request rejection.

Concrete exception/result/status-code representation remains open.

### Browser monotonic time normalization

For the first browser/Web real-time host, monotonic timestamp samples are normalized before `tick(dt)` according to [ADR-0005](adr/0005-browser-monotonic-time-normalization.md).

The browser-host normalizer owns only host-time representation state such as:

- epoch baseline timestamp;
- previous accepted timestamp;
- cumulative normalized elapsed time;
- exact decomposition of an oversized normalized budget into valid tick chunks.

That state is not flow-semantic state and must not become an independent owner of phase, transition, cooldown, lock, direction, raw progress, or request eligibility.

The selected first browser-host unit is one microsecond, produced by baseline-relative cumulative floor quantization. This is not a universal core time unit or a permanent cross-host invariant.

The generic normalizer remains independent of DOM scheduling and visibility APIs. A later Web scheduler owns any policy that chooses between consuming a resume gap and explicitly rebasing to pause elapsed host time.

### Browser frame scheduling

The first browser frame scheduler is host state governed by [ADR-0006](adr/0006-first-browser-frame-scheduler.md).

While the scheduler remains running, delivered frame timestamps remain in one ADR-0005 normalization epoch. Browser callback suspension alone does not trigger a rebase; the scheduler consumes the elapsed gap represented by the next delivered timestamp.

Explicit scheduler stop ends the current normalization epoch. A later restart establishes a new epoch on its first delivered frame and advances zero lifecycle time on that frame.

For one delivered frame, all exact normalized tick chunks are applied before one semantic snapshot is read and projected. Carrier chunking must not create extra host-frame observations.

The scheduler does not own semantic Runtime lifetime or flow semantics. It receives an existing semantic runtime, drives valid time through it, and observes semantic snapshots.

Visibility-aware pause/rebase remains later DOM/Web host policy. The first scheduler does not inspect document visibility or own input-event policy.

### Browser/Web Wasm Module acquisition

The first Web Wasm acquisition boundary is governed by [ADR-0007](adr/0007-browser-wasm-module-acquisition.md).

It accepts a caller-supplied `Response` or `Promise<Response>`, uses strict `WebAssembly.compileStreaming()`, reuses the existing WIF module compatibility validator, and returns a reusable `WebAssembly.Module`.

This acquisition state is bridge/host validation, not flow-semantic state.

The acquisition boundary does not create a `WebAssembly.Instance` or semantic Runtime. Fresh Instance creation remains owned by the semantic runtime wrapper.

The first compiler does not own `fetch()`, URLs, artifact/package paths, bundler behavior, retry policy, or Module caching. Those remain caller/application/package concerns.

Streaming response, MIME, status, CORS, CSP/environment, body-consumption, and compilation failures remain host acquisition failures. They must not be reclassified as known flow-request rejection.

The compiler depends on WebAssembly streaming/`Response` semantics only and must not introduce DOM, frame scheduling, visibility, or input-event ownership.

## DOM/Web adapter

The DOM adapter is expected to own host-specific policy and mechanics such as:

- wheel, touch, keyboard, pointer, and programmatic input collection;
- normalization from host events to flow commands;
- flow-root scoping;
- native-scroll coexistence;
- event ownership and `preventDefault()` decisions;
- nested interactive regions;
- focus and accessibility integration;
- browser frame/visibility scheduling policy;
- projecting runtime state into DOM-visible effects;
- DOM/CSS presentation easing or interpolation where desired.

Native-scroll coexistence is a research frontier. Do not encode an untested global event-capture policy as core semantics.

## React adapter

A React adapter may own lifecycle and subscription ergonomics, but not the flow state machine.

React state should not become an independent semantic source of truth.

## R3F adapter

An R3F adapter may own:

- `useFrame` or equivalent frame-loop binding;
- R3F event integration;
- scene, camera, object, or material mutations;
- presentation easing and visual interpolation from raw core progress;
- conversion between runtime state and 3D presentation.

R3F raycasting and event propagation remain R3F/host responsibilities.

## Cross-host rule

When DOM and R3F consumers receive equivalent normalized commands and valid deltas, shared semantic claims must be decided by the same core runtime.

Equivalent core input should produce equivalent selected phase, lifecycle, raw progress, direction, cooldown/lock state, and request disposition where those observations apply.

Hosts are not required to use the same easing or produce identical visual effects.

Differences caused by host event systems, timestamp normalization epochs, scheduling policy, or presentation policy must be documented as host behavior, not hidden as core differences.
