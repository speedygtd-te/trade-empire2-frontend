class_name EnterpriseTab
extends VBoxContainer
## Common ground of the enterprise panel's tabs: the model, a result line at the bottom, one
## action at a time, two-step confirmation for destructive actions and small builders.

var model: EnterpriseModel
## The action waiting for its second tap; "" when none.
var armed := ""
var busy := false
var _note: Label


func setup(enterprise_model: EnterpriseModel) -> void:
	model = enterprise_model


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_build()
	_note = Ui.dynamic_label()
	_note.visible = false
	add_child(_note)
	refresh()


## Builds the controls (once).
func _build() -> void:
	pass


## Shows the model's current state.
func refresh() -> void:
	pass


## Called when the tab is shown.
func shown() -> void:
	pass


## Back closes something inside the tab; false when there was nothing to close.
func handle_back() -> bool:
	if not armed.is_empty():
		armed = ""
		refresh()
		return true
	return false


## The result line: a finished text in a colour; "" hides it.
func say(text: String, color: Color = AppTheme.COLOR_OK) -> void:
	if _note == null:
		return
	_note.text = text
	_note.add_theme_color_override("font_color", color)
	_note.visible = not text.is_empty()


func say_error(error: ApiError) -> void:
	say(ErrorText.describe(error, self), AppTheme.COLOR_DANGER)


## Runs one action: nothing while another runs; the result line tells how it went.
func run(action: Callable, done_key: String = "") -> bool:
	if busy:
		return false
	busy = true
	armed = ""
	say("")
	var result: ApiResult = await action.call()
	busy = false
	if not is_inside_tree():
		return result.is_ok()
	if result.is_ok():
		say(tr(done_key) if not done_key.is_empty() else "")
	else:
		say_error(result.error)
	refresh()
	return result.is_ok()


## Two-step confirmation: true on the second tap of the same action.
func confirm(action: String) -> bool:
	if armed == action:
		armed = ""
		return true
	armed = action
	say("")
	refresh()
	return false


## A scrolling column that takes the free height.
func scroll_column(parent: Container, separation: int = 12) -> VBoxContainer:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	parent.add_child(scroll)
	var column := Ui.column(separation)
	scroll.add_child(column)
	return column


## Scrolls the list a control sits in so that it is visible (a warning below a button).
static func reveal(control: Control) -> void:
	var node := control.get_parent()
	while node != null and not (node is ScrollContainer):
		node = node.get_parent()
	var scroll := node as ScrollContainer
	if scroll == null or not scroll.is_inside_tree():
		return
	# The rows are laid out during this frame: scroll on the next one.
	# Weak references: a rebuild in between frees both, and a lambda must not hold freed nodes.
	var scroll_ref: WeakRef = weakref(scroll)
	var control_ref: WeakRef = weakref(control)
	var show := func() -> void:
		var list := scroll_ref.get_ref() as ScrollContainer
		var target := control_ref.get_ref() as Control
		if list != null and target != null and target.is_inside_tree():
			list.ensure_control_visible(target)
	scroll.get_tree().process_frame.connect(show, CONNECT_ONE_SHOT)


## "1 member" / "3 members".
static func members_text(count: int, translator: Object) -> String:
	return translator.tr("ENTERPRISE_ONE_MEMBER") if count == 1 else \
		translator.tr("ENTERPRISE_MEMBERS_COUNT").format({"count": count})


## A panel with a column for its rows.
static func card(parent: Container) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(panel)
	var rows := Ui.column(10)
	panel.add_child(rows)
	return rows


static func clear(container: Node) -> void:
	for child: Node in container.get_children():
		container.remove_child(child)
		child.queue_free()


## A label with a finished text.
static func text_label(parent: Container, text: String, variation: String = "") -> Label:
	var label := Ui.dynamic_label(variation)
	label.text = text
	parent.add_child(label)
	return label


## A row of buttons sharing the width.
static func button_row(parent: Container) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	parent.add_child(row)
	return row


## A button with a finished text (two-step buttons change their text).
static func action_button(parent: Container, text: String, danger: bool = false, primary: bool = false) -> Button:
	var button := Ui.secondary_button("")
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.text = text
	if danger:
		button.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	elif primary:
		button.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
	parent.add_child(button)
	return button


## The name of a player the enterprise knows; a neutral placeholder otherwise (never the id).
func player_text(player: String) -> String:
	var known := ""
	if model.mine != null:
		known = model.mine.player_name(player)
	if known.is_empty() and player == model.player_id() and model.account != null:
		known = model.account.player_name
	return known if not known.is_empty() else tr("ENTERPRISE_SOMEONE")


## The name of a faction; a neutral placeholder when unknown.
func faction_text(faction: String) -> String:
	var known := model.faction_name(faction)
	if not known.is_empty():
		return known
	return tr("DIPLOMACY_UNKNOWN_ENTERPRISE") if Diplomacy.is_enterprise(faction) else tr("DIPLOMACY_UNKNOWN_PLAYER")


## "Iron, Water" style amounts of goods: "1 234 Iron".
static func goods_text(key: String, micro: int, translator: Object) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	if shown.is_empty():
		shown = translator.tr("STORE_UNKNOWN_ITEM")
	@warning_ignore("integer_division")
	return "%s %s" % [AmountFormat.units(micro / maxi(scale, 1)), shown]


static func resource_text(key: String, translator: Object) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else translator.tr("STORE_UNKNOWN_ITEM")


static func flag_text(flag: String, translator: Object) -> String:
	return translator.tr("ENTERPRISE_FLAG_" + flag) if Enterprise.FLAGS.has(flag) else translator.tr("ENTERPRISE_FLAG_OTHER")


static func flags_text(flags: PackedStringArray, translator: Object) -> String:
	if flags.is_empty():
		return translator.tr("ENTERPRISE_NO_RIGHTS")
	var parts := PackedStringArray()
	for flag: String in flags:
		parts.append(flag_text(flag, translator))
	return ", ".join(parts)
