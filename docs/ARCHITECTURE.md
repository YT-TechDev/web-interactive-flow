# Architecture

## Purpose

Web Interactive Flow separates interaction-flow semantics from the Web host that supplies input and renders effects.

The core is intended to be implemented in MoonBit and compiled to WebAssembly. JavaScript/TypeScript provides the host bridge and adapters.

The first runtime proof is additionally constrained by [BEHAVIORAL_CONTRACT.md](BEHAVIORAL_CONTRACT.md).

## Conceptual layers

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
          easing / host effects
                |
                v
Host effects
  DOM / CSS / React / R3F / future hosts
```

## Core ownership

The core owns the state machine and rules that determine interaction-flow truth.

Current researched concerns include:

- a stable ordered phase domain and selected phase;
- known request acceptance/rejection;
- active transition lifecycle;
- raw normalized progress and direction;
- cooldown and lock state;
- explicit valid time progression;
- semantic validity constraints.

The exact ABI, numeric encodings, and state representation are not yet frozen.

## Raw progress and presentation

Raw normalized transition progress belongs to core semantics.

Presentation easing does not. It may be applied after observing raw progress, but it must not redefine request eligibility, selected phase, transition completion, cooldown, direction, or lock behavior.

See [ADR-0004](adr/0004-raw-progress-core-easing-presentation.md).

## Bridge ownership

The JS/TS bridge is responsible for loading the Wasm artifact, translating supported values across the boundary, and exposing a usable Web API.

It may validate or resolve host representations into valid normalized semantic values.

It must not collapse validation failure into ordinary known-request rejection or reimplement flow state transitions.

The exact validation/error mapping remains open.

## Adapter ownership

Adapters own host-specific integration.

Examples:

- DOM: event listeners, scroll coexistence, focus/accessibility concerns, CSS attributes or custom properties.
- React: lifecycle binding and subscription ergonomics.
- R3F: frame-loop integration, scene/camera/object effects, and R3F event integration.

Adapters and presentation layers may apply easing or visual interpolation to raw progress.

Adapters should share core semantics rather than fork them.

## Evidence path

An existing TypeScript/R3F implementation may supply behavioral evidence.

The target path is:

```text
existing behavior
      |
      v
focused research + falsification
      |
      v
repository behavioral authority
      |
      v
semantic trace oracle
      |
      v
independent MoonBit/Wasm implementation
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
- snapshot representation;
- presentation easing utility/API design;
- validation/error encoding;
- event subscription API;
- React/R3F ergonomics;
- release artifact layout.

These should be resolved by evidence and ADRs rather than by convenience.
