# ADR-0024 — Pointer proposal timing is replaceable host policy

Status: Accepted

## Context

ADR-0020 defines the reusable single-pointer sequence lifecycle.

ADR-0021 defines finite start-relative signed displacement under one stable host-owned scalar projection.

ADR-0022 defines threshold qualification as projected-unit host policy before any Runtime request.

ADR-0023 defines sign-to-intent mapping as orientation-relative replaceable host policy.

ADR-0018 separates normalized proposal emission from accepted-only semantic gesture commitment, and ADR-0019 provides synchronous request-origin-scoped Runtime disposition feedback.

Those decisions deliberately left one host-policy question unresolved:

> At which delivered pointer-event boundaries may an otherwise eligible normalized proposal be produced?

Issue #182 / PR #183 researched this boundary independently of:

- a universal move-time or pointerup-time default;
- reversal commitment;
- direction locking;
- retry/cardinality policy;
- velocity/acceleration;
- threshold/projector/mapping defaults;
- pointerType policy;
- writing-mode/layout behavior;
- production recognizer representation;
- React/package API;
- core/Wasm changes.

The research supports a narrow timing theorem without selecting one recognizer UX.

## Decision

Pointer proposal timing is **replaceable host policy**.

It determines which delivered pointer-event boundaries may expose an otherwise eligible normalized proposal.

A representative layering is:

```text
ADR-0020 valid sequence
  -> ADR-0021 finite signed displacement
  -> ADR-0022 threshold qualification
  -> ADR-0023 sign-to-intent mapping
  -> host proposal timing
  -> next | previous | no proposal
  -> generic pointer listener
  -> Runtime disposition
  -> later policy-defined semantic commitment
```

This diagram records responsibility boundaries, not one mandatory internal implementation order for every future recognizer.

### Move-time and pointerup-time are observably distinct policy classes

Research held pointer samples, start-relative displacement, threshold qualification, and sign mapping stable while changing only the event boundary eligible to produce a proposal.

For a sequence that crossed the tested threshold before termination:

- the move-time policy could produce a normalized request on the qualifying `pointermove`;
- the pointerup-time policy produced no request until `pointerup`.

For identical delivered samples containing two qualifying moves followed by pointerup, the tested move-time policy produced two requests while the tested pointerup-time policy produced one terminal request.

Therefore move-time and pointerup-time are not observationally interchangeable.

This ADR does **not** select either as the WIF-wide default.

### Timing does not redefine measurement, qualification, or mapping

The same tested start-relative displacement algebra, strict threshold qualifier, and sign mapper were reused under both timing classes.

Equivalent eligible terminal displacement could produce the same normalized intent under either timing class.

Therefore proposal timing determines **when** a host policy may surface an eligible proposal; it does not redefine:

- displacement measurement;
- threshold units or qualification semantics;
- sign-to-intent meaning.

Those remain governed by ADR-0021 through ADR-0023.

### Proposal timing is not Runtime semantic acceptance

The event boundary that produces a proposal does not predict Runtime disposition.

A recording Runtime used in the research returned either `accepted` or `rejected` for the same normalized request path without changing proposal timing.

That recording witness establishes separation and routing only; actual Runtime eligibility remains governed by the semantic Runtime and existing Runtime authority.

The host policy must not infer semantic acceptance merely because a proposal occurred on `pointermove`, `pointerup`, or another future authorized event boundary.

### Proposal timing is not semantic gesture commitment

A move-time proposal may be followed by later eligible movement when the composed policy remains uncommitted.

Research preserved a rejected move-time proposal followed by later qualifying movement in the opposite direction.

Therefore proposal emission alone does not freeze gesture direction or consume the semantic sequence.

Accepted-only semantic commitment remains governed by ADR-0018 and disposition routing by ADR-0019.

### Cancellation exposes a timing difference

Research used a sequence that crossed the tested threshold and then received `pointercancel` before pointerup.

The tested move-time policy could already have emitted a proposal before cancellation.

The tested pointerup-time policy emitted no terminal proposal from cancellation.

Therefore cancellation can distinguish proposal-timing policy classes.

This does not make `pointercancel` a semantic Runtime event and does not define one universal cancellation UX beyond existing host lifecycle authority.

### Reversal remains independent from timing

Research used one sequence that first crossed in one direction and terminated with eligible displacement in the opposite direction.

Under the tested uncommitted policies:

- move-time exposed the earlier eligible direction;
- pointerup-time exposed the terminal eligible direction.

This demonstrates that proposal timing can change which directional observation is surfaced.

It does **not** select:

- reversal commitment;
- direction locking;
- first-direction wins;
- last-direction wins;
- retry behavior.

Those remain separate host-policy questions.

### Request cardinality belongs to composed policy, not timing alone

Changing only proposal timing can change request schedule and request count.

However pointerup-only timing is not required to obtain one accepted semantic commitment.

Research composed move-time proposal timing with ADR-0019 synchronous disposition feedback:

- after an `accepted` disposition, the research policy committed and suppressed later proposals;
- under an otherwise identical `rejected` control, the policy remained uncommitted and continued producing later qualifying proposals.

Therefore one-request, one-accepted-navigation, retry, or consume-on-accept behavior belongs to a composed timing + commitment policy.

This ADR does not select a universal request-cardinality contract.

### Generic pointer listener remains timing-agnostic

Production `bindPointerNavigation()` remained unchanged during research.

It receives each delivered pointer event, invokes host policy, and routes only a returned normalized `next | previous` intent to Runtime.

The generic listener does not select or interpret:

- move-time versus pointerup-time;
- displacement;
- threshold;
- mapping;
- reversal;
- commitment.

Timing state therefore does not belong in the generic listener merely to support these policy classes.

### Runtime receives no proposal-timing metadata

Runtime requests remain normalized semantic requests.

The research required no Runtime arguments carrying:

- PointerEvent objects;
- event type;
- pointer coordinates;
- proposal-timing class;
- timing state.

No Runtime snapshot read is required to decide proposal timing.

No new MoonBit/Wasm state or ABI is required by this decision.

## Evidence and constraints

Issue #182 / PR #183 established the following bounded evidence:

- a qualifying move can produce an immediate request under move-time while pointerup-time remains silent until termination;
- the same displacement/qualification/mapping semantics can be reused under both timing classes;
- proposal event choice does not establish Runtime acceptance;
- rejected move-time proposal does not itself create semantic commitment;
- cancellation before pointerup can distinguish timing classes;
- identical samples with only timing changed can produce different request schedules/cardinality;
- terminal reversal can make an earlier move-time proposal differ from a pointerup-time terminal proposal;
- production `bindPointerNavigation()` remains timing-agnostic;
- Runtime receives no timing or PointerEvent metadata;
- accepted-only move-time composition can commit on authoritative `accepted` feedback while the rejected control remains uncommitted.

Latest research qualification:

- PR #183 research head: `e8a89221f5c770b8ef6213164182a844c931a912`;
- CI #314: success;
- research test step: success;
- differential-reference: success;
- repository browser/package/R3F qualification: success;
- CodeRabbit identified two valid test-evidence defects;
- commits `5ff664c` and `e8a8922` addressed them;
- latest CodeRabbit incremental review: no actionable comments;
- unresolved review threads: zero;
- PR #183 squash-merged as `ca5ce93ee6b7015bc7d07278129c1612bc1117a6`.

## Consequences

A reusable pointer gesture policy may choose a proposal event boundary without changing core Runtime semantics.

Hosts may implement move-time, pointerup-time, or a separately researched future timing class while preserving the existing measurement, qualification, mapping, listener, and Runtime boundaries.

Timing-specific request schedule differences are host-policy observations and must not be hidden as core semantic differences.

A future production recognizer must make its proposal-timing and commitment/cardinality policy explicit rather than implying that one follows automatically from the other.

No production recognizer is authorized by this ADR.

## Alternatives considered

### Universal move-time proposal

Not selected.

Move-time can expose eligible motion before termination and can emit multiple proposals without a separate commitment/cardinality policy.

The research does not establish it as the universal UX.

### Universal pointerup-time proposal

Not selected.

Pointerup-time delays proposal until termination, cancellation can remove that terminal opportunity, and accepted-only one-request behavior does not require pointerup timing.

The research does not establish it as the universal UX.

### Put proposal timing in Runtime/core

Rejected.

Proposal timing depends on host event delivery and does not alter normalized Runtime semantic truth.

### Put proposal timing in the generic pointer listener

Rejected.

The production listener remains normalized-intent transport/lifecycle/disposition plumbing and can host either researched timing class without owning timing semantics.

### Treat proposal event as semantic commitment

Rejected.

Runtime disposition remains authoritative and accepted-only commitment is separately governed by ADR-0018/ADR-0019.

### Treat timing as a universal request-cardinality guarantee

Rejected.

Move-time plus accepted-only disposition feedback can consume an accepted sequence while rejected proposals remain retryable.

Cardinality is a composed policy property.

## Deferred frontiers

This ADR does not select:

- move-time as default;
- pointerup-time as default;
- any other default proposal event;
- reversal commitment;
- direction locking;
- first-direction or terminal-direction ownership;
- retry/cardinality policy;
- velocity/acceleration;
- threshold default/comparator;
- projector orientation;
- coordinate property;
- X/Y or diagonal policy;
- sign-to-intent default;
- pointerType policy;
- writing-mode behavior;
- RTL/LTR behavior;
- production gesture recognizer representation or API;
- React integration;
- package export;
- core/Wasm state or ABI.

## Evidence limits

This ADR does not establish:

- equivalent physical-device gesture behavior across touch, mouse, or pen;
- browser-wide pointer event delivery equivalence;
- one universally preferred responsiveness/latency UX;
- accessibility suitability of move-time or pointerup-time behavior;
- one request per physical gesture;
- one accepted navigation per physical gesture without an explicit composed commitment contract;
- universal reversal semantics;
- velocity- or duration-aware recognition;
- native scrolling or `touch-action` policy;
- pointer capture policy.
