extends Control
## Review tool for the relief of the ground (TerrainRelief, GroundLayer, ColonyView.lift_of): the
## home colony of the development account from afar, mid and close, by day and at night, and two
## made-up structures (on the client only, never sent) on the steepest ground nearby — one where the
## ground falls towards the camera (its foundation shows), one where it rises towards it (the cut
## shows). Checks that neighbouring ground blocks share their edge heights (no cracks) and that taps
## on the ground hit the cell drawn there, and measures the cost: draw calls, primitives and frame
## time with the relief and with flat ground, and how long the ground meshes take to build.
## Uses the development account (.local/dev-account.json, node tools/dev-account.cjs). Root script
## of smoke/relief_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/relief_view.tscn -- --out=<folder>

const DEV_ACCOUNT := "res://.local/dev-account.json"
## Ids of the made-up structures (far from any real one).
const FAKE_DOWN := 990001
const FAKE_UP := 990002
## Size of a made-up structure (cells).
const FAKE_SIZE := Vector2i(5, 4)
## How far from the home structure the steep spots are looked for (cells).
const SEARCH := 40

var _out_dir := "user://relief"
var _colony: ColonyScreen


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
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
	await get_tree().create_timer(3.0).timeout
	# The sun and the detail tier stay where this tool puts them; the made-up structures stay
	# (the fleet's sync would drop neighbours it does not know).
	_colony.set_process(false)
	if _colony._fleet.changed.is_connected(_colony._on_fleet_changed):
		_colony._fleet.changed.disconnect(_colony._on_fleet_changed)
	var view := _colony._view
	var model := _colony._model
	view.apply_detail(DetailGovernor.Tier.FAST)
	var home := model.centre_cell()
	var relief := view.relief
	print("RELIEF  scale %.2f cells per unit, reference e %.1f, home base %.1f, home lift %.3f" % [
		TerrainRelief.SCALE, relief.reference, view._bases.get(model.structure_id, NAN), view.home_lift()])
	_print_range(home)

	await _look(home, ColonyView.ZOOM_MAX)
	_day()
	await _capture("home_far_day")
	await _measure("home far day")
	await _look(home, 16.0)
	await _capture("home_mid_day")
	await _look(home, 6.0)
	await _capture("home_close_day")
	_night()
	await _capture("home_close_night")
	await _look(home, 16.0)
	await _capture("home_mid_night")
	_day()

	var spots := _steep_spots(home)
	if spots.is_empty():
		print("SLOPE  no steep ground found near the home structure")
	else:
		var down: Vector2i = spots[0]
		var up: Vector2i = spots[1]
		print("SLOPE  falls towards the camera at %s, rises towards it at %s (made-up structures, client only)" % [down, up])
		_fake(FAKE_DOWN, down)
		_fake(FAKE_UP, up)
		await get_tree().create_timer(0.5).timeout
		for pair: Array in [[FAKE_DOWN, down, "slope_down"], [FAKE_UP, up, "slope_up"]]:
			var id: int = pair[0]
			var at: Vector2i = pair[1]
			var label: String = pair[2]
			_ensure_fake(id, at)
			var fake := model.neighbours.get(id) as ColonyModel
			var cells: Array[Vector2i] = []
			if fake != null:
				cells = ColonyView.footprint_of(fake.layout)
			print("SLOPE  %s: base e %.1f, lift %.3f, ground e %s .. %s under it, %d foundation walls in view" % [
				label, view._bases.get(id, NAN), view._lifts.get(id, NAN), _low(cells), _high(cells), view.foundation_walls()])
			var centre := Vector3i(at.x, at.y, 0)
			await _look(centre, 9.0)
			_day()
			await _capture(label + "_day")
			# Close on the corner facing the camera (south-east: +x, −y).
			@warning_ignore("integer_division")
			var corner := Vector3i(at.x + FAKE_SIZE.x / 2, at.y - FAKE_SIZE.y / 2, 0)
			await _look(corner, 5.0)
			await _capture(label + "_close_day")
			_night()
			await _capture(label + "_close_night")
			_day()
			_check_picking(centre)
		await _look(Vector3i(down.x, down.y, 0), 22.0)
		await _capture("slope_down_wide_day")

	await _look(home, 16.0)
	_check_seams()
	await _compare_flat()
	get_tree().quit()


## Elevations loaded around the home structure.
func _print_range(home: Vector3i) -> void:
	var surface := _colony._model.surface
	var low := INF
	var high := -INF
	var steps: Array[int] = []
	for y: int in range(home.y - SEARCH, home.y + SEARCH):
		for x: int in range(home.x - SEARCH, home.x + SEARCH):
			var cell := surface.cell(x, y)
			var east := surface.cell(x + 1, y)
			if cell == null:
				continue
			low = minf(low, cell.elevation)
			high = maxf(high, cell.elevation)
			if east != null:
				steps.append(absi(east.elevation - cell.elevation))
	steps.sort()
	if steps.is_empty():
		print("RANGE  nothing loaded")
		return
	@warning_ignore("integer_division")
	var median := steps[steps.size() / 2]
	print("RANGE  e %d .. %d within %d cells (scene %.2f), neighbour step median %d, max %d" % [
		int(low), int(high), SEARCH, (high - low) * TerrainRelief.SCALE, median, steps[steps.size() - 1]])


## The cells (centres) near the home structure where the ground falls most towards the camera
## (from +x, −y) and rises most towards it, away from every structure; empty when nothing loaded.
func _steep_spots(home: Vector3i) -> Array[Vector2i]:
	var model := _colony._model
	var surface := model.surface
	var taken := {}
	for structure: ColonyModel in model.drawn_structures():
		for local: Vector3i in structure.layout.hull_cells():
			var cell := structure.layout.to_absolute(local)
			for dy: int in range(-8, 9):
				for dx: int in range(-8, 9):
					taken[Vector2i(cell.x + dx, cell.y + dy)] = true
	var best_down := Vector2i.ZERO
	var best_up := Vector2i.ZERO
	var down_score := -INF
	var up_score := -INF
	for y: int in range(home.y - SEARCH, home.y + SEARCH):
		for x: int in range(home.x - SEARCH, home.x + SEARCH):
			var spot := Vector2i(x, y)
			if taken.has(spot) or taken.has(spot + FAKE_SIZE) or taken.has(spot - FAKE_SIZE):
				continue
			var east := surface.cell(x + 3, y)
			var west := surface.cell(x - 3, y)
			var north := surface.cell(x, y + 3)
			var south := surface.cell(x, y - 3)
			if east == null or west == null or north == null or south == null:
				continue
			# Rise along the view towards the camera (+x, −y).
			var rise := float(east.elevation - west.elevation) - float(north.elevation - south.elevation)
			if -rise > down_score:
				down_score = -rise
				best_down = spot
			if rise > up_score:
				up_score = rise
				best_up = spot
	if down_score == -INF:
		return []
	return [best_down, best_up]


## A made-up structure of FAKE_SIZE shut hulls with its middle at `centre`, as a neighbour of the
## home structure (client only).
func _fake(id: int, centre: Vector2i) -> void:
	var model := _colony._model
	var fake := model._make_sibling(id)
	fake.name = "Fake%d" % id
	fake.neighbour_of = model
	fake.structure_name = "Slope %d" % id
	fake.layout.structure_id = id
	fake.layout.kind = "base"
	fake.layout.anchor_type = "surface"
	@warning_ignore("integer_division")
	fake.layout.offset = Vector3i(centre.x - FAKE_SIZE.x / 2, centre.y - FAKE_SIZE.y / 2, 0)
	fake.layout.rev = 1
	for j: int in FAKE_SIZE.y:
		for i: int in FAKE_SIZE.x:
			fake.layout._hulls[Vector3i(i, j, 0)] = "STARTER"
	model.neighbours[id] = fake
	model.add_child(fake)
	model.guests_changed.emit()


## Puts a made-up structure back if the fleet's sync took it away.
func _ensure_fake(id: int, centre: Vector2i) -> void:
	if not _colony._model.neighbours.has(id):
		_fake(id, centre)


func _low(cells: Array[Vector2i]) -> String:
	var low := INF
	for cell: Vector2i in cells:
		var found := _colony._model.surface.cell(cell.x, cell.y)
		if found != null:
			low = minf(low, found.elevation)
	return "%d" % int(low) if low != INF else "?"


func _high(cells: Array[Vector2i]) -> String:
	var high := -INF
	for cell: Vector2i in cells:
		var found := _colony._model.surface.cell(cell.x, cell.y)
		if found != null:
			high = maxf(high, found.elevation)
	return "%d" % int(high) if high != -INF else "?"


## Taps on the ground around a cell: the cell under the point where a cell's middle is drawn must
## be that cell.
func _check_picking(centre: Vector3i) -> void:
	var view := _colony._view
	var model := _colony._model
	var hits := 0
	var tried := 0
	var flat_hits := 0
	for dy: int in range(-6, 7, 2):
		for dx: int in range(-6, 7, 2):
			var cell := Vector3i(centre.x + dx, centre.y + dy, 0)
			if view._hull_of_drawn(cell) != null:
				continue
			var point := view.on_ground(WorldGrid.to_scene(cell, view.origin, model.size_x))
			var screen := view._camera.unproject_position(point)
			tried += 1
			var found: Variant = view.cell_at(screen)
			if found != null and (found as Vector3i) == cell:
				hits += 1
			var flat: Variant = view.cell_at(screen, 0.0)
			if flat != null and (flat as Vector3i) == cell:
				flat_hits += 1
	print("PICK  %d of %d ground cells hit (a flat plane would hit %d)" % [hits, tried, flat_hits])


## Neighbouring ground blocks must agree on the heights of their shared edge.
func _check_seams() -> void:
	var ground := _colony._view._ground
	var worst := 0.0
	var edges := 0
	var side := SurfaceBlocks.BLOCK + 1
	for key: Vector2i in ground._blocks.keys():
		var east := key + Vector2i(1, 0)
		var north := key + Vector2i(0, 1)
		var mine := _vertices(ground._blocks[key] as MeshInstance3D)
		if mine.is_empty():
			continue
		for other: Vector2i in [east, north]:
			if not ground._blocks.has(other):
				continue
			var theirs := _vertices(ground._blocks[other] as MeshInstance3D)
			edges += 1
			for k: int in side:
				var a: float
				var b: float
				if other == east:
					a = mine[k * side + side - 1].y
					b = theirs[k * side].y
				else:
					a = mine[(side - 1) * side + k].y
					b = theirs[k].y
				worst = maxf(worst, absf(a - b))
	print("SEAMS  %d shared block edges, largest height difference %.6f" % [edges, worst])


func _vertices(instance: MeshInstance3D) -> PackedVector3Array:
	var mesh := instance.mesh as ArrayMesh
	if mesh == null:
		return PackedVector3Array()
	var arrays := mesh.surface_get_arrays(0)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	return vertices


## Cost with the relief and with flat ground (the same blocks as flat quads), on the fast and the
## slow tier, and how long building every ground mesh takes.
func _compare_flat() -> void:
	var view := _colony._view
	var ground := view._ground
	var blocks := {}
	for key: Vector2i in ground._blocks.keys():
		blocks[key] = true
	view.relief._pad_signature = 0
	var start := Time.get_ticks_usec()
	view._update_relief()
	var relief_ms := (Time.get_ticks_usec() - start) / 1000.0
	start = Time.get_ticks_usec()
	view._build_foundations()
	print("STRUCTURES  bases and pads %.1f ms, foundations %.1f ms (per layout change)" % [
		relief_ms, (Time.get_ticks_usec() - start) / 1000.0])
	start = Time.get_ticks_usec()
	view.relief.clear()
	ground.refresh_heights(blocks)
	var build_ms := (Time.get_ticks_usec() - start) / 1000.0
	print("BUILD  %d relief meshes (heights computed anew) in %.1f ms, %.2f ms each" % [
		blocks.size(), build_ms, build_ms / maxf(blocks.size(), 1)])
	for tier: DetailGovernor.Tier in [DetailGovernor.Tier.FAST, DetailGovernor.Tier.SLOW]:
		view.apply_detail(tier)
		var name: String = DetailGovernor.Tier.keys()[tier]
		var with_relief := await _frame_cost()
		ground.relief = null
		ground.refresh_heights(blocks)
		var flat := await _frame_cost()
		ground.relief = view.relief
		ground.refresh_heights(blocks)
		print("COST  %s: relief %d draw calls, %d primitives, %.2f ms per frame; flat %d draw calls, %d primitives, %.2f ms per frame" % [
			name, with_relief[0], with_relief[1], with_relief[2], flat[0], flat[1], flat[2]])
	view.apply_detail(DetailGovernor.Tier.FAST)


func _look(cell: Vector3i, zoom: float) -> void:
	var view := _colony._view
	view.look_at_cell(cell)
	view.zoom = zoom
	view.zoom_by(1.0)
	await get_tree().create_timer(1.5).timeout
	var deadline := Time.get_ticks_msec() + 20000
	while (view._props.busy() or not view._ground_queue.is_empty()) and Time.get_ticks_msec() < deadline:
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


func _measure(label: String) -> void:
	var cost := await _frame_cost()
	print("MEASURE  %s: %d draw calls, %d primitives, %.2f ms per frame; ground %d blocks, props %s" % [
		label, cost[0], cost[1], cost[2], _colony._view._ground.block_count(), _colony._view._props.stats()])


## Draw calls, primitives and the mean time per frame over 60 frames.
func _frame_cost() -> Array:
	for frame: int in 3:
		await RenderingServer.frame_post_draw
	var calls := int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	var primitives := int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	var start := Time.get_ticks_usec()
	for frame: int in 60:
		await RenderingServer.frame_post_draw
	return [calls, primitives, (Time.get_ticks_usec() - start) / 60000.0]


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
