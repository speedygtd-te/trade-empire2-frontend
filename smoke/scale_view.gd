extends Control
## Review tool for very large structures (the backend will allow up to 100 000 hulls): the home
## structure of the showcase account grown on the client only (hulls and modules added to the
## layout here, never sent) to 2 500, 10 000 and 100 000 hulls, then measured: how long the first
## build takes, a rebuild after one hull changed, a fleet change, opening the structure; per camera
## (default zoom, zoomed out) the frame time, draw calls, primitives and memory; and a picture of
## each. Uses the showcase account (.local/showcase-account.json). Root script of
## smoke/scale_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/scale_view.tscn -- --out=<folder> [--sizes=2500,10000]
## Lines: BUILD (ms), FRAME (averages of FRAMES frames), SAVED (pictures).

const ACCOUNT := "res://.local/showcase-account.json"
const SIZES: Array[int] = [2500, 10000, 100000]
## Frames averaged per measurement.
const FRAMES := 90
## The made-up hulls come in squares of this many cells: one in YARD_EVERY of them is an open yard
## (outdoor hulls, outdoor modules on them), the others are closed halls (indoor hulls).
const BLOCK := 8
const YARD_EVERY := 4
## One cell in MODULE_EVERY carries a module.
const MODULE_EVERY := 3
## Ids of the made-up modules start here (far beyond the server's).
const FIRST_ID := 900000000

var _out_dir := "user://scale"
var _sizes: Array[int] = []
var _colony: ColonyScreen
var _indoor_hull := ""
var _outdoor_hull := ""
var _indoor_modules: PackedStringArray = []
var _outdoor_modules: PackedStringArray = []
var _next_id := FIRST_ID
## The ring around the middle the growth reached, and the cell in it to go on with.
var _ring := 0
var _ring_cells: Array[Vector3i] = []
var _middle := Vector3i.ZERO
var _taken: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument.begins_with("--sizes="):
			for part: String in argument.trim_prefix("--sizes=").split(","):
				_sizes.append(part.to_int())
	if _sizes.is_empty():
		_sizes = SIZES.duplicate()
	DirAccess.make_dir_recursive_absolute(_out_dir)
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/showcase.cjs first)")
		get_tree().quit(1)
		return
	print("SIGNED IN")
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(5.0).timeout
	# The sun and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	# Uncapped (the screen holds a frame rate for its detail tier), so frame times show the cost.
	Engine.max_fps = 0
	var view := _colony._view
	view.apply_detail(DetailGovernor.Tier.FAST)
	_day()
	RenderingServer.viewport_set_measure_render_time(_colony._viewport.get_viewport_rid(), true)
	var layout := _colony._model.layout
	print("BASE  %d hulls, %d modules, %d neighbours, %d guests" % [layout.hull_count(), layout.module_count(),
		_colony._model.neighbours.size(), _colony._model.guests.size()])
	_choose_types()
	_plan()
	await _look(_colony._model.centre_cell(), ColonyView.ZOOM_DEFAULT)
	await _measure_views("real")
	for size: int in _sizes:
		await _stage(size)
	get_tree().quit()


## The hull and module types the made-up cells use: the commonest indoor and outdoor hull of the
## real layout, and its 1×1×1 modules by where they may stand.
func _choose_types() -> void:
	var definitions := Services.definitions
	var layout := _colony._model.layout
	var counts: Dictionary = {}
	for local: Vector3i in layout.hull_cells():
		var hull_type := layout.hull_at(local)
		var before: int = counts.get(hull_type, 0)
		counts[hull_type] = before + 1
	var best_in := 0
	var best_out := 0
	for hull_type: String in counts.keys():
		var count: int = counts[hull_type]
		if DockRules.is_dock(hull_type):
			continue
		if StructureLook.hull_closed(definitions, hull_type):
			if count > best_in:
				best_in = count
				_indoor_hull = hull_type
		elif count > best_out:
			best_out = count
			_outdoor_hull = hull_type
	var seen: Dictionary = {}
	for placed: StructureLayout.Module in layout.modules():
		var module_def := definitions.module(placed.module_type)
		if module_def == null or module_def.size != Vector3i.ONE or seen.has(placed.module_type):
			continue
		if layout.is_shaft(placed):
			continue
		seen[placed.module_type] = true
		if StructureLook.module_outdoor(definitions, placed.module_type):
			_outdoor_modules.append(placed.module_type)
		elif module_def.positioning.has("INDOOR"):
			_indoor_modules.append(placed.module_type)
	print("TYPES  indoor hull %s, outdoor hull %s, %d indoor and %d outdoor module types" % [_indoor_hull,
		_outdoor_hull, _indoor_modules.size(), _outdoor_modules.size()])


## The made-up base grows ring by ring around the middle of the real one; cells of other
## structures stay free.
func _plan() -> void:
	var model := _colony._model
	var layout := model.layout
	var centre := model.centre_cell()
	_middle = layout.to_local(Vector3i(centre.x, centre.y, layout.to_absolute(Vector3i.ZERO).z))
	_middle.z = 0
	for structure: ColonyModel in model.drawn_structures():
		if structure == model:
			continue
		for local: Vector3i in structure.layout.hull_cells():
			var absolute := structure.layout.to_absolute(local)
			var mine := layout.to_local(Vector3i(absolute.x, absolute.y, 0))
			_taken[Vector2i(mine.x, mine.y)] = true


## The next free cell of the growth (local, ground level).
func _next_cell() -> Vector3i:
	var layout := _colony._model.layout
	while true:
		if _ring_cells.is_empty():
			_ring_cells = _ring_of(_ring)
			_ring += 1
		var cell: Vector3i = _ring_cells.pop_back()
		if _taken.has(Vector2i(cell.x, cell.y)) or layout._hulls.has(cell):
			continue
		return cell
	return Vector3i.ZERO


func _ring_of(radius: int) -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	if radius == 0:
		result.append(_middle)
		return result
	for dy: int in range(-radius, radius + 1):
		for dx: int in range(-radius, radius + 1):
			if maxi(absi(dx), absi(dy)) == radius:
				result.append(_middle + Vector3i(dx, dy, 0))
	result.reverse()
	return result


## Adds made-up hulls (and modules on some) until the structure has `size` hulls.
func _grow(size: int) -> void:
	var layout := _colony._model.layout
	while layout.hull_count() < size:
		var cell := _next_cell()
		_add_hull(cell)


func _add_hull(cell: Vector3i) -> void:
	var layout := _colony._model.layout
	var block := Vector2i(floori(float(cell.x) / BLOCK), floori(float(cell.y) / BLOCK))
	var yard := PropRules.key_hash(block.x, block.y, YARD_EVERY) == 0
	layout._hulls[cell] = _outdoor_hull if yard else _indoor_hull
	_touch()
	if PropRules.key_hash(cell.x * 7 + 3, cell.y * 13 + 5, MODULE_EVERY) != 0:
		return
	var choices := _outdoor_modules if yard else _indoor_modules
	if choices.is_empty():
		return
	var placed := StructureLayout.Module.new()
	placed.module_id = _next_id
	_next_id += 1
	placed.module_type = choices[PropRules.key_hash(cell.x, cell.y, choices.size())]
	placed.origin = cell
	placed.rotation = 90 * PropRules.key_hash(cell.y, cell.x, 4)
	placed.status = "active"
	layout._modules[placed.module_id] = placed
	layout._module_cells[cell] = placed.module_id


## Tells the layout it was changed from outside (layouts that count their changes).
func _touch() -> void:
	var layout := _colony._model.layout
	if layout.has_method("touch"):
		layout.call("touch")


## One size: grow, build, measure, change one hull, change the fleet, open.
func _stage(size: int) -> void:
	var view := _colony._view
	_grow(size)
	var layout := _colony._model.layout
	print("STAGE  %d hulls, %d modules" % [layout.hull_count(), layout.module_count()])
	var build_ms := _timed_change(func() -> void: _colony._model.layout_changed.emit())
	var settle_ms := await _settle()
	print("BUILD  %d first build %.0f ms, next frames max %.0f ms" % [size, build_ms, settle_ms])
	await _look(_colony._model.centre_cell(), ColonyView.ZOOM_DEFAULT)
	print("BUILD  %d look_at_cell (origin) %.0f ms" % [size, _look_ms])
	await _measure_views("%d" % size)
	# One hull more at the edge of the growth.
	var edge := _next_cell()
	var hull_ms := _timed_change(func() -> void:
		_add_hull(edge)
		_colony._model.layout_changed.emit())
	settle_ms = await _settle()
	print("BUILD  %d one hull changed %.0f ms, next frames max %.0f ms" % [size, hull_ms, settle_ms])
	# A module finishes (module.completed).
	var finished: StructureLayout.Module = layout.module(FIRST_ID)
	if finished != null:
		finished.status = "building"
		_touch()
		_colony._model.layout_changed.emit()
		await _settle()
		var completed_ms := _timed_change(func() -> void:
			layout.complete_module(FIRST_ID)
			_colony._model.layout_changed.emit())
		settle_ms = await _settle()
		print("BUILD  %d module completed %.0f ms, next frames max %.0f ms" % [size, completed_ms, settle_ms])
	# The fleet changed (a trade route's leg somewhere): nothing drawn here moves.
	var fleet_ms := _timed_change(func() -> void: view.set_fleet(view.fleet))
	settle_ms = await _settle()
	print("BUILD  %d fleet changed %.0f ms, next frames max %.0f ms" % [size, fleet_ms, settle_ms])
	# Opened: every module on its floor.
	var open_ms := _timed_change(func() -> void: view.open_structure(_colony._model.structure_id))
	settle_ms = await _settle()
	print("BUILD  %d opened %.0f ms, next frames max %.0f ms" % [size, open_ms, settle_ms])
	await get_tree().create_timer(1.0).timeout
	await _measure("%d opened zoom 9" % size)
	await _capture("scale_%d_opened_9" % size)
	var close_ms := _timed_change(func() -> void: view.open_structure(0))
	settle_ms = await _settle()
	print("BUILD  %d closed %.0f ms, next frames max %.0f ms" % [size, close_ms, settle_ms])


var _look_ms := 0.0


## Runs a change and, if the view puts rebuilds off to the end of the frame, its rebuild too (ms).
func _timed_change(change: Callable) -> float:
	var view := _colony._view
	var start := Time.get_ticks_usec()
	change.call()
	if view.has_method("flush_rebuild"):
		view.call("flush_rebuild")
	var took := (Time.get_ticks_usec() - start) / 1000.0
	if view.has_method("rebuild_timings"):
		var phases: Dictionary = view.call("rebuild_timings")
		var parts := PackedStringArray()
		for phase: String in phases.keys():
			parts.append("%s %.0f" % [phase, phases[phase]])
		print("PHASES  %s" % ", ".join(parts))
	return took


## The slowest of the next frames (ms): work the view leaves to its _process.
func _settle() -> float:
	var slowest := 0.0
	var last := Time.get_ticks_usec()
	for _frame: int in 8:
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		slowest = maxf(slowest, (now - last) / 1000.0)
		last = now
	return slowest


## Default zoom and zoomed out, closed, by day: frame cost and a picture each.
func _measure_views(label: String) -> void:
	var view := _colony._view
	for zoom: float in [ColonyView.ZOOM_DEFAULT, ColonyView.ZOOM_MAX]:
		view.zoom = zoom
		view.zoom_by(1.0)
		await get_tree().create_timer(1.0).timeout
		await _measure("%s zoom %d" % [label, int(zoom)])
		await _capture("scale_%s_%d" % [label, int(zoom)])
	view.zoom = ColonyView.ZOOM_DEFAULT
	view.zoom_by(1.0)


## Averages of FRAMES frames and the memory now.
func _measure(what: String) -> void:
	var rid := _colony._viewport.get_viewport_rid()
	var sums := PackedFloat64Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
	var slowest := 0.0
	for _frame: int in FRAMES:
		await get_tree().process_frame
		var frame_ms := get_process_delta_time() * 1000.0
		slowest = maxf(slowest, frame_ms)
		sums[0] += frame_ms
		sums[1] += RenderingServer.viewport_get_measured_render_time_cpu(rid)
		sums[2] += RenderingServer.viewport_get_measured_render_time_gpu(rid)
		sums[3] += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		sums[4] += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
		sums[5] += Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var frame_ms := sums[0] / FRAMES
	print("FRAME  %s: %.1f ms (%.0f fps, max %.0f ms, process %.2f ms), render cpu %.2f ms, gpu %.2f ms, %.0f draw calls, %.0f primitives, memory %.0f MB, video %.0f MB, %d nodes" % [
		what, frame_ms, 1000.0 / maxf(frame_ms, 0.001), slowest, sums[5] / FRAMES, sums[1] / FRAMES, sums[2] / FRAMES, sums[3] / FRAMES,
		sums[4] / FRAMES, Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0,
		Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0,
		int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT))])


func _look(cell: Vector3i, zoom: float) -> void:
	var view := _colony._view
	var start := Time.get_ticks_usec()
	view.look_at_cell(cell)
	if view.has_method("flush_rebuild"):
		view.call("flush_rebuild")
	_look_ms = (Time.get_ticks_usec() - start) / 1000.0
	view.zoom = zoom
	view.zoom_by(1.0)
	await get_tree().create_timer(1.5).timeout
	var deadline := Time.get_ticks_msec() + 30000
	while view._props.busy() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout


func _day() -> void:
	var model := _colony._model
	_colony._view.set_sun(deg_to_rad(48.0), deg_to_rad(210.0), model.star_kelvin, model.atmosphere_density,
		model.star_brightness(), model.star_size())


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
