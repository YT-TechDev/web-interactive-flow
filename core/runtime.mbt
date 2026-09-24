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
/// This first proof keeps all representation private. The phase count defines
/// an ordered token domain from zero through phase_count - 1; those tokens are
/// an implementation detail, and transition duration has no public unit yet.
priv struct Runtime {
  phase_count : Int
  mut selected : Int
  transition_duration : Int
  cooldown_duration : Int
  mut transition : Transition
  mut cooldown : Cooldown
  mut locked : Bool
}

///|
/// Construction validity is intentionally a private binary outcome. Detailed
/// validation errors and their precedence remain outside this proof.
priv enum Construction {
  Valid(Runtime)
  Invalid
}

///|
/// The only ordinary construction path validates the complete configuration
/// before creating a Runtime value.
fn Runtime::new(
  phase_count : Int,
  selected : Int,
  transition_duration : Int,
  cooldown_duration : Int,
) -> Construction {
  guard phase_count > 0 else { return Invalid }
  guard selected >= 0 && selected < phase_count else { return Invalid }
  guard transition_duration >= 0 else { return Invalid }
  guard cooldown_duration >= 0 else { return Invalid }
  Valid({
    phase_count,
    selected,
    transition_duration,
    cooldown_duration,
    transition: Inactive,
    cooldown: Inactive,
    locked: false,
  })
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
  if self.transition_duration == 0 {
    self.selected = target
    self.transition = Inactive
    self.start_configured_cooldown()
  } else {
    let direction = if target > self.selected { Forward } else { Reverse }
    self.selected = target
    self.transition = Active(
      direction,
      duration=self.transition_duration,
      elapsed=0,
    )
    self.cooldown = Inactive
  }
  true
}

///|
/// Initializes the configured cooldown without creating an active zero-valued
/// cooldown. Both synchronous and tick-driven settlement use this rule.
fn Runtime::start_configured_cooldown(self : Runtime) -> Unit {
  if self.cooldown_duration > 0 {
    self.cooldown = Active(remaining=self.cooldown_duration)
  } else {
    self.cooldown = Inactive
  }
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
        self.start_configured_cooldown()
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
  guard target >= 0 && target < self.phase_count else { return false }
  self.request_known_target(target)
}
