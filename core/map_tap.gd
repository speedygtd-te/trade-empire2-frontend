class_name MapTap
extends RefCounted
## Taps on a map that also pans and pinches: which pointers are down, whether a press ended as a
## tap, and which bodies a tap meant. Display only.
##
## A tap is the press and release of a single finger (or the mouse) that never got further than
## SLOP from where it went down. Only positions count, not the drag events in between: press and
## release may arrive in the same frame, and a release without any drag before it is a tap. A
## second finger makes the gesture a pinch, no tap until all fingers are up again; a cancelled touch
## is no tap. A press on a pointer that is still down (its release never came) starts afresh, so a
## lost release cannot swallow every later tap.

## Pointer travel (canvas px) below which a press counts as a tap, not a drag.
const SLOP := 18.0
## Pointer index of the mouse (touches count from 0).
const MOUSE := -1
## A body is clearly the one meant when the next one lies this share of the reach further away.
const CLEAR_GAP := 0.5
## Most bodies offered to choose from.
const MAX_CHOICES := 5

## Pointer index → where it is now.
var _down: Dictionary = {}
var _start := Vector2.ZERO
var _travel := 0.0
var _several := false


## A pointer went down at `at`.
func press(index: int, at: Vector2) -> void:
	if _down.has(index):
		_down.clear()
	if _down.is_empty():
		_start = at
		_travel = 0.0
		_several = false
	else:
		_several = true
	_down[index] = at


## A pointer that is down moved to `at`; others are ignored.
func move(index: int, at: Vector2) -> void:
	if not _down.has(index):
		return
	_down[index] = at
	if _down.size() == 1:
		_travel = maxf(_travel, at.distance_to(_start))


## A pointer went up at `at`; true when that ended a tap.
func release(index: int, at: Vector2) -> bool:
	if not _down.has(index):
		return false
	_down.erase(index)
	if not _down.is_empty() or _several:
		return false
	_travel = maxf(_travel, at.distance_to(_start))
	return _travel < SLOP


## The system took a touch away (e.g. a system gesture): the gesture is no tap.
func cancel(index: int) -> void:
	_down.erase(index)
	_travel = INF


## How many pointers are down.
func count() -> int:
	return _down.size()


func is_down(index: int) -> bool:
	return _down.has(index)


## Where a pointer that is down is now; ZERO for one that is not.
func position_of(index: int) -> Vector2:
	var found: Variant = _down.get(index)
	return found as Vector2 if found != null else Vector2.ZERO


## Where another pointer than `index` is (the second finger of a pinch); ZERO when none.
func other_than(index: int) -> Vector2:
	for key: int in _down.keys():
		if key != index:
			return _down[key]
	return Vector2.ZERO


## The bodies a tap meant, from each candidate's distance (px) between the finger and the edge of
## its disc (negative inside it): none within `reach`; just one when it is clearly the nearest (the
## next lies at least CLEAR_GAP · reach further, or out of reach); else the nearest few (at most
## `limit`), nearest first, to choose from.
static func meant(ids: PackedStringArray, distances: PackedFloat64Array, reach: float,
		limit: int = MAX_CHOICES) -> PackedStringArray:
	var order: Array[int] = []
	for index: int in mini(ids.size(), distances.size()):
		if distances[index] <= reach:
			order.append(index)
	order.sort_custom(func(a: int, b: int) -> bool:
		return distances[a] < distances[b] or distances[a] == distances[b] and a < b)
	var result := PackedStringArray()
	if order.is_empty():
		return result
	if order.size() == 1 or distances[order[1]] - distances[order[0]] >= reach * CLEAR_GAP:
		result.append(ids[order[0]])
		return result
	for index: int in mini(order.size(), maxi(limit, 1)):
		result.append(ids[order[index]])
	return result
