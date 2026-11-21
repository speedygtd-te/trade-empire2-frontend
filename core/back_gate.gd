class_name BackGate
extends RefCounted
## One Back press closes one layer. Android can hand the app the same press twice (Godot 4.7
## passes the back key to the engine and also answers the activity's back callback): a second
## request within REPEAT_MS of the one before counts as the same press and is ignored.

const REPEAT_MS := 250

var _last_ms := -1


## Whether a Back request at `now_ms` is a new press (true) or the echo of the last one (false).
func accept(now_ms: int) -> bool:
	if _last_ms >= 0 and now_ms - _last_ms < REPEAT_MS and now_ms >= _last_ms:
		return false
	_last_ms = now_ms
	return true
