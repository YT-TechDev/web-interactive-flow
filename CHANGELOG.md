# Changelog

This changelog records high-level distribution changes. It does not replace accepted ADRs or qualification evidence.

## Unreleased — v0.2.0 release preparation

### Added

- Tagged direct-target intents for the existing `applyWheelNavigationIntent()` helper: `{ type: "target", target: phaseIdentity }`.

### Preserved

- Existing `"next"` and `"previous"` meanings and the package root export names.
- Runtime ownership of eligibility, disposition, transitions, cooldown, lock, and semantic time.
- The package topology, Wasm ABI, and read-only R3F boundary for this frontier.
- Caller ownership of raw wheel policy and application topology.

### Not added / deferred

- `./dom`, public DOM listener APIs, public pointer or keyboard widening, and scheduler composition.

### Evidence

- [ADR-0028](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/adr/0028-target-capable-wheel-ownership.md)
- [WIF production qualification, PR #212](https://github.com/YT-TechDev/web-interactive-flow/pull/212)
- [Issue #210 and UsagePage consumer dogfood evidence](https://github.com/YT-TechDev/web-interactive-flow/issues/210)

This is release-preparation documentation. It does not claim that `web-interactive-flow@0.2.0` is available on npm.

## 0.1.0 — First public npm release

- Published the first public `web-interactive-flow` package with the framework-neutral root, optional `./r3f` subpath, and packaged `./core.wasm` asset.
- Used the qualified copy-only staging path and caller-owned Wasm acquisition.

See [ADR-0027](https://github.com/YT-TechDev/web-interactive-flow/blob/main/docs/adr/0027-first-public-npm-release.md) and [release follow-up #206](https://github.com/YT-TechDev/web-interactive-flow/issues/206).
