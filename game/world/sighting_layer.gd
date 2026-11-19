class_name SightingLayer
extends Node3D
## Foreign structures a probe has seen near the view (draft.31, RevealMap.Sighting): a snapshot,
## not live, so each is only a ghost — a flat amber fill over exactly the cells it covered seen from
## above (draft.32 `footprint`; before, a square about as large as its hull count), with one
## outline around them all, and the owner with how long ago it was seen. Fill and outline lie on
## the ground as drawn (TerrainRelief).

## Sightings farther than this from the view's origin (cells) are left out.
const REACH := 400
const COLOR_FILL := Color(0.984, 0.749, 0.141, 0.16)
const COLOR_EDGE := Color(0.984, 0.749, 0.141, 0.85)
## Height of the fill and the outline over the ground, and the outline's width (cells).
const FILL_HEIGHT := 0.04
const EDGE_HEIGHT := 0.06
const EDGE := 0.08

var _view: ColonyView
var _sightings: Array[RevealMap.Sighting] = []
var _fill: StandardMaterial3D
var _edge: StandardMaterial3D


func setup(view: ColonyView) -> void:
	_view = view
	_fill = _material(COLOR_FILL)
	_edge = _material(COLOR_EDGE)


func show_sightings(sightings: Array[RevealMap.Sighting]) -> void:
	_sightings = sightings
	redraw()


## Places the ghosts again around the view's origin.
func redraw() -> void:
	for child: Node in get_children():
		child.queue_free()
	if _view == null or _view.model == null:
		return
	var size_x := _view.model.size_x
	var origin := _view.origin
	var now := Services.clock.now_ms()
	for sighting: RevealMap.Sighting in _sightings:
		if absi(WorldGrid.wrapped_delta(origin.x, sighting.x, size_x)) > REACH or absi(sighting.y - origin.y) > REACH:
			continue
		var cells := sighting.cells()
		if cells.is_empty():
			continue
		var taken := {}
		for cell: Vector2i in cells:
			taken[cell] = true
		var mesh := ImmediateMesh.new()
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, _fill)
		var middle := Vector3.ZERO
		for cell: Vector2i in cells:
			var corner := _corner(cell, origin, size_x)
			middle += corner + Vector3(0.5, 0.0, -0.5)
			_quad(mesh, corner, Vector3(1.0, 0.0, 0.0), Vector3(0.0, 0.0, -1.0), FILL_HEIGHT)
		mesh.surface_end()
		# The outline: every side of a cell that borders a cell outside the structure.
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, _edge)
		for cell: Vector2i in cells:
			var corner := _corner(cell, origin, size_x)
			if not taken.has(cell + Vector2i(0, -1)):
				_quad(mesh, corner, Vector3(1.0, 0.0, 0.0), Vector3(0.0, 0.0, -EDGE), EDGE_HEIGHT)
			if not taken.has(cell + Vector2i(0, 1)):
				_quad(mesh, corner + Vector3(0.0, 0.0, -1.0 + EDGE), Vector3(1.0, 0.0, 0.0), Vector3(0.0, 0.0, -EDGE), EDGE_HEIGHT)
			if not taken.has(cell + Vector2i(-1, 0)):
				_quad(mesh, corner, Vector3(EDGE, 0.0, 0.0), Vector3(0.0, 0.0, -1.0), EDGE_HEIGHT)
			if not taken.has(cell + Vector2i(1, 0)):
				_quad(mesh, corner + Vector3(1.0 - EDGE, 0.0, 0.0), Vector3(EDGE, 0.0, 0.0), Vector3(0.0, 0.0, -1.0), EDGE_HEIGHT)
		mesh.surface_end()
		var instance := MeshInstance3D.new()
		instance.mesh = mesh
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(instance)
		var label := Label3D.new()
		label.text = ProbeTargetScreen.sighting_text(sighting, now, self)
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.fixed_size = true
		label.pixel_size = 0.0012
		label.font_size = 26
		label.outline_size = 8
		label.modulate = AppTheme.COLOR_PENDING
		label.outline_modulate = AppTheme.COLOR_BACKGROUND
		label.position = _view.on_ground(middle / float(cells.size())) + Vector3(0.0, 0.6, 0.0)
		add_child(label)


## The scene corner of a cell's floor at its west and south edge (x low, scene z high).
static func _corner(cell: Vector2i, origin: Vector3i, size_x: int) -> Vector3:
	return WorldGrid.to_scene(Vector3i(cell.x, cell.y, 0), origin, size_x) - Vector3(0.5, 0.0, -0.5)


## A rectangle from `corner` spanning `along_x` and `along_z`, `height` above the ground as drawn
## at each of its corners (TerrainRelief).
func _quad(mesh: ImmediateMesh, corner: Vector3, along_x: Vector3, along_z: Vector3, height: float) -> void:
	var points: Array[Vector3] = [corner, corner + along_x, corner + along_x + along_z, corner + along_z]
	for index: int in points.size():
		points[index].y = _view.ground_height(points[index]) + height
	for index: int in [0, 2, 1, 0, 3, 2]:
		mesh.surface_add_vertex(points[index])


static func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material
