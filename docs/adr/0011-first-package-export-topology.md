# ADR-0011 — First distribution uses one package with isolated host subpaths

Status: Accepted

## Context

Web Interactive Flow now has proven production surfaces for the framework-neutral/Web host and React Three Fiber:

- `createFlowRuntime`;
- `compileFlowModule`;
- `createFrameScheduler`;
- `applyWheelNavigationIntent`;
- `useFlowFrame`.

The repository intentionally remained package-less while those semantic and host boundaries were researched and qualified.

Issue #95 researched the first distribution topology after those production seams existed. The goal was to make the proven runtime consumable outside the repository without making R3F architectural owner, publishing implementation internals, or reintroducing network/artifact ownership into the bridge.

Modern package export maps can expose explicit public subpaths while encapsulating other package files. npm peer metadata can also mark host-framework peers optional at install time.

The existence of those mechanisms does not itself define WIF package architecture. The first topology must preserve the repository's DOM/Web-first architecture and the ownership boundaries already established by ADR-0007 through ADR-0010.

## Decision

The first distributable topology is **one logical package with explicit public subpaths**.

Conceptually:

```text
<wif>
  .
    -> framework-neutral/Web facade

  ./r3f
    -> R3F adapter facade

  ./core.wasm
    -> packaged Wasm asset
```

The exact package name is not selected by this ADR.

### Root/framework-neutral facade

The first root facade exposes only these proven production consumer seams:

- `createFlowRuntime`;
- `compileFlowModule`;
- `createFrameScheduler`;
- `applyWheelNavigationIntent`.

The root facade must not import or re-export the R3F adapter.

A framework-neutral/Web consumer must be able to install and import this root surface without React or R3F being present.

### R3F facade

The `./r3f` subpath exposes only:

- `useFlowFrame`.

Provider/context remains deferred.

The first package does not expose R3F through the root facade.

### R3F dependency isolation

For the one-package topology, `@react-three/fiber` is a host peer used by the R3F subpath.

It is optional at package-install level so a framework-neutral/Web consumer is not required to install R3F merely to use the root surface.

The first topology does not add direct React or Three.js peer declarations merely because the qualification fixture installs them. WIF currently imports neither React nor Three.js directly from the production R3F hook; R3F remains responsible for its own host peer contract.

The exact public R3F peer-version range is not selected by this ADR. The exact versions used by qualification remain provenance, not an automatic support range.

### Package-private implementation

The package export map is a closed public boundary.

The first package does not expose package-name subpaths for:

- `bridge/internal.mjs`;
- raw Wasm ABI implementation details;
- lower-level clock-normalizer internals;
- repository source-tree filenames;
- MoonBit source;
- tests, tools, generated fixtures, or qualification internals.

Implementation files may be present inside the package artifact when required by exported modules, but they are not public package entry points.

### Packaged Wasm asset

The first package includes the qualified built `core.wasm`.

It is exposed as the explicit package subpath:

```text
./core.wasm
```

The package does not automatically fetch, cache, or select a network location for this asset.

A consumer or its package/bundler environment resolves the packaged asset. The caller then owns acquisition and supplies a `Response` or `Promise<Response>` to `compileFlowModule()` according to ADR-0007.

This ADR does not claim universal browser-bundler behavior for package-exported Wasm assets.

### Copy-only release staging

The first package artifact is constructed through a generated copy-only staging boundary.

Package construction may:

- copy audited production `.mjs` bytes unchanged;
- create small explicit facade modules that only re-export selected production surfaces;
- copy the qualified built Wasm bytes unchanged;
- create package metadata;
- stage release documentation/license files;
- pack and inspect the resulting artifact.

The first distribution process does not introduce:

- JavaScript bundling;
- transpilation;
- semantic source transformation;
- framework-specific compilation;
- generated replacement implementations.

A later build pipeline requires separate evidence.

### Explicit package allowlist

The package artifact uses an explicit file allowlist and an explicit export map.

Publishing the repository tree by default is not part of the first topology.

### One package, not split packages

The first topology does not split Web/framework-neutral and R3F surfaces into independent packages.

The current R3F production API is a single thin hook. A split would add workspace topology, release coordination, cross-package versioning, and duplicated metadata without a demonstrated requirement that explicit subpath isolation cannot satisfy.

A future package split remains possible and requires new evidence.

## Public API boundary

The first package topology authorizes these public entry points only:

### Root

- `createFlowRuntime`
- `compileFlowModule`
- `createFrameScheduler`
- `applyWheelNavigationIntent`

### R3F subpath

- `useFlowFrame`

### Asset subpath

- `core.wasm`

This is a distribution/public-entry decision. It does not change the semantics of any exported function.

## Evidence and constraints

Repository authority:

- I-01 requires the MoonBit/Wasm core to remain host-independent;
- I-02 requires one semantic owner;
- ADR-0002 keeps DOM/Web and R3F as host adapters;
- ADR-0007 leaves resource acquisition/fetch policy with the caller/application/package layer;
- ADR-0009 and ADR-0010 keep R3F read-only and explicit-Runtime;
- current real-DOM evidence proves framework-neutral/Web consumption without R3F;
- current actual-R3F evidence proves the R3F adapter independently.

Current package-platform evidence used by Issue #95 includes:

- Node package `exports` and subpath exports;
- Node package-resolution support for exported assets;
- npm peer dependencies and optional peer metadata;
- npm package file allowlisting and `npm pack` artifact inspection.

## Consequences

A Web-only consumer can use the root package surface without installing R3F.

An R3F consumer opts into the explicit R3F subpath and supplies the host peer.

The Wasm runtime ships with the same logical package, but the package does not own network fetching.

Repository internal file layout can continue to evolve behind the export map.

The first release artifact can be audited as a copy-only staging product rather than introducing a JavaScript build tool.

A future provider, additional host adapter, TypeScript declarations, peer-range widening, package split, or bundler-specific Wasm helper can be researched independently.

## Alternatives considered

### Split Web and R3F packages immediately

Deferred. Stronger physical dependency isolation is possible, but current R3F API size does not justify the extra workspace/versioning/release topology.

### Re-export R3F from the root entry

Rejected. It weakens the host boundary and can force R3F module resolution onto consumers that only need framework-neutral/Web APIs.

### Publish repository source tree directly

Rejected for the first artifact. Stable Wasm placement already requires staging, and a generated package boundary gives stronger release provenance without bundling.

### Bundle/transpile into dist

Rejected for the first artifact. Current JavaScript is already standard ESM and no compatibility evidence requires transformation.

### Omit the Wasm artifact

Rejected. A distributed WIF JavaScript surface without the qualified runtime artifact would leave consumers dependent on an out-of-band build/resource source.

### Add an automatic Wasm URL/fetch helper

Not selected. ADR-0007 already establishes caller-owned resource acquisition. A package asset subpath is sufficient for the first distribution theorem.

### Add React and Three.js as WIF peers

Not selected. The current WIF production R3F adapter imports only `@react-three/fiber`. Duplicating transitive host peer policy without direct WIF ownership is not justified.

## Deferred decisions

This ADR does not select:

- final package name;
- stable semver support promise;
- exact public `@react-three/fiber` peer range;
- TypeScript declaration generation;
- CommonJS or dual-package support;
- workspace layout;
- split-package future;
- universal browser bundler support for Wasm;
- package-owned network fetch;
- provider/context;
- RSC/`"use client"` package strategy.

These remain later distribution or host frontiers.
