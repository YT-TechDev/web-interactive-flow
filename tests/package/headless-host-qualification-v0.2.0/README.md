# WIF v0.2.0 second headless host qualification

**Classification:** historical, bounded qualification evidence. This file is not normative architecture, a new invariant, an ADR, or a public API contract.

It records the exact published npm artifact tested in Node 24.19.0 and preserves a runnable consumer trace. It does not qualify current source for every future change. The fixture is intentionally outside ordinary CI: it must not turn immutable npm v0.2.0 or live registry availability into a gate for later source versions.

## Refrozen identity

The repository source still matches the historical qualification baseline:

| Item | Observed value |
| --- | --- |
| WIF main commit | 779e670bd1ad11bc4ffc44caf04c47aba411da50 |
| WIF main tree | 3defcc763f3f35b46b1dd1a77d75fbbf6c9cffd2 |
| Source version | 0.2.0 |
| Tag and GitHub Release | v0.2.0 at the main commit |
| Registry latest | 0.2.0 |
| npm tarball | https://registry.npmjs.org/web-interactive-flow/-/web-interactive-flow-0.2.0.tgz |
| Registry integrity | sha512-uwdHSxsfNFzgbDyGwj26U8TgG1tcCK6+P46bE2rxjA7HZyZDhkPk+mUYc/dXOeTC1fvQhIdQWhuNgPqems3IJg== |
| Registry shasum | 0f89bf52f6ad6dd9f35407164994a0cb5bac3ab5 |
| Independently computed tarball SHA-256 | e1e7f1cde17a51dc8e2068d080d309494cbab9b6d879fc1ae26f17228eeea7be |
| Packaged core.wasm SHA-256 | 430cfc1549112427b5e3dfbe80e4c2634ad5cfe24b44fd12d8e6830b16f3a656 |
| Packaged core.wasm size | 11,441 bytes |

The registry metadata contains 16 files and 52,969 unpacked bytes. The exact export map is:

~~~json
{
  ".": "./index.mjs",
  "./r3f": "./r3f.mjs",
  "./core.wasm": "./core.wasm"
}
~~~

The npm signing/provenance verification recorded for this artifact found one verified registry signature and one verified attestation. The SLSA provenance subject was pkg:npm/web-interactive-flow@0.2.0 with the published digest; it names repository YT-TechDev/web-interactive-flow, ref refs/tags/v0.2.0, commit 779e670bd1ad11bc4ffc44caf04c47aba411da50, workflow .github/workflows/npm-release.yml, and workflow run 36749914405 attempt 1. The provenance transparency-log index was 3022650625; the separate npm publish attestation index was 3022664961. The release workflow and published tag identify the same source commit.

Live registry refreeze commands:

~~~sh
npm view web-interactive-flow dist-tags --json
npm view web-interactive-flow@latest version dist.integrity dist.shasum dist.tarball --json
npm view web-interactive-flow@0.2.0 exports --json
~~~

The refreeze returned latest 0.2.0 and the exact integrity, shasum, and tarball URL above. The package lock in this fixture pins the same version and integrity.

## Environment and reproduction

The historical consumer ran with Node v24.19.0. It used the public package root and public core.wasm export. It did not install or import React, React Three Fiber, Three.js, a renderer, or a browser framework. There was no DOM, window/document, WheelEvent/PointerEvent, or browser frame API in the process. The optional R3F peer was absent.

Run the frozen artifact fixture from this directory:

~~~sh
node --version
npm ci --ignore-scripts --no-audit --no-fund --omit=optional
npm audit signatures
npm ls --depth=0
npm test
~~~

Expected runtime: Node 24.19.0. The test asserts that exact version. npm ci uses the checked-in lock file and verifies the registry artifact integrity. npm audit signatures rechecks npm’s signature and attestation for the installed package. npm test compiles the exported Wasm asset through the public compileFlowModule API, creates the public Runtime, and replays the trace below. No source deep import is used.

This is an opt-in historical reproduction. It is deliberately not part of current-source CI. The repository’s normal Runtime, package, browser, and differential checks remain the evidence for current source.

## Host organizations and semantic trace

One Runtime was created and disposed for each host run, with no concurrent Runtime clock.

- **Host A:** direct imperative calls; request sites A and B invoke existing Runtime methods directly; snapshots are read after each operation.
- **Host B:** one host-owned mutation/invalidation boundary wraps requests, lock changes, unlock, and ticks; two observers pull current snapshots after invalidation.
- **Host C:** requests return their Runtime disposition synchronously; one manual frame/tick owner advances semantic time and then both observers pull snapshots.

These are three organizations in a temporary headless consumer. They are not React, Vue, Svelte, Solid, Angular, or framework compatibility tests. The fixture contains no generic WIF dispatcher: each step calls next(), previous(), goTo(), lock(), unlock(), or tick() directly. The small trace helper is test-local and does not predict eligibility from snapshots.

Configuration: phases alpha, beta, gamma, delta; initial alpha; transitionDuration 10; cooldown 5. A row shows the semantic snapshot as selected / transition / cooldownActive / locked. “Settled” means transition is null.

| # | Operation | Result | Snapshot |
| ---: | --- | --- | --- |
| 1 | Initial observation | — | alpha / settled / false / false |
| 2 | Site A next() | accepted | beta / forward 0 / false / false |
| 3 | Site B previous() during transition | rejected | beta / forward 0 / false / false |
| 4 | tick(0) | — | beta / forward 0 / false / false |
| 5 | tick(5) | — | beta / forward 0.5 / false / false |
| 6 | tick(5) | — | beta / settled / true / false |
| 7 | Site B next() during cooldown | rejected | beta / settled / true / false |
| 8 | tick(5) | — | beta / settled / false / false |
| 9 | Site B goTo("delta"), non-adjacent | accepted | delta / forward 0 / false / false |
| 10 | tick(10) | — | delta / settled / true / false |
| 11 | tick(5) | — | delta / settled / false / false |
| 12 | Site B goTo("delta"), same target | rejected | delta / settled / false / false |
| 13 | Site A next() at last boundary | rejected | delta / settled / false / false |
| 14 | Site A previous(); host acknowledgment throws afterward | accepted; host effect failed | gamma / reverse 0 / false / false |
| 15 | tick(15) | — | gamma / settled / false / false |
| 16 | Site B goTo("alpha") | accepted | alpha / reverse 0 / false / false |
| 17 | Large valid tick(1000) | — | alpha / settled / false / false |
| 18 | Site A previous() at first boundary | rejected | alpha / settled / false / false |
| 19 | lock() | — | alpha / settled / false / true |
| 20 | Site B next() while locked | rejected | alpha / settled / false / true |
| 21 | unlock() | — | alpha / settled / false / false |
| 22 | Site B goTo("omega") | validation failure; unchanged state | alpha / settled / false / false |

The invalid target throws before returning a Runtime disposition. The pre- and post-call snapshots are equal. It is a validation failure, not a rejected known request.

The host acknowledgment is a test-local caller-owned effect counter. Four accepted requests caused four effect attempts; three completed and the step 14 attempt threw after Runtime acceptance. Six known requests were rejected and the invalid target failed validation; none caused the accepted-only effect. The Runtime request was not rolled back or retried. This does not generalize ADR-0028’s wheel preventDefault rule into a WIF-wide effect contract.

For all 22 rows, the three host organizations produced equal dispositions/failure points and equal semantic projections: selected, transition presence/direction/raw progress, cooldownActive, and locked. Host-local cache history, invalidation count, and observer timing are excluded from that comparison.

## Observer lifecycle and counterexample

Two independent read-only observers shared the Runtime. Each reads semantic truth from getSnapshot(); neither owns flow state.

- Both observers attached and pulled the same current snapshot.
- With observer A detached, a host-routed request/tick advanced the Runtime and observer B; A received no host-local update while detached.
- Reattaching A performed one current-state pull. It recovered the present snapshot without replaying missed history.
- The same detach, mutation, and reattach pattern was exercised for observer B.
- With both detached, the Runtime remained alive. The owner could stop the host loop, issue an accepted request, then resume the single clock with tick(15). Reattaching each observer pulled only the current stable snapshot.
- Detaching observers or stopping the loop did not dispose the Runtime. The explicit owner disposed it after the lifecycle experiment; next() and getSnapshot() then failed as disposed.

A separate out-of-band mutation probe preserved the negative evidence:

~~~text
request site writes runtime.next() without the shared host update path
→ observer caches remain alpha
→ Runtime getSnapshot() is already beta with an active forward transition
→ a direct pull sees current Runtime state
→ one shared host-owned invalidation around tick(15) refreshes attached observers
→ subsequent centralized goTo("delta") and tick(15) keep both observers current
~~~

This is a real host-presentation staleness counterexample when a writer bypasses host coordination. The WIF Runtime itself was not stale. Central host-owned invalidation plus pull snapshots resolved the tested stale cache. This does not say that every host can centralize writes or that WIF guarantees reactive updates.

The dual-clock probe is misuse evidence only: after one accepted transition, two nominal owners each called tick(3); Runtime progress advanced from 0.3 to 0.6 because it consumed six valid time units. The Runtime did not identify owner identity. This is host lifecycle policy, not semantic nondeterminism; no guard or new invariant was justified.

## Bounded verdicts

| Claim | Verdict for this evidence |
| --- | --- |
| Exact published root and Wasm work in Node 24.19.0 without DOM/framework dependencies | Supported in this one tested environment |
| Equivalent request/tick traces across Hosts A, B, and C | Supported for these three organizations |
| Two read-only observers can detach, reattach, and recover current state without replay | Supported for the tested lifecycle |
| Multiple request sites need no semantic mirror or eligibility predictor | Supported for the tested consumer |
| General subscription requirement | Falsified for the tested host organizations |
| Public WIF subscription primitive | Not justified by the tested evidence |
| A materially different future host | Unresolved |
| Generic request dispatcher | Not justified; hosts select existing Runtime methods |
| Generic accepted-only host-effect API | Not justified; returned disposition sufficed for this test |
| MoonBit/Wasm semantic or ABI change | Not justified |
| JS Runtime/public package change | Not justified |
| New ADR or invariant change | Not justified |
| v0.3.0 production release | Not justified by qualification alone |

The subscription statuses are deliberately separate. Do not shorten them to “WIF does not need subscriptions.” The effect result is a headless acknowledgment example; it does not establish a universal WIF host-effect ordering rule.

## Explicit non-claims and open questions

This evidence does not establish universal compatibility with Node, Deno, Bun, workers, SSR/RSC, any browser, bundler, package manager, or framework. It does not establish performance, snapshot object identity stability, or compatibility with browser frame APIs. The test does not exercise createFrameScheduler or applyWheelNavigationIntent.

Open questions remain: whether a future host has a legitimate writer that cannot share any host-owned update boundary; whether a specific framework lifecycle makes local invalidation materially repetitive or impossible; what ordering/reentrancy/listener-failure contract a future push primitive would need; and whether dual-clock ownership should ever be enforced. Ergonomics alone is not a Runtime semantic counterexample.

## Authority and history

The current repository authority reviewed for this evidence includes AGENTS.md; docs/INVARIANTS.md I-01 through I-07; docs/ARCHITECTURE.md; docs/HOST_BOUNDARIES.md; docs/TESTING.md; and accepted ADR-0001 through ADR-0028, with particular relevance from ADR-0009, ADR-0010, ADR-0011, and ADR-0028. This record supports those boundaries; it does not amend them.

Related repository history: #209 (completed DOM/Web boundary research), ADR-0028 and #210 (v0.2.0 host ownership), PR #212 (implementation), PR #213 (distribution documentation), PR #214 (release source), #206 (Trusted Publishing follow-up), and this evidence follow-up #215. The exact source/tag and registry artifact are separate evidence layers; source identity alone does not prove which bytes npm served.

The original qualification was recorded on 2026-10-01. This durable fixture preserves the historical result and offers a reproducible falsification path without making it a current-source guarantee.

