class_name ResourceIcon
extends RefCounted
## The icons of the resources (Iron, Iron Plate, Robot T3 …): pictures of their 3D models
## (scripts/3d/models/resources.py), rendered by smoke/resource_icons.tscn into FOLDER as
## <key in lower case>.png. A resource without a picture (a new one from the server) has none:
## texture() is null and the screens show the name alone.

const FOLDER := "res://game/ui/resource_icons/"
## The size of an icon in a list row, in canvas pixels (the pictures are 128 px).
const ROW_SIZE := 44

static var _cache: Dictionary[String, Texture2D] = {}
static var _blank: Texture2D


## The file of the icon of *key*; "" for a key that is no resource key (only A–Z, 0–9 and _).
static func path(key: String) -> String:
	if key.is_empty():
		return ""
	for character: String in key:
		if not (character >= "A" and character <= "Z" or character >= "0" and character <= "9" or character == "_"):
			return ""
	return FOLDER + key.to_lower() + ".png"


## The icon of the resource *key*, or null when there is none.
static func texture(key: String) -> Texture2D:
	if _cache.has(key):
		return _cache[key]
	var file := path(key)
	var found: Texture2D = null
	if not file.is_empty() and ResourceLoader.exists(file):
		found = load(file) as Texture2D
	_cache[key] = found
	return found


## A clear picture of an icon's size: holds the room of a missing icon on a button, so the texts
## of a list stay in line.
static func blank() -> Texture2D:
	if _blank == null:
		_blank = ImageTexture.create_from_image(Image.create_empty(ROW_SIZE, ROW_SIZE, false, Image.FORMAT_RGBA8))
	return _blank
