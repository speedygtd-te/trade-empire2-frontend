extends Node
## Follows the high-detail package (HdPackageService) from the start until it is ready or the
## first attempt failed, printing each status line; then loads one model from it. Exit code 0 when
## ready and the model loads, 1 otherwise. No account needed. Root script of
## smoke/hd_package_check.tscn:
##   godot --path . res://smoke/hd_package_check.tscn [-- --hd-manifest=<url>]
## In the project folder the models are built in; to see the download, move game/world/models_hd
## out of the project (no import in between) and use a fresh user:// (APPDATA elsewhere).

const TIMEOUT_MS := 300000


func _ready() -> void:
	_run()


func _run() -> void:
	var hd := Services.hd_package
	var started := Time.get_ticks_msec()
	var last := ""
	while Time.get_ticks_msec() - started < TIMEOUT_MS:
		var line := hd.status_text()
		if line != last:
			last = line
			print("HD  %5.1f s  %s" % [(Time.get_ticks_msec() - started) / 1000.0, line])
		if hd.is_ready() or hd.package.state in [HdPackage.State.FAILED, HdPackage.State.NOT_OFFERED]:
			break
		if not hd.package.is_eligible() and Time.get_ticks_msec() - started > 2000:
			break
		await get_tree().process_frame
	var scene: PackedScene = null
	if hd.is_ready():
		scene = load(HdBundle.PROBE) as PackedScene
	print("HD  %s, version '%s', probe model %s" % [hd.status_text(), hd.package.version,
		"loaded" if scene != null else "missing"])
	get_tree().quit(0 if scene != null else 1)
