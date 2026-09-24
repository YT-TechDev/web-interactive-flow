///|
/// Direction is meaningful only while a transition is active.
priv enum Direction {
  Forward
  Reverse
}

///|
priv enum Transition {
  Inactive
  Active(Direction, duration~ : Int, elapsed~ : Int)
}

///|
/// Active cooldowns always carry a strictly positive remaining duration.
priv enum Cooldown {
  Inactive
  Active(remaining~ : Int)
}

///|
/// This first proof keeps all representation private. Phase indexes are an
/// implementation detail, and transition duration has no public unit yet.
priv struct Runtime {
  phases : Array[String]
  mut selected : Int
  transition_duration : Int
  cooldown_duration : Int
  mut transition : Transition
  mut cooldown : Cooldown
  mut locked : Bool
}

///|
/// Construction receives an already-valid ordered domain, selected member,
/// a positive transition duration, and a non-negative uniform cooldown.
/// Validation and a public constructor are deliberately outside this proof.
fn Runtime::new(
  phases : Array[String],
  selected : Int,
  transition_duration : Int,
  cooldown_duration : Int,
) -> Runtime {
  {
    phases,
    selected,
    transition_duration,
    cooldown_duration,
    transition: Inactive,
    cooldown: Inactive,
    locked: false,
  }
}

///|
/// Manual lock changes request eligibility without changing lifecycle state.
fn Runtime::lock(self : Runtime) -> Unit {
  self.locked = true
}

///|
/// Unlocking permits future requests; rejected requests are never replayed.
fn Runtime::unlock(self : Runtime) -> Unit {
  self.locked = false
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
  guard !self.locked else { return false }
  guard self.transition is Inactive else { return false }
  guard self.cooldown is Inactive else { return false }
  guard target != self.selected else { return false }
  let direction = if target > self.selected { Forward } else { Reverse }
  self.selected = target
  self.transition = Active(
    direction,
    duration=self.transition_duration,
    elapsed=0,
  )
  self.cooldown = Inactive
  true
}

///|
/// Advances an already-valid non-negative count of abstract time quanta. This
/// private proof consumes transition time before cooldown time. Lock state is
/// deliberately absent from lifecycle arithmetic.
fn Runtime::tick(self : Runtime, dt : Int) -> Unit {
  let mut remaining_dt = dt
  match self.transition {
    Inactive => ()
    Active(direction, duration~, elapsed~) => {
      let remaining = duration - elapsed
      if remaining_dt >= remaining {
        remaining_dt = remaining_dt - remaining
        self.transition = Inactive
        if self.cooldown_duration > 0 {
          self.cooldown = Active(remaining=self.cooldown_duration)
        } else {
          self.cooldown = Inactive
        }
      } else {
        self.transition = Active(
          direction,
          duration~,
          elapsed=elapsed + remaining_dt,
        )
        return
      }
    }
  }
  match self.cooldown {
    Inactive => ()
    Active(remaining~) =>
      if remaining_dt >= remaining {
        self.cooldown = Inactive
      } else {
        self.cooldown = Active(remaining=remaining - remaining_dt)
      }
  }
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
