# ADR-0007 — Browser Wasm acquisition terminates at a validated Module

Status: Accepted

## Context

The host-independent MoonBit/Wasm runtime is already exposed through a scalar Wasm ABI and a JavaScript semantic wrapper.

The semantic wrapper consumes a `WebAssembly.Module` and creates one fresh `WebAssembly.Instance` for each semantic Runtime. The current artifact proof also requires the WIF module to have zero imports and the required scalar function exports.

After ADR-0005 and ADR-0006 established browser time normalization and frame scheduling, Issues #62 and #63 selected and falsified the next missing Web-host boundary: acquiring a reusable WIF `WebAssembly.Module` from a browser/Web `Response` without prematurely owning package, URL, instance, runtime, or scheduling policy.

The WebAssembly Web API exposes `WebAssembly.compileStreaming()` for compiling a `Response` or promise of a `Response` directly to a `WebAssembly.Module`.

## Decision

For the first browser/Web Wasm acquisition proof, the bridge accepts a caller-supplied `Response` or `Promise<Response>` and compiles it with `WebAssembly.compileStreaming()`.

The boundary is:

```text
Response | Promise<Response>
        |
        v
WebAssembly.compileStreaming(source)
        |
        v
existing WIF module compatibility validation
        |
        v
validated reusable WebAssembly.Module
```

The acquisition boundary ends at the validated `WebAssembly.Module`.

It does not create a `WebAssembly.Instance`, initialize a semantic Runtime, start frame scheduling, or dispose Runtime state.

### Input ownership

The first compiler accepts only a caller-supplied `Response` or `Promise<Response>`.

It does not own:

- `fetch()`;
- URL or `Request` construction;
- package-relative artifact discovery;
- bundler asset rules;
- CDN paths;
- retry policy.

A caller may compose `fetch(url)` with the compiler because `fetch()` produces a promise for a `Response`, but the URL and fetch operation remain caller/application concerns.

### Streaming compilation

The first compiler uses strict `WebAssembly.compileStreaming(source)` without a buffered `ArrayBuffer` / `WebAssembly.compile()` fallback and without custom compile options.

The WebAssembly Web API's streaming requirements remain authoritative. In particular, a streaming response must satisfy the platform's response, CORS, status, and `application/wasm` MIME requirements.

The bridge must not catch every streaming failure and retry through a buffered path. Such retry could hide server MIME misconfiguration, response-status/CORS failure, CSP or environment restrictions, body-consumption failure, or genuine WebAssembly compilation failure.

A future non-streaming compatibility path requires separate evidence.

### WIF compatibility validation

Successful WebAssembly compilation proves only that the bytes form a valid WebAssembly module.

Before returning the Module as a WIF-compatible acquisition result, the bridge reuses the existing repository compatibility validator, which requires:

- no WebAssembly imports;
- every required scalar WIF ABI export to exist as a function.

The semantic `createFlowRuntime(module, config)` boundary retains its own compatibility validation because callers may supply Modules obtained through other paths.

The validation logic must be shared rather than reimplemented.

### Instance and Runtime ownership

`WebAssembly.instantiateStreaming()` is not the primary acquisition seam.

Creating an Instance during acquisition would cross the existing ownership boundary where the semantic wrapper creates a fresh Instance for each Runtime. The reusable Module is the correct handoff between acquisition and semantic runtime creation.

### Cache and response-body ownership

The acquisition helper owns no global or URL-keyed Module cache.

The caller/application may retain the returned Module and reuse it to create independent semantic Runtime instances.

`compileStreaming()` consumes the supplied Response body. The bridge does not implicitly clone the Response. Repeated compilation therefore requires a fresh or caller-cloned Response.

### Failure boundary

HTTP/network, response/MIME/CORS, CSP/environment, body-consumption, and WebAssembly compilation failures are host acquisition failures. They are not semantic flow request dispositions.

The first bridge does not freeze a custom public error taxonomy or exact error messages for these failures.

### Environment scope

This acquisition contract depends on WebAssembly streaming and `Response` semantics only. It does not depend on `window`, `document`, requestAnimationFrame, visibility, DOM input, React, R3F, or presentation.

Automated tests outside a real browser may prove repository-owned composition and validation, but they must not be presented as proof of every browser CORS, CSP, network, or deployment configuration.

## Evidence and constraints

- Issue #62 selected browser Wasm Module acquisition ahead of direct Window rAF binding, DOM projection, DOM input/native-scroll, and visibility policy.
- Issue #63 selected `Response | Promise<Response>` -> strict `compileStreaming()` -> shared WIF compatibility validation -> reusable Module.
- `createFlowRuntime(module, config)` already consumes a Module and creates a fresh Instance.
- Current ABI evidence proves the WIF artifact has zero imports and required scalar function exports.
- I-01/I-02 require host acquisition to remain outside the host-independent flow-semantic core.
- I-04 requires invalid boundary input to remain distinct from ordinary known-request dispositions.

Platform evidence:

- WebAssembly Web API: https://webassembly.github.io/spec/web-api/
- `WebAssembly.compileStreaming()`: https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/compileStreaming_static

## Consequences

A Web consumer can acquire and qualify one reusable WIF Module without committing the repository to a package path or browser-global fetch policy.

Multiple semantic Runtime instances can continue to be created independently from the same compiled Module through the existing semantic wrapper.

Server/deployment correctness for streaming Wasm remains visible rather than being silently masked by an automatic byte-buffer fallback.

Direct Window frame binding, package exports, asset URL discovery, cache policy, DOM projection/input, and visibility-aware scheduling remain open later frontiers.

## Alternatives considered

### `WebAssembly.instantiateStreaming()` as the loader boundary

Rejected. It creates an Instance before the semantic wrapper and blurs the proven Module -> fresh Instance per Runtime ownership boundary.

### Internal `fetch(url)`

Rejected for the first proof. It would force URL and artifact-location policy into the compiler boundary.

### Buffered fallback after streaming failure

Rejected for the first proof. No current consumer requires it, and catch-all fallback could hide materially different host failures.

### Always buffer then `WebAssembly.compile()`

Rejected for the first browser/Web acquisition proof. It bypasses the selected streaming-response contract without evidence that buffering is required.

### Loader-owned Module cache

Rejected as premature. The compiler owns no resource identity or application lifetime from which to justify cache keys or eviction.
