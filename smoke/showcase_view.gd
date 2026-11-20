extends Control
## Review tool for the showcase colony (every module type, tools/showcase.cjs): pictures of the
## colony closed and opened, from afar and close up, by night, and of its store. Uses the
## showcase account (.local/showcase-account.json). Root script of smoke/showcase_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/showcase_view.tscn -- --out=<folder>
## With --detail-compare it only compares the normal models (FAST) with the high-detail ones
## (ULTRA, game/world/models_hd), close up and from mid distance: pictures detail_<tier>_<zoom>.png
## and per view a line PERF with frame time, render time of CPU and GPU, draw calls, primitives and
## texture memory. Before ULTRA it waits for the high-detail package (HdPackageService) and prints
## its status lines (download test: move game/world/models_hd out of the project first).

const ACCOUNT := "res://.local/showcase-account.json"

var _out_dir := "user://showcase"
var _compare := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument == "--detail-compare":
			_compare = true
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/showcase.cjs first)")
		get_tree().quit(1)
		return
	var colony := ColonyScreen.new()
	add_child(colony)
	await get_tree().create_timer(1.0).timeout
	var deadline := Time.get_ticks_msec() + 30000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(5.0).timeout
	var layout := colony._model.layout
	var view := colony._view
	print("SHOWCASE  %d hulls, %d modules (%d still being built)" % [
		layout.hull_count(), layout.module_count(), StructureLook.modules_building(layout)])
	if _compare:
		await _compare_detail(colony)
		get_tree().quit()
		return

	# Afar and close up, closed; then the same opened.
	var centre := colony._model.centre_cell()
	var spots: Array[Vector3i] = [centre + Vector3i(-3, -3, 0), centre + Vector3i(3, 2, 0), centre + Vector3i(-2, 3, 0)]
	for opened: bool in [false, true]:
		var state := "opened" if opened else "closed"
		if opened:
			colony._open_structure(ColonyScreen.Mode.VIEW)
		view.look_at_cell(centre)
		view.zoom = 16.0
		view.zoom_by(1.0)
		await _capture("showcase_%s_all" % state)
		for index: int in spots.size():
			view.look_at_cell(spots[index])
			view.zoom = 6.0
			view.zoom_by(1.0)
			await _capture("showcase_%s_near_%d" % [state, index])
	colony._close_structure()
	colony._select_structure(false)

	# By night: the lamps and windows of the closed containers.
	colony.set_process(false)
	view.look_at_cell(centre)
	view.zoom = 9.0
	view.zoom_by(1.0)
	view.set_sun(deg_to_rad(-25.0), deg_to_rad(250.0), colony._model.star_kelvin, colony._model.atmosphere_density,
		colony._model.star_brightness(), colony._model.star_size())
	await _capture("showcase_closed_night")
	colony.set_process(true)

	colony._open_structure(ColonyScreen.Mode.STORE)
	await get_tree().create_timer(2.0).timeout
	await _capture("showcase_store")
	get_tree().quit()


## Normal against high-detail models: the same views on FAST and on ULTRA, with measurements.
func _compare_detail(colony: ColonyScreen) -> void:
	var view := colony._view
	var centre := colony._model.centre_cell()
	RenderingServer.viewport_set_measure_render_time(colony._viewport.get_viewport_rid(), true)
	for tier: DetailGovernor.Tier in [DetailGovernor.Tier.FAST, DetailGovernor.Tier.ULTRA]:
		if tier == DetailGovernor.Tier.ULTRA:
			await _wait_for_hd_package()
		var tier_name := "ultra" if tier == DetailGovernor.Tier.ULTRA else "fast"
		# Held there: the governor keeps the tier unless the frames get slow.
		colony._ultra_device = tier == DetailGovernor.Tier.ULTRA
		colony._detail.allow_ultra(colony._ultra_device)
		colony._detail.tier = tier
		view.apply_detail(tier)
		var deadline := Time.get_ticks_msec() + 30000
		while view.shows_high_detail() != (tier == DetailGovernor.Tier.ULTRA) and Time.get_ticks_msec() < deadline:
			await get_tree().process_frame
		for zoom: float in [4.0, 9.0, 16.0]:
			view.look_at_cell(centre + Vector3i(-2, 3, 0))
			view.zoom = zoom
			view.zoom_by(1.0)
			await get_tree().create_timer(1.5).timeout
			await _measure(colony, "%s zoom %d" % [tier_name, int(zoom)])
			await _capture("detail_%s_%d" % [tier_name, int(zoom)])


## The top tier needs the package of high-detail models: in the project folder it is built in,
## otherwise (models_hd moved away, as in an export) it is downloaded or taken from user://hd.
## Prints how it went.
func _wait_for_hd_package() -> void:
	var hd := Services.hd_package
	var started := Time.get_ticks_msec()
	var last := ""
	while not hd.is_ready() and Time.get_ticks_msec() - started < 300000:
		var line := hd.status_text()
		if line != last:
			last = line
			print("HD  %5.1f s  %s" % [(Time.get_ticks_msec() - started) / 1000.0, line])
		await get_tree().process_frame
	print("HD  %5.1f s  %s, version %s" % [(Time.get_ticks_msec() - started) / 1000.0, hd.status_text(),
		hd.package.version])


## Prints the averages of 120 frames.
func _measure(colony: ColonyScreen, what: String) -> void:
	var rid := colony._viewport.get_viewport_rid()
	var frames := 120
	var sums := PackedFloat64Array([0.0, 0.0, 0.0, 0.0, 0.0])
	for _frame: int in frames:
		await get_tree().process_frame
		sums[0] += get_process_delta_time() * 1000.0
		sums[1] += RenderingServer.viewport_get_measured_render_time_cpu(rid)
		sums[2] += RenderingServer.viewport_get_measured_render_time_gpu(rid)
		sums[3] += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		sums[4] += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
	var texture_mb := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED) / 1048576.0
	print("PERF  %s: frame %.1f ms, render cpu %.2f ms, gpu %.2f ms, %.0f draw calls, %.0f primitives, textures %.0f MB" % [
		what, sums[0] / frames, sums[1] / frames, sums[2] / frames, sums[3] / frames, sums[4] / frames, texture_mb])


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
