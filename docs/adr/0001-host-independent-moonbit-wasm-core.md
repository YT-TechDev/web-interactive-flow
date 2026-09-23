# ADR-0001 — Host-independent MoonBit/Wasm core

Status: Accepted

## Context

The originating interaction-flow behavior exists in a Web/R3F context, but the new OSS is intended to serve Web hosts more broadly.

Coupling the runtime to React, R3F, DOM, or Three.js would make those hosts architectural owners and would undermine portability.

## Decision

Implement the semantic core in MoonBit and compile it to WebAssembly.

The core must remain host-independent and receive only normalized runtime inputs.

JavaScript/TypeScript will provide the Web bridge and host adapters.

## Consequences

- DOM and R3F integration remain outside the core.
- Wasm is a portability/runtime boundary, not a blanket performance claim.
- ABI details remain open until the minimum semantic surface is proven.
- npm distribution can package the Wasm artifact behind a normal Web-facing API.

## Alternatives considered

- Keep the existing R3F/TypeScript implementation as the product core.
- Implement a DOM-specific runtime.
- Put React lifecycle and state inside the semantic owner.

These alternatives were rejected because they couple semantics to a particular host.
