class_name Backoff
extends RefCounted
## Waiting times between reconnect attempts: doubles from `first_ms` up to `max_ms`.

var _first_ms: int
var _max_ms: int
var _next_ms: int


func _init(first_ms: int = 1000, max_ms: int = 30000) -> void:
	_first_ms = first_ms
	_max_ms = max_ms
	_next_ms = first_ms


## Delay before the next attempt; each call doubles the following one.
func next_delay_ms() -> int:
	var delay := _next_ms
	_next_ms = mini(_next_ms * 2, _max_ms)
	return delay


## Call after a successful connection.
func reset() -> void:
	_next_ms = _first_ms
