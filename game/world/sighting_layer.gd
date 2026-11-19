class_name SightingLayer
extends Node3D
## Foreign structures a probe has seen near the view (draft.31, RevealMap.Sighting): a snapshot,
## not live, so each is only a ghost — a flat amber outline about as large as the structure (the
## sighting carries its hull count, not its shape) with the owner and how long ago it was seen.

## Sightings farther than this from the view's origin (cells) are left out.
const REACH := 400
const COLOR_FILL := Color(0.984, 0.749, 0.141, 0.16)
const COLOR_EDGE := Color(0.984, 0.749, 0.141, 0.85)
const HEIGHT := 0.08
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
	var now := Services.clock.now_ms()
	for sighting: RevealMap.Sighting in _sightings:
		var origin := _view.origin
		if absi(WorldGrid.wrapped_delta(origin.x, sighting.x, size_x)) > REACH or absi(sighting.y - origin.y) > REACH:
			continue
		var side := float(sighting.footprint_side())
		var corner := WorldGrid.to_scene(Vector3i(sighting.x, sighting.y, 0), origin, size_x) - Vector3(0.5, 0.0, -0.5)
		var middle := corner + Vector3(side * 0.5, HEIGHT * 0.5, -side * 0.5)
		_add_box(middle, Vector3(side, HEIGHT, side), _fill)
		for edge: Array in [[Vector3(0, 0, side * 0.5), Vector3(side, HEIGHT, EDGE)],
				[Vector3(0, 0, -side * 0.5), Vector3(side, HEIGHT, EDGE)],
				[Vector3(side * 0.5, 0, 0), Vector3(EDGE, HEIGHT, side)],
				[Vector3(-side * 0.5, 0, 0), Vector3(EDGE, HEIGHT, side)]]:
			var offset: Vector3 = edge[0]
			var extent: Vector3 = edge[1]
			_add_box(middle + offset, extent, _edge)
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
		label.position = middle + Vector3(0.0, 0.6, 0.0)
		add_child(label)


func _add_box(at: Vector3, extent: Vector3, material: StandardMaterial3D) -> void:
	var mesh := BoxMesh.new()
	mesh.size = extent
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.position = at
	add_child(instance)


static func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return material
