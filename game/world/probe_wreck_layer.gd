class_name ProbeWreckLayer
extends Node3D
## Impact sites of probes: a landed probe stays for good on the cell it was sent to and lies there
## as a small wreck — every player's, as the surface stream names them (draft.32 `SurfaceCell.p`),
## and the player's own landed probes from `GET /v2/probes` (the only source before draft.32).
## While a hull of any drawn structure (guests too) covers that cell on the ground level, the wreck
## is not shown; once the hull is gone it shows again.

## The wreck model (a prop); the first path that exists is used, else a small placeholder.
const MODEL_PATHS: PackedStringArray = [
	"res://game/world/models/props/probe_wreck_0.glb",
	"res://game/world/models/props/probe_wreck.glb",
	"res://game/world/models/probe_wreck.glb",
]
## Wrecks farther than this from the view's origin (cells) are left out.
const REACH := 400

static var _scene: PackedScene = null
static var _looked_up := false

var _view: ColonyView
var _landed: Array[Probes.Probe] = []


func setup(view: ColonyView) -> void:
	_view = view


## The landed probes on the body shown.
func show_landed(landed: Array[Probes.Probe]) -> void:
	_landed = landed
	redraw()


func landed() -> Array[Probes.Probe]:
	return _landed


## Places the wrecks again (the origin moved, a layout or the probes changed).
func redraw() -> void:
	for child: Node in get_children():
		child.queue_free()
	if _view == null or _view.model == null:
		return
	var size_x := _view.model.size_x
	var origin := _view.origin
	for cell: Vector2i in Probes.visible_wrecks(impacts(), covered_cells()):
		if absi(WorldGrid.wrapped_delta(origin.x, cell.x, size_x)) > REACH or absi(cell.y - origin.y) > REACH:
			continue
		var wreck := _wreck()
		wreck.position = WorldGrid.to_scene(Vector3i(cell.x, cell.y, 0), origin, size_x)
		# Each lies its own way: a quarter turn by its cell.
		wreck.rotation.y = float(GroundTiles.cell_hash(cell.x, cell.y) % 4) * PI * 0.5
		add_child(wreck)
		# Its beacon and band glow like the lamps of the colony, brighter at night.
		_view._collect_lamps(wreck)


## The impact sites near the view by cell (x wrapped): the loaded surface's and the own landed probes.
func impacts() -> Dictionary:
	var account: Account = Services.session.account if Services.session != null else null
	return Probes.impacts_by_cell(_landed, account.player_id if account != null else "",
		_view.model.surface.impacts(), _view.model.size_x)


## The probes that landed on a cell and show there (no hull over it), oldest first; empty when none.
func impacts_at(x: int, y: int) -> Array:
	var cell := Vector2i(WorldGrid.wrap_x(x, _view.model.size_x), y)
	if covered_cells().has(cell):
		return []
	var found: Array = impacts().get(cell, [])
	return found


## The cells (x wrapped) a hull of a drawn structure covers on the ground level.
func covered_cells() -> Dictionary:
	var result := {}
	var size_x := _view.model.size_x
	for structure: ColonyModel in _view.model.drawn_structures():
		var layout := structure.layout
		for cell: Vector3i in layout.hull_cells():
			var absolute := layout.to_absolute(cell)
			if absolute.z == 0:
				result[Vector2i(WorldGrid.wrap_x(absolute.x, size_x), absolute.y)] = true
	return result


static func _wreck() -> Node3D:
	if not _looked_up:
		_looked_up = true
		for path: String in MODEL_PATHS:
			if ResourceLoader.exists(path):
				_scene = load(path) as PackedScene
				break
	if _scene != null:
		return _scene.instantiate() as Node3D
	return _placeholder()


## Until the model exists: a small dark, tilted capsule with a scorched base.
static func _placeholder() -> Node3D:
	var holder := Node3D.new()
	var body := CapsuleMesh.new()
	body.radius = 0.09
	body.height = 0.42
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color(0.32, 0.33, 0.36)
	metal.metallic = 0.4
	metal.roughness = 0.6
	body.material = metal
	var hull := MeshInstance3D.new()
	hull.mesh = body
	hull.rotation = Vector3(0.0, 0.0, deg_to_rad(68.0))
	hull.position = Vector3(0.0, 0.1, 0.0)
	holder.add_child(hull)
	var scorch := CylinderMesh.new()
	scorch.top_radius = 0.32
	scorch.bottom_radius = 0.32
	scorch.height = 0.01
	var soot := StandardMaterial3D.new()
	soot.albedo_color = Color(0.08, 0.07, 0.06, 0.7)
	soot.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	scorch.material = soot
	var mark := MeshInstance3D.new()
	mark.mesh = scorch
	mark.position = Vector3(0.0, 0.005, 0.0)
	mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	holder.add_child(mark)
	return holder
