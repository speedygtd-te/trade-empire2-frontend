class_name RemoveArm
extends RefCounted
## The two-step removal on the inspect card: the first tap arms it for one thing on one field
## ("module" or "hull" at an absolute cell), only a second tap on the same thing removes it.
##
## A second tap that comes too soon (within GRACE_MS: a bounce, a double tap, a finger that meant
## a neighbouring field) never removes; it keeps the arming. Any other field or kind arms anew
## instead of removing, and clearing (another field selected, the card closed) disarms.

## Shortest time (ms) between arming and the confirming tap.
const GRACE_MS := 400

## What waits for its second tap: "module" or "hull"; "" while nothing is armed.
var kind := ""
## The absolute cell it waits on; null while nothing is armed.
var cell: Variant = null
var _since_ms := 0


## A tap on the removal of `what` at `at`: true when this tap confirms it (remove now), false when
## it only armed it (or came too soon to confirm).
func press(what: String, at: Variant, now_ms: int) -> bool:
	if is_armed(what, at):
		if now_ms - _since_ms < GRACE_MS:
			return false
		clear()
		return true
	kind = what
	cell = at
	_since_ms = now_ms
	return false


## Whether the removal of `what` at `at` waits for its second tap.
func is_armed(what: String, at: Variant) -> bool:
	return not kind.is_empty() and kind == what and at != null and cell == at


## Whether anything is armed.
func is_set() -> bool:
	return not kind.is_empty()


## The field changed to `at`: an arming for another field is dropped.
func follow(at: Variant) -> void:
	if cell != at:
		clear()


func clear() -> void:
	kind = ""
	cell = null
	_since_ms = 0
