# ADR-0019 — Pointer listener synchronously routes Runtime disposition to the originating policy

Status: Accepted

## Context

ADR-0018 established a conditional accepted-only gesture theorem: a reusable stateful Pointer Events policy that permits retry/reversal after semantic rejection but consumes an active sequence after semantic acceptance needs access to the authoritative Runtime disposition.

ADR-0018 deliberately did not select where that feedback seam belongs or how it is represented.

Issue #156 researched that deferred placement boundary against the existing production Pointer Events listener.

The research compared:

- a binding-local Runtime-shaped facade;
- a shared/decorated Runtime;
- listener-mediated disposition routing;
- proposal-local transaction objects;
- a separately wired disposition observer;
- synchronous and deferred feedback timing.

The discriminating concerns were request-origin attribution, stale feedback delivery, failure ordering, and ownership separation.

## Decision

The first production disposition-feedback placement is **listener-mediated and synchronous**.

For one delivered PointerEvent:

```text
PointerEvent
   |
   v
stateful host gesture policy
   |
   +--> decline
   |
   +--> next | previous
            |
            v
        pointer listener
            |
            v
          Runtime
      accepted | rejected
            |
            v
 synchronous disposition routing
            |
            v
 same originating policy
```

When the policy produces a normalized `next` or `previous`, the listener submits exactly one corresponding Runtime request.

If that Runtime request returns a disposition, the listener may synchronously route the normalized intent and returned disposition back to the **same policy instance that originated the request** before the listener invocation completes.

This routing is transaction plumbing.

It does not make listener mechanics the owner of gesture recognition or semantic eligibility.

This ADR selects placement, request-origin scope, timing, and minimum information.

It does **not** select the final public callback/method name or API shape.

### Feedback is request-origin scoped

Only Runtime requests issued because the current pointer policy produced an intent are eligible for feedback to that policy.

Unrelated Runtime requests must not mutate pointer gesture-policy state merely because they use the same semantic Runtime.

Issue #156 falsified a general/shared Runtime decorator:

```text
shared decorated Runtime
programmatic next
-> Runtime accepted
-> pointer policy observes accepted
-> pointer policy commits
```

No pointer proposal occurred.

Therefore pointer disposition feedback is not Runtime-global observation.

The listener-mediated placement structurally binds:

```text
originating policy proposal
  -> one listener-owned Runtime request
  <- that request disposition
  -> same originating policy
```

### Feedback is synchronous

The first seam routes feedback during the same request call stack after the Runtime has returned its disposition.

Issue #156 falsified deferred feedback without identity:

```text
gesture A
next -> Runtime accepted
feedback queued

pointercancel / reset
gesture B begins

old accepted feedback delivered
-> gesture B can be committed by stale feedback
```

Avoiding that failure asynchronously would require additional proposal/gesture identity and lifetime rules.

Current evidence does not justify that widening.

Therefore asynchronous/deferred disposition feedback is not selected.

### The minimum feedback is intent plus disposition

For the current one-event/one-request contract, the required observation is only:

```text
next | previous
+
accepted | rejected
```

The feedback seam does not require:

- the original PointerEvent;
- selected phase;
- transition state;
- cooldown;
- lock state;
- a Runtime snapshot;
- a proposal identifier;
- a gesture identifier.

Issue #156 reproduced the accepted-only reversal trace with only normalized intent and disposition.

### Runtime remains the semantic owner

The listener does not predict whether a request will be accepted.

It does not inspect `runtime.getSnapshot()` or mirror semantic gating state.

The Runtime remains the sole owner of:

- phase-boundary eligibility;
- transition eligibility;
- cooldown;
- lock;
- request disposition.

The listener only transports the result already decided by the Runtime.

### Gesture semantics remain policy-owned

Disposition routing does not move gesture interpretation into listener mechanics.

The listener still does not own:

- threshold;
- axis or diagonal policy;
- velocity or duration;
- reversal rules;
- pointer identity;
- pointerType allowlists;
- multi-pointer policy;
- accepted-only commitment itself.

A stateful policy may choose to interpret `accepted` as commitment under ADR-0018.

That interpretation remains policy state.

### Runtime does not mutate gesture policy

The semantic Runtime remains unaware of:

- PointerEvent objects;
- gesture sequences;
- policy instances;
- feedback callbacks;
- gesture commitment.

The listener invokes the Runtime and then performs host-local disposition routing.

No MoonBit/Wasm state or ABI change is required by this ADR.

### Runtime failure before disposition produces no feedback

If the Runtime request throws or otherwise fails before returning a semantic disposition, no `accepted` or `rejected` feedback exists to route.

That failure must not be fabricated as semantic rejection.

Exact public validation/error encoding remains outside this ADR.

### Feedback failure occurs after semantic disposition

Issue #156 established the ordering:

```text
Runtime next
-> accepted
-> semantic state changes

listener routes feedback
-> feedback hook throws
```

The Runtime remained in the accepted semantic state.

Therefore a host-layer feedback failure after disposition must not be reclassified as Runtime `rejected`.

This ADR does not require the listener to swallow that failure.

The exact public feedback-failure exception policy remains a production API detail, but semantic disposition must remain intact and distinguishable.

### Shared Runtime decoration is not the selected placement

A strictly private binding-local Runtime facade was shown to be semantically sufficient when:

- only the pointer listener receives that facade;
- unrelated callers retain the original Runtime.

That result proves the existing production listener was not architecturally invalid.

It does not select Runtime decoration as the production seam.

The facade relies on a scope invariant that can be violated by reuse and visually resembles a general Runtime despite carrying pointer-policy coupling.

Listener-mediated routing is narrower in ownership because the listener already owns the exact proposal-to-request transaction.

### Proposal-local transaction identity is not required

A research proposal-object shape could also preserve attribution.

However, under the current synchronous contract, it produced no stronger observable theorem than direct listener-mediated routing.

Therefore this ADR does not widen:

```text
policy.handle(event)
  -> null | next | previous
```

merely to carry proposal identity.

If a future asynchronous seam is justified, transaction identity requires separate evidence.

### A separately wired observer is not selected

Issue #156 showed that an independently supplied observer can be wired to a different policy than the policy that originated the proposal.

That creates additional origin-routing responsibility.

The listener already knows the originating policy and request transaction, so the first placement does not introduce a separate observer owner.

## Evidence and constraints

Repository authority:

- I-01 keeps pointer/DOM concepts outside the core.
- I-02 keeps semantic eligibility under one Runtime owner.
- I-04 requires observable request disposition.
- I-06 requires evidence before widening semantics.
- ADR-0016 owns Pointer Events substrate selection.
- ADR-0017 owns listener/lifecycle mechanics and one-request-per-delivered-event behavior.
- ADR-0018 establishes when an accepted-only gesture policy requires semantic disposition observation.

Issue #156 / PR #157 supplied the placement evidence.

PR #157 CI #271 passed both `moonbit-wasm` and `differential-reference`.

### Binding-local facade evidence

The production listener composed with a strictly private feedback facade and correctly routed one pointer-origin disposition.

A direct request through the original Runtime did not notify pointer policy.

A shared/decorated Runtime did notify pointer policy for an unrelated programmatic request, falsifying general decoration.

### Synchronous timing evidence

Synchronous feedback completed before pointer cancellation and a later sequence began.

Deferred feedback without identity was delivered after reset/new-sequence and incorrectly committed the new sequence.

### Listener-mediated evidence

A research listener-mediated candidate preserved:

```text
C
next -> rejected
policy remains uncommitted
reverse
previous -> accepted
C -> B
policy commits
```

Threshold, coordinates, reversal, and commitment remained policy-owned.

### Failure-order evidence

Runtime failure before disposition produced no feedback.

Feedback failure after Runtime acceptance propagated only after the semantic state had already changed.

### Evidence limits

Issue #156 did not add redundant physical-input or browser-default-action qualification.

Those concerns were already qualified under ADR-0016 and ADR-0017.

The discriminating evidence here is host-layer transaction placement and ordering.

## Consequences

A production pointer-listener seam can be implemented without:

- introducing a Runtime-global observer;
- wrapping the Runtime as shared mutable feedback state;
- exposing Runtime snapshots;
- sending PointerEvents back through the feedback path;
- introducing proposal/gesture IDs;
- changing MoonBit/Wasm;
- selecting a production gesture algorithm.

The implementation frontier must preserve existing policies that do not require disposition feedback unless evidence shows that compatibility is impossible.

The smallest compatible representation of the optional feedback capability remains to be chosen by production implementation evidence.

## Alternatives considered

### Shared/decorated Runtime

Rejected as the production placement.

It can misattribute unrelated Runtime requests to pointer policy.

### Strictly binding-local Runtime facade

Semantically valid, but not selected.

Its correctness depends on non-escape scope, while the listener already owns the exact originating transaction.

### Deferred/asynchronous feedback

Rejected for the first seam.

Without identity it can mutate stale/new gesture state. Adding identity and lifetime semantics is unnecessary widening at this frontier.

### Proposal-local transaction/result object

Not selected.

It works, but current synchronous evidence does not require widening the policy return shape.

### Separate disposition observer

Not selected.

It creates additional caller-owned origin-routing responsibility and can diverge from the originating policy.

### Runtime snapshot observation

Rejected.

It duplicates semantic knowledge and is unnecessary.

## Deferred frontiers

This ADR does not select:

- feedback method or callback name;
- optional-policy capability representation;
- exact validation/error strings;
- exact feedback-failure exception API;
- production gesture recognizer;
- threshold;
- axis/diagonal rules;
- velocity/duration;
- exact reversal strategy;
- pointerType allowlist;
- multi-pointer policy;
- native-control/ignore policy;
- explicit pointer capture API;
- default `touch-action`;
- React integration;
- package export;
- core/Wasm state or ABI changes;
- asynchronous feedback or transaction identity.
