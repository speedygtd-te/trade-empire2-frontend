extends Control
## SAMPLE review of deep water (contract draft.39, not live yet): opens the colony of the levels
## account (.local/levels-account.json) and replaces the ground around it, client side only, with
## a draft.39-shaped coast — land around the structure, east of it a sea whose water column grows
## to 13 levels (water biome down to z = −12, the sea floor's rock below) — then takes pictures:
## the coast from outside, the cutaway at z −1, −6 and −13, and the build palette in the water
## column and on the sea floor. Nothing is built or sent; every picture is named *_SAMPLE.
##   godot --path . --resolution 720x1280 res://smoke/deep_water_view.tscn -- --out=build/deep_water

const ACCOUNT := "res://.local/levels-account.json"
## Deepest water column of the sample (levels): water down to z = −(DEPTH − 1).
const DEPTH := 13
## Blocks around the structure that get the sample ground.
const REACH := 4
## Levels below the ground that get a sample surface.
const LEVELS := 16

var _out_dir := "user://deep_water"
var _colony: ColonyScreen
var _model: ColonyModel
## Absolute x of the shore line at y = 0 (land west of it).
var _shore := 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/dev-account.cjs --account levels /v2/me)")
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(4.0).timeout
	_model = _colony._model
	var layout := _model.layout
	var east: int = -(1 << 30)
	for cell: Vector3i in layout.hull_cells():
		east = maxi(east, layout.to_absolute(cell).x)
	var centre := _model.centre_cell()
	_shore = east + 4
	print("SAMPLE  structure at %s, shore x = %d, deep threshold %d, body %s" % [centre, _shore, _model.deep_threshold, _model.body_type])

	_fill_sample(centre)
	var view := _colony._view
	view.relief.clear()
	var footprint := ColonyView.footprint_of(layout)
	view.relief.set_reference(view.relief.base_of(footprint))
	view._rebuild_all()
	await get_tree().create_timer(1.0).timeout

	# Outside: the coast, water flat at the sea level, the shore blending into the land.
	var coast := Vector3i(_shore + 2, centre.y, 0)
	view.look_at_cell(coast)
	view.zoom = 24.0
	view.zoom_by(1.0)
	await _capture("coast_outside_SAMPLE")
	view.zoom = 9.0
	view.zoom_by(1.0)
	await _capture("coast_outside_near_SAMPLE")

	# The cutaway: z −1 (shore: rock west, water east), z −6 (the column goes on further out),
	# z −13 (all sea floor, washed blue under the deep water).
	_colony._select_structure(true)
	_colony._open_structure(ColonyScreen.Mode.VIEW)
	view.zoom = 18.0
	view.zoom_by(1.0)
	for z: int in [-1, -6, -13]:
		_colony._set_level(z)
		_look_at(Vector3i(_shore + (10 if z < -10 else 3), centre.y, z))
		await get_tree().create_timer(0.5).timeout
		var counts := view.underground_layer().water_cells()
		print("SAMPLE  level %d: %d water cells, %d sea floor cells, env %s, range %s" % [z, counts.x, counts.y,
			_colony._level_environment(), _colony._level_range()])
		await _capture("cutaway_z%d_SAMPLE" % -z)

	# Build on level −6 (inside this body's grid): far out the cell lies in the water column and the
	# palette offers the underwater hulls; nearer the shore the column is only six levels deep and
	# the cell is the sea floor, which takes the hulls for (deep) rock.
	_colony._set_mode(ColonyScreen.Mode.BUILD)
	_colony._set_level(-6)
	var y := centre.y
	var wet := Vector3i(_shore_at(y) + 12, y, -6)
	var floor_cell := Vector3i(_shore_at(y) + 5, y, -6)
	for entry: Array in [[wet, "column", "hull:PLATFORM_UNDERWATER"], [floor_cell, "sea_floor", "hull:REINFORCED"]]:
		var cell: Vector3i = entry[0]
		var tag: String = entry[1]
		_colony._select(cell)
		await get_tree().process_frame
		_open_hull_list()
		await get_tree().process_frame
		_look_at(cell)
		print("SAMPLE  palette at %s (depth %d): %s, hidden: %s" % [cell, _depth(cell.x, cell.y),
			_colony._level_environment(), _colony._palette._hint_text])
		await _capture("build_%s_palette_SAMPLE" % tag)
		var tool: String = entry[2]
		_colony._choose_tool(tool)
		_colony._select(cell)
		await get_tree().process_frame
		await get_tree().process_frame
		_look_at(cell)
		await _capture("build_%s_%s_SAMPLE" % [tag, tool.get_slice(":", 1).to_lower()])
	get_tree().quit()


## Opens the palette's list on the hulls.
func _open_hull_list() -> void:
	_colony._palette._category = BuildCatalog.HULLS
	_colony._palette._on_change()


func _shore_at(y: int) -> int:
	return _shore + roundi(2.0 * sin(y * 0.35))


## The sample water column depth (levels) under an absolute column: 0 on land, then one more per
## cell out to sea (neighbours differ by at most one), up to DEPTH; the shore wobbles.
func _depth(x: int, y: int) -> int:
	var shore := _shore_at(y)
	return clampi(x - shore + 1, 0, DEPTH)


## The sample biome of a cell at level z (≤ 0) and its elevation.
func _biome(x: int, y: int, z: int) -> String:
	var depth := _depth(x, y)
	if depth > -z:
		return "SHALLOW_WATER" if depth <= 2 else ("OCEAN" if depth <= 8 else "DEEP_OCEAN")
	if z == 0:
		return "BEACH" if x >= _shore_at(y) - 2 else "PLAINS"
	# Underground layers counted from the sea floor (or the ground on land).
	var layer := -z - maxi(0, depth - 1)
	if layer >= 6 or z <= _model.deep_threshold:
		return "DEEP_STONE"
	return "MINERAL_VEIN" if (x * 7 + y * 3 + z) % 11 == 0 else "ROCK_LAYER"


func _elevation(x: int, y: int) -> int:
	var depth := _depth(x, y)
	if depth > 0:
		return 300 - depth * 8
	var shore := _shore_at(y)
	return mini(360, 304 + (shore - x) * 3)


## Stores the sample ground for z = 0 … −LEVELS in every block within REACH of `centre`.
func _fill_sample(centre: Vector3i) -> void:
	_model.body_type = "EARTH_LIKE"
	var middle := _model.surface.block_of(centre.x, centre.y)
	for z: int in range(0, -LEVELS - 1, -1):
		var blocks := _model.level_surface(z)
		for by: int in range(middle.y - REACH, middle.y + REACH + 1):
			for bx: int in range(middle.x - REACH, middle.x + REACH + 1):
				var request := SurfaceBlocks.Request.new()
				request.x0 = bx * SurfaceBlocks.BLOCK
				request.y0 = by * SurfaceBlocks.BLOCK
				request.x1 = request.x0 + SurfaceBlocks.BLOCK - 1
				request.y1 = request.y0 + SurfaceBlocks.BLOCK - 1
				request.blocks.append(Vector2i(bx, by))
				blocks.store(request, _patch(request, z))


func _patch(request: SurfaceBlocks.Request, z: int) -> SurfacePatch:
	var lines := PackedStringArray()
	lines.append('{"bodyId":"sample","x0":%d,"y0":%d,"x1":%d,"y1":%d,"z":%d,"rows":%d}' % [
		request.x0, request.y0, request.x1, request.y1, z, SurfaceBlocks.BLOCK])
	for y: int in range(request.y0, request.y1 + 1):
		var cells := PackedStringArray()
		for x: int in range(request.x0, request.x1 + 1):
			cells.append('{"b":"%s","v":%d,"g":%d,"e":%d,"m":500}' % [_biome(x, y, z), posmod(x * 3 + y, 4),
				2 if z == 0 and _depth(x, y) == 0 else 0, _elevation(x, y)])
		lines.append('{"y":%d,"cells":[%s]}' % [y, ",".join(cells)])
	lines.append('{"end":true,"rows":%d}' % SurfaceBlocks.BLOCK)
	return SurfacePatch.from_stream(Ndjson.parse("\n".join(lines)))


## Centres the view on an absolute cell, in the part above the bottom panel.
func _look_at(cell: Vector3i) -> void:
	_colony._view.look_at_cell(cell)
	_colony._view.pan(Vector2(0.0, -_colony._bottom.size.y * 0.5 * _colony._scale()), Vector2(_colony._viewport.size))


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
