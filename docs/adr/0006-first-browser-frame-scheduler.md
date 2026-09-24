# ADR-0006 — First browser frame scheduler consumes delivered frame timestamps

Status: Accepted

## Context

The host-independent runtime already consumes explicit normalized `tick(dt)` inputs.

ADR-0005 and Issues #52 through #56 established a browser-host time-normalization boundary that converts one caller-defined monotonic timestamp stream into exact microsecond budgets and valid signed-i32 tick chunks without importing browser scheduling into the core.

A real browser host still needs a bounded scheduling rule for requestAnimationFrame-style delivery:

- requestAnimationFrame is one-shot and subsequent frames must be requested explicitly;
- delivered callbacks carry a monotonic high-resolution timestamp;
- browsers may suspend frame callbacks for background or hidden documents;
- explicit application stop/restart is distinct from a browser temporarily not delivering callbacks.

Issue #57 researched the smallest scheduler boundary before any DOM input, visibility, loader, or presentation policy is added.

## Decision

The first browser frame scheduler is host state above the semantic runtime.

While the scheduler remains Running, every delivered requestAnimationFrame-style timestamp belongs to one ADR-0005 normalization epoch.

If frame callbacks are suspended and later resume with a larger timestamp while the scheduler remained Running, the scheduler consumes the elapsed gap represented by the delivered timestamp stream.

This is a reported-timestamp catch-up rule only. It does not claim wall-clock, operating-system-sleep, or universal cross-browser physical-time equivalence.

For one successfully delivered frame, processing order is:

```text
delivered timestamp
        |
        v
normalize exact elapsed budget
        |
        v
apply every valid i32 tick chunk in order
        |
        v
read one semantic snapshot
        |
        v
invoke observer once
        |
        v
if still Running and processing succeeded,
request exactly one next frame
```

Exact tick-chunk decomposition is a carrier detail. It must not create additional host-frame observations.

A frame with zero normalized elapsed budget still reads one semantic snapshot and invokes the observer once.

### Explicit stop and restart

Explicit `stop()`:

- transitions the scheduler to Stopped;
- cancels its pending frame request when one exists;
- ends the current timestamp-normalization epoch;
- does not dispose the semantic runtime;
- does not mutate core flow state merely because scheduling stopped.

A later `start()`:

- requests exactly one frame;
- begins a new normalization epoch on the first delivered timestamp;
- advances zero lifecycle time on that first frame;
- still reads one semantic snapshot and invokes the observer.

Browser callback suspension while the scheduler remains Running does not itself end or rebase the epoch.

Scheduler lifecycle controls are idempotent:

- `start()` while Running is a no-op;
- `stop()` while Stopped is a no-op.

### Runtime and normalizer ownership

The scheduler receives an already-created semantic runtime.

It may drive and observe that runtime through the semantic surface required by scheduling, conceptually:

- `tick(validChunk)`;
- `getSnapshot()`.

It does not:

- create the Wasm module;
- construct the semantic runtime;
- dispose the semantic runtime;
- own phase, transition, cooldown, lock, direction, progress, or request-eligibility semantics.

Each scheduler owns one private ADR-0005 clock normalizer.

There is no process-global normalizer.

One time-driving scheduler per semantic runtime is a first-proof architectural precondition. The first implementation does not require a process-global registry solely to enforce that precondition.

### Frame-request ownership

Outside active callback execution, a Running scheduler owns at most one pending frame request.

The absence of a pending request is represented explicitly, such as by `null`. Numeric request identifier `0` must not be treated as impossible.

When a requested frame callback is delivered, the scheduler clears its pending-request ownership before frame processing or observer code executes.

A stale callback delivered after the scheduler has become Stopped performs no tick, snapshot read, observer call, or reschedule.

### Observer

The first scheduler observer receives only one semantic snapshot per successfully delivered frame.

It does not receive:

- raw Wasm ABI values;
- raw frame timestamp;
- normalized budget;
- tick chunks;
- request identifier;
- visibility metadata.

The observer return value is ignored.

If observer code synchronously issues semantic runtime commands through separately held runtime access, those commands are ordered after the snapshot captured for the current frame.

If the observer calls scheduler `stop()`, the current callback does not request another frame.

### Failure behavior

An exception from timestamp normalization, chunk decomposition, runtime ticking, snapshot observation, or the observer:

- transitions the scheduler to Stopped;
- ends the current normalization epoch;
- requests no next frame;
- propagates the exception;
- does not dispose the semantic runtime.

No rollback of already-applied valid tick chunks is claimed.

A later explicit restart begins a new normalization epoch.

### Visibility policy

The first scheduler does not install a visibility listener and does not inspect document visibility state.

Visibility-aware pause/rebase behavior remains a later host-policy widening.

A future visibility-aware scheduler may deliberately end/rebase an epoch, but that behavior is not part of this first scheduler contract.

### Test binding

The first implementation may receive injected request/cancel functions shaped conceptually as:

```text
requestFrame(callback) -> opaque request id
cancelFrame(request id)
```

This supports deterministic scheduler falsification without introducing a browser test dependency.

A later browser binding may connect these functions to `requestAnimationFrame` and `cancelAnimationFrame` without changing scheduler semantics.

## Evidence and constraints

- ADR-0002 places browser/R3F frame-loop behavior in host adapters rather than the core.
- ADR-0005 defines exact browser-host timestamp normalization and explicitly leaves visibility/scheduling policy to a later scheduler layer.
- Issue #57 compared catch-up, visibility-pause, configurable, and externally-driven scheduler candidates.
- Issue #57 selected reported-timestamp catch-up while continuously Running and a fresh epoch after explicit stop/restart.
- Issue #57 selected tick-all-chunks-before-one-snapshot ordering.
- I-02 requires the core runtime to remain the single owner of flow semantics.
- I-03 places host scheduling outside core determinism until it is normalized into explicit commands and deltas.
- I-05 requires host projections not to redefine core truth.

## Consequences

The first real-time browser scheduler can drive the existing semantic runtime without adding scheduling concepts to MoonBit/Wasm.

Browser callback suspension and explicit application stop have intentionally different epoch behavior.

Carrier chunking remains invisible to frame observers.

A scheduler can be deterministically tested with an injected frame-request harness before DOM input or package integration exists.

The first scheduler does not solve page-visibility pause, wheel/native-scroll ownership, pointer/touch, keyboard/focus, DOM projection, loader strategy, or package API design.

## Alternatives considered

### Pause semantic lifecycle automatically when the document is hidden

Deferred. It introduces Document visibility policy and an additional rebase lifecycle that the first scheduling theorem does not require.

### Make catch-up versus pause configurable immediately

Rejected for the first proof. No current consumer requires both policies, and configuration would widen API and lifecycle evidence prematurely.

### Continue the same epoch across explicit scheduler stop/restart

Rejected. Explicit stop is host control that intentionally suspends scheduler driving; consuming stopped time on restart would make stop semantics surprising and harder to falsify.

### Read the snapshot before applying the delivered frame's elapsed budget

Rejected. It would project state corresponding to the prior scheduling instant and create an avoidable one-frame lag.

### Observe once per tick chunk

Rejected. Chunk decomposition is a carrier constraint for one host-time interval, not a browser-frame semantic.

### Let the scheduler create or dispose the semantic runtime

Rejected. Runtime lifetime and semantic configuration are independent of frame scheduling and are already owned by the semantic wrapper/caller.
