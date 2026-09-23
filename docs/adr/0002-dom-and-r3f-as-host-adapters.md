# ADR-0002 — DOM and R3F are host adapters

Status: Accepted

## Context

The project must support both ordinary Web content and the original 3D/R3F use case without duplicating semantic state machines.

DOM and R3F have materially different event systems and rendering responsibilities.

## Decision

Treat DOM/Web and R3F as host adapters/consumers above one host-independent core.

DOM-specific event ownership, native scroll, focus, and CSS concerns remain in the DOM layer.

R3F-specific frame-loop, raycasting, event propagation, and scene mutation concerns remain in the R3F layer.

## Consequences

Equivalent normalized inputs can share core semantics while host-specific mechanics remain explicit.

Adapters must not become competing semantic owners.
