# Glossary

## Core

The host-independent runtime that owns interaction-flow semantics.

## Host

The environment integrating the core, such as DOM/Web content, React, or React Three Fiber.

## Adapter

Host-specific code that converts host input into normalized runtime commands and projects runtime state back into host effects.

## Flow

An ordered interaction process whose current/target phase and transition behavior are owned by the core.

## Phase

A discrete logical position in a flow. Its final representation is not yet frozen.

## Transition

Core-managed movement between logical flow states.

## Progress

An observable measure of transition advancement. Representation and interpolation details are not yet frozen.

## Direction

The logical orientation of a transition or request, such as forward or reverse, independent of a particular input device.

## Cooldown

A core concept that may temporarily affect request acceptance after or around transitions. Exact timing semantics remain to be researched.

## Lock

A core condition restricting flow requests according to defined semantics.

## Request disposition

The observable result of a normalized flow request, such as acceptance, rejection, or no-op. Exact API representation is not yet frozen.

## Behavioral trace

An ordered test fixture containing inputs and expected observable behavior used to investigate or verify semantics.

## Reference implementation

An existing implementation used as behavioral evidence. It is not automatically normative.

## Host effect

A DOM, CSS, React, R3F, rendering, or other host-specific consequence derived from runtime state.
