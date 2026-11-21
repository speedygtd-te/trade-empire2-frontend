class_name HdPackageService
extends Node
## Keeps the package of high-detail models (HdBundle) on devices that may use the top detail tier:
## at start a checked local copy is mounted without network; then, in the background, the
## manifest is asked once whether a (newer) pack exists, which is downloaded into user://hd,
## checked against its SHA-256 and mounted (or kept for the next start when one is in use). The
## game never waits for it: until a pack is mounted, the top tier is not offered
## (ColonyScreen asks is_ready()). Weak devices and a profile switch set to off fetch nothing.
##
## Godot cannot tell Wi-Fi from mobile data without a plugin, so the download (~35 MB) simply
## runs in the background.

## Emitted when the status line would read differently.
signal changed

## A download that receives nothing for this long is given up (and tried again later).
const STALL_MS := 60 * 1000

## Where the manifest is asked (Services: `--hd-manifest=<url>` overrides it).
var manifest_url := HdBundle.MANIFEST_URL
var package := HdPackage.new()

var _download: HdDownload
var _device := false
var _engine := ""
var _cache_tried := false
## A version already stored for the next start (an update fetched while another is in use).
var _stored := ""
var _last_bytes := -1
var _last_progress_ms := 0
var _shown_key := ""
var _shown_percent := -1


## `device`: whether this device may reach the top tier (DetailGovernor.device_allows_ultra).
func setup(url: String, device: bool) -> void:
	manifest_url = url
	_device = device


func _ready() -> void:
	_engine = HdBundle.engine_tag(Engine.get_version_info())
	_download = HdDownload.new()
	_download.name = "HdDownload"
	add_child(_download)
	package.set_eligibility(_device, AppSettings.high_detail_models())
	# Run from the project folder (or a build with the models inside): nothing to fetch.
	if ResourceLoader.exists(HdBundle.PROBE):
		package.mounted(HdPackage.BUILT_IN)
	# A checked local copy is there right away, before any colony asks.
	elif package.is_eligible():
		_cache_tried = true
		_mount_cached()


func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	if package.set_eligibility(_device, AppSettings.high_detail_models()) and _download.is_downloading():
		_download.cancel()
	if package.is_eligible() and not _cache_tried:
		_cache_tried = true
		_mount_cached()
	if package.wants_check(now):
		_run()
	if _download.is_downloading():
		var bytes := _download.received_bytes()
		if bytes != _last_bytes:
			_last_bytes = bytes
			_last_progress_ms = now
			package.progress(bytes)
		elif now - _last_progress_ms > STALL_MS:
			_download.cancel()
	# Compared as values: no text is put together every frame.
	var key := package.status_key()
	var percent := package.percent()
	if key != _shown_key or percent != _shown_percent:
		_shown_key = key
		_shown_percent = percent
		changed.emit()


## Whether the high-detail models can be loaded now.
func is_ready() -> bool:
	return package.is_ready()


## The status line for the profile (translated).
func status_text() -> String:
	return tr(package.status_key()).format({"percent": package.percent()})


## Whether the player can ask for another attempt now.
func can_retry() -> bool:
	return package.is_eligible() and (package.state == HdPackage.State.FAILED
		or package.state == HdPackage.State.NOT_OFFERED)


func retry() -> void:
	package.retry_now()


## Mounts the checked local copy, if there is one, and removes everything else in the cache.
func _mount_cached() -> void:
	if package.version == HdPackage.BUILT_IN or not DirAccess.dir_exists_absolute(HdBundle.CACHE_DIR):
		return
	var record_path := HdBundle.CACHE_DIR + "/" + HdBundle.CURRENT_FILE
	var record: HdBundle.Entry = null
	if FileAccess.file_exists(record_path):
		record = HdBundle.parse_record(FileAccess.get_file_as_string(record_path))
	var keep := ""
	if record != null:
		var path := HdBundle.pack_path(record.version)
		if _size_of(path) == record.size and ProjectSettings.load_resource_pack(path, false) \
				and ResourceLoader.exists(HdBundle.PROBE):
			keep = record.version
			package.mounted(keep)
		else:
			push_warning("HD package: local copy %s unusable, removed" % record.version)
	for file: String in HdBundle.stale_files(DirAccess.get_files_at(HdBundle.CACHE_DIR), keep):
		DirAccess.remove_absolute(HdBundle.CACHE_DIR + "/" + file)


## One attempt: ask the manifest, download what is new, check it, mount or store it.
func _run() -> void:
	package.check_started()
	changed.emit()
	var text := await _download.fetch_text(manifest_url)
	if not package.is_eligible():
		package.stopped()
		return
	var entry := HdBundle.pick(text, manifest_url, HdBundle.FORMAT, _engine)
	if entry == null:
		if HdBundle.is_manifest(text):
			package.not_offered()
		else:
			push_warning("HD package: manifest unavailable (%s)" % manifest_url)
			package.failed(Time.get_ticks_msec())
		return
	if entry.version == package.version or entry.version == _stored:
		package.up_to_date()
		return

	DirAccess.make_dir_recursive_absolute(HdBundle.CACHE_DIR)
	var part := HdBundle.part_path(entry.version)
	DirAccess.remove_absolute(part)
	package.download_started(entry.size)
	_last_bytes = -1
	_last_progress_ms = Time.get_ticks_msec()
	var ok := await _download.download(entry.url, part, entry.size)
	if not package.is_eligible():
		DirAccess.remove_absolute(part)
		package.stopped()
		return
	if not ok or _size_of(part) != entry.size:
		_fail(part, "download of %s failed" % entry.version)
		return
	package.progress(entry.size)
	package.verifying()
	var digest := await _sha256(part)
	if digest != entry.sha256:
		_fail(part, "checksum of %s does not match" % entry.version)
		return
	var path := HdBundle.pack_path(entry.version)
	DirAccess.remove_absolute(path)
	if DirAccess.rename_absolute(part, path) != OK:
		_fail(part, "could not store %s" % entry.version)
		return
	var record := FileAccess.open(HdBundle.CACHE_DIR + "/" + HdBundle.CURRENT_FILE, FileAccess.WRITE)
	if record == null:
		_fail(path, "could not record %s" % entry.version)
		return
	record.store_string(HdBundle.current_record(entry))
	record.close()
	if not package.is_ready():
		if not ProjectSettings.load_resource_pack(path, false) or not ResourceLoader.exists(HdBundle.PROBE):
			DirAccess.remove_absolute(HdBundle.CACHE_DIR + "/" + HdBundle.CURRENT_FILE)
			_fail(path, "could not mount %s" % entry.version)
			return
	else:
		_stored = entry.version
	package.downloaded(entry.version)
	print("HD package %s ready (%d bytes)" % [entry.version, entry.size])


func _fail(path: String, why: String) -> void:
	push_warning("HD package: " + why)
	DirAccess.remove_absolute(path)
	package.failed(Time.get_ticks_msec())


## SHA-256 of a file, computed on a worker thread (tens of MB would stall a frame).
func _sha256(path: String) -> String:
	var thread := Thread.new()
	if thread.start(HdBundle.file_sha256.bind(path)) != OK:
		return ""
	while thread.is_alive():
		await get_tree().process_frame
	var digest: Variant = thread.wait_to_finish()
	return Wire.as_string(digest)


static func _size_of(path: String) -> int:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return -1
	var size := file.get_length()
	file.close()
	return size
