class_name AppSettings
extends RefCounted
## Small settings of this device, kept between starts (user://settings.json): so far whether the
## performance display is shown.

const PATH := "user://settings.json"

static var _loaded := false
static var _performance := false


## Whether the performance display is on.
static func performance_display() -> bool:
	_load()
	return _performance


static func set_performance_display(on: bool) -> void:
	_load()
	_performance = on
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({"performanceDisplay": on}))
		file.close()


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	var data := Wire.parse_object(FileAccess.get_file_as_string(PATH))
	_performance = data.get("performanceDisplay") == true
