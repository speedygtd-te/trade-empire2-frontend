extends Node
## Review tool for the lighting: shows the colony of the development account at morning, noon,
## evening and night (SunPosition on an equator spot, ColonyView.set_sun) and saves a picture of
## each. Root script of smoke/day_night.tscn.

const DEV_ACCOUNT := "res://.local/dev-account.json"

var _out_dir := "user://day_night"


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

	var sun := SunPosition.new()
	sun.rotation_period_s = 600.0
	sun.orbit_period_s = 1.0e12
	sun.axial_tilt = deg_to_rad(20.0)
	sun.tilt_azimuth = PI
	var lat := deg_to_rad(25.0)
	# Noon at longitude PI is near t = 0; morning is a quarter turn earlier.
	for moment: Array in [["morning", -120.0], ["noon", 0.0], ["evening", 130.0], ["night", 300.0]]:
		var at: float = moment[1]
		var label: String = moment[0]
		var sky := sun.sky_at(lat, PI, at)
		colony._view.set_sun(sky.elevation, sky.azimuth, Color(1.0, 0.96, 0.9))
		await get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var path := "%s/%s.png" % [_out_dir, label]
		get_viewport().get_texture().get_image().save_png(path)
		print("SAVED  %s (sun %.0f°)" % [path, rad_to_deg(sky.elevation)])
	get_tree().quit()
