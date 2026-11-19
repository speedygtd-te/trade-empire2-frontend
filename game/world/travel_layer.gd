class_name TravelLayer
extends Node3D
## Marks of trips in the colony view (ColonyView owns it): the ghost of a structure on a landing
## or stopping site being chosen, the line of a drive with its waypoints, and the cells reserved
## for a structure that is on its way to land here. Cells are absolute; the layer redraws itself
## when the view's origin moves.

const COLOR_GHOST_OK := Color(0.133, 0.827, 0.933, 0.42)
const COLOR_GHOST_BAD := Color(0.973, 0.443, 0.443, 0.42)
const COLOR_GHOST_UNSURE := Color(0.984, 0.749, 0.141, 0.42)
const COLOR_RESERVED := Color(0.984, 0.749, 0.141, 0.55)
const COLOR_ROUTE := Color(0.133, 0.827, 0.933, 0.95)
## Height of a ghost box (a shut hull is about this high).
const GHOST_HEIGHT := 0.72
## Height of the drive line above the ground.
const ROUTE_LIFT := 0.08

var _view: ColonyView
var _ghost_cells: Array[Vector3i] = []
var _ghost_color := COLOR_GHOST_OK
var _route: Array[Vector2i] = []
var _route_level := 0
var _reserved: Array[Vector3i] = []
var _ghost: Node3D
var _line: Node3D
var _marks: Node3D


func setup(view: ColonyView) -> void:
	_view = view


func _ready() -> void:
	_ghost = Node3D.new()
	_ghost.name = "Ghost"
	add_child(_ghost)
	_line = Node3D.new()
	_line.name = "Route"
	add_child(_line)
	_marks = Node3D.new()
	_marks.name = "Reserved"
	add_child(_marks)


## The structure as it would stand on a site (absolute cells) in the colour of the check: ok
## (cyan), not ok (red) or not known yet (amber). An empty list hides it.
func show_ghost(cells: Array[Vector3i], color: Color) -> void:
	_ghost_cells = cells
	_ghost_color = color
	_draw_ghost()


## The line of a drive through its corners (absolute cells, x unwrapped) on `level`.
func show_route(points: Array[Vector2i], level: int = 0) -> void:
	_route = points
	_route_level = level
	_draw_route()


## Cells reserved for structures on their way to land here.
func show_reserved(cells: Array[Vector3i]) -> void:
	_reserved = cells
	_draw_reserved()


## Draws everything again around the view's (new) origin.
func redraw() -> void:
	_draw_ghost()
	_draw_route()
	_draw_reserved()


func _draw_ghost() -> void:
	if _ghost == null:
		return
	for child: Node in _ghost.get_children():
		child.queue_free()
	if _ghost_cells.is_empty() or _view == null:
		return
	var box := BoxMesh.new()
	box.size = Vector3(0.94, GHOST_HEIGHT, 0.94)
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = _ghost_color
	box.material = material
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = box
	multimesh.instance_count = _ghost_cells.size()
	for index: int in _ghost_cells.size():
		var at := _scene(_ghost_cells[index]) + Vector3(0.0, GHOST_HEIGHT * 0.5 + 0.01, 0.0)
		multimesh.set_instance_transform(index, Transform3D(Basis.IDENTITY, at))
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ghost.add_child(instance)
	# A bright frame around each cell on the ground, so the site reads on any terrain.
	for cell: Vector3i in _ghost_cells:
		if cell.z != _lowest(_ghost_cells):
			continue
		var frame := _square(Color(_ghost_color, 0.95), false)
		frame.position = _scene(cell) + Vector3(0.0, 0.02, 0.0)
		_ghost.add_child(frame)


func _draw_route() -> void:
	if _line == null:
		return
	for child: Node in _line.get_children():
		child.queue_free()
	if _route.size() < 2 or _view == null:
		return
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = COLOR_ROUTE
	material.no_depth_test = true
	material.render_priority = 5
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
	# A flat band a fifth of a cell wide along each piece.
	var lift := Vector3(0.0, ROUTE_LIFT, 0.0)
	for index: int in _route.size() - 1:
		var a := _scene_xy(_route[index]) + lift
		var b := _scene_xy(_route[index + 1]) + lift
		var along := (b - a)
		if along.length() < 0.001:
			continue
		var side := along.cross(Vector3.UP).normalized() * 0.1
		for corner: Vector3 in [a - side, a + side, b + side, a - side, b + side, b - side]:
			mesh.surface_add_vertex(corner)
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_line.add_child(instance)
	for index: int in range(1, _route.size() - 1):
		var mark := _square(COLOR_ROUTE, true, 0.4)
		mark.position = _scene_xy(_route[index]) + lift
		_line.add_child(mark)


func _draw_reserved() -> void:
	if _marks == null:
		return
	for child: Node in _marks.get_children():
		child.queue_free()
	if _view == null:
		return
	for cell: Vector3i in _reserved:
		var mark := _square(COLOR_RESERVED, false)
		mark.position = _scene(cell) + Vector3(0.0, 0.03, 0.0)
		_marks.add_child(mark)


func _scene(cell: Vector3i) -> Vector3:
	return WorldGrid.to_scene(cell, _view.origin, _view.model.size_x)


func _scene_xy(point: Vector2i) -> Vector3:
	return _scene(Vector3i(point.x, point.y, _route_level))


static func _lowest(cells: Array[Vector3i]) -> int:
	var lowest := cells[0].z
	for cell: Vector3i in cells:
		lowest = mini(lowest, cell.z)
	return lowest


## A square on one cell: a frame, or filled (`size` of the cell).
func _square(color: Color, filled: bool, size: float = 0.96) -> MeshInstance3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = color
	material.no_depth_test = true
	material.render_priority = 6
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	var half := size * 0.5
	var mesh := ImmediateMesh.new()
	if filled:
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
		for corner: Vector3 in [Vector3(-half, 0, -half), Vector3(half, 0, -half), Vector3(half, 0, half),
				Vector3(-half, 0, -half), Vector3(half, 0, half), Vector3(-half, 0, half)]:
			mesh.surface_add_vertex(corner)
	else:
		# A frame of four thin bands (lines are one pixel wide on a phone).
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
		var width := 0.06
		var bands: Array[Rect2] = [Rect2(-half, -half, size, width), Rect2(-half, half - width, size, width),
			Rect2(-half, -half, width, size), Rect2(half - width, -half, width, size)]
		for band: Rect2 in bands:
			var x0 := band.position.x
			var z0 := band.position.y
			var x1 := band.end.x
			var z1 := band.end.y
			for corner: Vector3 in [Vector3(x0, 0, z0), Vector3(x1, 0, z0), Vector3(x1, 0, z1),
					Vector3(x0, 0, z0), Vector3(x1, 0, z1), Vector3(x0, 0, z1)]:
				mesh.surface_add_vertex(corner)
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance
