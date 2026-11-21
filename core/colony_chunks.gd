class_name ColonyChunks
extends RefCounted
## Splits what a structure draws into square chunks of ground cells (all levels of a column
## together), so the renderer culls the parts off screen and a change builds again only the chunks
## it touched. Each chunk carries a signature of what it draws; chunks whose signature stayed are
## kept. Pure.

## Cells per side of a chunk (absolute cells; x wraps with the body, chunks follow the scene).
const SIZE := 16


## The chunk of an absolute cell (x, y).
static func chunk_of(x: int, y: int) -> Vector2i:
	return Vector2i(floori(float(x) / SIZE), floori(float(y) / SIZE))


## A signature per chunk of grouped entries (chunk → Array of what it draws; → int).
static func signatures(groups: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for key: Vector2i in groups.keys():
		var list: Array = groups[key]
		result[key] = list.hash()
	return result


## Chunks that have to be built (again): new in `after` or with another signature than in `before`
## (both chunk → signature).
static func changed(before: Dictionary, after: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for key: Vector2i in after.keys():
		if not before.has(key) or before[key] != after[key]:
			result.append(key)
	return result


## Chunks drawn before that are gone now.
static func removed(before: Dictionary, after: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for key: Vector2i in before.keys():
		if not after.has(key):
			result.append(key)
	return result
