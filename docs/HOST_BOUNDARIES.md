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

## DOM/Web adapter

The DOM adapter is expected to own host-specific policy and mechanics such as:

- wheel, touch, keyboard, pointer, and programmatic input collection;
- normalization from host events to flow commands;
- flow-root scoping;
- native-scroll coexistence;
- event ownership and `preventDefault()` decisions;
- nested interactive regions;
- focus and accessibility integration;
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

Differences caused by host event systems or presentation policy must be documented as host behavior, not hidden as core differences.
