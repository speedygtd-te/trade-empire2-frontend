class_name StreamPosition
extends RefCounted
## A position in the backend's event channel, as accepted by `GET /v2/events?since=`.
##
## Either a plain rev ("314": every event of that rev was seen) or an event id "<rev>-<seq>"
## ("314-0": continue right after that event). Several events can share a rev; resuming from an
## event id means nothing is skipped when the connection drops in the middle of such a group.


## True for "<digits>" and "<digits>-<digits>".
static func is_valid(text: String) -> bool:
	var parts := text.split("-")
	if parts.size() < 1 or parts.size() > 2:
		return false
	for part: String in parts:
		if part.is_empty():
			return false
		for index: int in part.length():
			var code := part.unicode_at(index)
			if code < 0x30 or code > 0x39:
				return false
	return true


## Position for "everything up to and including this rev was seen"; "" for a negative rev.
static func from_rev(rev: int) -> String:
	return str(rev) if rev >= 0 else ""
