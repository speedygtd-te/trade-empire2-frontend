class_name AppSettings
extends RefCounted
## Small settings of this device, kept between starts (user://settings.json): whether the
## performance display is shown, and whether the high-detail models may be used (the top detail
## tier, DetailGovernor.Tier.ULTRA; on by default, the device still has to be fast enough).

const PATH := "user://settings.json"

static var _loaded := false
static var _performance := false
static var _high_detail := true


## Whether the performance display is on.
static func performance_display() -> bool:
	_load()
	return _performance


static func set_performance_display(on: bool) -> void:
	_load()
	_performance = on
	_save()


## Whether the high-detail models may be used when the device is fast enough (off: never, e.g.
## to save battery).
static func high_detail_models() -> bool:
	_load()
	return _high_detail


static func set_high_detail_models(on: bool) -> void:
	_load()
	_high_detail = on
	_save()


static func _save() -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({"performanceDisplay": _performance, "highDetailModels": _high_detail}))
		file.close()


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	var data := Wire.parse_object(FileAccess.get_file_as_string(PATH))
	_performance = data.get("performanceDisplay") == true
	_high_detail = data.get("highDetailModels") != false
