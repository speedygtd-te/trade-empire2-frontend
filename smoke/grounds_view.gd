extends Control
## Review tool for the land around a growing base (BaseGrounds, BaseGroundsLayer): the home
## colony of the development account grown on the client only (hulls added to the layout here,
## never sent) to about 100, 200, 2 000, 8 000 and 11 000 hulls, one picture per stage by day and
## at night, near (a gate in the fence before the docks, the corner facing the camera) and from
## afar; with the cost per stage: pieces, slabs, how long the plan takes, draw calls and
## primitives with and without the grounds (and without the whole perimeter).
## Uses the development account (.local/dev-account.json, node tools/dev-account.cjs). Root
## script of smoke/grounds_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/grounds_view.tscn -- --out=<folder>
##   (-- --out=<folder> --only=8000 shows one size only)

const DEV_ACCOUNT := "res://.local/dev-account.json"
## The sizes shown, in hulls on and above the ground.
const SIZES := [100, 200, 2000, 8000, 11000]
## The made-up base grows as an L: this quarter (local x and y beyond the corner) stays empty.
const NOTCH := 7
## Edges of the made-up base wobble in steps of this many cells.
const STEP := 4

var _out_dir := "user://grounds"
var _only := 0
var _colony: ColonyScreen
## Local cells in the order the base grows into them.
var _order: Array[Vector3i] = []
var _taken: Dictionary = {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument.begins_with("--only="):
			_only = argument.trim_prefix("--only=").to_int()
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/dev-account.cjs first)")
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(2.0).timeout
	# The sun and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	_colony._view.apply_detail(DetailGovernor.Tier.FAST)
	var model := _colony._model
	print("BASE  kind %s, %d hulls, %d guests, %d neighbours" % [model.layout.kind, model.layout.hull_count(),
		model.guests.size(), model.neighbours.size()])
	print("STAGES  cleared from %d, fenced from %d, paved from %d, walled from %d hulls; fence %d cells out" % [
		BaseGrounds.CLEARED_FROM, BaseGrounds.FENCED_FROM, BaseGrounds.PAVED_FROM, BaseGrounds.WALLED_FROM,
		BaseGrounds.FENCE_DISTANCE])
	_plan_growth()
	for size: int in SIZES:
		if _only > 0 and size != _only:
			continue
		_grow(size)
		await _show(size)
	get_tree().quit()


## The cells the made-up base grows into, nearest first: a rough rectangle (a little wider than
## deep) around the real base whose edges step in and out by STEP cells, an L (one quarter left
## empty) for an inner corner. Cells of other structures stay free.
func _plan_growth() -> void:
	var model := _colony._model
	var layout := model.layout
	var centre := Vector2.ZERO
	var count := 0
	for local: Vector3i in layout.hull_cells():
		if local.z == 0:
			centre += Vector2(local.x, local.y)
			count += 1
	centre /= maxf(count, 1)
	var middle := Vector2i(roundi(centre.x), roundi(centre.y))
	for structure: ColonyModel in model.drawn_structures():
		if structure == model:
			continue
		for local: Vector3i in structure.layout.hull_cells():
			var absolute := structure.layout.to_absolute(local)
			var mine := layout.to_local(Vector3i(absolute.x, absolute.y, 0))
			_taken[Vector2i(mine.x, mine.y)] = true
	var scored: Array[Vector3] = []
	var reach := 70
	for dy: int in range(-reach, reach + 1):
		for dx: int in range(-reach, reach + 1):
			if dx >= NOTCH and dy >= NOTCH:
				continue
			var cell := middle + Vector2i(dx, dy)
			if _taken.has(cell):
				continue
			var block := Vector2i(floori(float(dx) / STEP), floori(float(dy) / STEP))
			var wobble := float(PropRules.key_hash(block.x * 31 + 7, block.y * 17 + 3, 1000)) / 1000.0
			var score := maxf(absf(dx), absf(dy) * 1.2) + wobble * 3.0
			scored.append(Vector3(score, cell.x, cell.y))
	scored.sort_custom(func(a: Vector3, b: Vector3) -> bool:
		if a.x != b.x:
			return a.x < b.x
		return a.z < b.z if a.y == b.y else a.y < b.y)
	for entry: Vector3 in scored:
		_order.append(Vector3i(int(entry.y), int(entry.z), 0))


## Adds hulls in growth order until the base has `size` hulls on and above the ground, then puts
## two docks in the middle of its east side (the earlier ones end up inside: no gap there).
func _grow(size: int) -> void:
	var layout := _colony._model.layout
	var surface := 0
	for local: Vector3i in layout.hull_cells():
		if local.z >= 0:
			surface += 1
	for cell: Vector3i in _order:
		if surface >= size:
			break
		if layout._hulls.has(cell):
			continue
		layout._hulls[cell] = "STARTER"
		surface += 1
	var east := -(1 << 30)
	for local: Vector3i in layout.hull_cells():
		if local.z == 0:
			east = maxi(east, local.x)
	# The east column may be broken (its edge steps in and out): the middle one of its cells.
	var column: Array[int] = []
	for local: Vector3i in layout.hull_cells():
		if local.z == 0 and local.x == east:
			column.append(local.y)
	column.sort()
	@warning_ignore("integer_division")
	var middle := column[column.size() / 2]
	for y: int in [middle, middle + 1]:
		var cell := Vector3i(east, y, 0)
		if layout._hulls.has(cell) and layout.module_at(cell) == null:
			layout._hulls[cell] = DockRules.DOCK
	var start := Time.get_ticks_usec()
	_colony._model.layout_changed.emit()
	print("GROW  %d hulls: layout change handled in %d ms" % [size, roundi((Time.get_ticks_usec() - start) / 1000.0)])
	# The relief's share of it: bases and pads of the structures, and their foundations.
	var view := _colony._view
	# As if the pads had changed (the grown base's pad did).
	view.relief._pad_signature = 0
	start = Time.get_ticks_usec()
	view._update_relief()
	var pads_ms := (Time.get_ticks_usec() - start) / 1000.0
	start = Time.get_ticks_usec()
	view._build_foundations()
	print("RELIEF  %d hulls: bases and pads %.1f ms, foundations %.1f ms (%d walls)" % [size, pads_ms,
		(Time.get_ticks_usec() - start) / 1000.0, view.foundation_walls()])


## Pictures and cost of the base at its current size.
func _show(size: int) -> void:
	var model := _colony._model
	var view := _colony._view
	var start := Time.get_ticks_usec()
	var plans := PerimeterLayer.grounds_for(model)
	var plan_ms := (Time.get_ticks_usec() - start) / 1000.0
	var plan: BaseGrounds.Plan = plans[0] if not plans.is_empty() else BaseGrounds.Plan.new()
	var gates := 0
	for post: BaseGrounds.Post in plan.posts:
		if post.gate:
			gates += 1
	var docks: Array[Vector3i] = []
	for local: Vector3i in model.layout.hull_cells():
		if model.layout.hull_at(local) == DockRules.DOCK:
			docks.append(model.layout.to_absolute(local))
	print("DOCKS  %s" % [docks])
	print("PLAN  %d hulls: stage %s, cleared %d cells (radius %d), %d posts (%d gates), %d slabs; plan %.1f ms" % [
		size, BaseGrounds.Stage.keys()[plan.stage], plan.cleared.size(), plan.clear_radius, plan.posts.size(),
		gates, plan.paved.size(), plan_ms])
	var prefix := "grounds_%d" % size
	var near := _near_cell(plan)
	await _look(near, 9.0)
	_day()
	await _capture(prefix + "_near_day")
	await _measure("%d near day" % size)
	_night()
	await _capture(prefix + "_near_night")
	var corner := _corner_cell(plan)
	await _look(corner, 9.0)
	_day()
	await _capture(prefix + "_corner_day")
	var far_zoom := 16.0 if size < 1000 else 40.0
	# From afar a little outside the corner: the land beyond the fence shows too.
	var inward := 2 if size < 1000 else -4
	await _look(corner + Vector3i(-inward, inward, 0), far_zoom)
	_day()
	await _capture(prefix + "_far_day")
	await _measure("%d far day" % size)
	_night()
	await _capture(prefix + "_far_night")
	await _measure("%d far night" % size)
	view.apply_detail(DetailGovernor.Tier.SLOW)
	await _measure("%d far night SLOW" % size)
	view.apply_detail(DetailGovernor.Tier.FAST)


## Where to look from near: the first gate post (before the docks), else the middle of the east
## side just outside the base.
func _near_cell(plan: BaseGrounds.Plan) -> Vector3i:
	for post: BaseGrounds.Post in plan.posts:
		if post.gate:
			return Vector3i(post.cell.x - 2, post.cell.y + 1, 0)
	var layout := _colony._model.layout
	var east := -(1 << 30)
	var sum := 0
	var count := 0
	for local: Vector3i in layout.hull_cells():
		east = maxi(east, layout.to_absolute(local).x)
	for local: Vector3i in layout.hull_cells():
		var cell := layout.to_absolute(local)
		if cell.x == east:
			sum += cell.y
			count += 1
	@warning_ignore("integer_division")
	return Vector3i(east + 1, sum / maxi(count, 1), 0)


## The corner of the base facing the camera (south-east: +x, −y), a little inside.
func _corner_cell(plan: BaseGrounds.Plan) -> Vector3i:
	var best := Vector2i.ZERO
	var score := -INF
	var cells: Array[Vector2i] = []
	for post: BaseGrounds.Post in plan.posts:
		cells.append(post.cell)
	if cells.is_empty():
		var layout := _colony._model.layout
		for local: Vector3i in layout.hull_cells():
			var cell := layout.to_absolute(local)
			cells.append(Vector2i(cell.x, cell.y))
	for cell: Vector2i in cells:
		var value := float(cell.x - cell.y)
		if value > score:
			score = value
			best = cell
	return Vector3i(best.x - 2, best.y + 2, 0)




func _look(cell: Vector3i, zoom: float) -> void:
	var view := _colony._view
	view.look_at_cell(cell)
	view.zoom = zoom
	view.zoom_by(1.0)
	await get_tree().create_timer(1.5).timeout
	var deadline := Time.get_ticks_msec() + 30000
	while view._props.busy() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout


func _day() -> void:
	_sun(48.0, 210.0)


func _night() -> void:
	_sun(-25.0, 250.0)


func _sun(elevation: float, azimuth: float) -> void:
	var model := _colony._model
	_colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(azimuth), model.star_kelvin, model.atmosphere_density,
		model.star_brightness(), model.star_size())


## Pieces and slabs, and the frame's draw calls and primitives with everything, without the
## grounds, and without the whole perimeter (masts and grounds).
func _measure(label: String) -> void:
	var perimeter := _colony._view._perimeter
	var grounds := perimeter._grounds
	var stats := grounds.stats()
	var with_it := await _frame_cost()
	grounds.visible = false
	var without := await _frame_cost()
	perimeter.visible = false
	var bare := await _frame_cost()
	perimeter.visible = true
	grounds.visible = true
	print("MEASURE  %s: %s; draw calls %d (without grounds %d, without perimeter %d), primitives %d (without grounds %d, without perimeter %d); props %s" % [
		label, stats, with_it.x, without.x, bare.x, with_it.y, without.y, bare.y, _colony._view._props.stats()])


func _frame_cost() -> Vector2i:
	for frame: int in 3:
		await RenderingServer.frame_post_draw
	return Vector2i(int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)))


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
