extends Control
## Pictures of the member unlocks of an enterprise (draft.39, package 3) for review, and what live
## says, with enterprise account A (`.local/enterprise-a-account.json`).
##
## Live: the game data (`owners`, `enterpriseBuildable`, `memberUnlocksBlueprints`, the extraction
## focus), A founds an enterprise and the research tab shows "Unlocks for all members" per tech;
## the recipe list of a Factory says the enterprise has to research Mining Efficiency first.
##
## Then made-up states no test account reaches (Mining Efficiency costs 1 500 units per resource
## from taxes and needs a flagship): the recipe unlocked by the enterprise and, after leaving,
## locked for non-members; A's own base with two modules posing as a Mining Optimizer and an
## Observation Uplink — the optimizer with the extractors it reaches, a mine with its bonus,
## both inactive (NO_ENTERPRISE); the Research Network Node; the probe map with areas and a
## sighting shared by the Cartography Archive. Those files end in `_SAMPLE`; nothing is sent.
## The enterprise is dissolved at the end.
##
##   godot --path . --resolution 720x1280 res://smoke/member_links_view.tscn -- --out=build/members

const ACCOUNT_A := "res://.local/enterprise-a-account.json"

var _out_dir := "user://members"
var _model: EnterpriseModel


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT_A)))
	if account.is_empty():
		print("SKIP  no account %s" % ACCOUNT_A)
		get_tree().quit(2)
		return
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 15000)
	_live_definitions()
	_model = EnterpriseModel.new()
	add_child(_model)
	await _model.reload()
	if _model.mine == null:
		var names := Enterprise.suggestions_from_wire((await _model.suggest_names()).data)
		if not names.is_empty():
			print("LIVE  A founds %s: %s" % [names[0].name, _code(await _model.found(names[0], "Member unlocks review.", false))])
	await _research_views()
	await _recipe_views()
	await _inspect_views()
	await _probe_map_view()
	await _model.reload()
	if _model.mine != null:
		print("LIVE  enterprise dissolved: %s" % _code(await _model.dissolve()))
	get_tree().quit(0)


func _live_definitions() -> void:
	var definitions := Services.definitions
	var with_owners := 0
	var enterprise_buildable := 0
	for key: String in definitions.module_keys():
		var entry := definitions.module(key)
		if entry.allows("enterprise"):
			with_owners += 1
		if entry.enterprise_buildable:
			enterprise_buildable += 1
	print("LIVE  contract %s, owners from the data %s (derived %s), %d modules enterprises may hold, %d the factory builds" % [
		Contract.VERSION, definitions.owners_known, definitions.owners_derived, with_owners, enterprise_buildable])
	for key: String in [MemberLinks.OPTIMIZER, MemberLinks.UPLINK, MemberLinks.NODE, MemberLinks.PLATFORM]:
		var entry := definitions.module(key)
		print("LIVE  %s: %s" % [key, ("owners %s, focus %d" % [",".join(entry.owners), entry.emission_strength(MemberLinks.EXTRACTION_FOCUS)])
			if entry != null else "missing"])
	print("LIVE  MINE reacts to the focus with %d, decay %d" % [
		definitions.module("MINE").sensitivity(MemberLinks.EXTRACTION_FOCUS), definitions.emission_decay(MemberLinks.EXTRACTION_FOCUS)])
	for tech: ResearchCatalog.Tech in definitions.research.techs():
		if not tech.member_unlocks_blueprints.is_empty():
			print("LIVE  %s unlocks for members: %s" % [tech.key, ",".join(tech.member_unlocks_blueprints)])


func _research_views() -> void:
	if _model.mine == null:
		print("SKIP  A is in no enterprise")
		return
	var panel := EnterprisePanel.new()
	panel.setup(_model)
	add_child(panel)
	panel.show_tab_key("ENTERPRISE_TAB_RESEARCH")
	await _until(func() -> bool: return _model.research != null, 8000)
	var count := 0
	for tech: EnterpriseResearch.Tech in _model.research.techs:
		if not tech.member_unlocks.is_empty():
			count += 1
			print("LIVE  research %s memberUnlocks %s" % [tech.key, ",".join(tech.member_unlocks)])
	print("LIVE  %d techs with member unlocks, member blueprints now %d" % [count, _model.research.member_blueprints().size()])
	var tab := panel.current_tab() as EnterpriseResearchTab
	# Scroll the E2/E3 techs with member unlocks into view: the tier 1 rows first.
	tab._chosen = "ET_MINING_EFFICIENCY"
	tab.refresh()
	await get_tree().process_frame
	await _scroll_to(tab, "Mining Efficiency")
	await _capture("member_research_detail")
	panel.queue_free()


func _scroll_of(node: Node) -> ScrollContainer:
	for child: Node in node.get_children():
		if child is ScrollContainer:
			return child as ScrollContainer
		var found := _scroll_of(child)
		if found != null:
			return found
	return null


## The Factory's recipes: live (the enterprise has not researched Mining Efficiency), then the
## recipe unlocked by the enterprise and, out of any enterprise, locked for non-members.
func _recipe_views() -> void:
	var research := await Services.api.get_json("/v2/research")
	var usable: Dictionary = {}
	if research.is_ok():
		var state := ResearchState.from_wire(research.data)
		for key: String in state.blueprints.keys():
			usable[key] = true
	var member := "MINING_OPTIMIZER_MANUFACTURING"
	print("LIVE  /v2/research lists %s: %s" % [member, usable.has(member)])
	var panel := RecipePanel.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(panel)
	panel.show_recipes("FACTORY", "", usable)
	await _scroll_to(panel, "Mining Optimizer")
	await _capture("member_recipe_locked")
	usable[member] = true
	panel.show_recipes("FACTORY", "", usable)
	await _scroll_to(panel, "Mining Optimizer")
	await _capture("member_recipe_unlocked_SAMPLE")
	usable.erase(member)
	var account := Services.session.account
	var real := account.enterprise_id
	account.enterprise_id = ""
	panel.show_recipes("FACTORY", "", usable)
	await _scroll_to(panel, "Mining Optimizer")
	await _capture("member_recipe_not_member_SAMPLE")
	account.enterprise_id = real
	panel.queue_free()


func _scroll_to(panel: Node, prefix: String) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	var scroll := _scroll_of(panel)
	if scroll == null:
		return
	# The row on top of the visible part, whatever follows below it.
	for row: Node in scroll.get_child(0).get_children():
		if row is Button and (row as Button).text.begins_with(prefix):
			scroll.scroll_vertical = int((row as Control).position.y)
			return


## A's base with an extractor and a module beside it posing as a Mining Optimizer (made up).
func _inspect_views() -> void:
	var colony := ColonyScreen.new()
	add_child(colony)
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._model.layout.rev >= 0, 30000)
	await get_tree().create_timer(4.0).timeout
	var model := colony._model
	var layout := model.layout
	var definitions := Services.definitions
	var extractor: StructureLayout.Module = null
	var beside: StructureLayout.Module = null
	for placed: StructureLayout.Module in layout.modules():
		var entry := definitions.module(placed.module_type)
		if entry == null or entry.sensitivity(MemberLinks.EXTRACTION_FOCUS) <= 0 or placed.size != Vector3i.ONE:
			continue
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]:
			var near := layout.module_at(placed.origin + step)
			if near != null and near.size == Vector3i.ONE and near.module_id != placed.module_id:
				extractor = placed
				beside = near
				break
		if extractor != null:
			break
	if extractor == null:
		print("SKIP  no extractor with a neighbour in A's base")
		colony.queue_free()
		return
	colony._select_structure(true)
	colony._open_structure(ColonyScreen.Mode.VIEW)
	await get_tree().create_timer(1.0).timeout
	var real_type := beside.module_type
	beside.module_type = MemberLinks.OPTIMIZER
	model.idle_reasons.erase(beside.module_id)
	colony._select(layout.to_absolute(beside.origin))
	await _capture("member_inspect_optimizer_SAMPLE")
	print("SAMPLE  optimizer: %s" % colony._scope.text)
	colony._select(layout.to_absolute(extractor.origin))
	await _capture("member_inspect_mine_bonus_SAMPLE")
	print("SAMPLE  extractor: %s" % colony._info.text.replace("\n", " / "))
	model.idle_reasons[beside.module_id] = MemberLinks.IDLE_NO_ENTERPRISE
	colony._select(layout.to_absolute(beside.origin))
	await _capture("member_inspect_optimizer_off_SAMPLE")
	colony._select(layout.to_absolute(extractor.origin))
	colony._refresh()
	print("SAMPLE  extractor, optimizer off: %s" % colony._info.text.replace("\n", " / "))
	beside.module_type = MemberLinks.UPLINK
	colony._select(layout.to_absolute(beside.origin))
	await _capture("member_inspect_uplink_off_SAMPLE")
	model.idle_reasons.erase(beside.module_id)
	colony._refresh()
	await _capture("member_inspect_uplink_on_SAMPLE")
	beside.module_type = MemberLinks.NODE
	colony._refresh()
	await _capture("member_inspect_node_SAMPLE")
	print("SAMPLE  node: %s" % colony._scope.text)
	beside.module_type = real_type
	colony._select(null)
	colony.queue_free()


## The probe map of A's home body with own areas and areas and a sighting shared by the archive.
func _probe_map_view() -> void:
	var fleet := FleetModel.new()
	add_child(fleet)
	fleet.reload()
	await _until(func() -> bool: return fleet.loaded, 15000)
	var body := Services.session.account.home_body_id
	var screen := ProbeTargetScreen.new()
	screen.setup_view(fleet, body)
	add_child(screen)
	await _until(func() -> bool: return screen._size_x > 0, 15000)
	await get_tree().create_timer(1.0).timeout
	var own := screen._own_cells()
	var at := own[0] if not own.is_empty() else Vector2i.ZERO
	var live := screen._map.reveal
	var areas: Array = [{"x0": at.x, "y0": at.y, "radius": 60, "since": 1, "source": "home"}]
	if live != null:
		areas.clear()
		for area: RevealMap.Area in live.areas:
			areas.append({"x0": area.x0, "y0": area.y0, "x1": area.x1, "y1": area.y1, "radius": area.radius,
				"since": area.since, "source": area.source})
	# Sizes in units of the home area, so the picture works at any body size.
	var r := 60
	if live != null and not live.areas.is_empty():
		r = maxi(live.areas[0].radius, 10)
	areas.append({"x0": at.x + 3 * r, "y0": at.y + r, "radius": r, "since": 2, "source": "probe", "sharedBy": "42"})
	areas.append({"x0": at.x - 3 * r, "y0": at.y - 2 * r, "x1": at.x - r, "y1": at.y - 3 * r, "radius": int(r * 0.5), "since": 3,
		"source": "vehicle", "sharedBy": "enterprise"})
	var sample := RevealMap.from_wire({"bodyId": body, "fog": true, "areas": areas, "sightings": [
		{"structureId": 1, "ownerId": "42", "ownerName": "Mira", "x": at.x + 3 * r, "y": at.y + r, "hulls": 30,
			"seenAt": Services.clock.now_ms() - 7200000, "probeId": 3, "footprint": [], "sharedBy": "42"}]})
	screen._map.reveal = sample
	screen._map.show_body(screen._size_x, screen._size_y, at, 10.0 * r)
	screen._refresh()
	await _capture("member_probe_map_shared_SAMPLE")
	print("SAMPLE  probe map: %s" % screen._lines.text.replace("\n", " / "))
	screen.queue_free()


func _code(result: ApiResult) -> String:
	return "ok" if result.is_ok() else "%s (%d)" % [result.error.code, result.error.http_status]


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
