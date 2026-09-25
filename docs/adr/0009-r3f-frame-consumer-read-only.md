# ADR-0009 — R3F frame consumers are read-only semantic observers

Status: Accepted

## Context

Web Interactive Flow now has a host-independent MoonBit/Wasm semantic Runtime, a browser time-normalization boundary, a browser frame scheduler, and real-browser DOM-consumer evidence.

The remaining initial-program host target is React Three Fiber.

React Three Fiber provides Canvas-bound frame callbacks through `useFrame`. Current R3F documentation describes those callbacks as render-loop work that receives host frame state and a frame `delta` in seconds. Callback delivery depends on R3F scheduling policy such as frameloop mode and render priority.

Those callbacks are host scheduling. They are not automatically WIF semantic lifecycle time.

WIF already has one selected lifecycle-time path. If a future R3F consumer independently advances the same Runtime from `useFrame(delta)` while that time owner is active, transition and cooldown time can be applied more than once.

The pinned behavioral reference also demonstrates why ownership must be explicit. At `YT-TechDev/r3f-interactive-flow@9c1e1d7b4dee026f4e5724435315f72eb11974ce`, the current `useFlowFrame` implementation reads the machine snapshot without advancing it, while older documentation in the same repository describes frame-delta advancement. The reference is evidence of historical ownership changes, not WIF authority.

## Decision

The first R3F frame-consumer boundary is a **read-only semantic observer**.

For one delivered R3F frame callback, the boundary:

1. reads one current semantic snapshot from the WIF Runtime;
2. makes that snapshot available to R3F presentation code;
3. may pass through R3F frame `delta` as host/presentation metadata;
4. may apply scene, camera, object, material, or other R3F/Three.js host effects.

The first R3F frame-consumer boundary does **not** call `runtime.tick()`.

### Lifecycle time ownership

R3F frame delivery and R3F frame `delta` do not independently own WIF transition or cooldown lifecycle in the first contract.

The already-selected WIF lifecycle-time owner remains authoritative until a later repository decision explicitly replaces or reconfigures that ownership.

A future R3F-specific time adapter, if ever justified, requires separate research and authority. It must not coexist as a second time owner for one Runtime.

### One coherent semantic observation per delivered frame callback

One R3F frame-consumer invocation reads one current semantic snapshot.

The consumer must not rebuild the snapshot from React state, R3F-local state, scene state, or duplicated phase/transition/cooldown/lock fields.

Multiple R3F consumers are independent read-only views. Mounting more consumers must not accelerate semantic lifecycle.

### R3F delta is presentation metadata

The R3F frame `delta` may be forwarded to presentation code.

It may be used for host-local work such as scene-object motion that is intentionally independent of WIF semantic lifecycle.

That use does not make R3F `delta` a WIF semantic clock.

### Presentation remains host-owned

R3F presentation code may use semantic selected phase, direction, raw progress, lock state, or other public snapshot fields to drive host effects.

Presentation easing and interpolation remain outside core flow semantics.

Scene effects must not feed eased or scene-derived values back into semantic transition completion, request eligibility, cooldown, selected phase, direction, or lock truth.

The semantic selected identity is the accepted destination. During an active transition it is not a claim that the user or camera is already visually occupying that destination.

### Scheduling policy remains open

This ADR does not select policy for:

- `frameloop="always"`, `"demand"`, or `"never"`;
- `invalidate()`;
- positive render-priority takeover;
- negative-priority ordering;
- XR frame scheduling;
- multiple Canvas roots;
- React StrictMode lifecycle;
- hidden-page behavior;
- R3F event/input integration.

The first theorem applies only to a frame callback that has been delivered.

### Public API and package shape remain open

This ADR does not select:

- a `useFlowFrame` public hook;
- provider/component APIs;
- package or workspace layout;
- npm export names;
- React/R3F dependency placement;
- TypeScript public types.

Those decisions require implementation evidence after this ownership boundary is proven.

## Evidence and constraints

Repository authority:

- I-01 keeps R3F and Three.js out of the core;
- I-02 requires one semantic owner;
- I-05 keeps host effects from redefining semantics;
- ADR-0002 treats R3F as a host adapter;
- ADR-0004 keeps easing in presentation;
- ADR-0005/ADR-0006 already define the first browser lifecycle-time path.

Current R3F documentation used during Issue #83 describes `useFrame` as shared render-loop work receiving state and a frame delta, with delivery behavior affected by frameloop mode and render priority.

Pinned-reference implementation evidence supports read-only sampling, while conflicting older reference documentation confirms that historical reference ownership is not automatically normative.

## Consequences

The first R3F adapter proof can focus on semantic observation and host projection without reopening core timing semantics.

Multiple R3F consumers can safely observe one Runtime without changing lifecycle speed.

A later application may choose R3F-local visual motion driven by R3F `delta` while WIF semantic transition progress remains driven by the selected WIF time owner.

R3F scheduling, package ergonomics, React lifecycle, and input integration remain separately researchable.

## Alternatives considered

### Advance the Runtime from every `useFrame(delta)`

Rejected for the first adapter. It can create a second lifecycle clock and makes semantic speed depend on consumer mounting and R3F scheduling policy.

### Replace the browser scheduler with R3F delta immediately

Not selected. Current evidence does not justify replacing the accepted browser time/scheduler authority, and doing so would require explicit handling of frameloop modes, lifecycle restart, and other R3F scheduling behavior.

### Maintain R3F-local copies of flow state

Rejected. That creates a competing semantic owner and can diverge from the Runtime.

### Treat selected phase as current visual occupancy

Rejected. Selected phase is the accepted destination; presentation interpolation remains host-owned.

### Freeze the old package's `useFlowFrame` API

Rejected. The old repository is reference evidence only, and WIF package/React/R3F API shape remains intentionally unfrozen.
