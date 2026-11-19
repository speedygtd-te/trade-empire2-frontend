class_name DetailGovernor
extends RefCounted
## Picks the detail tier of the 3D view from measured frame times, after the V1 client
## (`src/views/grid/detailTier.ts` there): stay fluid on weak devices by dropping detail early.
## Rudi's rule: "ein plötzlich fehlender Baum ist weniger störend als Ruckeln."
##
## Differences to V1: Godot renders on the GPU and is capped by vsync, so the metric is the
## median frame time of the last frames, not time per unit of work. Because dropping detail
## makes frames faster, a naive rule would flip back and forth. Against that: a dead band
## between the thresholds (hysteresis), going up only one step after several good
## evaluations in a row, and a tier that had to be left twice is not entered again.

enum Tier { FAST, MEDIUM, SLOW }

## Median frame time (ms) below which a tier may go up, and above which it goes down.
## A 60 Hz display delivers ~16.7 ms at best; 30 fps is 33.3 ms.
const UP_BELOW_MS := 18.5
const DOWN_ABOVE_MS := 30.0
## Frames thrown away after a reset (loading, scene changes are not device speed).
const WARMUP_FRAMES := 30
## Frames the median is taken over, and the least needed for an evaluation.
const SAMPLE_CAPACITY := 90
const MIN_SAMPLES := 60
## Time between evaluations.
const EVAL_INTERVAL_MS := 4000
## Good evaluations in a row before going up a step.
const GOOD_EVALUATIONS_TO_RISE := 3
## How often a tier may be left for being too slow before it is not entered again.
const MAX_FAILS_PER_TIER := 2
const DEFAULT_TIER := Tier.MEDIUM
## On the slowest tier the frame rate is held at this (steady frames, less heat and battery). A
## capped device cannot show that it got faster, so every PROBE_EVERY_MS the cap is lifted for
## PROBE_MS and only those frames count for going up again.
const SLOW_FPS_CAP := 30
const PROBE_EVERY_MS := 60000
const PROBE_MS := 3000

var tier: Tier = DEFAULT_TIER
## Last measured median frame time in ms; -1 before the first evaluation.
var metric_ms := -1.0

var _samples: PackedFloat32Array = []
var _warmup_left := WARMUP_FRAMES
var _last_eval_ms := -1
var _good_in_row := 0
var _fails: Dictionary = {}
## The measuring window on the slowest tier: whether it runs, until when, and the next start
## (-1: not planned yet).
var _probing := false
var _probe_until := -1
var _next_probe := -1


## Feeds the duration of one rendered frame. On the slowest tier only frames of a measuring
## window count (capped frames say nothing about the device).
func add_frame(frame_ms: float) -> void:
	if tier == Tier.SLOW and not _probing:
		return
	if _warmup_left > 0:
		_warmup_left -= 1
		return
	_samples.append(frame_ms)
	if _samples.size() > SAMPLE_CAPACITY:
		_samples.remove_at(0)


## Drops the samples, e.g. after loading a new colony.
func reset_samples() -> void:
	_samples.clear()
	_warmup_left = WARMUP_FRAMES
	_good_in_row = 0


## The frame rate to hold now (Engine.max_fps): SLOW_FPS_CAP on the slowest tier outside a
## measuring window, otherwise 0 (no cap).
func fps_cap() -> int:
	return SLOW_FPS_CAP if tier == Tier.SLOW and not _probing else 0


## Starts and ends the measuring windows of the slowest tier; call every frame. Returns true when
## the cap changed (a window began or ended).
func tick(now_ms: int) -> bool:
	if tier != Tier.SLOW:
		var was := _probing
		_probing = false
		_next_probe = -1
		return was
	if _next_probe < 0:
		_next_probe = now_ms + PROBE_EVERY_MS
	if not _probing and now_ms >= _next_probe:
		_probing = true
		_probe_until = now_ms + PROBE_MS
		_samples.clear()
		_warmup_left = 0
		return true
	if _probing and now_ms >= _probe_until:
		_probing = false
		_next_probe = now_ms + PROBE_EVERY_MS
		return true
	return false


## Whether a measuring window runs now.
func is_probing() -> bool:
	return _probing


## Re-evaluates at most every EVAL_INTERVAL_MS. Returns true when the tier changed.
func evaluate(now_ms: int) -> bool:
	if _last_eval_ms >= 0 and now_ms - _last_eval_ms < EVAL_INTERVAL_MS:
		return false
	if _samples.size() < MIN_SAMPLES:
		return false
	_last_eval_ms = now_ms
	metric_ms = median(_samples)
	# On the slowest tier each measuring window counts once.
	if tier == Tier.SLOW:
		_samples.clear()

	if metric_ms > DOWN_ABOVE_MS and tier != Tier.SLOW:
		_fails[tier] = Wire.as_int(_fails.get(tier, 0)) + 1
		tier = (tier + 1) as Tier
		_good_in_row = 0
		_samples.clear()
		return true
	if metric_ms < UP_BELOW_MS and tier != Tier.FAST:
		_good_in_row += 1
		var higher := (tier - 1) as Tier
		if _good_in_row >= GOOD_EVALUATIONS_TO_RISE and Wire.as_int(_fails.get(higher, 0)) < MAX_FAILS_PER_TIER:
			tier = higher
			_good_in_row = 0
			_samples.clear()
			return true
		return false
	_good_in_row = 0
	return false


## State worth keeping across starts (a device property).
func to_dict() -> Dictionary:
	return {"tier": int(tier), "metric": metric_ms}


## Restores a stored state; anything invalid keeps the default.
func restore(data: Dictionary) -> void:
	var stored := Wire.as_int(data.get("tier"), -1)
	if stored >= Tier.FAST and stored <= Tier.SLOW:
		tier = stored as Tier
	var value: Variant = data.get("metric")
	if typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT:
		var number: float = value
		metric_ms = number


static func median(values: PackedFloat32Array) -> float:
	if values.is_empty():
		return -1.0
	var sorted := values.duplicate()
	sorted.sort()
	return sorted[sorted.size() / 2]
