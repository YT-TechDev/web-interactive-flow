# Architecture

## Purpose

Web Interactive Flow separates interaction-flow semantics from the Web host that supplies input and renders effects.

The core is intended to be implemented in MoonBit and compiled to WebAssembly. JavaScript/TypeScript provides the host bridge and adapters.

## Conceptual layers

```text
Host input
  wheel / touch / keyboard / pointer / programmatic requests
                |
                v
        Host adapter / bridge
                |
        normalized commands + dt
                |
                v
        MoonBit / Wasm core
        -------------------
        phase / target
        transition state
        progress / direction
        cooldown / lock
        request disposition
                |
                v
        observable snapshot
                |
        Host adapter / bridge
                |
                v
Host effects
  DOM / CSS / React / R3F / future hosts
```

## Core ownership

The core owns the state machine and rules that determine interaction-flow state.

Expected concerns include phase, target, transition progress, direction, cooldown, lock state, request acceptance/rejection, and explicit time progression.

The exact ABI and state representation are not yet frozen.

## Bridge ownership

The JS/TS bridge is responsible for loading the Wasm artifact, translating supported values across the boundary, and exposing a usable Web API.

It should stay thin. Business/flow semantics do not belong in the bridge.

## Adapter ownership

Adapters own host-specific integration.

Examples:

- DOM: event listeners, scroll coexistence, focus/accessibility concerns, CSS attributes or custom properties.
- React: lifecycle binding and subscription ergonomics.
- R3F: frame-loop integration, scene/camera/object effects, and R3F event integration.

Adapters should share core semantics rather than fork them.

## Evidence path

An existing TypeScript/R3F implementation may supply behavioral evidence.

The target path is:

```text
existing behavior
      |
      v
trace / invariant extraction
      |
      v
independent core semantics
      |
      v
MoonBit/Wasm implementation
      |
      +--> DOM/Web adapter
      |
      +--> R3F adapter
```

This is not a line-by-line porting project.

## Architectural questions intentionally open

- final Wasm ABI shape;
- final package/workspace layout;
- serialization;
- easing/animation ownership;
- snapshot representation;
- event subscription API;
- React/R3F ergonomics;
- release artifact layout.

These should be resolved by evidence and ADRs rather than by convenience.
