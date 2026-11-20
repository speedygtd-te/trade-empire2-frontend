extends Control
## Review tool for the heat shimmer over hot bodies (HeatShimmer, game/world/heat_shimmer.gdshader):
## the home colony with a forced surface temperature (only in the client), by day and by night,
## on the detail tiers. Saves a short sequence of frames per case (a still shows no motion) and
## a difference picture of two frames (bright where the picture moves), and the cost: GPU time of
## the frame with and without the shimmer. Uses the development account (.local/dev-account.json)
## or another one (--account=showcase). Root script of smoke/heat_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/heat_view.tscn -- --out=<folder> [--account=showcase] [--temperature=450]

const FRAMES := 4
const FRAME_GAP := 0.3

var _out_dir := "user://heat"
var _account := "dev"
var _temperatures: Array[float] = [20.0, 100.0, 450.0]
var _colony: ColonyScreen


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument.begins_with("--account="):
			_account = argument.trim_prefix("--account=")
		elif argument.begins_with("--temperature="):
			_temperatures = [argument.trim_prefix("--temperature=").to_float()]
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var file := "res://.local/%s-account.json" % _account
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(file)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in with %s" % file)
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(3.0).timeout
	# The sun, the temperature and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	var view := _colony._view
	var model := _colony._model
	print("HEAT  %s: body %s at %.0f °C, atmosphere %.2f" % [_account, model.body_name,
		model.surface_celsius, model.atmosphere_density])
	view.apply_detail(DetailGovernor.Tier.FAST)
	var home := model.centre_cell()
	view.look_at_cell(home)
	view.zoom = 9.0
	view.zoom_by(1.0)
	await get_tree().create_timer(2.0).timeout
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)

	for celsius: float in _temperatures:
		model.surface_celsius = celsius
		for daytime: String in ["day", "night"]:
			_sun(48.0 if daytime == "day" else -25.0)
			await _case("%s_%dC_%s" % [_account, int(celsius), daytime])
	var hottest: float = _temperatures.max()
	model.surface_celsius = hottest
	_sun(48.0)
	for tier: DetailGovernor.Tier in [DetailGovernor.Tier.MEDIUM, DetailGovernor.Tier.SLOW]:
		view.apply_detail(tier)
		await _case("%s_%dC_day_%s" % [_account, int(hottest), DetailGovernor.Tier.keys()[tier].to_lower()])
	view.apply_detail(DetailGovernor.Tier.FAST)
	await _measure(hottest)
	get_tree().quit()


func _sun(elevation: float) -> void:
	var model := _colony._model
	_colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(250.0), model.star_kelvin,
		model.atmosphere_density, model.star_brightness(), model.star_size())
	_colony._update_heat()


## A few frames of one case and the difference of the first two.
func _case(label: String) -> void:
	_colony._update_heat()
	var shown := _colony._container.material != null
	print("CASE  %s: shimmer %s, strength %.2f" % [label, "on" if shown else "off",
		_colony._heat_strength if shown else 0.0])
	await get_tree().create_timer(0.5).timeout
	var images: Array[Image] = []
	for frame: int in FRAMES:
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		images.append(image)
		image.save_png("%s/%s_f%d.png" % [_out_dir, label, frame])
		await get_tree().create_timer(FRAME_GAP).timeout
	var difference := _difference(images[0], images[1])
	difference.save_png("%s/%s_diff.png" % [_out_dir, label])
	print("SAVED  %s/%s_f0..%d.png, _diff.png" % [_out_dir, label, FRAMES - 1])


## Bright where two frames differ (amplified 6x).
func _difference(a: Image, b: Image) -> Image:
	var result := Image.create(a.get_width(), a.get_height(), false, Image.FORMAT_RGB8)
	var changed := 0
	for y: int in a.get_height():
		for x: int in a.get_width():
			var ca := a.get_pixel(x, y)
			var cb := b.get_pixel(x, y)
			var d := clampf((absf(ca.r - cb.r) + absf(ca.g - cb.g) + absf(ca.b - cb.b)) * 2.0, 0.0, 1.0)
			if d > 0.02:
				changed += 1
			result.set_pixel(x, y, Color(d, d, d))
	print("DIFF  %.1f %% of the pixels changed" % (100.0 * changed / float(a.get_width() * a.get_height())))
	return result


## GPU and CPU time of the whole frame with and without the shimmer (desktop; the effect is the
## shader the 3D picture is drawn with anyway, so draw calls do not change).
func _measure(celsius: float) -> void:
	var with_it := await _frame_cost()
	var material := _colony._container.material
	_colony._container.material = null
	var without := await _frame_cost()
	_colony._container.material = material
	print("MEASURE  %d °C: frame GPU %.3f ms (without shimmer %.3f), CPU %.3f ms (without %.3f), draw calls %d (without %d)" % [
		int(celsius), with_it.x, without.x, with_it.y, without.y, int(with_it.z), int(without.z)])


func _frame_cost() -> Vector3:
	var rid := get_viewport().get_viewport_rid()
	for frame: int in 10:
		await RenderingServer.frame_post_draw
	var gpu := 0.0
	var cpu := 0.0
	const SAMPLES := 120
	for frame: int in SAMPLES:
		await RenderingServer.frame_post_draw
		gpu += RenderingServer.viewport_get_measured_render_time_gpu(rid)
		cpu += RenderingServer.viewport_get_measured_render_time_cpu(rid)
	return Vector3(gpu / SAMPLES, cpu / SAMPLES,
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
