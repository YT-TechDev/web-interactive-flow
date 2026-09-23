# Web Interactive Flow

A deterministic, host-independent interaction-flow runtime for the Web, powered by MoonBit and WebAssembly.

> Status: pre-v0.1 research and architecture bootstrap. No stable API or compatibility guarantees yet.

## Goals

Web Interactive Flow aims to provide a small interaction-flow runtime whose semantics are independent of rendering frameworks and host APIs.

The intended architecture is:

- MoonBit core compiled to WebAssembly;
- explicit flow state, transition, cooldown, lock, and request semantics;
- reusable behavioral traces and invariants;
- thin adapters for DOM/Web content, React, React Three Fiber, and future hosts;
- npm-compatible distribution for ordinary Web consumption.

React Three Fiber is an important reference consumer, but it does not own the runtime architecture. DOM/Web content is a first-class target.

## Repository authority

Repository-owned authority is intentionally explicit for both humans and coding agents.

1. [Invariants](docs/INVARIANTS.md)
2. Accepted [ADRs](docs/adr/README.md)
3. [Architecture](docs/ARCHITECTURE.md)
4. [Host boundaries](docs/HOST_BOUNDARIES.md)
5. [Testing and evidence](docs/TESTING.md)
6. Implementation
7. This README

See [AGENTS.md](AGENTS.md) for agent-facing operating rules and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow.

## Current frontier

The initial program is to:

1. extract useful observable behavior from the existing TypeScript/R3F implementation;
2. separate host-specific behavior from flow semantics;
3. record behavioral traces and invariants;
4. implement the smallest justified MoonBit runtime;
5. compile it to Wasm and expose a narrow JS/TypeScript bridge;
6. prove host independence with a DOM/Web consumer;
7. add an R3F adapter for the original 3D use case.

The repository intentionally avoids freezing the final npm layout, ABI, serialization format, React/R3F API, animation ownership, or plugin architecture before evidence requires it.

## License

MIT.
