# AGENTS.md

This repository is designed to be safe and legible for human and AI contributors.

## Before acting

- Inspect the live repository and current branch state.
- Read the relevant repository authority before changing code or docs.
- Do not reconstruct current repository state from chat history or memory.
- Keep the task narrowly scoped.
- Prefer evidence, traces, and explicit invariants over assumptions.

## Authority order

When authorities conflict, use this order:

1. `docs/INVARIANTS.md`
2. accepted ADRs under `docs/adr/`
3. `docs/ARCHITECTURE.md`
4. `docs/HOST_BOUNDARIES.md`
5. `docs/TESTING.md`
6. implementation
7. `README.md`
8. external conversation or project context

Stop and resolve material conflicts rather than guessing.

## Non-negotiable architecture

- The MoonBit/Wasm core is host-independent.
- Core must not depend on DOM, React, R3F, Three.js, Canvas, browser event APIs, or rendering frameworks.
- Host adapters translate host input into normalized commands and runtime state into host effects.
- DOM/Web is a first-class host.
- R3F is a reference consumer/adapter, not the architectural owner.
- Adapters must not reimplement core flow semantics.

## Existing TypeScript/R3F implementation

When an existing R3F implementation is available, treat it as behavioral evidence, not as source text to port mechanically.

Preferred process:

1. observe behavior;
2. separate framework-specific effects from flow semantics;
3. extract traces and invariants;
4. seek boundary cases and counterexamples;
5. implement independently in MoonBit/Wasm;
6. compare observable behavior.

Existing behavior is not automatically normative when ambiguous or defective.

## Git workflow

- `main` is protected.
- Never push directly to `main`.
- Never force-push or weaken repository protections.
- Use pull requests.
- Prefer squash merge.
- Resolve review conversations before merge.
- CI green is required where checks exist, but does not by itself prove semantic correctness.

## Actions policy

- External Actions must be pinned to full-length commit SHAs.
- Default workflow permissions remain read-only.
- Declare any write permission explicitly and minimally.
- Do not grant repository-wide write permissions for convenience.

## Scope discipline

Do not prematurely freeze final package layout, ABI, serialization format, React/R3F API, animation/easing ownership, plugin architecture, or future WebGPU integration.

Stop and investigate when semantics are unclear, repository authority conflicts, or a change would leak host-specific behavior into core.
