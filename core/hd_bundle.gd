class_name HdBundle
extends RefCounted
## The package of high-detail models (game/world/models_hd, the top detail tier
## DetailGovernor.Tier.ULTRA), which is not inside the app but downloaded once from the asset
## host (Rudi, 2026-11-20): a Godot resource pack, mounted with ProjectSettings.load_resource_pack
## so the models load from their usual res:// paths.
##
## The host keeps a manifest (tools/hd-bundle.ps1 writes it):
##   {"schema": 1, "bundles": [{"format": 1, "engine": "4.7", "version": "20261120-1a2b3c4d5e6f",
##     "path": "20261120-1a2b3c4d5e6f/models_hd.pck", "size": 35062744, "sha256": "<64 hex>"}]}
## A pack only fits the client it was made for: the same `format` (FORMAT: names and layout of the
## models the client asks for) and the same Godot version (major.minor: the imported resources).
## Older clients keep finding their entry, because the manifest holds one per format and engine.
## Here: reading the manifest, choosing the entry, the files of the local copy, the checksum.

## What this client can mount; raise it when the HD models change in a way an older pack would
## not fit (new names, another folder), and build a new pack.
const FORMAT := 1
const MANIFEST_SCHEMA := 1
const MANIFEST_URL := "https://assets.trade-empire.com/game/hd/manifest.json"
## Where the local copy lives: `<version>.pck`, `<version>.part` while it downloads, and
## CURRENT_FILE naming the copy that was checked.
const CACHE_DIR := "user://hd"
const CURRENT_FILE := "current.json"
## A model that is part of the package: when it loads without the package, the models are in the
## app already (a run from the project folder) and nothing needs downloading.
const PROBE := "res://game/world/models_hd/hull_standard_closed.glb"
## Larger packs are refused (a broken or hostile manifest must not fill the device).
const MAX_SIZE := 256 * 1024 * 1024
## Read size while hashing.
const HASH_CHUNK := 1 << 20


## One downloadable pack.
class Entry:
	extends RefCounted
	## Names the pack; safe as a file name (is_safe_version).
	var version := ""
	## Absolute https address of the pack.
	var url := ""
	var size := 0
	## Lower-case hex SHA-256 of the whole file.
	var sha256 := ""


## The entry of `manifest_text` that fits this client (`format`, `engine` as "major.minor"), with
## its address resolved against `manifest_url`; null when the manifest is broken or has none.
## Several fitting entries: the last one listed wins.
static func pick(manifest_text: String, manifest_url: String, format: int, engine: String) -> Entry:
	var manifest := Wire.parse_object(manifest_text)
	if Wire.as_int(manifest.get("schema"), -1) != MANIFEST_SCHEMA:
		return null
	var bundles: Variant = manifest.get("bundles")
	if typeof(bundles) != TYPE_ARRAY:
		return null
	var chosen: Entry = null
	for item: Variant in bundles as Array:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var data: Dictionary = item
		if Wire.as_int(data.get("format"), -1) != format or Wire.as_string(data.get("engine")) != engine:
			continue
		var entry := Entry.new()
		entry.version = Wire.as_string(data.get("version"))
		entry.url = resolve(manifest_url, Wire.as_string(data.get("path")))
		entry.size = Wire.as_int(data.get("size"), -1)
		entry.sha256 = Wire.as_string(data.get("sha256")).to_lower()
		if is_safe_version(entry.version) and not entry.url.is_empty() and entry.size > 0 \
				and entry.size <= MAX_SIZE and is_sha256(entry.sha256):
			chosen = entry
	return chosen


## Whether `text` is a manifest this client can read (even when it has no entry for it).
static func is_manifest(text: String) -> bool:
	var manifest := Wire.parse_object(text)
	return Wire.as_int(manifest.get("schema"), -1) == MANIFEST_SCHEMA and typeof(manifest.get("bundles")) == TYPE_ARRAY


## "major.minor" of an engine version (Engine.get_version_info()).
static func engine_tag(info: Dictionary) -> String:
	return "%d.%d" % [Wire.as_int(info.get("major"), 0), Wire.as_int(info.get("minor"), 0)]


## The address of `path` next to the manifest: a relative path without "..", or an https address;
## "" when it is neither.
static func resolve(manifest_url: String, path: String) -> String:
	if path.begins_with("https://"):
		return path if not path.contains(" ") else ""
	if path.is_empty() or path.begins_with("/") or path.contains("://") or path.contains("..") \
			or path.contains("\\") or path.contains(" ") or path.contains("?") or path.contains("#"):
		return ""
	var slash := manifest_url.rfind("/")
	if not manifest_url.begins_with("https://") or slash < 8:
		return ""
	return manifest_url.substr(0, slash + 1) + path


## Whether `version` can name a file: 1..64 of a-z, A-Z, 0-9, ".", "_", "-", not starting with ".".
static func is_safe_version(version: String) -> bool:
	if version.is_empty() or version.length() > 64 or version.begins_with("."):
		return false
	for character: String in version:
		if not (character >= "a" and character <= "z" or character >= "A" and character <= "Z"
				or character >= "0" and character <= "9" or character in [".", "_", "-"]):
			return false
	return true


## Whether `text` is 64 lower-case hex digits.
static func is_sha256(text: String) -> bool:
	if text.length() != 64:
		return false
	for character: String in text:
		if not (character >= "0" and character <= "9" or character >= "a" and character <= "f"):
			return false
	return true


## The checked local copy of `version`.
static func pack_path(version: String) -> String:
	return CACHE_DIR + "/" + version + ".pck"


## Where `version` is written while it downloads.
static func part_path(version: String) -> String:
	return CACHE_DIR + "/" + version + ".part"


## The record of the checked local copy (CURRENT_FILE).
static func current_record(entry: Entry) -> String:
	return JSON.stringify({"version": entry.version, "size": entry.size, "sha256": entry.sha256})


## Reads a record written by current_record; null when it is missing or broken.
static func parse_record(text: String) -> Entry:
	var data := Wire.parse_object(text)
	var entry := Entry.new()
	entry.version = Wire.as_string(data.get("version"))
	entry.size = Wire.as_int(data.get("size"), -1)
	entry.sha256 = Wire.as_string(data.get("sha256"))
	if not is_safe_version(entry.version) or entry.size <= 0 or not is_sha256(entry.sha256):
		return null
	return entry


## The files of the cache folder (names only) that can go when `keep` is the version in use
## ("" when none is): everything but its pack and the record. A stray part of another download
## goes as well; that of `keep` itself never exists once it is checked.
static func stale_files(files: PackedStringArray, keep: String) -> PackedStringArray:
	var stale := PackedStringArray()
	for file: String in files:
		if file == CURRENT_FILE and not keep.is_empty():
			continue
		if not keep.is_empty() and file == keep + ".pck":
			continue
		stale.append(file)
	return stale


## SHA-256 of a file as lower-case hex; "" when it cannot be read. Reads in chunks (a pack is tens
## of MB); meant for a worker thread.
static func file_sha256(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	var context := HashingContext.new()
	if context.start(HashingContext.HASH_SHA256) != OK:
		return ""
	while file.get_position() < file.get_length():
		context.update(file.get_buffer(HASH_CHUNK))
	file.close()
	return context.finish().hex_encode()
