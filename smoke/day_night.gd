extends Node
## Review tool for the lighting (SkyLight, ColonyView.set_sun): shows the colony of the
## development account under different suns and skies and saves a picture of each — the sun
## high and low over an Earth-like world, low over the colony's own world (its star and air),
## low over an airless moon, and at dusk. Root script of smoke/day_night.tscn.

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
	var own_kelvin := colony._model.star_kelvin
	var own_air := colony._model.atmosphere_density
	print("COLONY  star %.0f K, atmosphere %.2f" % [own_kelvin, own_air])

	var scenes: Array[Array] = [
		["earth_noon", 60.0, 5800.0, 1.0],
		["earth_sunset", 4.0, 5800.0, 1.0],
		["earth_dusk", -3.0, 5800.0, 1.0],
		["colony_noon", 50.0, own_kelvin, own_air],
		["colony_sunset", 4.0, own_kelvin, own_air],
		["airless_sunset", 4.0, 5800.0, 0.0],
		["thick_air_sunset", 8.0, 5800.0, 2.5],
		["shadow_airless", 30.0, 5800.0, 0.0],
		["shadow_earth", 30.0, 5800.0, 1.0],
		["shadow_thick", 30.0, 5800.0, 2.5],
	]
	for scene: Array in scenes:
		var label: String = scene[0]
		var elevation: float = scene[1]
		var kelvin: float = scene[2]
		var air: float = scene[3]
		colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(250.0), kelvin, air)
		await get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var path := "%s/%s.png" % [_out_dir, label]
		get_viewport().get_texture().get_image().save_png(path)
		print("SAVED  %s" % path)
	get_tree().quit()
