class_name DockBuild
extends Node
## End-to-end check of docks and guests against the server, with the development account of
## tools/dev-account.cjs: place two docks next to the colony, found a guest on one, extend it
## onto the other, check the dock rules (preview and server agree), build a module on the guest
## from the host's store, and take everything down again. Leaves the colony as it was.
##
## Root script of smoke/dock_build.tscn (needs the Services autoload); run through
## tools\colony-smoke.ps1 -Scene dock_build.

const DEV_ACCOUNT := "res://.local/dev-account.json"
const HULL := "STARTER"
const MODULE := "SMELTER"
const UP := Vector3i(0, 0, 1)

var _failures := 0
var _model: ColonyModel


func _ready() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _code(result: ApiResult) -> String:
	if result.is_ok():
		return "(none)"
	return "transport: " + result.error.message if result.error.is_transport() else result.error.code


func _verdict(verdict: BuildRules.Verdict) -> String:
	return BuildRules.Verdict.keys()[verdict]


func _wait_until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


func _units(item: String) -> int:
	return _model.inventory.units(item, Services.clock.now_ms()) if _model.inventory != null else -1


func _guest() -> ColonyModel:
	var list := _model.guest_list()
	return list[0] if list.size() == 1 else null


func _send(ops: Array[Dictionary]) -> ApiResult:
	return await _model.send_ops(ops)


func _op(kind: String, host_cell: Vector3i, type: String = "") -> Dictionary:
	var at := _model.layout.to_absolute(host_cell)
	var op := {"op": kind, "x": at.x, "y": at.y, "z": at.z}
	if kind == "placeHull":
		op["hullType"] = type
	elif kind == "placeModule":
		op["moduleType"] = type
		op["rotation"] = 0
	return op


func _run() -> void:
	await get_tree().process_frame
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	if account.is_empty():
		print("FAIL  no development account (run node tools/dev-account.cjs)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	_check(signed_in == null, "sign in with the development account")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 10000)

	_model = ColonyModel.new()
	add_child(_model)
	var failed: Array[ApiError] = []
	_model.load_failed.connect(func(error: ApiError) -> void: failed.append(error))
	_model.load_home()
	await _wait_until(func() -> bool: return _model.inventory != null or not failed.is_empty(), 20000)
	_check(failed.is_empty() and _model.layout.hull_count() > 0, "colony loaded: %d hulls, %d guests" % [
		_model.layout.hull_count(), _model.guests.size()])
	if not failed.is_empty():
		get_tree().quit(1)
		return
	if not _model.guests.is_empty():
		print("FAIL  the colony already has guests; clean up by hand first")
		get_tree().quit(1)
		return

	var host := _model.layout
	var dock_item := Services.definitions.hull("DOCK").item
	var hull_item := Services.definitions.hull(HULL).item
	var module_item := Services.definitions.module(MODULE).item
	var docks_before := _units(dock_item)
	var hulls_before := _units(hull_item)
	var modules_before := _units(module_item)
	var spot := free_pair(host)
	var first: Vector3i = spot[0]
	var second: Vector3i = spot[1]
	var beyond: Vector3i = spot[2]
	print("docks at host cells %s and %s" % [first, second])

	# Two docks next to the colony.
	var docks := await _send([_op("placeHull", first, "DOCK"), _op("placeHull", second, "DOCK")])
	_check(docks.is_ok(), "place two docks -> ok (error: %s)" % _code(docks))
	await _wait_until(func() -> bool: return host.hull_at(second) == "DOCK", 8000)
	_check(host.hull_at(first) == "DOCK" and host.hull_at(second) == "DOCK", "layout shows both docks")

	# Found a guest on the first dock.
	var guests := _model.guest_layouts()
	_check(DockRules.placement(host, guests, first + UP) == DockRules.Placement.FOUND, "preview: a hull on the dock founds a guest")
	_check(DockRules.check_place_hull(host, guests, first + UP) == BuildRules.Verdict.OK, "preview: founding is allowed")
	var founded := await _send([_op("placeHull", first + UP, HULL)])
	_check(founded.is_ok(), "found a guest -> ok (error: %s)" % _code(founded))
	var results: Array = founded.data.get("results") if typeof(founded.data.get("results")) == TYPE_ARRAY else []
	var created: bool = not results.is_empty() and Wire.as_dict(results[0]).get("created") == true
	_check(created, "server: a new structure was created")
	await _wait_until(func() -> bool: return _guest() != null and _guest().layout.hull_count() == 1, 8000)
	var guest := _guest()
	_check(guest != null, "the host's layout lists the guest")
	if guest == null:
		await _clean_up(first, second, docks_before, hulls_before)
		_finish()
		return
	await _wait_until(func() -> bool: return not guest.structure_name.is_empty(), 8000)
	_check(not guest.structure_name.is_empty(), "the guest has a name (%s)" % guest.structure_name)
	_check(guest.layout.is_docked() and guest.layout.host_id == _model.structure_id, "guest anchor: docked on the host")
	_check(guest.layout.to_absolute(DockRules.guest_cell(guest.layout, first + UP)) == host.to_absolute(first + UP),
		"guest cells come out at the absolute cell that was built")
	_check(DockRules.owner_at(host, _model.guest_layouts(), first + UP) == guest.structure_id, "the cell belongs to the guest")
	await _wait_until(func() -> bool: return _units(hull_item) == hulls_before - 1, 8000)
	_check(_units(hull_item) == hulls_before - 1, "the hull came from the host's store (%d -> %d)" % [hulls_before, _units(hull_item)])

	# Extend it onto the second dock; one step further leaves the docks.
	guests = _model.guest_layouts()
	_check(DockRules.placement(host, guests, second + UP) == DockRules.Placement.EXTEND, "preview: next to the guest extends it")
	var extended := await _send([_op("placeHull", second + UP, HULL)])
	_check(extended.is_ok(), "extend the guest -> ok (error: %s)" % _code(extended))
	await _wait_until(func() -> bool: return guest.layout.hull_count() == 2, 8000)
	_check(guest.layout.hull_count() == 2, "the guest has two hulls")
	guests = _model.guest_layouts()
	var preview_beyond := DockRules.check_place_hull(host, guests, beyond + UP)
	var off_dock := await _send([_op("placeHull", beyond + UP, HULL)])
	_check(preview_beyond == BuildRules.Verdict.DOCK_AREA_TOO_SMALL and _code(off_dock) == "DOCK_AREA_TOO_SMALL",
		"off the docks: preview and server agree (preview %s, server %s)" % [_verdict(preview_beyond), _code(off_dock)])
	var preview_dock := DockRules.check_remove_hull(host, guests, host, first)
	var dock_gone := await _send([_op("removeHull", first)])
	_check(preview_dock == BuildRules.Verdict.HULL_HAS_GUEST and _code(dock_gone) == "HULL_HAS_GUEST",
		"dock under the guest: preview and server agree (preview %s, server %s)" % [_verdict(preview_dock), _code(dock_gone)])

	# A module on the guest comes from the host's store.
	var preview_module := BuildRules.check_place_module(guest.layout, Services.definitions, MODULE,
		DockRules.guest_cell(guest.layout, first + UP))
	_check(preview_module == BuildRules.Verdict.OK, "preview: module fits on the guest (%s)" % _verdict(preview_module))
	var module := await _send([_op("placeModule", first + UP, MODULE)])
	_check(module.is_ok(), "module on the guest -> ok (error: %s)" % _code(module))
	await _wait_until(func() -> bool: return _units(module_item) == modules_before - 1, 8000)
	_check(_units(module_item) == modules_before - 1, "the module came from the host's store (%d -> %d)" % [
		modules_before, _units(module_item)])
	await _wait_until(func() -> bool: return guest.layout.module_count() == 1, 8000)
	_check(guest.layout.module_count() == 1, "the guest's layout shows the module")
	guest.activate()
	await _wait_until(func() -> bool: return guest.inventory != null, 8000)
	_check(guest.inventory != null, "the guest's own store loads (%d items)" % (
		guest.inventory.item_keys().size() if guest.inventory != null else -1))
	var module_gone := await _send([_op("removeModule", first + UP)])
	_check(module_gone.is_ok(), "remove the module -> ok (error: %s)" % _code(module_gone))
	await _wait_until(func() -> bool: return _units(module_item) == modules_before, 8000)
	_check(_units(module_item) == modules_before, "the module went back to the host's store")

	await _clean_up(first, second, docks_before, hulls_before)
	_finish()


## Removes the guest (its last hull deletes it) and the docks, and checks the store is whole.
func _clean_up(first: Vector3i, second: Vector3i, docks_before: int, hulls_before: int) -> void:
	var host := _model.layout
	var guest := _guest()
	if guest != null and guest.layout.hull_count() > 1:
		var upper := await _send([_op("removeHull", second + UP)])
		_check(upper.is_ok(), "remove the guest's second hull -> ok (error: %s)" % _code(upper))
		await _wait_until(func() -> bool: return guest.layout.hull_count() == 1, 8000)
	if guest != null:
		_check(DockRules.removes_guest(guest.layout, first + UP), "preview: the last hull removes the guest")
		var last := await _send([_op("removeHull", first + UP)])
		_check(last.is_ok(), "remove the guest's last hull -> ok (error: %s)" % _code(last))
		await _wait_until(func() -> bool: return _model.guests.is_empty(), 8000)
		_check(_model.guests.is_empty(), "the guest is gone")
	var docks := await _send([_op("removeHull", first), _op("removeHull", second)])
	_check(docks.is_ok(), "remove both docks -> ok (error: %s)" % _code(docks))
	await _wait_until(func() -> bool: return host.hull_at(first).is_empty() and host.hull_at(second).is_empty(), 8000)
	await _wait_until(func() -> bool: return _units("HULL_DOCK") == docks_before and _units("HULL_" + HULL) == hulls_before, 8000)
	_check(_units("HULL_DOCK") == docks_before and _units("HULL_" + HULL) == hulls_before,
		"store as before: %d docks, %d hulls" % [_units("HULL_DOCK"), _units("HULL_" + HULL)])


func _finish() -> void:
	print("DOCK SMOKE %s  (%d failed)" % ["GREEN" if _failures == 0 else "RED", _failures])
	get_tree().quit(0 if _failures == 0 else 1)


## Three free host cells in a row leading away from the colony: two docks and the cell beyond.
static func free_pair(layout: StructureLayout) -> Array[Vector3i]:
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -1, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0)]:
			var row: Array[Vector3i] = [cell + step, cell + step * 2, cell + step * 3]
			var free := true
			for at: Vector3i in row:
				free = free and layout.hull_at(at).is_empty()
			if free:
				return row
	return [Vector3i(-1, 0, 0), Vector3i(-2, 0, 0), Vector3i(-3, 0, 0)]
