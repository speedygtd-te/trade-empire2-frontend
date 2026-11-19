class_name SurfaceBlocks
extends RefCounted
## Which parts of a body's surface are loaded, in blocks of BLOCK × BLOCK cells.
##
## The surface is far too large to load at once; the view asks for the blocks around the
## camera. Blocks are aligned to multiples of BLOCK, which the wrap width of a body always is
## (the contract promises `sizeX` to be a multiple of 16), so no block crosses the seam. A
## smaller block size (a divisor of 16, e.g. for the deposits of a few cells) keeps that true.

const BLOCK := 16


class Request:
	extends RefCounted
	## Inclusive absolute cell rectangle.
	var x0: int = 0
	var y0: int = 0
	var x1: int = 0
	var y1: int = 0
	## The blocks this request covers.
	var blocks: Array[Vector2i] = []


## Body width in cells for wrapping in x; 0 = no wrapping.
var size_x := 0
## Edge length of a block in cells (BLOCK unless chosen smaller).
var block_size := BLOCK
## Block → SurfacePatch (null while requested).
var _blocks: Dictionary = {}


func _init(wrap_width: int = 0, block_cells: int = BLOCK) -> void:
	size_x = wrap_width
	block_size = maxi(1, block_cells)


## The block containing an absolute cell.
func block_of(x: int, y: int) -> Vector2i:
	return Vector2i(floori(float(WorldGrid.wrap_x(x, size_x)) / block_size), floori(float(y) / block_size))


## Requests for every block within `radius` blocks of the cell that is neither loaded nor
## requested. Consecutive blocks of a row form one request. The blocks are marked as requested.
func missing_around(x: int, y: int, radius: int) -> Array[Request]:
	var centre := block_of(x, y)
	var requests: Array[Request] = []
	for by: int in range(centre.y - radius, centre.y + radius + 1):
		var current: Request = null
		for step: int in range(-radius, radius + 1):
			var bx := centre.x + step
			if size_x > 0:
				@warning_ignore("integer_division")
				bx = posmod(bx, size_x / block_size)
			var block := Vector2i(bx, by)
			if _blocks.has(block):
				current = null
				continue
			_blocks[block] = null
			if current == null or block.x != current.blocks[current.blocks.size() - 1].x + 1:
				current = Request.new()
				current.x0 = block.x * block_size
				current.y0 = block.y * block_size
				current.y1 = current.y0 + block_size - 1
				requests.append(current)
			current.x1 = block.x * block_size + block_size - 1
			current.blocks.append(block)
	return requests


## Stores a loaded patch for the blocks of its request.
func store(request: Request, patch: SurfacePatch) -> void:
	for block: Vector2i in request.blocks:
		_blocks[block] = patch


## Forgets a failed request, so it is asked for again later.
func forget(request: Request) -> void:
	for block: Vector2i in request.blocks:
		if _blocks.get(block) == null:
			_blocks.erase(block)


## The loaded cell at an absolute position; null when its block is not loaded.
func cell(x: int, y: int) -> SurfacePatch.Cell:
	var patch := _blocks.get(block_of(x, y)) as SurfacePatch
	return patch.cell(WorldGrid.wrap_x(x, size_x), y) if patch != null else null


## Whether an absolute cell is loaded and unexplored (fog, draft.31); false while it loads.
func is_hidden(x: int, y: int) -> bool:
	var patch := _blocks.get(block_of(x, y)) as SurfacePatch
	return patch != null and patch.is_hidden(WorldGrid.wrap_x(x, size_x), y)


func is_loaded(block: Vector2i) -> bool:
	return _blocks.get(block) != null


func clear() -> void:
	_blocks.clear()
