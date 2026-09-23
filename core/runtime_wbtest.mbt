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
  match (runtime.transition, direction) {
    (Active(Forward, duration~), Forward)
    | (Active(Reverse, duration~), Reverse) => assert_true(duration > 0)
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
