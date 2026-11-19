class_name PerfStats
extends RefCounted
## Frame measurements of the last minute for the performance display and the shared report: per
## frame the time it took, draw calls, primitives and memory. Pure: the caller feeds samples.

## How far back the summary looks (ms).
const WINDOW_MS := 60000
## Frames slower than this count as stutters (ms; 30 fps).
const SLOW_FRAME_MS := 33.4


class Sample:
	extends RefCounted
	var at_ms := 0
	var frame_ms := 0.0
	var draw_calls := 0
	var primitives := 0
	var memory_mb := 0.0


class Summary:
	extends RefCounted
	var frames := 0
	var seconds := 0.0
	var fps := 0.0
	var frame_ms_avg := 0.0
	var frame_ms_p95 := 0.0
	var frame_ms_max := 0.0
	## Share of frames slower than SLOW_FRAME_MS, 0..1.
	var slow_share := 0.0
	var draw_calls_avg := 0.0
	var primitives_avg := 0.0
	var memory_mb_max := 0.0


var _samples: Array[Sample] = []


func add(at_ms: int, frame_ms: float, draw_calls: int, primitives: int, memory_mb: float) -> void:
	var sample := Sample.new()
	sample.at_ms = at_ms
	sample.frame_ms = frame_ms
	sample.draw_calls = draw_calls
	sample.primitives = primitives
	sample.memory_mb = memory_mb
	_samples.append(sample)
	var oldest := at_ms - WINDOW_MS
	var drop := 0
	while drop < _samples.size() and _samples[drop].at_ms < oldest:
		drop += 1
	if drop > 0:
		_samples = _samples.slice(drop)


func size() -> int:
	return _samples.size()


func clear() -> void:
	_samples.clear()


## The summary of the samples kept (the last minute).
func summary() -> Summary:
	var result := Summary.new()
	result.frames = _samples.size()
	if _samples.is_empty():
		return result
	var times := PackedFloat32Array()
	var total_ms := 0.0
	var slow := 0
	var draws := 0.0
	var primitives := 0.0
	for sample: Sample in _samples:
		times.append(sample.frame_ms)
		total_ms += sample.frame_ms
		if sample.frame_ms > SLOW_FRAME_MS:
			slow += 1
		draws += sample.draw_calls
		primitives += sample.primitives
		result.memory_mb_max = maxf(result.memory_mb_max, sample.memory_mb)
		result.frame_ms_max = maxf(result.frame_ms_max, sample.frame_ms)
	times.sort()
	result.seconds = total_ms / 1000.0
	result.frame_ms_avg = total_ms / _samples.size()
	result.fps = 1000.0 / result.frame_ms_avg if result.frame_ms_avg > 0.0 else 0.0
	result.frame_ms_p95 = times[mini(times.size() - 1, int(times.size() * 0.95))]
	result.slow_share = float(slow) / _samples.size()
	result.draw_calls_avg = draws / _samples.size()
	result.primitives_avg = primitives / _samples.size()
	return result


## A plain-text report to share: the device lines first (`device`: label → value, kept in order),
## then the summary of the last minute. Numbers are formatted for reading, the labels are given
## by the caller (translated), so this stays free of text keys.
static func report(device: Array[Array], labels: Dictionary, stats: Summary) -> String:
	var lines := PackedStringArray()
	for pair: Array in device:
		lines.append("%s: %s" % [pair[0], pair[1]])
	lines.append("%s: %d / %.0f s" % [labels.get("frames", "frames"), stats.frames, stats.seconds])
	lines.append("%s: %.1f" % [labels.get("fps", "fps"), stats.fps])
	lines.append("%s: %.1f / %.1f / %.1f ms" % [labels.get("frame", "frame"), stats.frame_ms_avg,
		stats.frame_ms_p95, stats.frame_ms_max])
	lines.append("%s: %.0f %%" % [labels.get("slow", "slow"), stats.slow_share * 100.0])
	lines.append("%s: %.0f" % [labels.get("draws", "draws"), stats.draw_calls_avg])
	lines.append("%s: %.0f" % [labels.get("primitives", "primitives"), stats.primitives_avg])
	# Release builds do not count memory (0): left out then.
	if stats.memory_mb_max > 0.0:
		lines.append("%s: %.0f MB" % [labels.get("memory", "memory"), stats.memory_mb_max])
	return "\n".join(lines)
