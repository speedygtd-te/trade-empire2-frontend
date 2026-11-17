class_name GameClock
extends RefCounted
## Local estimate of the backend's game time (milliseconds since the world was created).
##
## Game time advances one-to-one with real time while the backend daemon runs and stands still
## while it does not. The client cannot see a pause directly, so the clock only runs while the
## event channel is connected (`set_running(true)`) and freezes otherwise. Every successful
## response carries `gameTime`; `sync` moves the estimate forward with it, `resync` sets it
## unconditionally after a reconnect.

var _ticks_msec: Callable
var _synced := false
var _running := false
var _anchor_game_ms := 0
var _anchor_ticks_ms := 0


## `ticks_msec` is a monotonic millisecond source; tests inject their own.
func _init(ticks_msec: Callable = Callable()) -> void:
	_ticks_msec = ticks_msec if ticks_msec.is_valid() else Time.get_ticks_msec


func is_synced() -> bool:
	return _synced


func is_running() -> bool:
	return _running


## Current game time estimate in ms; 0 before the first sync.
func now_ms() -> int:
	if not _synced:
		return 0
	if not _running:
		return _anchor_game_ms
	return _anchor_game_ms + (_read_ticks() - _anchor_ticks_ms)


## Takes the `gameTime` of a response. Only moves the estimate forward: a response that was
## delayed on the network must not pull the clock back.
func sync(game_time_ms: int) -> void:
	if _synced and game_time_ms <= now_ms():
		return
	_anchor(game_time_ms)


## Sets the estimate unconditionally, also backwards. Use after reconnecting: the clock may have
## run ahead while the backend was already paused.
func resync(game_time_ms: int) -> void:
	_anchor(game_time_ms)


## Starts or freezes the clock. Freezing keeps the current estimate.
func set_running(running: bool) -> void:
	if running == _running:
		return
	var current := now_ms()
	_running = running
	if _synced:
		_anchor(current)


func _anchor(game_time_ms: int) -> void:
	_anchor_game_ms = game_time_ms
	_anchor_ticks_ms = _read_ticks()
	_synced = true


func _read_ticks() -> int:
	var ticks: int = _ticks_msec.call()
	return ticks
