extends Control
## Review tool for the props on the surface (PropLayer): pictures of the home colony's
## surroundings and of a forest, plains and a desert on the same body, close (zoom 9) and from
## afar (zoom 40), by day and at night, and the cost: props built and drawn, MultiMeshes, draw
## calls and primitives with and without props, per detail tier. Uses the development account
## (.local/dev-account.json, node tools/dev-account.cjs). Root script of smoke/prop_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/prop_view.tscn -- --out=<folder>

const DEV_ACCOUNT := "res://.local/dev-account.json"
## Cells on the development account's home body (EARTH_LIKE, sizeY 706860) with other biomes:
## its colony sits among mountains and snow near the pole, forest lies at the equator.
const SPOTS := {
	"forest": Vector3i(80, 350020, 0),
	"plains": Vector3i(90, 250030, 0),
	"beach": Vector3i(100, 200060, 0),
	"desert": Vector3i(80, 100030, 0),
}
## Biomes the development account's body does not have, laid out as a made-up sample (never
## sent, never from the server): per block four biomes in its quarters, block origin in cells.
const SAMPLE_ORIGIN := Vector2i(1600, 400000)
const SAMPLES := [
	["CALDERA", "LAVA_FLOW", "FUMAROLE", "BASALT_PLAIN"],
	["GLACIER", "ICE_SHELF", "TUNDRA", "CREVASSE"],
	["CRATER", "REGOLITH", "SWAMP", "OASIS"],
	["ASH_FIELD", "OBSIDIAN_RIDGE", "PERMAFROST", "PLAINS"],
]

var _out_dir := "user://props"
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
	await get_tree().create_timer(2.0).timeout
	# The sun and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	var view := _colony._view
	view.apply_detail(DetailGovernor.Tier.FAST)
	_day()

	var spots := {"home": _colony._model.centre_cell()}
	spots.merge(SPOTS)
	for spot: String in spots.keys():
		var cell: Vector3i = spots[spot]
		for zoom: float in [9.0, 40.0]:
			await _look(cell, zoom)
			await _capture("props_%s_zoom%d" % [spot, int(zoom)])
			await _measure("%s zoom %d" % [spot, int(zoom)])
		if spot == "home" or spot == "forest":
			await _look(cell, 9.0)
			_night()
			await _capture("props_%s_night" % spot)
			_day()

	# What the tiers cost from afar over the forest.
	await _look(SPOTS["forest"], 40.0)
	for tier: DetailGovernor.Tier in [DetailGovernor.Tier.FAST, DetailGovernor.Tier.MEDIUM, DetailGovernor.Tier.SLOW]:
		view.apply_detail(tier)
		await _measure("forest zoom 40 tier %s" % DetailGovernor.Tier.keys()[tier])
		if tier == DetailGovernor.Tier.SLOW:
			await _capture("props_forest_zoom40_slow")
	view.apply_detail(DetailGovernor.Tier.FAST)
	await _look(SPOTS["forest"], 9.0)
	await _measure("forest zoom 9 tier FAST")
	await _samples()
	get_tree().quit()


## The made-up sample of the other biomes (volcanic, ice, craters, swamp …) with a few vent
## covers, by day and by night.
func _samples() -> void:
	print("SAMPLE  made-up surface with the biomes this body lacks (not from the server)")
	var model := _colony._model
	var view := _colony._view
	var request := SurfaceBlocks.Request.new()
	var patch := SurfacePatch.new()
	patch.x0 = SAMPLE_ORIGIN.x
	patch.y0 = SAMPLE_ORIGIN.y
	patch.x1 = SAMPLE_ORIGIN.x + 2 * SurfaceBlocks.BLOCK - 1
	patch.y1 = SAMPLE_ORIGIN.y + 2 * SurfaceBlocks.BLOCK - 1
	request.x0 = patch.x0
	request.y0 = patch.y0
	request.x1 = patch.x1
	request.y1 = patch.y1
	for index: int in SAMPLES.size():
		var biomes: Array = SAMPLES[index]
		@warning_ignore("integer_division")
		var block := Vector2i(SAMPLE_ORIGIN.x / SurfaceBlocks.BLOCK + index % 2, SAMPLE_ORIGIN.y / SurfaceBlocks.BLOCK + index / 2)
		request.blocks.append(block)
		for dy: int in SurfaceBlocks.BLOCK:
			for dx: int in SurfaceBlocks.BLOCK:
				var cell := SurfacePatch.Cell.new()
				@warning_ignore("integer_division")
				cell.biome = biomes[(dx / 8) + 2 * (dy / 8)]
				var x := block.x * SurfaceBlocks.BLOCK + dx
				var y := block.y * SurfaceBlocks.BLOCK + dy
				cell.vegetation = 1 + PropRules.key_hash(x, y, 6)
				cell.variant = PropRules.key_hash(y, x, 4)
				cell.elevation = 500
				patch._cells[Vector2i(x, y)] = cell
	model.surface.store(request, patch)
	# A few vent covers, as over an underground hull.
	for step: int in 12:
		view._props._vented[Vector2i(SAMPLE_ORIGIN.x + 3 + step * 2, SAMPLE_ORIGIN.y + 15 + step % 3)] = true
	for index: int in SAMPLES.size():
		var names: Array = SAMPLES[index]
		var name_of := "_".join(PackedStringArray(names)).to_lower()
		@warning_ignore("integer_division")
		var corner := Vector3i(SAMPLE_ORIGIN.x + SurfaceBlocks.BLOCK * (index % 2) + 8,
			SAMPLE_ORIGIN.y + SurfaceBlocks.BLOCK * (index / 2) + 8, 0)
		await _look(corner, 9.0)
		await _capture("sample_%s" % name_of)
		if index == 0 or index == 1:
			_night()
			await _capture("sample_%s_night" % name_of)
			_day()
	await _look(Vector3i(SAMPLE_ORIGIN.x + 16, SAMPLE_ORIGIN.y + 16, 0), 24.0)
	await _capture("sample_all_zoom24")


func _look(cell: Vector3i, zoom: float) -> void:
	var view := _colony._view
	view.look_at_cell(cell)
	view.zoom = zoom
	view.zoom_by(1.0)
	# The surface streams in, then the props are built a few cells per frame.
	await get_tree().create_timer(1.5).timeout
	var deadline := Time.get_ticks_msec() + 20000
	while view._props.busy() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout


func _day() -> void:
	_colony._view.set_sun(deg_to_rad(48.0), deg_to_rad(210.0), _colony._model.star_kelvin, _colony._model.atmosphere_density,
		_colony._model.star_brightness(), _colony._model.star_size())


func _night() -> void:
	_colony._view.set_sun(deg_to_rad(-25.0), deg_to_rad(250.0), _colony._model.star_kelvin, _colony._model.atmosphere_density,
		_colony._model.star_brightness(), _colony._model.star_size())


## Props built and drawn, and the frame's draw calls and primitives with and without them.
func _measure(label: String) -> void:
	var props := _colony._view._props
	var stats := props.stats()
	var with_props := await _frame_cost()
	props.visible = false
	var without := await _frame_cost()
	props.visible = true
	print("MEASURE  %s: %d props built, %d drawn in %d MultiMeshes over %d blocks (built in %d ms so far); draw calls %d (without props %d), primitives %d (without %d)" % [
		label, stats["built"], stats["drawn"], stats["multimeshes"], stats["blocks"], stats["build_ms"],
		with_props.x, without.x, with_props.y, without.y])


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
