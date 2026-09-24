///|
/// Test-only semantic vocabulary. These types are deliberately local to the
/// white-box suite: they are neither a Runtime snapshot nor a product ABI.
enum ObservedDirection {
  ObservedForward
  ObservedReverse
} derive(Eq, Debug)

///|
struct RawProgressWitness {
  numerator : Int
  denominator : Int
} derive(Eq, Debug)

///|
enum ObservedTransition {
  Inactive
  Active(ObservedDirection, RawProgressWitness)
} derive(Eq, Debug)

///|
struct SemanticObservation {
  selected_phase : String
  transition : ObservedTransition
  cooldown_active : Bool
  locked : Bool
} derive(Eq, Debug)

///|
enum RequestDisposition {
  Accepted
  Rejected
} derive(Eq, Debug)

///|
enum TraceAction {
  Next
  Previous
  KnownTarget(Int)
  Lock
  Unlock
  Tick(Int)
}

///|
enum TraceActionResult {
  NoRequestDisposition
  Request(RequestDisposition)
} derive(Eq, Debug)

///|
pub extend ObservedDirection with Eq::{equal, not_equal}

///|
pub extend ObservedDirection with Debug::{to_repr}

///|
pub extend RawProgressWitness with Eq::{equal, not_equal}

///|
pub extend RawProgressWitness with Debug::{to_repr}

///|
pub extend ObservedTransition with Eq::{equal, not_equal}

///|
pub extend ObservedTransition with Debug::{to_repr}

///|
pub extend SemanticObservation with Eq::{equal, not_equal}

///|
pub extend SemanticObservation with Debug::{to_repr}

///|
pub extend RequestDisposition with Eq::{equal, not_equal}

///|
pub extend RequestDisposition with Debug::{to_repr}

///|
pub extend TraceActionResult with Eq::{equal, not_equal}

///|
pub extend TraceActionResult with Debug::{to_repr}

///|
/// Projects only trace-relevant semantics. In particular, inactive transitions
/// structurally have no direction or progress, and cooldown erases remaining
/// time to a gate boolean.
fn observe(runtime : Runtime) -> SemanticObservation {
  let transition = match runtime.transition {
    Inactive => ObservedTransition::Inactive
    Active(direction, duration~, elapsed~) => {
      let observed_direction = match direction {
        Direction::Forward => ObservedDirection::ObservedForward
        Direction::Reverse => ObservedDirection::ObservedReverse
      }
      ObservedTransition::Active(observed_direction, {
        numerator: elapsed,
        denominator: duration,
      })
    }
  }
  {
    selected_phase: runtime.phases[runtime.selected],
    transition,
    cooldown_active: runtime.cooldown is Cooldown::Active(_),
    locked: runtime.locked,
  }
}

///|
fn disposition(accepted : Bool) -> TraceActionResult {
  Request(if accepted { Accepted } else { Rejected })
}

///|
/// Applies valid normalized trace inputs. KnownTarget indexes and Tick deltas
/// are fixture-local normalized carriers, so validation failures are excluded.
fn apply_trace_action(
  runtime : Runtime,
  action : TraceAction,
) -> TraceActionResult {
  match action {
    Next => disposition(runtime.request_next())
    Previous => disposition(runtime.request_previous())
    KnownTarget(target) => disposition(runtime.request_known_target(target))
    Lock => {
      runtime.lock()
      NoRequestDisposition
    }
    Unlock => {
      runtime.unlock()
      NoRequestDisposition
    }
    Tick(dt) => {
      runtime.tick(dt)
      NoRequestDisposition
    }
  }
}

///|
/// All known-valid white-box fixtures pass through checked construction.
fn valid_runtime(
  phases : Array[String],
  selected : Int,
  transition_duration : Int,
  cooldown_duration : Int,
) -> Runtime raise {
  match Runtime::new(phases, selected, transition_duration, cooldown_duration) {
    Valid(runtime) => runtime
    Invalid => fail("expected valid test fixture")
  }
}

///|
fn abc(selected : Int) -> Runtime raise {
  valid_runtime(["A", "B", "C"], selected, 100, 0)
}

///|
fn abcd(selected : Int) -> Runtime raise {
  valid_runtime(["A", "B", "C", "D"], selected, 100, 0)
}

///|
fn assert_inactive(runtime : Runtime) -> Unit raise {
  assert_true(runtime.transition is Inactive)
}

///|
fn assert_locked(runtime : Runtime) -> Unit raise {
  assert_true(runtime.locked)
}

///|
fn assert_unlocked(runtime : Runtime) -> Unit raise {
  assert_false(runtime.locked)
}

///|
fn assert_cooldown_inactive(runtime : Runtime) -> Unit raise {
  assert_true(runtime.cooldown is Inactive)
}

///|
fn assert_cooldown_active_at(runtime : Runtime, remaining : Int) -> Unit raise {
  match runtime.cooldown {
    Active(remaining=active_remaining) => {
      assert_eq(active_remaining, remaining)
      assert_true(active_remaining > 0)
    }
    Inactive => fail("cooldown was inactive")
  }
}

///|
fn cooled(selected : Int) -> Runtime raise {
  valid_runtime(["A", "B", "C"], selected, 100, 300)
}

///|
fn assert_active(runtime : Runtime, direction : Direction) -> Unit raise {
  assert_active_at(runtime, direction, 100, 0)
}

///|
fn assert_active_at(
  runtime : Runtime,
  direction : Direction,
  duration : Int,
  elapsed : Int,
) -> Unit raise {
  match (runtime.transition, direction) {
    (Active(Forward, duration=active_duration, elapsed=active_elapsed), Forward)
    | (
      Active(Reverse, duration=active_duration, elapsed=active_elapsed),
      Reverse,
    ) => {
      assert_eq(active_duration, duration)
      assert_eq(active_elapsed, elapsed)
      assert_true(active_duration > 0)
      assert_true(active_elapsed >= 0)
      assert_true(active_elapsed < active_duration)
    }
    _ => fail("active transition direction did not match")
  }
}

///|
test "T1 accepted adjacent navigation has a semantic projection" {
  let runtime = abc(0)

  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Active(ObservedDirection::ObservedForward, {
      numerator: 0,
      denominator: 100,
    }),
    cooldown_active: false,
    locked: false,
  })
}

///|
test "T2 rejected known request preserves semantic projection" {
  let runtime = abc(0)
  let before = observe(runtime)

  assert_eq(apply_trace_action(runtime, Previous), Request(Rejected))
  assert_eq(observe(runtime), before)
}

///|
test "T3 partial positive tick advances exact raw progress" {
  let runtime = abc(0)
  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))

  assert_eq(apply_trace_action(runtime, Tick(25)), NoRequestDisposition)
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Active(ObservedDirection::ObservedForward, {
      numerator: 25,
      denominator: 100,
    }),
    cooldown_active: false,
    locked: false,
  })
}

///|
test "T4 transition completion enters cooldown" {
  let runtime = cooled(0)
  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))

  assert_eq(apply_trace_action(runtime, Tick(100)), NoRequestDisposition)
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Inactive,
    cooldown_active: true,
    locked: false,
  })
}

///|
test "T5 exact cooldown bookkeeping is hidden" {
  let full = cooled(0)
  let partly_consumed = cooled(0)
  assert_eq(apply_trace_action(full, Next), Request(Accepted))
  assert_eq(apply_trace_action(partly_consumed, Next), Request(Accepted))
  assert_eq(apply_trace_action(full, Tick(100)), NoRequestDisposition)
  assert_eq(
    apply_trace_action(partly_consumed, Tick(200)),
    NoRequestDisposition,
  )
  assert_cooldown_active_at(full, 300)
  assert_cooldown_active_at(partly_consumed, 200)

  assert_eq(observe(full), observe(partly_consumed))
}

///|
test "T6 lock and time are orthogonal through projection" {
  let runtime = abc(0)
  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))
  assert_eq(apply_trace_action(runtime, Tick(25)), NoRequestDisposition)
  assert_eq(apply_trace_action(runtime, Lock), NoRequestDisposition)
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Active(ObservedDirection::ObservedForward, {
      numerator: 25,
      denominator: 100,
    }),
    cooldown_active: false,
    locked: true,
  })

  assert_eq(apply_trace_action(runtime, Tick(25)), NoRequestDisposition)
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Active(ObservedDirection::ObservedForward, {
      numerator: 50,
      denominator: 100,
    }),
    cooldown_active: false,
    locked: true,
  })
}

///|
test "T7 zero-duration lifecycle collapses without transition sentinels" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)

  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))
  assert_eq(observe(runtime), {
    selected_phase: "B",
    transition: ObservedTransition::Inactive,
    cooldown_active: true,
    locked: false,
  })
}

///|
test "T8 settled extra tick is projection-idempotent" {
  let runtime = cooled(0)
  assert_eq(apply_trace_action(runtime, Next), Request(Accepted))
  assert_eq(apply_trace_action(runtime, Tick(400)), NoRequestDisposition)
  let before = observe(runtime)

  assert_eq(apply_trace_action(runtime, Tick(25)), NoRequestDisposition)
  assert_eq(observe(runtime), before)
}

///|
test "O01 adjacent next selects target atomically and starts forward transition" {
  let runtime = abc(0)
  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)

  assert_true(runtime.request_next())

  assert_eq(runtime.selected, 1)
  assert_active(runtime, Forward)
}

///|
test "O02 adjacent previous selects target atomically and starts reverse transition" {
  let runtime = abc(1)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)

  assert_true(runtime.request_previous())

  assert_eq(runtime.selected, 0)
  assert_active(runtime, Reverse)
}

///|
test "O03 and P03 direct non-adjacent forward selects only the target" {
  let runtime = abcd(0)
  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)

  assert_true(runtime.request_known_target(3))

  assert_eq(runtime.selected, 3)
  assert_active(runtime, Forward)
}

///|
test "O04 and P03 direct non-adjacent reverse selects only the target" {
  let runtime = abcd(3)
  assert_eq(runtime.selected, 3)
  assert_inactive(runtime)

  assert_true(runtime.request_known_target(0))

  assert_eq(runtime.selected, 0)
  assert_active(runtime, Reverse)
}

///|
test "O05 and P01 same-selected direct request is stable" {
  let runtime = abc(1)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)

  assert_false(runtime.request_known_target(1))

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
}

///|
test "O05 and P01 active direct request is stable" {
  let runtime = abcd(0)
  assert_true(runtime.request_known_target(3))
  assert_eq(runtime.selected, 3)
  assert_active(runtime, Forward)

  assert_false(runtime.request_known_target(1))

  assert_eq(runtime.selected, 3)
  assert_active(runtime, Forward)
}

///|
test "O05 and P01 previous at first boundary is stable" {
  let runtime = abc(0)

  assert_false(runtime.request_previous())

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
}

///|
test "O05 and P01 next at last boundary is stable" {
  let runtime = abc(2)

  assert_false(runtime.request_next())

  assert_eq(runtime.selected, 2)
  assert_inactive(runtime)
}

///|
test "O05 and P01 same-direction active re-entry is stable" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_active(runtime, Forward)

  assert_false(runtime.request_next())

  assert_eq(runtime.selected, 1)
  assert_active(runtime, Forward)
}

///|
test "O05 and P01 active reversal is stable" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_active(runtime, Forward)

  assert_false(runtime.request_previous())

  assert_eq(runtime.selected, 1)
  assert_active(runtime, Forward)
}

///|
test "O06 zero tick preserves an active transition exactly" {
  let runtime = abc(0)
  assert_true(runtime.request_next())

  runtime.tick(0)

  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 0)
}

///|
test "O06 and P04 partial ticks advance exact elapsed quanta monotonically" {
  let runtime = abc(0)
  assert_true(runtime.request_next())

  runtime.tick(25)
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 25)

  runtime.tick(25)
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 50)

  assert_false(runtime.request_previous())
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 50)
}

///|
test "O06 partial tick preserves reverse direction" {
  let runtime = abc(1)
  assert_true(runtime.request_previous())
  assert_eq(runtime.selected, 0)
  assert_active_at(runtime, Reverse, 100, 0)

  runtime.tick(25)

  assert_eq(runtime.selected, 0)
  assert_active_at(runtime, Reverse, 100, 25)
}

///|
test "O06 normalized finer quanta retain exact fractional-host precision" {
  let runtime = valid_runtime(["A", "B"], 0, 200, 0)
  assert_true(runtime.request_next())

  runtime.tick(99)

  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 200, 99)
}

///|
test "O06 just below completion remains active at the exact position" {
  let runtime = abc(0)
  assert_true(runtime.request_next())

  runtime.tick(99)

  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 99)
}

///|
test "O06 exact completion settles without changing the selected target" {
  let runtime = abc(0)
  assert_true(runtime.request_next())

  runtime.tick(100)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
}

///|
test "O06 overshoot settles without changing the selected target" {
  let runtime = abc(0)
  assert_true(runtime.request_next())

  runtime.tick(101)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
}

///|
test "O06 bounded overshoot avoids an overflowing addition" {
  let runtime = valid_runtime(["A", "B"], 0, 1_100_000_000, 0)
  assert_true(runtime.request_next())

  runtime.tick(1_000_000_000)
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 1_100_000_000, 1_000_000_000)

  runtime.tick(1_200_000_000)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
}

///|
test "P02 combined and segmented ticks agree before completion" {
  let combined = valid_runtime(["A", "B"], 0, 200, 0)
  let segmented = valid_runtime(["A", "B"], 0, 200, 0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())

  combined.tick(99)
  segmented.tick(40)
  segmented.tick(59)

  assert_eq(combined.selected, 1)
  assert_eq(segmented.selected, 1)
  assert_active_at(combined, Forward, 200, 99)
  assert_active_at(segmented, Forward, 200, 99)
}

///|
test "P02 combined and segmented ticks agree from non-zero elapsed" {
  let combined = valid_runtime(["A", "B"], 0, 200, 0)
  let segmented = valid_runtime(["A", "B"], 0, 200, 0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())
  combined.tick(1)
  segmented.tick(1)

  combined.tick(99)
  segmented.tick(49)
  segmented.tick(50)

  assert_eq(combined.selected, 1)
  assert_eq(segmented.selected, 1)
  assert_active_at(combined, Forward, 200, 100)
  assert_active_at(segmented, Forward, 200, 100)
}

///|
test "P02 combined and segmented ticks agree across completion" {
  let combined = abc(0)
  let segmented = abc(0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())

  combined.tick(110)
  segmented.tick(60)
  segmented.tick(50)

  assert_eq(combined.selected, 1)
  assert_eq(segmented.selected, 1)
  assert_inactive(combined)
  assert_inactive(segmented)
}

///|
test "transition-only settled tick is idempotent" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  assert_inactive(runtime)

  runtime.tick(25)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
}

///|
test "L1 O05 and P01 idle lock rejects adjacent navigation stably" {
  let runtime = abc(0)
  assert_unlocked(runtime)
  runtime.lock()

  assert_false(runtime.request_next())

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_locked(runtime)
}

///|
test "L2 O05 and P01 idle lock rejects direct navigation stably" {
  let runtime = abc(0)
  runtime.lock()

  assert_false(runtime.request_known_target(2))

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_locked(runtime)
}

///|
test "L3 unlock does not replay a rejected request" {
  let runtime = abc(0)
  runtime.lock()
  assert_false(runtime.request_next())

  runtime.unlock()

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_unlocked(runtime)

  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 0)
  assert_unlocked(runtime)
}

///|
test "L4 transition-only O08 lock and unlock preserve active lifecycle" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  runtime.tick(25)

  runtime.lock()
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 25)
  assert_locked(runtime)

  runtime.unlock()
  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 25)
  assert_unlocked(runtime)
}

///|
test "L5 transition-only P05 locked and unlocked lifecycle projections agree" {
  let unlocked = abc(0)
  let locked = abc(0)
  assert_true(unlocked.request_next())
  assert_true(locked.request_next())
  unlocked.tick(25)
  locked.tick(25)
  locked.lock()

  unlocked.tick(25)
  locked.tick(25)

  assert_eq(unlocked.selected, 1)
  assert_eq(locked.selected, 1)
  assert_active_at(unlocked, Forward, 100, 50)
  assert_active_at(locked, Forward, 100, 50)
  assert_unlocked(unlocked)
  assert_locked(locked)
}

///|
test "L6 transition-only O08 transition completes while locked" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  runtime.tick(25)
  runtime.lock()

  runtime.tick(75)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_locked(runtime)
}

///|
test "L7 lock remains the gate after completion until a fresh unlocked request" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  runtime.tick(25)
  runtime.lock()
  runtime.tick(75)
  assert_inactive(runtime)

  assert_false(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_locked(runtime)

  runtime.unlock()
  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 2)
  assert_active_at(runtime, Forward, 100, 0)
  assert_unlocked(runtime)
}

///|
test "L8 active locked rejection preserves lifecycle state" {
  let runtime = abc(0)
  assert_true(runtime.request_next())
  runtime.tick(25)
  runtime.lock()

  assert_false(runtime.request_known_target(2))

  assert_eq(runtime.selected, 1)
  assert_active_at(runtime, Forward, 100, 25)
  assert_locked(runtime)
}

///|
test "C1 exact transition completion starts the full cooldown" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "O06 zero tick preserves an active cooldown exactly" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
  assert_unlocked(runtime)

  runtime.tick(0)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
  assert_unlocked(runtime)
}

///|
test "C2 transition overshoot is consumed by cooldown" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(150)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 250)
}

///|
test "C3 exact transition and cooldown budget settles in one tick" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(400)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "C4 excess beyond the full lifecycle has no effect" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(450)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "C5 exact cooldown expiry controls navigation eligibility" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  runtime.tick(299)
  assert_cooldown_active_at(runtime, 1)
  assert_false(runtime.request_next())
  runtime.tick(1)
  assert_cooldown_inactive(runtime)
  assert_true(runtime.request_next())
}

///|
test "C6 rejected cooldown request preserves the original expiry boundary" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(150)
  assert_cooldown_active_at(runtime, 250)
  assert_false(runtime.request_known_target(2))
  assert_eq(runtime.selected, 1)
  assert_cooldown_active_at(runtime, 250)
  runtime.tick(249)
  assert_cooldown_active_at(runtime, 1)
  runtime.tick(1)
  assert_cooldown_inactive(runtime)
}

///|
test "C7 direct known target cannot bypass cooldown" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  assert_false(runtime.request_known_target(2))
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "C8 adjacent request cannot bypass cooldown" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  assert_false(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "C9 zero configured cooldown never creates an active cooldown" {
  let exact = abc(0)
  let overshoot = abc(0)
  assert_true(exact.request_next())
  assert_true(overshoot.request_next())
  exact.tick(100)
  overshoot.tick(150)
  assert_inactive(exact)
  assert_inactive(overshoot)
  assert_cooldown_inactive(exact)
  assert_cooldown_inactive(overshoot)
}

///|
test "C10 P02 agrees across transition into cooldown" {
  let combined = cooled(0)
  let segmented = cooled(0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())
  combined.tick(250)
  segmented.tick(80)
  segmented.tick(20)
  segmented.tick(150)
  assert_eq(combined.selected, segmented.selected)
  assert_inactive(combined)
  assert_inactive(segmented)
  assert_cooldown_active_at(combined, 150)
  assert_cooldown_active_at(segmented, 150)
}

///|
test "C11 P02 agrees across transition from non-zero elapsed" {
  let combined = cooled(0)
  let segmented = cooled(0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())
  combined.tick(25)
  segmented.tick(25)
  combined.tick(175)
  segmented.tick(50)
  segmented.tick(125)
  assert_inactive(combined)
  assert_inactive(segmented)
  assert_cooldown_active_at(combined, 200)
  assert_cooldown_active_at(segmented, 200)
}

///|
test "C12 P02 agrees while already in cooldown" {
  let combined = cooled(0)
  let segmented = cooled(0)
  assert_true(combined.request_next())
  assert_true(segmented.request_next())
  combined.tick(100)
  segmented.tick(100)
  combined.tick(125)
  segmented.tick(50)
  segmented.tick(75)
  assert_cooldown_active_at(combined, 175)
  assert_cooldown_active_at(segmented, 175)
}

///|
test "C13 large bounded lifecycle avoids overflowing additions" {
  let runtime = valid_runtime(["A", "B"], 0, 1_100_000_000, 1_100_000_000)
  assert_true(runtime.request_next())
  runtime.tick(1_000_000_000)
  assert_active_at(runtime, Forward, 1_100_000_000, 1_000_000_000)
  assert_cooldown_inactive(runtime)
  runtime.tick(1_200_000_000)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "C14 cooldown advances while locked" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  runtime.lock()
  runtime.tick(200)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 100)
  assert_locked(runtime)
}

///|
test "C15 unlock before cooldown expiry does not bypass cooldown" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(200)
  runtime.lock()
  runtime.unlock()
  assert_false(runtime.request_next())
  assert_cooldown_active_at(runtime, 200)
  assert_unlocked(runtime)
}

///|
test "C16 cooldown expires while lock remains an independent gate" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(100)
  runtime.lock()
  runtime.tick(300)
  assert_cooldown_inactive(runtime)
  assert_locked(runtime)
  assert_false(runtime.request_next())
  runtime.unlock()
  assert_true(runtime.request_next())
}

///|
test "C17 full P05 locked and unlocked lifecycle projections agree" {
  let unlocked = cooled(0)
  let locked = cooled(0)
  assert_true(unlocked.request_next())
  assert_true(locked.request_next())
  unlocked.tick(25)
  locked.tick(25)
  locked.lock()
  unlocked.tick(175)
  locked.tick(175)
  assert_inactive(unlocked)
  assert_inactive(locked)
  assert_cooldown_active_at(unlocked, 200)
  assert_cooldown_active_at(locked, 200)
  assert_unlocked(unlocked)
  assert_locked(locked)
}

///|
test "C18 lock remains orthogonal through full lifecycle settlement" {
  let unlocked = cooled(0)
  let locked = cooled(0)
  assert_true(unlocked.request_next())
  assert_true(locked.request_next())
  locked.lock()
  unlocked.tick(400)
  locked.tick(400)
  assert_inactive(unlocked)
  assert_inactive(locked)
  assert_cooldown_inactive(unlocked)
  assert_cooldown_inactive(locked)
  assert_unlocked(unlocked)
  assert_locked(locked)
}

///|
test "C19 settled time after cooldown is idempotent" {
  let runtime = cooled(0)
  assert_true(runtime.request_next())
  runtime.tick(400)
  runtime.lock()
  runtime.tick(250)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_locked(runtime)
}

///|
test "Z1 O09 adjacent forward zero-duration lifecycle collapses" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 0)

  assert_true(runtime.request_next())

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "Z2 O09 adjacent reverse zero-duration lifecycle collapses" {
  let runtime = valid_runtime(["A", "B", "C"], 1, 0, 0)

  assert_true(runtime.request_previous())

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "Z3 O09 and P03 direct non-adjacent zero-duration selects only target" {
  let runtime = valid_runtime(["A", "B", "C", "D"], 0, 0, 0)

  assert_true(runtime.request_known_target(3))

  assert_eq(runtime.selected, 3)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "Z4 O09 positive cooldown starts synchronously at full duration" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)

  assert_true(runtime.request_next())

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "Z5 O06 zero-duration acceptance consumes no cooldown time" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)
  assert_true(runtime.request_next())

  runtime.tick(0)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
  assert_unlocked(runtime)
}

///|
test "Z6 O06 exact cooldown expiry after zero-duration acceptance" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)
  assert_true(runtime.request_next())

  runtime.tick(299)
  assert_cooldown_active_at(runtime, 1)
  assert_false(runtime.request_next())
  runtime.tick(1)
  assert_cooldown_inactive(runtime)

  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 2)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "Z7 O09 repeated zero-duration zero-cooldown acceptance" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 0)

  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)

  assert_true(runtime.request_next())
  assert_eq(runtime.selected, 2)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "Z8 O05 and P01 same-selected zero-duration rejection is stable" {
  let runtime = valid_runtime(["A", "B", "C"], 1, 0, 300)

  assert_false(runtime.request_known_target(1))

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
}

///|
test "Z9 O05 and P01 locked zero-duration rejection is stable" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)
  runtime.lock()

  assert_false(runtime.request_next())

  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_locked(runtime)
}

///|
test "Z10 O06 zero-duration-origin cooldown uses ordinary tick semantics" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)
  assert_true(runtime.request_next())

  runtime.tick(125)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 175)
}

///|
test "Z11 O10 settled time is idempotent from zero-zero origin" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 0)
  assert_true(runtime.request_next())

  runtime.tick(250)

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "Z12 O05 and P01 cooldown rejection after zero-duration is stable" {
  let runtime = valid_runtime(["A", "B", "C"], 0, 0, 300)
  assert_true(runtime.request_next())

  assert_false(runtime.request_known_target(2))

  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_active_at(runtime, 300)
}

///|
test "V1 empty domain is invalid" {
  assert_true(Runtime::new([], 0, 0, 0) is Invalid)
}

///|
test "V2 adjacent duplicate phase is invalid" {
  assert_true(Runtime::new(["A", "A"], 0, 0, 0) is Invalid)
}

///|
test "V3 non-adjacent duplicate phase is invalid" {
  assert_true(Runtime::new(["A", "B", "A"], 0, 0, 0) is Invalid)
}

///|
test "V4 trailing duplicate phase is invalid" {
  assert_true(Runtime::new(["A", "B", "B"], 0, 0, 0) is Invalid)
}

///|
test "V5 negative selected index is invalid" {
  assert_true(Runtime::new(["A", "B"], -1, 0, 0) is Invalid)
}

///|
test "V6 selected index equal to domain length is invalid" {
  assert_true(Runtime::new(["A", "B"], 2, 0, 0) is Invalid)
}

///|
test "V7 negative transition duration is invalid" {
  assert_true(Runtime::new(["A"], 0, -1, 0) is Invalid)
}

///|
test "V8 negative cooldown duration is invalid" {
  assert_true(Runtime::new(["A"], 0, 0, -1) is Invalid)
}

///|
test "V9 one-phase zero-duration configuration is valid and ordinary" {
  let runtime = valid_runtime(["A"], 0, 0, 0)
  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "V10 zero transition and positive cooldown constructs inactive" {
  let runtime = valid_runtime(["A", "B"], 0, 0, 300)
  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "V11 final selected boundary is valid" {
  let runtime = valid_runtime(["A", "B"], 1, 100, 0)
  assert_eq(runtime.selected, 1)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "V12 large researched positive lifecycle values are valid" {
  let runtime = valid_runtime(["A", "B"], 0, 1_100_000_000, 1_100_000_000)
  assert_eq(runtime.selected, 0)
  assert_inactive(runtime)
  assert_cooldown_inactive(runtime)
  assert_unlocked(runtime)
}

///|
test "checked construction owns a stable phase-domain copy" {
  let phases = ["A", "B"]
  let runtime = valid_runtime(phases, 0, 100, 0)
  assert_eq(runtime.phases, ["A", "B"])

  phases[1] = "A"

  assert_eq(phases, ["A", "A"])
  assert_eq(runtime.phases, ["A", "B"])
}
