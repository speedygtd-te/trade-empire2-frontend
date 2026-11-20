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
##
## ULTRA (Rudi, 2026-11-20) sits above FAST: like FAST, plus the high-detail models of modules and
## hulls (game/world/models_hd). Vsync hides headroom (a device that could do 120 fps still shows
## 16.7 ms), so the way up is stricter: allowed by the player and the device (allow_ultra,
## device_allows_ultra), a calm frame time (90th percentile) over more evaluations, and, where
## the renderer measures it, the work per frame well under the budget. It is left early (frames
## clearly over the 60 Hz budget), and a device that had to leave it does not try again (kept
## across starts).

enum Tier { ULTRA, FAST, MEDIUM, SLOW }

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
## The way up to ULTRA: good evaluations in a row on FAST, each with the median frame time below
## UP_BELOW_MS, the 90th percentile below ULTRA_UP_P90_MS and the median work per frame (render
## time of CPU and GPU, where measured) below ULTRA_UP_WORK_MS.
const GOOD_EVALUATIONS_TO_ULTRA := 5
const ULTRA_UP_P90_MS := 19.0
const ULTRA_UP_WORK_MS := 9.0
## ULTRA is left for FAST when the median frame time passes this (below ~45 fps).
const ULTRA_DOWN_ABOVE_MS := 22.0
## How often ULTRA may be left for being too slow before it is not tried again.
const MAX_ULTRA_FAILS := 1
## A phone or tablet gets ULTRA only with this much memory (the textures of the high-detail
## models take four times the memory) and this many processor cores, and not with a GPU of the
## low class (parts of the adapter name, lower case).
const ULTRA_MIN_MEMORY_BYTES := 7 * 1024 * 1024 * 1024
const ULTRA_MIN_CORES := 8
const WEAK_GPUS: PackedStringArray = [
	"powervr", "mali-4", "mali-t", "mali-g31", "mali-g51", "mali-g52", "mali-g57",
	"adreno (tm) 3", "adreno (tm) 4", "adreno (tm) 5", "adreno (tm) 60", "adreno (tm) 61",
]
## Version of the tier numbers in to_dict (1, or missing: before ULTRA, when FAST was 0).
const STATE_ORDER := 2

var tier: Tier = DEFAULT_TIER
## Last measured median frame time in ms; -1 before the first evaluation.
var metric_ms := -1.0
## Last measured median work per frame (CPU and GPU render time) in ms; -1 when not measured.
var work_ms := -1.0

var _samples: PackedFloat32Array = []
var _work: PackedFloat32Array = []
var _warmup_left := WARMUP_FRAMES
var _last_eval_ms := -1
var _good_in_row := 0
var _fails: Dictionary = {}
var _ultra_allowed := false
var _ultra_fails := 0
## The measuring window on the slowest tier: whether it runs, until when, and the next start
## (-1: not planned yet).
var _probing := false
var _probe_until := -1
var _next_probe := -1


## Feeds the duration of one rendered frame and, where measured, the time CPU and GPU worked on
## it (`frame_work_ms` <= 0: unknown). On the slowest tier only frames of a measuring window
## count (capped frames say nothing about the device).
func add_frame(frame_ms: float, frame_work_ms: float = -1.0) -> void:
	if tier == Tier.SLOW and not _probing:
		return
	if _warmup_left > 0:
		_warmup_left -= 1
		return
	_samples.append(frame_ms)
	if _samples.size() > SAMPLE_CAPACITY:
		_samples.remove_at(0)
	if frame_work_ms > 0.0:
		_work.append(frame_work_ms)
		if _work.size() > SAMPLE_CAPACITY:
			_work.remove_at(0)


## Whether ULTRA may be used (the player's setting and the device); cheap, call whenever either
## may have changed. Leaving ULTRA because it is no longer allowed is no failure. Returns true
## when the tier changed.
func allow_ultra(allowed: bool) -> bool:
	if allowed == _ultra_allowed:
		return false
	_ultra_allowed = allowed
	_good_in_row = 0
	if not allowed and tier == Tier.ULTRA:
		tier = Tier.FAST
		_clear_samples()
		return true
	return false


## Whether ULTRA may be used now (allow_ultra).
func is_ultra_allowed() -> bool:
	return _ultra_allowed


## Whether the device is strong enough to try ULTRA: always off a phone or tablet; there with
## enough memory and cores and a GPU outside the low class (adapter name, any case).
static func device_allows_ultra(mobile: bool, memory_bytes: int, cores: int, adapter: String) -> bool:
	if not mobile:
		return true
	if memory_bytes < ULTRA_MIN_MEMORY_BYTES or cores < ULTRA_MIN_CORES:
		return false
	var name := adapter.to_lower()
	for weak: String in WEAK_GPUS:
		if name.contains(weak):
			return false
	return true


## Drops the samples, e.g. after loading a new colony.
func reset_samples() -> void:
	_clear_samples()
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
		_clear_samples()
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
	work_ms = median(_work)
	var calm := percentile(_samples, 0.9)
	# On the slowest tier each measuring window counts once.
	if tier == Tier.SLOW:
		_clear_samples()

	if tier == Tier.ULTRA and metric_ms > ULTRA_DOWN_ABOVE_MS:
		_ultra_fails += 1
		return _change(Tier.FAST)
	if metric_ms > DOWN_ABOVE_MS and tier != Tier.SLOW:
		_fails[tier] = Wire.as_int(_fails.get(tier, 0)) + 1
		return _change((tier + 1) as Tier)
	if tier == Tier.FAST:
		if not _counts_towards_ultra(calm):
			_good_in_row = 0
			return false
		_good_in_row += 1
		return _change(Tier.ULTRA) if _good_in_row >= GOOD_EVALUATIONS_TO_ULTRA else false
	if metric_ms < UP_BELOW_MS and tier != Tier.ULTRA:
		_good_in_row += 1
		var higher := (tier - 1) as Tier
		if _good_in_row >= GOOD_EVALUATIONS_TO_RISE and Wire.as_int(_fails.get(higher, 0)) < MAX_FAILS_PER_TIER:
			return _change(higher)
		return false
	_good_in_row = 0
	return false


## State worth keeping across starts (a device property).
func to_dict() -> Dictionary:
	return {"tier": int(tier), "metric": metric_ms, "order": STATE_ORDER, "ultraFails": _ultra_fails}


## Restores a stored state; anything invalid keeps the default. A stored ULTRA starts as FAST:
## whether it is allowed is not known yet, and the way up is walked again.
func restore(data: Dictionary) -> void:
	var stored := Wire.as_int(data.get("tier"), -1)
	# Before ULTRA the numbers started at FAST.
	if Wire.as_int(data.get("order"), 1) < STATE_ORDER and stored >= 0:
		stored += 1
	if stored >= Tier.ULTRA and stored <= Tier.SLOW:
		tier = maxi(stored, Tier.FAST) as Tier
	var value: Variant = data.get("metric")
	if typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT:
		var number: float = value
		metric_ms = number
	_ultra_fails = maxi(0, Wire.as_int(data.get("ultraFails"), 0))


static func median(values: PackedFloat32Array) -> float:
	return percentile(values, 0.5)


## The value below which `share` (0..1) of the values lie (nearest rank); -1 when empty.
static func percentile(values: PackedFloat32Array, share: float) -> float:
	if values.is_empty():
		return -1.0
	var sorted := values.duplicate()
	sorted.sort()
	return sorted[clampi(floori(sorted.size() * share), 0, sorted.size() - 1)]


## Whether one evaluation on FAST counts towards ULTRA.
func _counts_towards_ultra(calm_ms: float) -> bool:
	if not _ultra_allowed or _ultra_fails >= MAX_ULTRA_FAILS:
		return false
	if metric_ms >= UP_BELOW_MS or calm_ms >= ULTRA_UP_P90_MS:
		return false
	return work_ms < 0.0 or work_ms < ULTRA_UP_WORK_MS


func _change(to: Tier) -> bool:
	tier = to
	_good_in_row = 0
	_clear_samples()
	return true


func _clear_samples() -> void:
	_samples.clear()
	_work.clear()
