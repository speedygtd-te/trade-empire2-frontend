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
		["earth_night", -25.0, 5800.0, 1.0],
		["thin_air_night", -25.0, 5800.0, 0.2],
		["airless_night", -25.0, 5800.0, 0.0],
		["airless_noon", 50.0, 5800.0, 0.0],
		["colony_noon", 50.0, own_kelvin, own_air],
		["colony_sunset", 4.0, own_kelvin, own_air],
		["airless_sunset", 4.0, 5800.0, 0.0],
		["thick_air_sunset", 8.0, 5800.0, 2.5],
		["shadow_airless", 30.0, 5800.0, 0.0],
		["shadow_earth", 30.0, 5800.0, 1.0],
		["shadow_thick", 30.0, 5800.0, 2.5],
		# Star types at the same sun height and Earth-like air: [luminosity (suns), distance (AU)].
		["star_g_1au", 35.0, 5778.0, 1.0, 1.0, 1.0],
		["star_m_dwarf", 35.0, 2754.0, 1.0, 0.022, 0.7],
		["star_red_giant", 35.0, 3900.0, 1.0, 150.0, 6.0],
		["star_f_close", 35.0, 7000.0, 1.0, 6.0, 0.8],
		["star_white_dwarf", 35.0, 15000.0, 1.0, 0.003, 0.05],
		["colony_own_star", 35.0, own_kelvin, own_air, colony._model.star_luminosity, colony._model.star_distance_au],
	]
	for scene: Array in scenes:
		var label: String = scene[0]
		var elevation: float = scene[1]
		var kelvin: float = scene[2]
		var air: float = scene[3]
		var luminosity: float = scene[4] if scene.size() > 4 else 1.0
		var distance: float = scene[5] if scene.size() > 5 else 1.0
		var brightness := SkyLight.brightness(SkyLight.irradiance(luminosity, distance))
		var size := SkyLight.apparent_size(SkyLight.star_radius(luminosity, kelvin), distance)
		# The screen sets the real sun again every few seconds; hold it off for the picture.
		colony._sun_left = 3600.0
		colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(250.0), kelvin, air, brightness, size)
		if scene.size() > 4:
			print("STAR  %s: brightness %.2f, apparent size %.2f, shadow blur %.2f" % [
				label, brightness, size, SkyLight.shadow_blur(size, air)])
		await get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var path := "%s/%s.png" % [_out_dir, label]
		get_viewport().get_texture().get_image().save_png(path)
		print("SAVED  %s" % path)
	get_tree().quit()
