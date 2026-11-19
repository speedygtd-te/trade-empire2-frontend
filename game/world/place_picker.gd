class_name PlacePicker
extends Control
## The player's places, opened from the Base head: every body with own structures standing or
## docked there (Fleet.places), e.g. "Tertius · 2 structures", the current one marked. A tap
## chooses the place's main structure. "‹ Back" or Back closes it.

## A place was chosen: its body and the structure to show there.
signal chosen(body_id: String, structure_id: int)
signal closed

var _fleet: FleetModel
var _current_body := ""
var _list: VBoxContainer
var _state: Label


## `current_body`: the body Base shows now (marked).
func setup(fleet: FleetModel, current_body: String) -> void:
	_fleet = fleet
	_current_body = current_body


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	var column := Ui.column(16)
	margin.add_child(column)
	var header := LayerHeader.new()
	header.set_title(tr("PLACES_TITLE"))
	header.back_pressed.connect(func() -> void: closed.emit())
	column.add_child(header)
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	column.add_child(_state)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	_list = Ui.column(10)
	scroll.add_child(_list)
	_fleet.changed.connect(_rebuild)
	_rebuild()
	if not _fleet.loaded:
		_fleet.reload()


func handle_back() -> bool:
	return false


## How many places are listed (for review scenes).
func place_count() -> int:
	return _list.get_child_count()


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	if not _fleet.loaded:
		_state.text = tr("FLEET_LOAD_FAILED") + "\n" + ErrorText.describe(_fleet.error, self) \
			if _fleet.error != null else tr("FLEET_LOADING")
		_state.visible = true
		return
	var places := _fleet.fleet.places()
	_state.visible = places.is_empty()
	_state.text = tr("PLACES_EMPTY")
	for place: Fleet.Place in places:
		var names := PackedStringArray()
		for id: int in place.structure_ids:
			var entry := _fleet.fleet.find(id)
			if entry != null:
				names.append(entry.name)
		var body := _fleet.body_name(place.body_id)
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.set_chosen(place.body_id == _current_body)
		row.text = "%s\n%s" % [tr("PLACES_ROW").format({"body": body if not body.is_empty() else tr("FLEET_UNKNOWN_PLACE"),
			"count": place.structure_ids.size()}), ", ".join(names)]
		var body_id := place.body_id
		var main_id := place.main_id
		row.tapped.connect(func() -> void: chosen.emit(body_id, main_id))
		_list.add_child(row)
