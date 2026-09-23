# Host Boundaries

This document defines responsibility boundaries between the host-independent runtime and Web hosts.

## Core

The core may know about normalized flow concepts such as:

- requests to move or target a phase;
- explicit time deltas;
- transition state;
- progress and direction;
- cooldown;
- lock state;
- request disposition;
- observable runtime snapshots.

The core must not directly know about:

- `Event`, `WheelEvent`, `PointerEvent`, or DOM nodes;
- `preventDefault()` or event propagation;
- native scrolling;
- CSS;
- React hooks or components;
- R3F hooks, raycasting, scene graphs, cameras, materials, or meshes;
- requestAnimationFrame or a particular rendering loop.

## DOM/Web adapter

The DOM adapter is expected to own host-specific policy and mechanics such as:

- wheel, touch, keyboard, pointer, and programmatic input collection;
- normalization from host events to flow commands;
- flow-root scoping;
- native-scroll coexistence;
- event ownership and `preventDefault()` decisions;
- nested interactive regions;
- focus and accessibility integration;
- projecting runtime state into DOM-visible effects.

Native-scroll coexistence is a research frontier. Do not encode an untested global event-capture policy as core semantics.

## React adapter

A React adapter may own lifecycle and subscription ergonomics, but not the flow state machine.

React state should not become an independent semantic source of truth.

## R3F adapter

An R3F adapter may own:

- `useFrame` or equivalent frame-loop binding;
- R3F event integration;
- scene, camera, object, or material mutations;
- conversion between runtime state and 3D presentation.

R3F raycasting and event propagation remain R3F/host responsibilities.

## Cross-host rule

When DOM and R3F consumers receive equivalent normalized commands and deltas, any shared semantic claim must be decided by the same core runtime.

Differences caused by host event systems must be documented as host behavior, not hidden as core differences.
