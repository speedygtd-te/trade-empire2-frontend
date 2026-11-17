class_name TimeFormat
extends RefCounted
## Formats game time (milliseconds) for display.

const _MS_PER_SECOND := 1000
const _MS_PER_MINUTE := 60 * _MS_PER_SECOND
const _MS_PER_HOUR := 60 * _MS_PER_MINUTE
const _MS_PER_DAY := 24 * _MS_PER_HOUR


## A running clock: "02:07:45", with days in front once there are any: "3d 02:07:45".
static func clock(ms: int) -> String:
	var remaining := maxi(ms, 0)
	@warning_ignore("integer_division")
	var days := remaining / _MS_PER_DAY
	remaining -= days * _MS_PER_DAY
	@warning_ignore("integer_division")
	var hours := remaining / _MS_PER_HOUR
	remaining -= hours * _MS_PER_HOUR
	@warning_ignore("integer_division")
	var minutes := remaining / _MS_PER_MINUTE
	remaining -= minutes * _MS_PER_MINUTE
	@warning_ignore("integer_division")
	var seconds := remaining / _MS_PER_SECOND
	var text := "%02d:%02d:%02d" % [hours, minutes, seconds]
	return "%dd %s" % [days, text] if days > 0 else text


## A rough remaining time with its two largest units: "6d 23h", "4h 12m", "9m 30s", "45s".
static func duration(ms: int) -> String:
	var remaining := maxi(ms, 0)
	@warning_ignore("integer_division")
	var days := remaining / _MS_PER_DAY
	remaining -= days * _MS_PER_DAY
	@warning_ignore("integer_division")
	var hours := remaining / _MS_PER_HOUR
	remaining -= hours * _MS_PER_HOUR
	@warning_ignore("integer_division")
	var minutes := remaining / _MS_PER_MINUTE
	remaining -= minutes * _MS_PER_MINUTE
	@warning_ignore("integer_division")
	var seconds := remaining / _MS_PER_SECOND
	if days > 0:
		return "%dd %dh" % [days, hours]
	if hours > 0:
		return "%dh %dm" % [hours, minutes]
	if minutes > 0:
		return "%dm %ds" % [minutes, seconds]
	return "%ds" % seconds
