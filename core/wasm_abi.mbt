///|
/// Module-instance-local ownership for the first scalar Wasm ABI proof.
///
/// This is boundary lifecycle state, not flow semantics. Runtime remains the
/// only owner of navigation, transition, cooldown, direction, and lock truth.
priv enum AbiLifecycle {
  AbiUninitialized
  AbiLive(Runtime)
  AbiDisposed
}

///|
let abi_lifecycle : Ref[AbiLifecycle] = { val: AbiUninitialized }

///|
/// Scalar status encodings are internal ABI proof details, not product errors.
const ABI_OPERATION_INVALID = 0

///|
const ABI_OPERATION_OK = 1

///|
const ABI_REQUEST_INVALID = 0

///|
const ABI_REQUEST_REJECTED = 1

///|
const ABI_REQUEST_ACCEPTED = 2

///|
/// Transition-state projection. Inactive structurally carries no direction.
const ABI_TRANSITION_INACTIVE = 0

///|
const ABI_TRANSITION_FORWARD = 1

///|
const ABI_TRANSITION_REVERSE = 2

///|
fn abi_request_status(accepted : Bool) -> Int {
  if accepted { ABI_REQUEST_ACCEPTED } else { ABI_REQUEST_REJECTED }
}

///|
/// Initializes the one-runtime-per-Wasm-instance proof.
///
/// Inputs are already-normalized i32 carriers. Pre-coercion JavaScript Number
/// validation belongs to the future JS wrapper, not this raw Wasm boundary.
#export_name("wif_abi_init")
pub fn abi_init(
  phase_count : Int,
  selected : Int,
  transition_duration : Int,
  cooldown_duration : Int,
) -> Int {
  guard abi_lifecycle.val is AbiUninitialized else {
    return ABI_OPERATION_INVALID
  }
  match
    Runtime::new(
      phase_count,
      selected,
      transition_duration,
      cooldown_duration,
    ) {
    Valid(runtime) => {
      abi_lifecycle.val = AbiLive(runtime)
      ABI_OPERATION_OK
    }
    Invalid => ABI_OPERATION_INVALID
  }
}

///|
#export_name("wif_abi_request_next")
pub fn abi_request_next() -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) => abi_request_status(runtime.request_next())
    _ => ABI_REQUEST_INVALID
  }
}

///|
#export_name("wif_abi_request_previous")
pub fn abi_request_previous() -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) => abi_request_status(runtime.request_previous())
    _ => ABI_REQUEST_INVALID
  }
}

///|
/// Validates normalized target membership before entering Runtime's trusted
/// known-target path.
#export_name("wif_abi_request_target")
pub fn abi_request_target(target : Int) -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) => {
      guard target >= 0 && target < runtime.phase_count else {
        return ABI_REQUEST_INVALID
      }
      abi_request_status(runtime.request_known_target(target))
    }
    _ => ABI_REQUEST_INVALID
  }
}

///|
/// Carries the semantic lock/unlock commands through one normalized Bool.
#export_name("wif_abi_set_locked")
pub fn abi_set_locked(locked : Bool) -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) => {
      if locked {
        runtime.lock()
      } else {
        runtime.unlock()
      }
      ABI_OPERATION_OK
    }
    _ => ABI_OPERATION_INVALID
  }
}

///|
/// Negative normalized quanta are rejected before Runtime::tick.
///
/// JavaScript values outside the signed-i32 carrier have already undergone
/// WebAssembly ToInt32 coercion before this function is entered and therefore
/// must be rejected by the future JS wrapper before crossing the ABI.
#export_name("wif_abi_tick")
pub fn abi_tick(dt : Int) -> Int {
  guard dt >= 0 else { return ABI_OPERATION_INVALID }
  match abi_lifecycle.val {
    AbiLive(runtime) => {
      runtime.tick(dt)
      ABI_OPERATION_OK
    }
    _ => ABI_OPERATION_INVALID
  }
}

///|
/// Releases this module instance's Runtime owner and enters terminal Disposed.
#export_name("wif_abi_dispose")
pub fn abi_dispose() -> Int {
  match abi_lifecycle.val {
    AbiLive(_) => {
      abi_lifecycle.val = AbiDisposed
      ABI_OPERATION_OK
    }
    _ => ABI_OPERATION_INVALID
  }
}

///|
/// Live-only raw ABI observation. -1 is a non-semantic misuse fallback and
/// must never be surfaced as a product phase identity.
#export_name("wif_abi_selected_token")
pub fn abi_selected_token() -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) => runtime.selected
    _ => -1
  }
}

///|
/// Live-only raw ABI observation.
///
/// 0 = inactive, 1 = forward, 2 = reverse. -1 is a non-semantic misuse
/// fallback. The future semantic wrapper must never expose these token values.
#export_name("wif_abi_transition_state")
pub fn abi_transition_state() -> Int {
  match abi_lifecycle.val {
    AbiLive(runtime) =>
      match runtime.transition {
        Inactive => ABI_TRANSITION_INACTIVE
        Active(direction, duration~, elapsed~) => {
          ignore(duration)
          ignore(elapsed)
          match direction {
            Forward => ABI_TRANSITION_FORWARD
            Reverse => ABI_TRANSITION_REVERSE
          }
        }
      }
    _ => -1
  }
}

///|
/// Live-only raw ABI observation. Progress is meaningful only while
/// abi_transition_state() reports an active direction. The inactive fallback
/// is not a semantic progress sentinel.
#export_name("wif_abi_raw_progress")
pub fn abi_raw_progress() -> Double {
  match abi_lifecycle.val {
    AbiLive(runtime) =>
      match runtime.transition {
        Inactive => 0.0
        Active(_, duration~, elapsed~) =>
          elapsed.to_double() / duration.to_double()
      }
    _ => 0.0
  }
}

///|
#export_name("wif_abi_cooldown_active")
pub fn abi_cooldown_active() -> Bool {
  match abi_lifecycle.val {
    AbiLive(runtime) => runtime.cooldown is Cooldown::Active(_)
    _ => false
  }
}

///|
#export_name("wif_abi_locked")
pub fn abi_locked() -> Bool {
  match abi_lifecycle.val {
    AbiLive(runtime) => runtime.locked
    _ => false
  }
}
