///|
fn abc(selected : Int) -> Runtime {
  Runtime::new(["A", "B", "C"], selected, 100)
}

///|
fn abcd(selected : Int) -> Runtime {
  Runtime::new(["A", "B", "C", "D"], selected, 100)
}

///|
fn assert_inactive(runtime : Runtime) -> Unit raise {
  assert_true(runtime.transition is Inactive)
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
  let runtime = Runtime::new(["A", "B"], 0, 200)
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
  let runtime = Runtime::new(["A", "B"], 0, 1_100_000_000)
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
  let combined = Runtime::new(["A", "B"], 0, 200)
  let segmented = Runtime::new(["A", "B"], 0, 200)
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
  let combined = Runtime::new(["A", "B"], 0, 200)
  let segmented = Runtime::new(["A", "B"], 0, 200)
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
