extends Node
## Review tool for the ground (GroundLayer, ground.gdshader): shows the colony of the development
## account at the closest, the default and the farthest zoom, with soft and with hard biome
## borders (the SLOW detail tier), under a fixed sun, and saves a picture of each. Root script
## of smoke/ground_review.tscn:
##
##   godot --path . --resolution 720x1280 res://smoke/ground_review.tscn -- --out=build/ground

const DEV_ACCOUNT := "res://.local/dev-account.json"

var _out_dir := "user://ground_review"


func _ready() -> void:
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in")
		get_tree().quit(1)
		return
	var colony := ColonyScreen.new()
	get_tree().root.add_child.call_deferred(colony)
	await get_tree().create_timer(1.0).timeout
	var deadline := Time.get_ticks_msec() + 20000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(4.0).timeout

	var view := colony._view
	var scenes: Array[Array] = [
		["zoom_09_soft", ColonyView.ZOOM_DEFAULT, true],
		["zoom_09_hard", ColonyView.ZOOM_DEFAULT, false],
		["zoom_03_soft", ColonyView.ZOOM_MIN, true],
		["zoom_40_soft", ColonyView.ZOOM_MAX, true],
		["zoom_40_hard", ColonyView.ZOOM_MAX, false],
	]
	for scene: Array in scenes:
		var label: String = scene[0]
		var zoom: float = scene[1]
		var soft: bool = scene[2]
		# The screen sets the real sun again every few seconds; hold it off for the picture.
		colony._sun_left = 3600.0
		view.set_sun(deg_to_rad(50.0), deg_to_rad(250.0), 5800.0, 1.0)
		view.zoom_by(zoom / view.zoom)
		view._ground.set_soft(soft)
		# The farthest zoom needs the blocks further out.
		view.pan(Vector2.ZERO, Vector2(720, 1280))
		await get_tree().create_timer(3.0 if zoom > ColonyView.ZOOM_DEFAULT else 0.5).timeout
		await RenderingServer.frame_post_draw
		var path := "%s/%s.png" % [_out_dir, label]
		get_viewport().get_texture().get_image().save_png(path)
		print("SAVED  %s  (%d ground blocks)" % [path, view._ground.block_count()])
	get_tree().quit()
