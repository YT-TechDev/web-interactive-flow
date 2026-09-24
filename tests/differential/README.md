# Differential semantic traces

`traces.json` is the single repository-owned source for the bounded O01–O10
cross-implementation examples. `tools/differential/generate.mjs` validates that
source and deterministically emits both committed test programs.

The fixture format is **test-only, provisional, compatibility-unstable**, and
replaceable without migration guarantees before product serialization is
justified. It is not Runtime serialization, a Wasm ABI, a JavaScript/TypeScript
product API, or a public interchange format.

Phase values in the fixture are semantic identities. Times are non-negative
exact rationals whose denominator is a supported power of two. For each trace,
the MoonBit test generator finds the largest denominator and scales every
configured duration, cooldown, and tick into exact integer test quanta. Those
quanta deliberately have no physical or product unit. The reference generator
uses the exactly representable JavaScript Number value. Neither path rounds or
uses a tolerance.

Expected observations deliberately erase representation details: an inactive
transition has no direction or progress, and cooldown is only a gate. The corpus
contains no phase indexes, settled/idle sentinels, exact cooldown remaining,
source history, host events, exception strings, or presentation state.

Regenerate with:

```sh
node tools/differential/generate.mjs
git diff --exit-code -- \
  core/differential_generated_wbtest.mbt \
  tests/differential/generated/reference.generated.test.ts
```
