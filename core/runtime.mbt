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
  self.request_adjacent(Forward)
}

///|
fn Runtime::request_previous(self : Runtime) -> Bool {
  self.request_adjacent(Reverse)
}

///|
/// Requests a target that has already been normalized to a valid member of
/// this runtime's configured domain. Keeping that precondition private avoids
/// defining unknown-target validation semantics in this proof.
fn Runtime::request_known_target(self : Runtime, target : Int) -> Bool {
  guard self.transition is Inactive else { return false }
  guard target != self.selected else { return false }
  let direction = if target > self.selected { Forward } else { Reverse }
  self.selected = target
  self.transition = Active(direction, duration=self.transition_duration)
  true
}

///|
/// Adjacent requests establish their target is in bounds before entering the
/// trusted known-target path.
fn Runtime::request_adjacent(self : Runtime, direction : Direction) -> Bool {
  let target = match direction {
    Forward => self.selected + 1
    Reverse => self.selected - 1
  }
  guard target >= 0 && target < self.phases.length() else { return false }
  self.request_known_target(target)
}
