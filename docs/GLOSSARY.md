# Glossary

## Core

The host-independent runtime that owns interaction-flow semantics.

## Host

The environment integrating the core, such as DOM/Web content, React, or React Three Fiber.

## Adapter

Host-specific code that converts host input into normalized runtime commands and projects runtime state back into host effects.

## Flow

An ordered interaction process whose phase selection and transition behavior are owned by the core.

## Phase

A discrete semantic identity in the ordered flow domain.

A phase's final representation is not frozen. User-facing labels are not required to be its semantic identity.

## Selected phase

The phase most recently selected by initialization or an accepted navigation.

During an active transition it identifies the accepted destination, not necessarily the host's current visual occupancy.

## Accepted target

The known target phase selected atomically by an accepted navigation request.

## Transition

Core-managed lifecycle between an accepted navigation and raw completion.

## Raw progress

The core-owned normalized measure of advancement for an active positive-duration transition.

Its exact numeric and snapshot representation are not frozen.

## Presentation easing

A host/presentation mapping from raw progress to an eased visual value.

Presentation easing is not core flow truth and must not determine request eligibility or lifecycle completion.

## Direction

The core-owned logical orientation of an active positive-duration transition, such as forward or reverse, derived from the ordered source/target relation.

No active direction is required once the transition is settled.

## Cooldown

A core-owned lifecycle gate that may make otherwise-valid navigation ineligible after transition completion until its configured time expires.

The exact public representation of remaining cooldown time is not frozen.

## Lock

A core condition restricting new flow requests without pausing an already-active transition or cooldown lifecycle.

## Request disposition

The observable result of a valid normalized flow request, such as acceptance or rejection/no-op.

Exact API representation is not frozen.

## Validation failure

Failure to construct or normalize an input/configuration into the valid semantic domain.

Validation failure is distinct from the rejection of a valid known flow request.

Exact error representation is not frozen.

## Behavioral trace

An ordered evidence fixture containing semantic initial conditions, normalized inputs, and expected semantic observations.

Its machine-readable serialization is not frozen.

## Reference implementation

An existing implementation used as behavioral evidence. It is not automatically normative.

## Host effect

A DOM, CSS, React, R3F, rendering, or other host-specific consequence derived from runtime state.

## Normalized intent

A host-boundary representation of one navigation request after host input has been interpreted. The wheel ownership helper accepts adjacent `next`/`previous` intents or a tagged direct-target intent. Raw wheel interpretation remains caller-owned.

## Tagged direct-target intent

The wheel helper representation `{ type: "target", target: phaseIdentity }` for requesting one configured phase directly. The tag distinguishes a phase named `next` or `previous` from the corresponding adjacent operation.
