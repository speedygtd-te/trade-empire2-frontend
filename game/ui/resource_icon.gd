class_name ResourceIcon
extends RefCounted
## The icons of the resources (Iron, Iron Plate, Robot T3 …) and of the store items that build
## modules and hulls (Pump, Standard Hull …): pictures of their 3D models, rendered by
## smoke/resource_icons.tscn as <key in lower case>.png — resources (scripts/3d/models/resources.py)
## into FOLDER, module and hull items (the models the colony shows) into ITEM_FOLDER. A key
## without a picture (a new one from the server) has none: texture() is null and the screens show
## the name alone.

const FOLDER := "res://game/ui/resource_icons/"
const ITEM_FOLDER := "res://game/ui/item_icons/"
## Where texture() looks, in this order.
const FOLDERS: Array[String] = [FOLDER, ITEM_FOLDER]
## The size of an icon in a list row, in canvas pixels (the pictures are 128 px).
const ROW_SIZE := 44
## The room between an icon and the name right of it, in canvas pixels.
const ROW_GAP := 16

static var _cache: Dictionary[String, Texture2D] = {}
static var _blank: Texture2D


## The file of the icon of *key* in *folder*; "" for a key that is no resource key (only A–Z,
## 0–9 and _).
static func path(key: String, folder: String = FOLDER) -> String:
	if key.is_empty():
		return ""
	for character: String in key:
		if not (character >= "A" and character <= "Z" or character >= "0" and character <= "9" or character == "_"):
			return ""
	return folder + key.to_lower() + ".png"


## The icon of the resource or item *key*, or null when there is none.
static func texture(key: String) -> Texture2D:
	if _cache.has(key):
		return _cache[key]
	var found: Texture2D = null
	for folder: String in FOLDERS:
		var file := path(key, folder)
		if not file.is_empty() and ResourceLoader.exists(file):
			found = load(file) as Texture2D
			break
	_cache[key] = found
	return found


## A clear picture of an icon's size: holds the room of a missing icon on a button, so the texts
## of a list stay in line.
static func blank() -> Texture2D:
	if _blank == null:
		_blank = ImageTexture.create_from_image(Image.create_empty(ROW_SIZE, ROW_SIZE, false, Image.FORMAT_RGBA8))
	return _blank
