# Documentation

Use the layer that matches your task. Consumer docs summarize the public package surface; they do not override repository authority.

## For users

- [Root README](../README.md) — what WIF does, install, and quick start.
- [Usage guide](USAGE.md) — practical integration and cleanup.
- [Public API](PUBLIC_API.md) — exports, ownership, and integration rules.
- [Changelog](../CHANGELOG.md) — release and release-preparation facts.

## For contributors and coding agents

- [AGENTS.md](../AGENTS.md) — instructions for work in this repository.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — focused PR and evidence workflow.
- Read the authority order below before changing behavior or architecture.

## Architecture and research authority

The repository authority order is:

1. [INVARIANTS.md](INVARIANTS.md)
2. Accepted [ADRs](adr/README.md)
3. [ARCHITECTURE.md](ARCHITECTURE.md)
4. [HOST_BOUNDARIES.md](HOST_BOUNDARIES.md)
5. [TESTING.md](TESTING.md) and behavioral evidence
6. Implementation
7. Consumer guidance, including the README and USAGE guide

- [BEHAVIORAL_CONTRACT.md](BEHAVIORAL_CONTRACT.md) — historical first-runtime behavior from the pre-v0.1 research phase.
- [GLOSSARY.md](GLOSSARY.md) — shared terminology.

This map is navigation, not a new authority source. Resolve conflicts using the authority order above.
