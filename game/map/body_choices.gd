class_name BodyChoices
extends VBoxContainer
## A short list of the bodies under a tap on the system map when none was clearly the one meant
## (the inner planets close together at the overview): a button per body, nearest first, with its
## short name (as on the map) and kind; a choice selects it, "Close" or Back drops the list.

## A body of the list was chosen.
signal chosen(body_id: String)
## The player closed the list.
signal closed

var _ids := PackedStringArray()
var _rows: VBoxContainer


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	add_child(header)
	var title := Ui.label("MAP_WHICH_BODY", AppTheme.VARIATION_HEADING)
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(title)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(func() -> void: closed.emit())
	header.add_child(close)
	_rows = Ui.column(8)
	add_child(_rows)


## Lists `body_ids` of `map` (nearest first) to choose from.
func show_bodies(map: SystemMap, body_ids: PackedStringArray) -> void:
	_ids = body_ids
	for child: Node in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	for index: int in body_ids.size():
		var body := map.body(body_ids[index])
		if body == null:
			continue
		var button := Ui.secondary_button("")
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.text = tr("MAP_BODY_CHOICE").format({"name": SystemMap.short_name(body.name, map.star_name),
			"type": BodyPanel.type_text(body.type, self)})
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.pressed.connect(choose.bind(index))
		_rows.add_child(button)


## How many bodies the list offers.
func choice_count() -> int:
	return _rows.get_child_count() if _rows != null else 0


## Chooses the `index`-th body of the list (nearest first).
func choose(index: int) -> void:
	if index >= 0 and index < _ids.size():
		chosen.emit(_ids[index])
