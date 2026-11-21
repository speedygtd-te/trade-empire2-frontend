class_name PerimeterLayer
extends Node3D
## The decoration around every base on screen (Perimeter decides which free cell carries what):
## lamp masts, radar, antennas and beacons, low-poly models (game/world/models/perimeter,
## scripts/3d/models/perimeter.py). Purely cosmetic; the server knows nothing about it.
##
## One MultiMesh per model; the radar reflectors are nodes of their own and turn slowly. The
## floodlights glow like the windows (ColonyView lamps); the red lights blink. At night every
## floodlight throws a light cone away from the base and a pool of light on the ground: no real
## lights (too dear on phones in the Compatibility renderer) but additive, unshaded meshes that
## fade with distance (perimeter_cone.gdshader, perimeter_pool.gdshader), invisible by day. On a
## slow device only the pools stay. An item on water, lava or swamp stands on a concrete caisson (Piers),
## drawn with the fence posts' caissons by a RetainingLayer of its own. Every structure on screen (bases or not) also casts a soft glow
## on the ground around itself at night (StructureGlowLayer, a child of this layer).
##
## Built around the view's origin; rebuilt when the footprints, bases or trips of the structures, the
## ground beside them or the origin change (ColonyView._rebuild_now, _place_followers).

const MODELS := "res://game/world/models/perimeter/"
const CONE_SHADER := preload("res://game/world/perimeter_cone.gdshader")
const POOL_SHADER := preload("res://game/world/perimeter_pool.gdshader")
## Model file per kind.
const FILES := {
	Perimeter.Kind.LAMP: "lamp_mast",
	Perimeter.Kind.RADAR: "radar_base",
	Perimeter.Kind.ANTENNA: "antenna",
	Perimeter.Kind.BEACON: "beacon",
}
const DISH_FILE := "radar_dish"
## Models whose glow is a red warning light: it blinks instead of following the lamps.
const BLINKING := ["antenna", "beacon"]
## Centre of the floodlight's lens in the mast model, front +Z (perimeter.py lens_centre()).
const LENS := Vector3(0.0, 1.0765, 0.1156)
## Where the cone's axis meets the ground (distance in front of the mast), its radius there, and
## how far the cone runs on beyond (share of the axis; the part under the ground is hidden).
const AIM_DISTANCE := 2.1
const CONE_RADIUS := 0.5
const CONE_OVERSHOOT := 1.25
const CONE_SEGMENTS := 12
## Radius of the cone at the lens.
const CONE_START_RADIUS := 0.07
## The pool of light on the ground: its centre in front of the mast and half its size (across,
## along).
const POOL_CENTRE := 2.5
const POOL_HALF := Vector2(0.85, 1.35)
const POOL_LIFT := 0.03
## Grid of a pool over the ground's slope (across, along).
const POOL_COLUMNS := 3
const POOL_ROWS := 5
## Height of the radar's turning axis (perimeter.py PIVOT) and its speed in turns per second.
const RADAR_PIVOT := 0.46
const RADAR_TURNS_PER_SECOND := 0.1
## Red lights: one blink every BLINK_PERIOD seconds, lit for BLINK_ON of it; dim in between.
const BLINK_PERIOD := 1.6
const BLINK_ON := 0.35
const BLINK_DIM := 0.15
## Strength of cones and pools at full darkness, and the darkness below which they are hidden.
const CONE_STRENGTH := 0.30
const POOL_STRENGTH := 0.45
const DARK_ENOUGH := 0.03

var _view: ColonyView
## Kind → MultiMeshInstance3D of the items now drawn.
var _items: Dictionary = {}
var _dishes: Array[MeshInstance3D] = []
var _dish_phases: PackedFloat32Array = []
var _cones: MultiMeshInstance3D
## The pools of all floodlights: one mesh lying on the ground as drawn.
var _pools: MeshInstance3D
var _pool_count := 0
var _cone_material: ShaderMaterial
var _pool_material: ShaderMaterial
var _cone_mesh: Mesh
## File → Mesh (null when missing), and the glow materials of the blinking models.
var _meshes: Dictionary = {}
var _blinkers: Array[StandardMaterial3D] = []
## Grounds plans (BaseGrounds) and spots computed lately, by structures_key (grounds_for, spots_for;
## a plan is null for a base too small for grounds).
const PLANS_KEPT := 8
static var _plans: Dictionary = {}
static var _spots: Dictionary = {}

## Fence, wall and concrete around large bases (BaseGroundsLayer), rebuilt with the items.
var _grounds: BaseGroundsLayer
## The caissons under items and fence posts standing in the water.
var _footings: RetainingLayer
## The glow of every structure's lamps on the ground at night (StructureGlowLayer), rebuilt with
## the items and dark with the cones; hidden with this layer in the cutaway view.
var _glow: StructureGlowLayer
var _darkness := 0.0
var _tier := DetailGovernor.DEFAULT_TIER
var _time := 0.0


func setup(view: ColonyView) -> void:
	_view = view
	_cone_material = ShaderMaterial.new()
	_cone_material.shader = CONE_SHADER
	_pool_material = ShaderMaterial.new()
	_pool_material.shader = POOL_SHADER
	_cone_mesh = _build_cone()
	_grounds = BaseGroundsLayer.new()
	_grounds.name = "Grounds"
	add_child(_grounds)
	_grounds.setup(view)
	_footings = RetainingLayer.new()
	_footings.name = "Caissons"
	add_child(_footings)
	_footings.setup(view)
	_glow = StructureGlowLayer.new()
	_glow.name = "StructureGlow"
	add_child(_glow)
	_glow.setup(view)


## The decorated cells around every base on screen: the loaded structure and its neighbours when
## they are bases (guests are ships and vehicles, never decorated). Every structure's cells, also the
## underground ones, stay free.
static func spots_for(model: ColonyModel) -> Array[Perimeter.Spot]:
	var result: Array[Perimeter.Spot] = []
	if model == null:
		return result
	# This layer and PropLayer ask after every change; for a large base it takes a while.
	var key := structures_key(model)
	var cached: Variant = _spots.get(key)
	if cached != null:
		var known: Array[Perimeter.Spot] = cached
		return known
	if _spots.size() >= PLANS_KEPT:
		_spots.clear()
	_spots[key] = result
	var structures := model.drawn_structures()
	var occupied: Array[Vector2i] = []
	for structure: ColonyModel in structures:
		for local: Vector3i in structure.layout.hull_cells():
			var cell := structure.layout.to_absolute(local)
			occupied.append(Vector2i(cell.x, cell.y))
	for structure: ColonyModel in structures:
		var layout := structure.layout
		if structure.is_guest() or layout.kind != "base":
			continue
		var footprint: Array[Vector2i] = []
		var docks: Array[Vector2i] = []
		for local: Vector3i in layout.hull_cells():
			var cell := layout.to_absolute(local)
			if cell.z < 0:
				continue
			footprint.append(Vector2i(cell.x, cell.y))
			if DockRules.is_dock(layout.hull_at(local)):
				docks.append(Vector2i(cell.x, cell.y))
		result.append_array(Perimeter.spots(footprint, occupied, model.size_x, docks))
	return result


## A key of everything spots_for and grounds_for read: the drawn structures, which of them are
## bases and their hulls (StructureLayout.hull_key). Layers that depend only on the footprints keep
## their work while it stays.
static func structures_key(model: ColonyModel) -> int:
	var parts: Array = [model.size_x]
	for structure: ColonyModel in model.drawn_structures():
		parts.append_array([structure.structure_id, structure.is_guest(), structure.layout.kind,
			structure.layout.hull_key()])
	return hash(parts)


## What the land around every base on screen looks like as it grows (BaseGrounds): its hulls on
## and above the ground; other structures (and their guests) keep their cells, its own underground
## parts do not (concrete may lie over them).
static func grounds_for(model: ColonyModel) -> Array[BaseGrounds.Plan]:
	var result: Array[BaseGrounds.Plan] = []
	if model == null:
		return result
	var structures := model.drawn_structures()
	var key := structures_key(model)
	for structure: ColonyModel in structures:
		var layout := structure.layout
		if structure.is_guest() or layout.kind != "base":
			continue
		# The layer and PropLayer both ask after every change; a large base takes a while.
		var plan_key := hash([key, structure.structure_id])
		if _plans.has(plan_key):
			var known: Variant = _plans[plan_key]
			if known != null:
				result.append(known as BaseGrounds.Plan)
			continue
		if _plans.size() >= PLANS_KEPT:
			_plans.clear()
		var footprint: Array[Vector2i] = []
		var docks: Array[Vector2i] = []
		for local: Vector3i in layout.hull_cells():
			var cell := layout.to_absolute(local)
			if cell.z < 0:
				continue
			footprint.append(Vector2i(cell.x, cell.y))
			if DockRules.is_dock(layout.hull_at(local)):
				docks.append(Vector2i(cell.x, cell.y))
		if BaseGrounds.stage(footprint.size()) == BaseGrounds.Stage.START:
			_plans[plan_key] = null
			continue
		var occupied: Array[Vector2i] = []
		for other: ColonyModel in structures:
			if other == structure:
				continue
			for local: Vector3i in other.layout.hull_cells():
				var cell := other.layout.to_absolute(local)
				occupied.append(Vector2i(cell.x, cell.y))
		var plan := BaseGrounds.plan(footprint, occupied, model.size_x, docks)
		_plans[plan_key] = plan
		result.append(plan)
	return result


## Places every item again around the view's origin.
func rebuild() -> void:
	if _view == null or _view.model == null:
		return
	for child: Node in get_children():
		if child != _grounds and child != _glow and child != _footings:
			child.queue_free()
	_items.clear()
	_dishes.clear()
	_dish_phases.clear()
	var model := _view.model
	var transforms: Dictionary = {}
	var caissons: Array[RetainingWalls.Piece] = []
	var caissons_drawn := _footings.has_models([Piers.CAISSON])
	for spot: Perimeter.Spot in spots_for(model):
		# Masts stand upright on the ground as drawn (TerrainRelief); in the water on a caisson.
		var at := _view.on_ground(WorldGrid.to_scene(Vector3i(spot.cell.x, spot.cell.y, 0), _view.origin, model.size_x))
		var pier := _view.cell_pier(spot.cell.x, spot.cell.y)
		if caissons_drawn and pier != LevelRules.PierGround.NONE:
			var surface := _view.pier_surface(pier, at.y)
			caissons.append(Piers.caisson(at, surface, Piers.caisson_size(spot.kind), pier))
			at.y = Piers.standing_height(at.y, surface, true)
		# The model's front (+Z) looks along the spot's direction (cell y is scene −Z).
		var turn := Basis(Vector3.UP, atan2(spot.direction.x, -spot.direction.y))
		if not transforms.has(spot.kind):
			transforms[spot.kind] = []
		var list: Array = transforms[spot.kind]
		list.append(Transform3D(turn, at))
		if spot.kind == Perimeter.Kind.RADAR:
			_add_dish(at, spot.phase)
	for kind: Perimeter.Kind in transforms.keys():
		var list: Array = transforms[kind]
		var file: String = FILES[kind]
		var instance := _multimesh(_mesh(file), list)
		if instance == null:
			continue
		instance.name = file
		instance.set_meta("casts", kind != Perimeter.Kind.BEACON)
		add_child(instance)
		_items[kind] = instance
	var lamps: Array = transforms.get(Perimeter.Kind.LAMP, [])
	_cones = _multimesh(_cone_mesh, lamps)
	_pools = _pool_sheet(lamps)
	for glow: GeometryInstance3D in [_cones, _pools]:
		if glow != null:
			glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(glow)
	if _grounds != null:
		_grounds.rebuild(grounds_for(model))
		caissons.append_array(_grounds.caissons)
	_footings.rebuild(caissons)
	if _glow != null:
		_glow.rebuild()
	_apply()


## How dark it is (SkyLight.darkness): the cones and pools follow it.
func set_darkness(level: float) -> void:
	_darkness = clampf(level, 0.0, 1.0)
	if _glow != null:
		_glow.set_darkness(_darkness)
	_apply()


func apply_detail(tier: DetailGovernor.Tier) -> void:
	_tier = tier
	if _grounds != null:
		_grounds.apply_detail(tier)
	if _footings != null:
		_footings.apply_detail(tier)
	_apply()


## Items per kind, lamps throwing cones, and how many cones and pools are drawn now (for
## measuring).
func stats() -> Dictionary:
	var counts: Dictionary = {}
	for kind: Perimeter.Kind in _items.keys():
		counts[FILES[kind]] = (_items[kind] as MultiMeshInstance3D).multimesh.instance_count
	counts["radar_dish"] = _dishes.size()
	counts["caissons"] = _footings.stats().get(Piers.CAISSON, 0) if _footings != null else 0
	counts["cones_drawn"] = _cones.multimesh.instance_count if _cones != null and _cones.visible else 0
	counts["pools_drawn"] = _pool_count if _pools != null and _pools.visible else 0
	return counts


func _process(delta: float) -> void:
	_time += delta
	for index: int in _dishes.size():
		_dishes[index].rotation.y = TAU * fposmod(_dish_phases[index] + _time * RADAR_TURNS_PER_SECOND, 1.0)
	if _blinkers.is_empty() or _view == null:
		return
	var lit := fposmod(_time, BLINK_PERIOD) < BLINK_PERIOD * BLINK_ON
	var energy := _view.lamp_energy() * (1.0 if lit else BLINK_DIM)
	for material: StandardMaterial3D in _blinkers:
		material.emission_energy_multiplier = energy


func _apply() -> void:
	var dark := _darkness > DARK_ENOUGH
	if _cones != null:
		_cones.visible = dark and _tier != DetailGovernor.Tier.SLOW
	# On the slowest tier the see-through light layers go (they cost fill rate on weak GPUs):
	# cones, pools and the glow around the structures; lamps and windows keep glowing.
	var slow := _tier == DetailGovernor.Tier.SLOW
	if _pools != null:
		_pools.visible = dark and not slow
	if _glow != null:
		_glow.visible = not slow
	if _cone_material != null:
		_cone_material.set_shader_parameter("strength", CONE_STRENGTH * _darkness)
		_pool_material.set_shader_parameter("strength", POOL_STRENGTH * _darkness)
	var shadows := _tier != DetailGovernor.Tier.SLOW
	for instance: MultiMeshInstance3D in _items.values():
		var casts: bool = instance.get_meta("casts", false) and shadows
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if casts \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _add_dish(at: Vector3, phase: float) -> void:
	var mesh := _mesh(DISH_FILE)
	if mesh == null:
		return
	var dish := MeshInstance3D.new()
	dish.name = "RadarDish"
	dish.mesh = mesh
	dish.position = at + Vector3(0.0, RADAR_PIVOT, 0.0)
	dish.rotation.y = TAU * phase
	add_child(dish)
	_dishes.append(dish)
	_dish_phases.append(phase)


func _multimesh(mesh: Mesh, transforms: Array) -> MultiMeshInstance3D:
	if mesh == null or transforms.is_empty():
		return null
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = mesh
	multimesh.instance_count = transforms.size()
	for index: int in transforms.size():
		var placed: Transform3D = transforms[index]
		multimesh.set_instance_transform(index, placed)
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	return instance


## The mesh of a model file, cached. Floodlights glow with the colony's lamps; red lights blink.
func _mesh(file: String) -> Mesh:
	if _meshes.has(file):
		return _meshes[file] as Mesh
	var mesh: Mesh = null
	var path := MODELS + file + ".glb"
	if ResourceLoader.exists(path):
		var node := (load(path) as PackedScene).instantiate() as Node3D
		var found := node.find_children("*", "MeshInstance3D", true, false)
		if not found.is_empty():
			mesh = (found[0] as MeshInstance3D).mesh
			if file in BLINKING:
				for surface: int in mesh.get_surface_count():
					var material := mesh.surface_get_material(surface) as StandardMaterial3D
					if material != null and material.emission_enabled and material not in _blinkers:
						_blinkers.append(material)
			else:
				_view._collect_lamps(node)
		node.free()
	_meshes[file] = mesh
	return mesh


## The light cone in the lamp mast's space: an open cone from the lens towards the ground in
## front of the mast. UV.y runs from the lens (0) to the cone's end (1).
func _build_cone() -> Mesh:
	var aim := Vector3(0.0, 0.0, AIM_DISTANCE)
	var axis := aim - LENS
	var length := axis.length() * CONE_OVERSHOOT
	var forward := axis.normalized()
	var side := Vector3.UP.cross(forward).normalized()
	var up := forward.cross(side)
	var end_radius := CONE_RADIUS * CONE_OVERSHOOT
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	# The cone's side leans outwards: its normal tilts back towards the lens.
	var slope := (end_radius - CONE_START_RADIUS) / length
	for index: int in CONE_SEGMENTS + 1:
		var angle := TAU * index / CONE_SEGMENTS
		var radial := side * cos(angle) + up * sin(angle)
		var normal := (radial - forward * slope).normalized()
		for ring: int in 2:
			var radius := CONE_START_RADIUS if ring == 0 else end_radius
			vertices.append(LENS + forward * (length * ring) + radial * radius)
			normals.append(normal)
			uvs.append(Vector2(float(index) / CONE_SEGMENTS, float(ring)))
	for index: int in CONE_SEGMENTS:
		var a := index * 2
		indices.append_array(PackedInt32Array([a, a + 1, a + 3, a, a + 3, a + 2]))
	return _array_mesh(vertices, normals, uvs, indices, _cone_material)


## The pools of light of every floodlight (mast transforms) in one mesh lying on the ground as
## drawn: a small grid per pool in front of its mast, each point on the ground's height. UV.y runs
## from the mast's side (0) to the far side (1). Null without lamps.
func _pool_sheet(lamps: Array) -> MeshInstance3D:
	_pool_count = lamps.size()
	if lamps.is_empty():
		return null
	var near := POOL_CENTRE - POOL_HALF.y
	var far := POOL_CENTRE + POOL_HALF.y
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	for placed: Transform3D in lamps:
		var first := vertices.size()
		for row: int in POOL_ROWS + 1:
			for column: int in POOL_COLUMNS + 1:
				var u := float(column) / POOL_COLUMNS
				var v := float(row) / POOL_ROWS
				var point := placed * Vector3(lerpf(-POOL_HALF.x, POOL_HALF.x, u), 0.0, lerpf(near, far, v))
				point.y = _view.ground_height(point) + POOL_LIFT
				vertices.append(point)
				normals.append(Vector3.UP)
				uvs.append(Vector2(u, v))
		for row: int in POOL_ROWS:
			for column: int in POOL_COLUMNS:
				var a := first + row * (POOL_COLUMNS + 1) + column
				var b := a + POOL_COLUMNS + 1
				indices.append_array(PackedInt32Array([a, b, a + 1, a + 1, b, b + 1]))
	var instance := MeshInstance3D.new()
	instance.name = "Pools"
	instance.mesh = _array_mesh(vertices, normals, uvs, indices, _pool_material)
	return instance


static func _array_mesh(vertices: PackedVector3Array, normals: PackedVector3Array, uvs: PackedVector2Array,
		indices: PackedInt32Array, material: Material) -> ArrayMesh:
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, material)
	return mesh
