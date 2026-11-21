class_name Concurrent
extends RefCounted
## Runs coroutines side by side and waits for all of them (like Promise.all): `add` starts a
## task at once (it runs until its first await), `wait` returns their results in the order they
## were added.
##
##   var tasks := Concurrent.new()
##   tasks.add(func() -> ApiResult: return await api.get_json("/v2/a"))
##   tasks.add(func() -> ApiResult: return await api.get_json("/v2/b"))
##   var results := await tasks.wait()

signal _settled

var _results: Array = []
var _left := 0


## Starts `task` (a Callable without arguments, usually a coroutine); returns its index.
func add(task: Callable) -> int:
	var index := _results.size()
	_results.append(null)
	_left += 1
	_run(task, index)
	return index


## How many tasks have not finished yet.
func pending() -> int:
	return _left


## Waits until every task added so far has finished; their results in the order of `add`.
func wait() -> Array:
	while _left > 0:
		await _settled
	return _results


## Runs every task side by side and returns their results in order.
static func all(tasks: Array[Callable]) -> Array:
	var group := Concurrent.new()
	for task: Callable in tasks:
		group.add(task)
	return await group.wait()


func _run(task: Callable, index: int) -> void:
	var value: Variant = await task.call()
	_results[index] = value
	_left -= 1
	if _left == 0:
		_settled.emit()
