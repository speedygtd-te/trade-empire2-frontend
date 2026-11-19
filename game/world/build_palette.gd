class_name BuildPalette
extends VBoxContainer
## The build palette: category buttons (hulls, production, colony …) and below them the items of
## the chosen category in a list that scrolls up and down. Choosing an item folds the palette into
## one line ("Starter Hull ×15 · Change"), so the colony stays in view while placing it.

## The player chose what to build: "hull:STARTER" or "module:PUMP".
signal chosen(tool: String)
## The player chose how hulls are placed (HullShapes.Shape).
signal shape_chosen(shape: HullShapes.Shape)

const CATEGORY_COLUMNS := 3
## About three rows of items; the list scrolls.
const LIST_HEIGHT := 280
## Text keys of the shape switch, in the order of HullShapes.Shape.
const SHAPE_KEYS: Array[String] = ["COLONY_SHAPE_SINGLE", "COLONY_SHAPE_RECTANGLE", "COLONY_SHAPE_SQUARE"]

var _entries: Array[BuildCatalog.Entry] = []
var _category := ""
var _tool := ""
var _browsing := true

var _grid: GridContainer
var _scroll: ScrollContainer
var _list: VBoxContainer
var _empty: Label
## Why some items are not offered here (hulls that cannot stand on the active level).
var _hint: Label
var _hint_text := ""
var _compact: HBoxContainer
var _compact_label: Label
## The shape switch under a chosen hull, and why it is missing where it is (on a guest).
var _shapes: TabStrip
var _shape_note: Label
var _shapes_offered := false
var _shape_note_text := ""


func _ready() -> void:
	add_theme_constant_override("separation", 10)
	_grid = GridContainer.new()
	_grid.columns = CATEGORY_COLUMNS
	_grid.add_theme_constant_override("h_separation", 8)
	_grid.add_theme_constant_override("v_separation", 8)
	add_child(_grid)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(_scroll)
	_list = Ui.column(8)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	_empty = Ui.label("COLONY_NOTHING_TO_BUILD", AppTheme.VARIATION_MUTED)
	add_child(_empty)
	_hint = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_hint)
	_compact = HBoxContainer.new()
	_compact.add_theme_constant_override("separation", 16)
	add_child(_compact)
	_compact_label = Ui.dynamic_label()
	_compact_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_compact_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_compact_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_compact_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_compact.add_child(_compact_label)
	var change := Ui.secondary_button("COLONY_BUILD_CHANGE")
	change.pressed.connect(_on_change)
	_compact.add_child(change)
	_shapes = TabStrip.new()
	for key: String in SHAPE_KEYS:
		_shapes.add_tab(key)
	_shapes.tab_selected.connect(func(index: int) -> void: shape_chosen.emit(index as HullShapes.Shape))
	add_child(_shapes)
	_shape_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_shape_note)
	_rebuild()


## Shows what the store offers; `tool` is the item chosen now ("" when none). `hint` says what is
## left out here and why ("" for nothing).
func show_entries(entries: Array[BuildCatalog.Entry], tool: String, hint: String = "") -> void:
	_entries = entries
	_tool = tool
	_hint_text = hint
	var present := BuildCatalog.categories(entries)
	var of_tool := BuildCatalog.category_of(entries, tool)
	if not of_tool.is_empty():
		_category = of_tool
	elif not present.has(_category):
		_category = present[0] if not present.is_empty() else ""
	# Fold away while something is chosen; open again when it ran out or nothing is chosen.
	_browsing = of_tool.is_empty()
	if is_inside_tree():
		_rebuild()


## Offers the shape switch under the chosen hull (`offered`) with `shape` chosen; `note` says why
## it is not offered ("" for nothing to say).
func show_shapes(offered: bool, shape: HullShapes.Shape, note: String = "") -> void:
	_shapes_offered = offered
	_shape_note_text = note
	_shapes.select(shape)
	if is_inside_tree():
		_show_shape_row()


## Whether the shape switch is on screen (for checks).
func shapes_shown() -> bool:
	return _shapes.visible


func _show_shape_row() -> void:
	var hull_chosen := not _browsing and _tool.begins_with("hull:") and not _entries.is_empty()
	_shapes.visible = hull_chosen and _shapes_offered
	_shape_note.text = _shape_note_text
	_shape_note.visible = hull_chosen and not _shapes_offered and not _shape_note_text.is_empty()


func _rebuild() -> void:
	_show_shape_row()
	for child: Node in _grid.get_children():
		child.queue_free()
	for child: Node in _list.get_children():
		child.queue_free()
	var categories := BuildCatalog.categories(_entries)
	_empty.visible = _entries.is_empty()
	_grid.visible = _browsing and not _entries.is_empty()
	_scroll.visible = _grid.visible
	_compact.visible = not _browsing and not _entries.is_empty()
	_hint.text = _hint_text
	_hint.visible = _browsing and not _hint_text.is_empty() and _category == BuildCatalog.HULLS
	if _compact.visible:
		for entry: BuildCatalog.Entry in _entries:
			if entry.tool == _tool:
				_compact_label.text = _row_text(entry)
		return
	var group := ButtonGroup.new()
	for category: String in categories:
		var button := Button.new()
		button.toggle_mode = true
		button.button_group = group
		button.text = tr("COLONY_CATEGORY_" + category)
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.button_pressed = category == _category
		button.pressed.connect(_on_category.bind(category))
		_grid.add_child(button)
	for entry: BuildCatalog.Entry in BuildCatalog.in_category(_entries, _category):
		# A swipe that starts on a row scrolls the list (ListButton).
		var row := ListButton.new()
		row.text = _row_text(entry)
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.set_chosen(entry.tool == _tool)
		row.tapped.connect(_on_item.bind(entry.tool))
		_list.add_child(row)
	_scroll.scroll_vertical = 0


## "Mine ×12", or with a note "Mine ×12 · +6 %".
func _row_text(entry: BuildCatalog.Entry) -> String:
	if entry.note.is_empty():
		return tr("COLONY_ITEM_COUNT").format({"name": entry.display_name, "count": entry.count})
	return tr("LEVEL_ITEM_WITH_CHANGE").format({"name": entry.display_name, "count": entry.count, "change": entry.note})


func _on_category(category: String) -> void:
	_category = category
	_rebuild()


func _on_item(tool: String) -> void:
	_tool = tool
	_browsing = false
	_rebuild()
	chosen.emit(tool)


func _on_change() -> void:
	_browsing = true
	_rebuild()
