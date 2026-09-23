///|
/// Direction is meaningful only while a transition is active.
priv enum Direction {
  Forward
  Reverse
}

///|
priv enum Transition {
  Inactive
  Active(Direction, duration~ : Int)
}

///|
/// This first proof keeps all representation private. Phase indexes are an
/// implementation detail, and transition duration has no public unit yet.
priv struct Runtime {
  phases : Array[String]
  mut selected : Int
  transition_duration : Int
  mut transition : Transition
}

///|
/// Construction receives an already-valid ordered domain, selected member,
/// and positive duration. Validation and a public constructor are deliberately
/// outside this proof.
fn Runtime::new(
  phases : Array[String],
  selected : Int,
  transition_duration : Int,
) -> Runtime {
  { phases, selected, transition_duration, transition: Inactive, }
}

///|
fn Runtime::request_next(self : Runtime) -> Bool {
  self.request_adjacent(1)
}

///|
fn Runtime::request_previous(self : Runtime) -> Bool {
  self.request_adjacent(-1)
}

///|
fn Runtime::request_adjacent(self : Runtime, offset : Int) -> Bool {
  guard self.transition is Inactive else { return false }
  let target = self.selected + offset
  guard target >= 0 && target < self.phases.length() else { return false }
  let direction = if target > self.selected { Forward } else { Reverse }
  self.selected = target
  self.transition = Active(direction, duration=self.transition_duration)
  true
}
