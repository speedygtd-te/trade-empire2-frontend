class_name ModuleMover
extends RefCounted
## Moves the moving parts of the module models on screen (ModuleMotion): collects the "move_*"
## nodes of every module ColonyView builds, keeps how far each has moved, and sets their pose
## each frame. A part moves as fast as its module works; at activity 0 it stops where it is.
## Solar panels turn towards the sun by day and swing back to rest at night or when idle.

## How quickly a solar panel follows its target (share of the way per second).
const PANEL_FOLLOW := 0.6


class _Part:
	extends RefCounted
	var node: Node3D
	## The module's model the part belongs to, and where it stands (scene x, z) when taken.
	var root: Node3D
	var at := Vector2.ZERO
	var rest := Transform3D.IDENTITY
	var role := ""
	var kind: ModuleMotion.Kind = ModuleMotion.Kind.SPIN
	var phase := 0.0
	var progress := 0.0
	var activity := 1.0
	var structure: ColonyModel
	var module: StructureLayout.Module


var _parts: Array[_Part] = []


func clear() -> void:
	_parts.clear()


## Lets go of the parts of models that were taken away (freed or queued for it; ColonyView keeps
## the others).
func prune() -> void:
	var kept: Array[_Part] = []
	for part: _Part in _parts:
		if is_instance_valid(part.root) and not part.root.is_queued_for_deletion():
			kept.append(part)
	_parts = kept


## Takes the moving parts of one module's model (its node from ColonyView).
func add(model_node: Node3D, structure: ColonyModel, module: StructureLayout.Module) -> void:
	var index := 0
	for found: Node in model_node.find_children(ModuleMotion.PREFIX + "*", "Node3D", true, false):
		var node := found as Node3D
		var role := ModuleMotion.role_of(String(node.name))
		if role.is_empty():
			continue
		var part := _Part.new()
		part.node = node
		part.root = model_node
		part.at = Vector2(model_node.position.x, model_node.position.z)
		part.rest = node.transform
		part.role = role
		part.kind = ModuleMotion.kind_of(role)
		part.phase = float(absi(hash(module.module_id * 31 + index)) % 1000) / 1000.0
		# Start part-way, so a freshly built colony does not start in step.
		part.progress = part.phase * 60.0
		part.structure = structure
		part.module = module
		part.activity = structure.module_activity(module)
		_parts.append(part)
		index += 1


## The rate solution changed: every part takes its module's activity again.
func refresh_activity() -> void:
	for part: _Part in _parts:
		part.activity = part.structure.module_activity(part.module)


func count() -> int:
	return _parts.size()


## Advances every part by `delta` seconds. `to_sun`: unit vector towards the sun in scene space;
## `sun_up`: whether it stands high enough for the panels to follow it. Only parts within `reach`
## of `centre` (scene x, z: the camera's view) move; the others wait where they are, so a large
## colony costs only what is on screen (a negative reach moves all).
func step(delta: float, to_sun: Vector3, sun_up: bool, centre: Vector2 = Vector2.ZERO, reach: float = -1.0) -> void:
	var limit := reach * reach
	for part: _Part in _parts:
		if reach >= 0.0 and part.at.distance_squared_to(centre) > limit:
			continue
		if not is_instance_valid(part.node):
			continue
		if part.kind == ModuleMotion.Kind.SUN:
			_follow_sun(part, delta, to_sun, sun_up)
			continue
		if part.activity <= 0.0:
			continue
		part.progress += delta * part.activity
		part.node.transform = part.rest * ModuleMotion.offset(part.role, part.progress, part.phase)


func _follow_sun(part: _Part, delta: float, to_sun: Vector3, sun_up: bool) -> void:
	var target := part.rest.basis
	if sun_up and part.activity > 0.0 and part.node.is_inside_tree():
		var parent := part.node.get_parent() as Node3D
		if parent != null:
			var local := (parent.global_basis.inverse() * to_sun).normalized()
			target = ModuleMotion.sun_basis(local)
	var now := part.node.basis.get_rotation_quaternion()
	var wanted := target.get_rotation_quaternion()
	if now.is_equal_approx(wanted):
		return
	var turned := now.slerp(wanted, clampf(PANEL_FOLLOW * delta, 0.0, 1.0))
	part.node.transform = Transform3D(Basis(turned), part.rest.origin)
