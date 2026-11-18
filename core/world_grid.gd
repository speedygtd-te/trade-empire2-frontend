class_name WorldGrid
extends RefCounted
## Turns cells of a body into scene positions and back.
##
## The scene is built around an origin cell (floating origin): Godot draws in 32-bit floats,
## and bodies are hundreds of thousands of cells wide, so absolute cells never go into the
## scene directly. Axes: cell x → scene +X, cell y → scene −Z, level z → scene +Y; one cell is
## one scene unit. The surface wraps around in x (`size_x` cells); 0 or less means it does not.


## Smallest offset from `from` to `to` along a wrapping axis of `size` cells.
static func wrapped_delta(from: int, to: int, size: int) -> int:
	var delta := to - from
	if size <= 0:
		return delta
	delta = posmod(delta, size)
	@warning_ignore("integer_division")
	if delta >= size / 2:
		delta -= size
	return delta


## Brings x into 0..size-1 on a wrapping surface.
static func wrap_x(x: int, size: int) -> int:
	return posmod(x, size) if size > 0 else x


## Scene position of the centre of a cell's floor.
static func to_scene(cell: Vector3i, origin: Vector3i, size_x: int = 0) -> Vector3:
	var dx := wrapped_delta(origin.x, cell.x, size_x)
	var dy := cell.y - origin.y
	var dz := cell.z - origin.z
	return Vector3(dx + 0.5, dz, -(dy + 0.5))


## The cell whose floor contains a scene position.
static func to_cell(point: Vector3, origin: Vector3i, size_x: int = 0) -> Vector3i:
	var x := origin.x + floori(point.x)
	var y := origin.y + floori(-point.z)
	var z := origin.z + floori(point.y + 0.001)
	return Vector3i(wrap_x(x, size_x), y, z)
