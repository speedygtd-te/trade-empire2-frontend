class_name RouteStopLayer
extends Node3D
## The stop sites the player's routes hold on the body on screen: a cyan frame on each reserved
## cell (where the transporter's local (0, 0) stops), so the player sees why nothing can be built
## there. A paused route holds no sites. Lives under the ColonyView and follows its origin.

const COLOR := Color(0.133, 0.827, 0.933, 0.85)
const FILL := Color(0.133, 0.827, 0.933, 0.18)
## Height above the ground, so the frame is not hidden in it.
const LIFT := 0.02

var _view: ColonyView
var _routes: RouteModel
## Absolute cells of the marks, in the order of the children.
var _cells: Array[Vector2i] = []


func setup(view: ColonyView, routes: RouteModel) -> void:
	_view = view
	_routes = routes


func _ready() -> void:
	if _routes == null:
		return
	_routes.changed.connect(_rebuild)
	_rebuild()


## The reserved stop cells on a body: those of every route that is not paused.
static func stop_cells(routes: Array[RoutePlan.Route], body_id: String) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for route: RoutePlan.Route in routes:
		if route.is_paused():
			continue
		for station: RoutePlan.Station in [route.station_a, route.station_b]:
			if station.has_stop and station.body_id == body_id and not result.has(station.stop):
				result.append(station.stop)
	return result


func _rebuild() -> void:
	for child: Node in get_children():
		child.queue_free()
	_cells.clear()
	if _view == null or _view.model == null:
		return
	for cell: Vector2i in stop_cells(_routes.book.routes(), _view.model.body_id):
		_cells.append(cell)
		add_child(_mark())
	_place()


func _process(_delta: float) -> void:
	_place()


## Puts the marks where their cells are now (the view's origin moves with the camera).
func _place() -> void:
	if _view == null or _view.model == null:
		return
	var index := 0
	for child: Node in get_children():
		var mark := child as Node3D
		if mark == null or mark.is_queued_for_deletion() or index >= _cells.size():
			continue
		var cell := _cells[index]
		mark.position = WorldGrid.to_scene(Vector3i(cell.x, cell.y, 0), _view.origin, _view.model.size_x) \
			+ Vector3(0.0, LIFT, 0.0)
		index += 1


func _mark() -> MeshInstance3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
	mesh.surface_set_color(FILL)
	for corner: Vector3 in [Vector3(-0.45, 0, -0.45), Vector3(0.45, 0, -0.45), Vector3(0.45, 0, 0.45),
			Vector3(-0.45, 0, -0.45), Vector3(0.45, 0, 0.45), Vector3(-0.45, 0, 0.45)]:
		mesh.surface_add_vertex(corner)
	mesh.surface_end()
	mesh.surface_begin(Mesh.PRIMITIVE_LINES, material)
	mesh.surface_set_color(COLOR)
	var corners: Array[Vector3] = [Vector3(-0.48, 0, -0.48), Vector3(0.48, 0, -0.48),
		Vector3(0.48, 0, 0.48), Vector3(-0.48, 0, 0.48)]
	for index: int in 4:
		mesh.surface_add_vertex(corners[index])
		mesh.surface_add_vertex(corners[(index + 1) % 4])
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance
