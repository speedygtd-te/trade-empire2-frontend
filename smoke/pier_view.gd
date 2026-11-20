extends Control
## Review tool for structures and props in the water (Piers, TerrainRelief.DECK): opens the home
## colony of the development account and replaces the ground around it, on the client only, with a
## coast whose shore runs through the middle of the base (land west, sea east). Pictures: the pier
## under the base's edge over the water near, mid and far, by day and at night, the masts on
## caissons, then the base grown (client only, as grounds_view) to a fenced and to a walled size:
## fence and wall posts in the water on caissons, no concrete on the water. Prints the pieces and
## the cost (draw calls, primitives with and without the piers and caissons). Nothing is sent.
##   godot --path . --resolution 720x1280 res://smoke/pier_view.tscn -- --out=build/piers [--small]

const DEV_ACCOUNT := "res://.local/dev-account.json"
## Blocks around the structure that get the sample ground.
const REACH := 7
## Sizes the base is grown to (hulls): fenced, walled.
const SIZES := [2000, 11000]

var _out_dir := "user://piers"
var _colony: ColonyScreen
var _model: ColonyModel
## Absolute x of the shore at y = 0 (land west of it).
var _shore := 0
var _order: Array[Vector3i] = []
## Only the base as it is (-- --small): no grown base.
var _small := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument == "--small":
			_small = true
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
	await get_tree().create_timer(4.0).timeout
	_colony.set_process(false)
	if _colony._fleet.changed.is_connected(_colony._on_fleet_changed):
		_colony._fleet.changed.disconnect(_colony._on_fleet_changed)
	_model = _colony._model
	var view := _colony._view
	view.apply_detail(DetailGovernor.Tier.FAST)
	var layout := _model.layout
	var west: int = 1 << 30
	var east: int = -(1 << 30)
	for cell: Vector3i in layout.hull_cells():
		var absolute := layout.to_absolute(cell)
		if absolute.z == 0:
			west = mini(west, absolute.x)
			east = maxi(east, absolute.x)
	var centre := _model.centre_cell()
	@warning_ignore("integer_division")
	_shore = (west + east + 1) / 2
	print("SAMPLE  base %s, x %d..%d, shore x = %d, %d hulls, kind %s" % [centre, west, east, _shore,
		layout.hull_count(), layout.kind])
	_fill_sample(centre)
	_refresh()
	await get_tree().create_timer(1.0).timeout
	_report("start")

	var pier := Vector3i(east, centre.y, 0)
	for entry: Array in [[5.0, "near"], [12.0, "mid"], [ColonyView.ZOOM_MAX, "far"]]:
		var zoom: float = entry[0]
		var tag: String = entry[1]
		await _look(pier + Vector3i(1, -1, 0), zoom)
		_day()
		await _capture("pier_%s_day" % tag)
		_night()
		await _capture("pier_%s_night" % tag)
	_day()
	# The masts and beacons standing in the water.
	var wet_spot := Vector3i.ZERO
	var found := false
	for spot: Perimeter.Spot in PerimeterLayer.spots_for(_model):
		if view.cell_wet(spot.cell.x, spot.cell.y) and spot.kind == Perimeter.Kind.LAMP:
			wet_spot = Vector3i(spot.cell.x, spot.cell.y, 0)
			found = true
			break
	if found:
		await _look(wet_spot, 4.0)
		await _capture("mast_in_water_day")
		_night()
		await _capture("mast_in_water_night")
		_day()
	# The shore: where the wall on land meets the pier.
	await _look(Vector3i(_shore, centre.y - 2, 0), 5.0)
	await _capture("shore_near_day")
	view._props.visible = false
	await _capture("shore_near_day_no_props")
	view._props.visible = true
	await _measure("small base")

	if _small:
		get_tree().quit()
		return
	_plan_growth()
	for size: int in SIZES:
		_grow(size)
		# The grown base asks for the ground around it: the server's arrives, the sample goes back.
		await get_tree().create_timer(4.0).timeout
		_fill_sample(_model.centre_cell())
		_refresh()
		await get_tree().create_timer(1.0).timeout
		_report("%d hulls" % size)
		var post := _wet_post()
		await _look(post, 6.0)
		_day()
		await _capture("grounds_%d_post_day" % size)
		_night()
		await _capture("grounds_%d_post_night" % size)
		_day()
		await _look(post, ColonyView.ZOOM_MAX)
		await _capture("grounds_%d_far_day" % size)
		await _measure("%d hulls" % size)
	get_tree().quit()


func _refresh() -> void:
	var view := _colony._view
	view.relief.clear()
	view.relief.set_reference(view.relief.base_of(ColonyView.footprint_of(_model.layout)))
	view._rebuild_all()
	# The props of the ground loaded before the sample.
	view._props.rebuild()


func _report(label: String) -> void:
	var view := _colony._view
	var low := 1 << 30
	var high := -1
	var wet := 0
	var missing := 0
	for cell: Vector2i in ColonyView.footprint_of(_model.layout):
		var found := _model.surface.cell(cell.x, cell.y)
		if found == null:
			missing += 1
			continue
		low = mini(low, found.elevation)
		high = maxi(high, found.elevation)
		if LevelRules.is_water_biome(found.biome):
			wet += 1
	# Props standing on water cells (should be none).
	var wet_props := 0
	var all_props := 0
	for holder: Node in view._props.get_children():
		for instance: Node in holder.get_children():
			var multi := instance as MultiMeshInstance3D
			if multi == null:
				continue
			for index: int in multi.multimesh.instance_count:
				var point := multi.multimesh.get_instance_transform(index).origin
				var cell := WorldGrid.to_cell(point, view.origin, _model.size_x)
				all_props += 1
				if view.cell_wet(cell.x, cell.y):
					wet_props += 1
	print("PROPS  %s: %d of %d props on water cells" % [label, wet_props, all_props])
	print("FOOTPRINT  %s: e %d..%d, %d water cells, %d not loaded, base %.1f" % [label, low, high, wet, missing,
		view.relief.base_of(ColonyView.footprint_of(_model.layout))])
	print("PIECES  %s: retaining %s, perimeter %s, foundation walls %d, home lift %.3f, water %.3f" % [label,
		view.retaining_stats(), view._perimeter.stats(), view.foundation_walls(), view.home_lift(), view.water_height()])


## A fence post in the water near the shore, south of the base (facing the camera).
func _wet_post() -> Vector3i:
	var view := _colony._view
	var best := Vector3i(_shore + 3, _model.centre_cell().y, 0)
	var score := 1 << 30
	for plan: BaseGrounds.Plan in PerimeterLayer.grounds_for(_model):
		for post: BaseGrounds.Post in plan.posts:
			if not view.cell_wet(post.cell.x, post.cell.y):
				continue
			var value := absi(post.cell.x - (_shore + 2)) + post.cell.y
			if value < score:
				score = value
				best = Vector3i(post.cell.x, post.cell.y, 0)
	return best


func _shore_at(y: int) -> int:
	# Straight along the base, wobbling further away.
	var away := absi(y - _model.centre_cell().y)
	return _shore + (roundi(1.5 * sin(y * 0.3)) if away > 8 else 0)


func _depth(x: int, y: int) -> int:
	return clampi(x - _shore_at(y) + 1, 0, 12)


func _fill_sample(centre: Vector3i) -> void:
	_model.body_type = "EARTH_LIKE"
	var middle := _model.surface.block_of(centre.x, centre.y)
	var blocks := _model.level_surface(0)
	for by: int in range(middle.y - REACH, middle.y + REACH + 1):
		for step: int in range(-REACH, REACH + 1):
			# Blocks are keyed wrapped into the body's width.
			var bx := middle.x + step
			if _model.size_x > 0:
				@warning_ignore("integer_division")
				bx = posmod(bx, _model.size_x / SurfaceBlocks.BLOCK)
			var request := SurfaceBlocks.Request.new()
			request.x0 = bx * SurfaceBlocks.BLOCK
			request.y0 = by * SurfaceBlocks.BLOCK
			request.x1 = request.x0 + SurfaceBlocks.BLOCK - 1
			request.y1 = request.y0 + SurfaceBlocks.BLOCK - 1
			request.blocks.append(Vector2i(bx, by))
			blocks.store(request, _patch(request))


func _patch(request: SurfaceBlocks.Request) -> SurfacePatch:
	var lines := PackedStringArray()
	lines.append('{"bodyId":"sample","x0":%d,"y0":%d,"x1":%d,"y1":%d,"z":0,"rows":%d}' % [
		request.x0, request.y0, request.x1, request.y1, SurfaceBlocks.BLOCK])
	for y: int in range(request.y0, request.y1 + 1):
		var cells := PackedStringArray()
		for cell_x: int in range(request.x0, request.x1 + 1):
			# Blocks are stored wrapped into the body's width; the shore is not.
			var x := WorldGrid.unwrap_x(cell_x, _shore, _model.size_x)
			var depth := _depth(x, y)
			var biome := "PLAINS"
			var elevation := mini(330, 303 + (_shore_at(y) - x) * 2)
			if depth > 0:
				biome = "SHALLOW_WATER" if depth <= 2 else "OCEAN"
				elevation = 300 - depth * 8
			elif x >= _shore_at(y) - 2:
				biome = "BEACH"
			cells.append('{"b":"%s","v":%d,"g":%d,"e":%d,"m":500}' % [biome, posmod(x * 3 + y, 4),
				2 if depth == 0 else 0, elevation])
		lines.append('{"y":%d,"cells":[%s]}' % [y, ",".join(cells)])
	lines.append('{"end":true,"rows":%d}' % SurfaceBlocks.BLOCK)
	return SurfacePatch.from_stream(Ndjson.parse("\n".join(lines)))


## Cells the base grows into, nearest first (a rough rectangle around it).
func _plan_growth() -> void:
	var layout := _model.layout
	var centre := Vector2.ZERO
	var count := 0
	for local: Vector3i in layout.hull_cells():
		if local.z == 0:
			centre += Vector2(local.x, local.y)
			count += 1
	centre /= maxf(count, 1)
	var middle := Vector2i(roundi(centre.x), roundi(centre.y))
	var taken := {}
	for structure: ColonyModel in _model.drawn_structures():
		if structure == _model:
			continue
		for local: Vector3i in structure.layout.hull_cells():
			var absolute := structure.layout.to_absolute(local)
			var mine := layout.to_local(Vector3i(absolute.x, absolute.y, 0))
			taken[Vector2i(mine.x, mine.y)] = true
	var scored: Array[Vector3] = []
	var reach := 70
	for dy: int in range(-reach, reach + 1):
		for dx: int in range(-reach, reach + 1):
			var cell := middle + Vector2i(dx, dy)
			if taken.has(cell):
				continue
			var block := Vector2i(floori(float(dx) / 4), floori(float(dy) / 4))
			var wobble := float(PropRules.key_hash(block.x * 31 + 7, block.y * 17 + 3, 1000)) / 1000.0
			scored.append(Vector3(maxf(absf(dx), absf(dy) * 1.2) + wobble * 3.0, cell.x, cell.y))
	scored.sort_custom(func(a: Vector3, b: Vector3) -> bool:
		if a.x != b.x:
			return a.x < b.x
		return a.z < b.z if a.y == b.y else a.y < b.y)
	for entry: Vector3 in scored:
		_order.append(Vector3i(int(entry.y), int(entry.z), 0))


func _grow(size: int) -> void:
	var layout := _model.layout
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
	_model.layout_changed.emit()


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
	_colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(azimuth), _model.star_kelvin, _model.atmosphere_density,
		_model.star_brightness(), _model.star_size())


## Draw calls and primitives with everything, without the piers and walls, without the caissons.
func _measure(label: String) -> void:
	var view := _colony._view
	var with_it := await _frame_cost()
	view._retaining.visible = false
	var without := await _frame_cost()
	view._retaining.visible = true
	view._perimeter._footings.visible = false
	var no_caissons := await _frame_cost()
	view._perimeter._footings.visible = true
	print("MEASURE  %s: draw calls %d (without piers/walls %d, without caissons %d), primitives %d (%d, %d)" % [
		label, with_it.x, without.x, no_caissons.x, with_it.y, without.y, no_caissons.y])


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
