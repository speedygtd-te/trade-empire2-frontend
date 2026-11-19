extends Control
## Review tool for the paths in a structure (PathAccess): signs in with the development account,
## opens its colony and replaces the layout on this client only (nothing is sent) by a block with
## an entrance, corridors, a cut-off pocket, a staircase to level 1 and a level 2 without one. Then
## takes pictures: the paths in Build, the spots of a staffed module, a placement that would cut a
## module off, the amber spots on the level that is not connected, a cut-off module and a hull
## that cannot go in Inspect. Root script of smoke/path_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/path_view.tscn -- --out=build/paths

const ACCOUNT := "res://.local/dev-account.json"
## Level pictures (row = y, column = x, local cells): # free hull, S storage, M smelter (staff),
## E staircase, . nothing.
const LEVELS := {
	0: [
		"SSSSSSSSSS",
		"####MS##MS",
		"S##SSS#SSS",
		"S#E#SM#S#S",
		"S###SS#SSS",
		"SSSSSSSSSS",
	],
	1: [
		"..........",
		"..........",
		".###......",
		".###M.....",
		".###......",
	],
	2: [
		"..........",
		"..........",
		".###......",
		".#M#......",
		".###......",
	],
}
const TYPES := {"S": "BASIC_STORAGE", "M": "SMELTER", "E": "STAIRCASE"}
const HULL := "STANDARD"

var _out_dir := "user://paths"
var _colony: ColonyScreen
var _model: ColonyModel


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
		print("FAIL  sign-in (run node tools/dev-account.cjs /v2/me)")
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
	print("PATHS  structure %d kind %s anchor %s offset %s, %d hulls, access %s" % [layout.structure_id, layout.kind,
		layout.anchor_type, layout.offset, layout.hull_count(), layout.access != null])
	_colony._view.look_at_cell(_model.centre_cell())
	await _capture("paths_before")
	_replace_layout(layout)
	var access := PathAccess.of(layout, Services.definitions)
	print("PATHS  entrances %s, levels %s, unconnected %s" % [access.entrance_cells(), access.levels, access.unconnected_modules()])

	_colony._select_structure(true)
	_colony._open_structure(ColonyScreen.Mode.BUILD)
	_colony.recentre()
	print("PATHS  centre ", _model.centre_cell(), " focus ", _colony._view.focus_cell(), " zoom ", _colony._view.zoom, " first hull ", layout.to_absolute(layout.hull_cells()[0]))
	await _capture("paths_overlay")

	_colony._choose_tool("module:SMELTER")
	await _capture("paths_spots_staffed")
	_colony._select(layout.to_absolute(Vector3i(3, 1, 0)))
	await _capture("paths_would_cut_off")
	_colony._select(layout.to_absolute(Vector3i(0, 1, 0)))
	await _capture("paths_last_entrance")
	_colony._select(null)

	_colony._set_level(layout.to_absolute(Vector3i(0, 0, 2)).z)
	await _capture("paths_level_not_connected")
	_colony._choose_tool("")
	await _capture("paths_level_overlay")
	_colony._set_level(layout.to_absolute(Vector3i(0, 0, 1)).z)
	_colony._choose_tool("module:SMELTER")
	await _capture("paths_level_one_spots")

	_colony._set_level(layout.to_absolute(Vector3i.ZERO).z)
	_colony._set_mode(ColonyScreen.Mode.VIEW)
	_colony._select(layout.to_absolute(Vector3i(5, 3, 0)))
	await _capture("paths_inspect_cut_off")
	_colony._select(layout.to_absolute(Vector3i(3, 1, 0)))
	await _capture("paths_inspect_hull")
	_colony._select(layout.to_absolute(Vector3i(2, 3, 0)))
	await _capture("paths_inspect_shaft")
	get_tree().quit()


## Puts the block of LEVELS in place of the colony's layout (on this client only).
func _replace_layout(layout: StructureLayout) -> void:
	var hulls := PackedStringArray()
	var modules := PackedStringArray()
	var next_id := 900000
	for z: int in LEVELS.keys():
		var rows: Array = LEVELS[z]
		for y: int in rows.size():
			var row: String = rows[y]
			for x: int in row.length():
				var mark := row[x]
				if mark == ".":
					continue
				hulls.append("[%d,%d,%d,0]" % [x, y, z])
				if TYPES.has(mark):
					next_id += 1
					modules.append('{"moduleId":%d,"moduleType":"%s","x":%d,"y":%d,"z":%d,"size":{"x":1,"y":1,"z":1},"rotation":0,"status":"active"}' % [
						next_id, TYPES[mark], x, y, z])
	var offset := layout.offset
	var lines := PackedStringArray([
		'{"line":"header","structureId":%d,"kind":"%s","anchor":{"type":"%s","bodyId":"%s","offset":{"x":%d,"y":%d,"z":%d}},"rev":%d,"chunks":1}' % [
			layout.structure_id, layout.kind, layout.anchor_type, layout.body_id, offset.x, offset.y, offset.z, layout.rev],
		'{"line":"chunk","chunk":[0,0,0],"version":1,"hullTypes":["%s"],"hulls":[%s],"modules":[%s]}' % [
			HULL, ",".join(hulls), ",".join(modules)],
		'{"line":"end","rev":%d}' % layout.rev,
	])
	print("PATHS  layout replaced: ", layout.apply(Ndjson.parse("\n".join(lines))))
	_model.layout_changed.emit()


## Centres the view on an absolute cell, in the part above the bottom panel.
func _look_at(cell: Vector3i) -> void:
	_colony._view.look_at_cell(cell)
	_colony._view.pan(Vector2(0.0, -_colony._bottom.size.y * 0.5 * _colony._scale()), Vector2(_colony._viewport.size))


func _capture(file_name: String) -> void:
	_colony.recentre()
	_colony._view.zoom = 14.0
	_colony._view.zoom_by(1.0)
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
