# ADR-0027 — First public npm release uses web-interactive-flow identity and a qualified release boundary

Status: Accepted

## Context

ADR-0011 selected the first distributable topology as one logical package with a framework-neutral root, an explicit `./r3f` subpath, and an explicit `./core.wasm` asset. It deliberately did not select a final npm package name or authorize publication.

Since ADR-0011, the repository has qualified:

- the MoonBit/Wasm semantic Runtime and scalar Wasm ABI;
- the JavaScript semantic wrapper and browser scheduler;
- the first package artifact through copy-only staging;
- framework-neutral package installation without R3F;
- the explicit R3F subpath against the selected R3F host fixture;
- package-aware Vite production build and real-Chrome execution;
- emitted-Wasm byte provenance;
- a separate consumer dogfood application against an exact staged tarball.

The MoonBit module already carries version `0.1.0`.

Issue #206 selects the first public npm publication frontier. The unscoped npm name `wif` is already occupied, while `web-interactive-flow` matches the public repository identity and is the selected first-release name.

Current npm Trusted Publishing supports GitHub Actions through OIDC, but a brand-new package may require a one-time bootstrap publication before the package can be configured with a trusted publisher. The release design must not retain a long-lived token after that bootstrap if it is required.

## Decision

The first public npm package identity is:

`web-interactive-flow`

The first public version is:

`0.1.0`

The public entry topology remains exactly the topology accepted by ADR-0011.

### Root

- `createFlowRuntime`
- `compileFlowModule`
- `createFrameScheduler`
- `applyWheelNavigationIntent`

### `./r3f`

- `useFlowFrame`

### `./core.wasm`

- the qualified built Wasm asset

No repository-internal DOM adapter becomes public merely because the npm package is published.

### Release artifact

The npm artifact must be produced through `tools/package/stage_package.mjs`.

Publication must not:

- publish the repository root directly;
- bundle or transpile audited production JavaScript;
- regenerate semantic implementations;
- mutate the built Wasm;
- widen the package export map;
- include tests, tools, research fixtures, MoonBit source, or internal DOM adapters.

The packed artifact used for publication must therefore remain the same class of copy-only artifact already qualified by ADR-0011 and the K/B package evidence.

### Package metadata

The staged manifest records:

- `name: "web-interactive-flow"`;
- the release version derived from the release tag;
- `type: "module"`;
- `license: "MIT"`;
- repository metadata for `YT-TechDev/web-interactive-flow`;
- an explicit public file allowlist;
- the accepted export map;
- public npm access.

The repository field must match the public GitHub repository so npm provenance can bind the package to the actual source repository.

### R3F peer contract for 0.1.0

The first public release keeps `@react-three/fiber` optional at package-install level and uses the directly qualified peer version `9.8.0`.

This is intentionally narrow. A broader peer range requires separate compatibility evidence.

### Release trigger and qualification

Publication is triggered from an explicit GitHub Release/tag boundary, not from arbitrary `main` pushes.

The release workflow must:

1. check out the release tag;
2. verify tag/version agreement with `moon.mod`;
3. verify the tagged commit is contained in `main`;
4. rebuild and re-test the Wasm target;
5. verify the Wasm ABI;
6. run package artifact qualification;
7. run package-aware real-browser qualification;
8. stage the real package identity/version through the same copy-only staging tool;
9. pack and inspect that artifact;
10. publish that exact tarball.

External Actions remain SHA-pinned and GitHub token permissions remain minimal.

### npm authentication and provenance

Trusted Publishing through GitHub Actions is the steady-state publication mechanism.

The publish job may request:

- `contents: read`;
- `id-token: write`.

If npm requires an initial bootstrap credential because the package does not yet exist, that credential is temporary. After the first successful publication:

1. configure npm Trusted Publishing for `YT-TechDev/web-interactive-flow` and the selected release workflow;
2. verify subsequent OIDC publication;
3. remove or revoke the bootstrap publish credential.

Provenance remains enabled for the public package from the public repository.

## Evidence and constraints

- I-01 keeps the MoonBit/Wasm core host-independent.
- I-02 keeps the core Runtime as the single semantic owner.
- ADR-0011 already qualifies one package with explicit host subpaths and copy-only staging.
- K01-K10 qualify the package artifact boundary.
- B01-B10 qualify the packed artifact through one exact Vite/real-Chrome production-build path.
- Current consumer dogfood exercises the same staged Wasm/runtime package surface from an exact local tarball.
- Current `main` CI is green for the selected release baseline.

CI success remains necessary evidence, not semantic proof.

## Consequences

Consumers can install the first public release by the repository-aligned package name once publication completes.

The release does not make the repository DOM adapters public and does not turn JavaScript into a second semantic owner.

The first R3F peer declaration is deliberately narrow.

The first publication may require a one-time npm credential bootstrap, but later releases must prefer OIDC Trusted Publishing rather than retaining that credential.

The Usage Page can move from a vendored dogfood tarball to the registry package after `0.1.0` is independently verified on npm.

## Alternatives considered

### Use `wif`

Rejected because the unscoped npm name is already occupied.

### Use `@yt-techdev/wif`

Not selected for the first release. A scoped name is viable, but the repository-aligned unscoped identity is clearer if available.

### Use a different abbreviated package name

Not selected. Abbreviation would make repository/package identity less obvious without an architectural benefit.

### Publish the repository root

Rejected. ADR-0011 already establishes copy-only staging and an explicit allowlist as the first distribution boundary.

### Keep a long-lived npm token in Actions

Rejected as the steady-state mechanism. Trusted Publishing provides a narrower workflow-bound OIDC credential and provenance.

### Widen R3F peer compatibility for convenience

Deferred. The current evidence directly qualifies `9.8.0`; broader compatibility needs evidence.

## Deferred decisions

This ADR does not establish:

- stable semver compatibility beyond the first `0.1.0` release;
- broad R3F peer-version support;
- TypeScript declaration generation;
- CommonJS or dual-package support;
- package splitting;
- provider/context APIs;
- universal bundler/browser compatibility;
- automatic Wasm fetching;
- public DOM adapter exports.
