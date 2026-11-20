class_name PerfOverlay
extends CanvasLayer
## The performance display: a small box at the top left over everything (also the navigation)
## with frames per second, frame time, draw calls, primitives, memory and the 3D detail tier of
## the last seconds. It keeps measuring the last minute while it is on, so the profile can copy a
## report (PerfStats). Switched on and off in the profile (AppSettings).

## How often the box is updated (seconds).
const UPDATE_SECONDS := 0.5

## The display in the scene (one at a time, made by the shell); null when none.
static var current: PerfOverlay = null

## The 3D detail tier now (DetailGovernor.Tier, -1 when none); set by the shell.
var tier_source: Callable

var _stats := PerfStats.new()
var _box: PanelContainer
var _text: Label
var _left := 0.0
## Frames since the last update of the box, for its rolling numbers.
var _recent := PerfStats.new()


func _enter_tree() -> void:
	current = self


func _exit_tree() -> void:
	if current == self:
		current = null


func _ready() -> void:
	layer = 100
	_box = PanelContainer.new()
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.position = Vector2(12, 12)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.62)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(10)
	_box.add_theme_stylebox_override("panel", style)
	add_child(_box)
	_text = Label.new()
	_text.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_text.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.add_child(_text)
	_apply_setting()


func _process(delta: float) -> void:
	if not AppSettings.performance_display():
		if _box.visible:
			_apply_setting()
		return
	if not _box.visible:
		_apply_setting()
	var now := Time.get_ticks_msec()
	var draws := int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var primitives := int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	var memory := Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0
	_stats.add(now, delta * 1000.0, draws, primitives, memory)
	_recent.add(now, delta * 1000.0, draws, primitives, memory)
	_left -= delta
	if _left > 0.0:
		return
	_left = UPDATE_SECONDS
	var summary := _recent.summary()
	_recent.clear()
	_text.text = tr("PERF_BOX").format({
		"fps": "%.0f" % summary.fps, "ms": "%.1f" % summary.frame_ms_avg, "worst": "%.0f" % summary.frame_ms_max,
		"draws": "%.0f" % summary.draw_calls_avg, "primitives": _thousands(summary.primitives_avg),
		"memory": "%.0f" % summary.memory_mb_max if summary.memory_mb_max > 0.0 else "–",
		"tier": tier_name(_tier(), self)})


## The report of the last minute with this device's details, for sharing.
func report() -> String:
	var size := DisplayServer.screen_get_size()
	var device: Array[Array] = [
		[tr("PERF_DEVICE"), "%s (%s %s)" % [OS.get_model_name(), OS.get_name(), OS.get_version()]],
		[tr("PERF_GPU"), "%s · %s" % [RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_vendor()]],
		[tr("PERF_SCREEN"), "%d × %d" % [size.x, size.y]],
		[tr("PERF_APP"), str(ProjectSettings.get_setting("application/config/version", ""))],
		[tr("PERF_TIER"), tier_name(_tier(), self)],
	]
	var labels := {"frames": tr("PERF_FRAMES"), "fps": tr("PERF_FPS"), "frame": tr("PERF_FRAME_TIMES"),
		"slow": tr("PERF_SLOW"), "draws": tr("PERF_DRAWS"), "primitives": tr("PERF_PRIMITIVES"),
		"memory": tr("PERF_MEMORY")}
	return PerfStats.report(device, labels, _stats.summary())


## Seconds of measurements kept (up to a minute).
func measured_seconds() -> float:
	return _stats.summary().seconds


static func tier_name(tier: int, translator: Object) -> String:
	match tier:
		DetailGovernor.Tier.ULTRA:
			return translator.tr("PROFILE_DETAIL_ULTRA")
		DetailGovernor.Tier.FAST:
			return translator.tr("PROFILE_DETAIL_HIGH")
		DetailGovernor.Tier.MEDIUM:
			return translator.tr("PROFILE_DETAIL_MEDIUM")
		DetailGovernor.Tier.SLOW:
			return translator.tr("PROFILE_DETAIL_LOW")
	return translator.tr("PROFILE_DETAIL_UNKNOWN")


func _tier() -> int:
	if tier_source.is_valid():
		var tier: int = tier_source.call()
		return tier
	return -1


func _apply_setting() -> void:
	var on := AppSettings.performance_display()
	_box.visible = on
	# Below a notch or camera cut-out (the safe area), in canvas pixels.
	var window := DisplayServer.window_get_size()
	var safe := DisplayServer.get_display_safe_area()
	var canvas := get_viewport().get_visible_rect().size if get_viewport() != null else Vector2(720, 1280)
	var top := 0.0
	if window.y > 0 and OS.has_feature("mobile"):
		top = maxf(0.0, safe.position.y) * canvas.y / window.y
	_box.position = Vector2(12, 12 + top)
	if not on:
		_stats.clear()
		_recent.clear()


static func _thousands(value: float) -> String:
	if value >= 1000.0:
		return "%.1fk" % (value / 1000.0)
	return "%.0f" % value
