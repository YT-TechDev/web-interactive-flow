# ADR-0010 — First production R3F hook takes an explicit Runtime

Status: Accepted

## Context

ADR-0009 established that React Three Fiber frame consumers are read-only semantic observers. Issue #87 then qualified that rule against actual `@react-three/fiber` and `@react-three/test-renderer`: delivered R3F frames can read the current WIF semantic Runtime without advancing its lifecycle, while the existing WIF frame scheduler remains the lifecycle-time owner.

Issue #89 researched the first production R3F adapter API after that qualification.

The pinned behavioral reference exposes a `useFlowFrame` hook through a React provider. Its provider also constructs the machine, mirrors semantic state into React state, and owns the transition clock. That composition is not normative for WIF because WIF has independently established Runtime construction, lifecycle scheduling, DOM consumption, wheel ownership, and R3F observation boundaries.

The first production R3F hook therefore needs to expose the proven frame-observation path without reintroducing provider-owned semantics or prematurely selecting package/distribution policy.

## Decision

The first production R3F hook takes the semantic Runtime explicitly and accepts one presentation callback.

Conceptually:

```js
useFlowFrame(runtime, callback)
```

For one delivered R3F frame callback, its behavior is equivalent to:

```js
useFrame((_, delta) => {
  callback(runtime.getSnapshot(), delta)
})
```

The exact final package-root export and distribution layout remain open.

### Explicit Runtime acquisition

The Runtime is a required hook argument.

The first hook does not:

- discover a Runtime through React context;
- fall back to a provider;
- use a module/global singleton;
- construct a Runtime;
- own Runtime disposal;
- own Runtime lifecycle scheduling.

This keeps Runtime ownership explicit and permits multiple independent Runtimes in one React/R3F tree.

### Raw semantic snapshot payload

The callback receives the existing semantic Runtime snapshot unchanged.

The first hook does not project or rename semantic fields into a second R3F-specific state shape.

The callback also receives the R3F frame `delta` as host/presentation metadata.

The first callback contract does not expose R3F `RootState`, XR frame data, or other R3F host state.

### One semantic read per delivered frame

One hook consumer performs one `runtime.getSnapshot()` read for one delivered R3F frame callback.

The hook must not combine multiple independently-read snapshots into one presentation observation.

### No semantic lifecycle ownership

The hook does not call `runtime.tick()` and does not invoke another lifecycle-advancement path.

R3F `delta` must not be converted into WIF semantic time by this hook.

Multiple hook consumers remain read-only observations and must not change semantic lifecycle speed.

### Runtime and callback freshness

The hook does not pin the initial Runtime or presentation callback.

After a normal React re-render supplies a different Runtime or callback, subsequent delivered R3F frames use the latest rendered values.

The first hook does not add a second WIF-owned callback-ref/effect lifecycle merely to mirror the callback. Current R3F frame subscription mechanics own callback freshness.

Runtime replacement does not imply ownership transfer:

- the hook does not dispose the previous Runtime;
- the hook does not start the replacement Runtime's scheduler;
- the caller remains responsible for Runtime lifetime and semantic time.

### Default R3F frame priority only

The first hook does not expose a render-priority argument.

It registers through R3F's default frame priority.

Positive render priority can take over rendering responsibility and requires separate host-policy evidence.

### No React semantic mirror

The hook does not maintain React state for phase, transition, cooldown, lock, direction, raw progress, or request disposition.

Per-frame semantic observation remains a direct Runtime read followed by the presentation callback.

Presentation-local refs or Three.js object mutations remain host effects.

### Host errors remain host errors

The first hook does not create a new stable adapter error taxonomy.

If the presentation callback throws, the hook does not swallow or reclassify that failure.

If the hook is used outside the R3F Canvas context, R3F remains the owner of the host-context failure.

Misuse of Runtime/callback values is not assigned stable public error wording by this ADR.

### Provider/context remains deferred

A future React provider may be justified by demonstrated Runtime-transport ergonomics.

This ADR does not select:

- provider placement relative to Canvas;
- nested-provider semantics;
- provider-owned disposal;
- provider-owned scheduling;
- React-only semantic subscriptions;
- context fallback for the R3F hook.

Any provider must preserve the existing semantic and lifecycle ownership rules.

### Client/distribution strategy remains deferred

The hook is semantically Canvas/client-bound because it uses R3F `useFrame`.

This ADR does not yet select:

- package/workspace layout;
- npm export names;
- peer dependency ranges;
- ESM/CJS build shape;
- exact `"use client"` directive preservation strategy;
- Next.js or React Server Component compatibility guarantees.

Repository implementation may qualify the exact production source inside isolated test infrastructure without treating that fixture as final package authority.

## Evidence and constraints

Repository authority:

- I-01 keeps React/R3F outside the core;
- I-02 preserves one semantic owner;
- I-05 keeps host effects from redefining semantics;
- ADR-0002 defines R3F as a host adapter;
- ADR-0004 keeps presentation easing outside semantic progress;
- ADR-0005/0006 preserve the current lifecycle-time path;
- ADR-0009 defines R3F frame consumers as read-only semantic observers.

Issue #87 provided actual-R3F evidence that raw semantic snapshot plus R3F delta is sufficient for scene-local presentation observation without a provider or second clock.

Current R3F implementation evidence used during Issue #89 shows that `useFrame` maintains callback freshness internally and owns frame-subscription cleanup on unmount.

The pinned behavioral reference is evidence only. Its provider-owned machine construction, React snapshot synchronization, and requestAnimationFrame clock are not imported by this decision.

## Consequences

The first production R3F adapter remains small and explicit.

Applications may thread a Runtime into Canvas-bound scene components and use the hook for frame-local presentation effects.

Multiple consumers and multiple Runtimes do not require new global/context ownership.

A future provider, package export, RootState payload, render priority, or distribution strategy can be researched independently without changing core semantics.

The first implementation can be qualified against actual R3F while the repository root remains package-layout-neutral.

## Alternatives considered

### Context/provider-only hook

Deferred. Context transport is ergonomic but introduces provider placement, identity, nesting, disposal, scheduling, and React-consumer policy that the first R3F observation path does not require.

### Explicit Runtime with context fallback

Rejected for the first API. It creates two Runtime acquisition paths and precedence/error semantics without evidence.

### Low-level non-React observer helper

Rejected as the first production R3F adapter. It adds little beyond the already-qualified `callback(runtime.getSnapshot(), delta)` sequence and does not itself represent R3F integration.

### Projected R3F-specific semantic state

Rejected. It duplicates the existing semantic snapshot contract and risks semantic drift.

### Forward full R3F RootState/XR frame

Deferred. The actual qualification did not require it, and it broadens host coupling.

### Expose render priority

Deferred. Positive priority can take render-loop ownership and requires separate evidence.

### Port the pinned reference FlowProvider/useFlowFrame architecture

Rejected. The reference provider owns machine creation, React state synchronization, and transition clock behavior that WIF has deliberately separated.
