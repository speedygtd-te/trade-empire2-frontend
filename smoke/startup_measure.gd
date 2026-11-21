extends Control
## Measures the way into the colony and the idle work afterwards, live with the development
## account (.local/dev-account.json, `--account=<name>` for another one):
##
## - sign-in → colony shown (ColonyModel.ready_to_show) in ms, and the calls sent until then;
## - the calls until the network is quiet (2 s without one), grouped by path, with duplicates;
## - frames drawn and processed per second while idle on Base, Profile and Fleet, with the
##   average process time per frame.
##
## Changes nothing on the account; signs out at the end unless a session was stored before.
##
## Pictures of the loading views go to `--out` (default build/startup): the app's view while the
## session is restored, and the colony's view at each step it reached.
##
##   godot --path . --resolution 720x1280 res://smoke/startup_measure.tscn [-- --account=<name>]
##   ... -- --server=https://dev.trade-empire.net --dev-account=DevLarge1   (dev instance, test_accounts.gd)

const TestAccounts := preload("res://smoke/test_accounts.gd")
const QUIET_MS := 2000
const MEASURE_SECONDS := 3.0

var _calls: Array[String] = []
## "start–end ms path" of every call, relative to the start of the sign-in.
var _timeline: Array[String] = []
var _started_ms := 0
var _last_call_ms := 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	await _until(func() -> bool: return Services.definitions != null, 15000)
	var account := TestAccounts.load()
	if account.has("error"):
		print("SKIP  %s" % account["error"])
		get_tree().quit(2)
		return
	print("ACCOUNT  %s on %s" % [account["label"], Services.server.base])
	var api := Services.api
	api.request_done.connect(_on_request_done)
	var had_session := not SessionStore.new().load_token(Services.server.base).is_empty()
	var out_dir := "res://build/startup"
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	var restoring := SplashScreen.new("COMMON_LOADING")
	restoring.set_progress("APP_STEP_SESSION", 1, ColonyModel.LOAD_STEPS + 1)
	add_child(restoring)
	await get_tree().create_timer(0.6).timeout
	await _capture(out_dir + "/loading_session.png")
	restoring.queue_free()

	var started := Time.get_ticks_msec()
	_started_ms = started
	var sent_before := api.requests_sent
	var opened_before := api.connections_opened
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("SKIP  sign-in failed: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	var signed_in := Time.get_ticks_msec()
	var shell := MainShell.new()
	shell.saves_power = true
	add_child(shell)
	var model := shell.colony()._model
	var shown := [false]
	model.ready_to_show.connect(func() -> void: shown[0] = true)
	var steps: Array[int] = []
	model.load_step.connect(func(_key: String, step: int) -> void: steps.append(step))
	var pictured := 0
	var deadline := Time.get_ticks_msec() + 30000
	while not shown[0] and Time.get_ticks_msec() < deadline:
		if steps.size() > pictured and pictured < 2:
			pictured = steps.size()
			await _capture(out_dir + "/loading_colony_step%d.png" % steps[pictured - 1])
		await get_tree().process_frame
	var ready_ms := Time.get_ticks_msec()
	var calls_ready := api.requests_sent - sent_before
	var opened_ready := api.connections_opened - opened_before
	print("STARTUP  sign-in %d ms, colony shown after %d ms (%d ms after sign-in), %d calls, %d connections" % [
		signed_in - started, ready_ms - started, ready_ms - signed_in, calls_ready, opened_ready])
	await _until(func() -> bool:
		return Services.api.in_flight == 0 and Time.get_ticks_msec() - _last_call_ms > QUIET_MS, 30000)
	var quiet_ms := _last_call_ms
	print("STARTUP  quiet after %d ms: %d calls, %d connections" % [quiet_ms - started,
		api.requests_sent - sent_before, api.connections_opened - opened_before])
	var by_path: Dictionary = {}
	for call: String in _calls:
		by_path[call] = Wire.as_int(by_path.get(call)) + 1
	for call: String in by_path.keys():
		var count := Wire.as_int(by_path[call])
		print("CALL  %dx %s" % [count, call] if count > 1 else "CALL  %s" % call)

	for line: String in _timeline:
		print("TIME  " + line)

	await get_tree().create_timer(2.0).timeout
	await _measure("base")
	shell.show_tab(MainShell.Tab.PROFILE)
	await get_tree().create_timer(2.0).timeout
	await _measure("profile")
	shell.show_tab(MainShell.Tab.FLEET)
	await get_tree().create_timer(2.0).timeout
	await _measure("fleet")
	shell.show_tab(MainShell.Tab.BASE)
	await get_tree().create_timer(2.0).timeout
	await _measure("base again")

	shell.queue_free()
	if not had_session:
		await Services.session.logout()
	get_tree().quit()


func _capture(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path(path))


## Frames drawn and processed per second over MEASURE_SECONDS, and the process time per frame.
func _measure(label: String) -> void:
	var drawn := Engine.get_frames_drawn()
	var processed := Engine.get_process_frames()
	var process_time := 0.0
	var worst := 0.0
	var draws := 0.0
	var primitives := 0.0
	var samples := 0
	var until := Time.get_ticks_msec() + int(MEASURE_SECONDS * 1000.0)
	var last := Time.get_ticks_usec()
	while Time.get_ticks_msec() < until:
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		worst = maxf(worst, (now - last) / 1000.0)
		last = now
		process_time += Performance.get_monitor(Performance.TIME_PROCESS)
		draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		primitives += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
		samples += 1
	var count := maxf(float(samples), 1.0)
	print("IDLE  %-10s %5.1f frames drawn/s, %5.1f process frames/s, %.2f ms process per frame, worst frame %.0f ms, %.0f draws, %.0fk primitives, %.0f MB, low-processor %s" % [
		label, float(Engine.get_frames_drawn() - drawn) / MEASURE_SECONDS,
		float(Engine.get_process_frames() - processed) / MEASURE_SECONDS,
		process_time * 1000.0 / count, worst, draws / count, primitives / count / 1000.0,
		Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, OS.low_processor_usage_mode])


func _on_request_done(method_name: String, path: String, status: int, ms: int) -> void:
	_last_call_ms = Time.get_ticks_msec()
	var short := path.get_slice("?", 0)
	_calls.append("%s %s" % [_method(method_name), short])
	if _started_ms > 0:
		var end := _last_call_ms - _started_ms
		_timeline.append("%5d-%5d ms %3d %s %s" % [end - ms, end, status, _method(method_name), short])


func _method(code: String) -> String:
	match code:
		"0":
			return "GET"
		"2":
			return "POST"
		"3":
			return "PUT"
		"4":
			return "DELETE"
		"8":
			return "PATCH"
	return code


func _until(condition: Callable, timeout_ms: int) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while not (condition.call() as bool) and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
