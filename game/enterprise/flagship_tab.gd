class_name EnterpriseFlagshipTab
extends EnterpriseTab
## The enterprise's flagship (draft.37). None yet (or destroyed): the price with what the
## inventory holds and what is missing (red), where it is delivered (a body where the player has
## a structure, chosen in the places list) and "Order flagship" in two steps — only with
## MANAGE_TREASURY, otherwise the reason. Ordered: the countdown to the delivery. Active: where it
## is, whether the Enterprise Lab works, the administrations and the member cap, and "Show in
## Base". Loaded again every minute while shown; the countdown runs every second.

const RELOAD_SECONDS := 60.0
const TICK_SECONDS := 1.0

var _column: VBoxContainer
var _state: Label
## The body the flagship is to be delivered to; "" until chosen.
var _body_id := ""
var _picker: PlacePicker = null
var _countdown: Label = null
var _progress: ProgressBar = null
var _tick := 0.0
var _reload := 0.0


func _build() -> void:
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_column = scroll_column(self, 14)
	model.flagship_changed.connect(refresh)
	model.stock_changed.connect(refresh)
	model.changed.connect(refresh)
	if model.fleet != null:
		model.fleet.changed.connect(refresh)


func shown() -> void:
	model.reload_flagship()
	_reload = RELOAD_SECONDS
	if model.fleet != null and not model.fleet.loaded:
		model.fleet.reload()


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_tick -= delta
	if _tick <= 0.0:
		_tick = TICK_SECONDS
		_update_countdown()
	_reload -= delta
	if _reload <= 0.0:
		_reload = RELOAD_SECONDS
		model.reload_flagship()


func refresh() -> void:
	if _column == null:
		return
	clear(_column)
	_countdown = null
	_progress = null
	var flagship := model.flagship
	_state.visible = flagship == null
	if flagship == null:
		_state.text = tr("COMMON_LOADING") if model.flagship_error == null else \
			tr("ENTERPRISE_FLAGSHIP_LOAD_FAILED") + "\n" + ErrorText.describe(model.flagship_error, self)
		if model.flagship_error != null:
			var retry := Ui.secondary_button("COMMON_RETRY")
			retry.pressed.connect(func() -> void: model.reload_flagship())
			_column.add_child(retry)
		return
	match flagship.status:
		EnterpriseFlagship.ORDERED:
			_show_ordered(flagship)
		EnterpriseFlagship.ACTIVE:
			_show_active(flagship)
		_:
			_show_offer(flagship)
	_show_cap(flagship)


# --- states -----------------------------------------------------------------------------------

func _show_ordered(flagship: EnterpriseFlagship) -> void:
	var status := card(_column)
	var title := text_label(status, tr("ENTERPRISE_FLAGSHIP_ORDERED"), AppTheme.VARIATION_HEADING)
	title.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	_countdown = text_label(status, "")
	_progress = bar(status, 0.0)
	text_label(status, tr("ENTERPRISE_FLAGSHIP_ORDERED_NOTE"), AppTheme.VARIATION_MUTED)
	_update_countdown()


func _show_active(flagship: EnterpriseFlagship) -> void:
	var status := card(_column)
	var title := text_label(status, tr("ENTERPRISE_FLAGSHIP_ACTIVE"), AppTheme.VARIATION_HEADING)
	title.add_theme_color_override("font_color", AppTheme.COLOR_OK)
	var entry: Fleet.Entry = model.fleet.fleet.find(flagship.structure_id) if model.fleet != null else null
	if entry != null:
		text_label(status, entry.name)
		text_label(status, FleetPanel.status_text(model.fleet, entry, Services.clock.now_ms(), self, false), AppTheme.VARIATION_MUTED)
	var lab := text_label(status, tr("ENTERPRISE_FLAGSHIP_LAB_WORKING") if flagship.lab_running else tr("ENTERPRISE_FLAGSHIP_LAB_IDLE"))
	lab.add_theme_color_override("font_color", AppTheme.COLOR_OK if flagship.lab_running else AppTheme.COLOR_PENDING)
	text_label(status, tr("ENTERPRISE_FLAGSHIP_ADMINISTRATIONS").format({"count": flagship.administrations}), AppTheme.VARIATION_MUTED)
	var open := Ui.primary_button("ENTERPRISE_FLAGSHIP_SHOW")
	open.disabled = flagship.structure_id == 0
	var id := flagship.structure_id
	open.pressed.connect(func() -> void: model.show_structure(id))
	status.add_child(open)
	if not holds(Enterprise.FLAG_FLEET):
		text_label(status, tr("ENTERPRISE_FLAGSHIP_COMMAND_NOTE").format({"right": flag_text(Enterprise.FLAG_FLEET, self)}),
			AppTheme.VARIATION_MUTED)


## No flagship (or a destroyed one): the price and the order.
func _show_offer(flagship: EnterpriseFlagship) -> void:
	var status := card(_column)
	if flagship.status == EnterpriseFlagship.DESTROYED:
		var title := text_label(status, tr("ENTERPRISE_FLAGSHIP_DESTROYED"), AppTheme.VARIATION_HEADING)
		title.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		var ago := maxi(Services.clock.now_ms() - flagship.destroyed_at, 0)
		text_label(status, tr("ENTERPRISE_FLAGSHIP_DESTROYED_NOTE").format({"duration": TimeFormat.duration(ago)}), AppTheme.VARIATION_MUTED)
	else:
		text_label(status, tr("ENTERPRISE_FLAGSHIP_NONE"), AppTheme.VARIATION_HEADING)
	text_label(status, tr("ENTERPRISE_FLAGSHIP_INTRO").format({"duration": TimeFormat.duration(flagship.delivery_ms)}),
		AppTheme.VARIATION_MUTED)

	var price := card(_column)
	price.add_child(Ui.label("ENTERPRISE_FLAGSHIP_PRICE", AppTheme.VARIATION_MUTED))
	for item: EnterpriseFlagship.PriceItem in flagship.price:
		_price_row(price, item)
	var total := text_label(price, tr("ENTERPRISE_FLAGSHIP_TOTAL").format({"total": _units(flagship.total_price())}))
	total.add_theme_color_override("font_color", AppTheme.COLOR_OK if flagship.affordable() else AppTheme.COLOR_DANGER)

	var order := card(_column)
	_ensure_body()
	var where := action_button(order, tr("ENTERPRISE_FLAGSHIP_BODY").format({"body": _body_text()}))
	where.disabled = busy or model.fleet == null
	where.pressed.connect(open_body_picker)
	var reason := flagship.order_blocker(holds(Enterprise.FLAG_TREASURY), _body_id)
	var armed_now := armed == "order"
	var button := action_button(order, tr("ENTERPRISE_FLAGSHIP_ORDER_CONFIRM").format({"total": _units(flagship.total_price())})
		if armed_now else tr("ENTERPRISE_FLAGSHIP_ORDER"), false, true)
	button.disabled = busy or not reason.is_empty()
	button.pressed.connect(_on_order)
	if not reason.is_empty():
		var why := text_label(order, _reason_text(reason), AppTheme.VARIATION_MUTED)
		why.add_theme_color_override("font_color", AppTheme.COLOR_DANGER if reason == "stock" else AppTheme.COLOR_MUTED)
	elif armed_now:
		var warning := text_label(order, tr("ENTERPRISE_FLAGSHIP_ORDER_WARNING").format({"body": _body_text()}))
		warning.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		reveal(warning)


func _price_row(parent: Container, item: EnterpriseFlagship.PriceItem) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	parent.add_child(row)
	row.add_child(Ui.resource_icon(item.resource))
	var texts := Ui.column(2)
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(texts)
	text_label(texts, resource_text(item.resource, self))
	var have := text_label(texts, tr("ENTERPRISE_FLAGSHIP_HAVE").format({"have": _units(mini(item.available, item.amount)),
		"need": _units(item.amount)}), AppTheme.VARIATION_MUTED)
	if item.missing > 0:
		var short := text_label(texts, tr("ENTERPRISE_FLAGSHIP_MISSING").format({"missing": _units(item.missing)}))
		short.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	else:
		have.add_theme_color_override("font_color", AppTheme.COLOR_OK)


## Members and the cap; how administrations raise it.
func _show_cap(flagship: EnterpriseFlagship) -> void:
	var cap := card(_column)
	cap.add_child(Ui.label("ENTERPRISE_MEMBERS", AppTheme.VARIATION_MUTED))
	var line := text_label(cap, tr("ENTERPRISE_MEMBERS_OF_CAP").format({"count": flagship.member_count, "cap": flagship.member_cap}))
	if flagship.member_count >= flagship.member_cap:
		line.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	text_label(cap, tr("ENTERPRISE_CAP_NOTE"), AppTheme.VARIATION_MUTED)


func _update_countdown() -> void:
	var flagship := model.flagship
	if flagship == null or _countdown == null or not is_instance_valid(_countdown):
		return
	var now := Services.clock.now_ms()
	_countdown.text = tr("ENTERPRISE_FLAGSHIP_ARRIVES").format({"body": _body_name(flagship.body_id),
		"duration": TimeFormat.duration(flagship.remaining_ms(now))})
	if _progress != null and is_instance_valid(_progress):
		_progress.value = flagship.delivery_progress(now)


# --- delivery body ----------------------------------------------------------------------------

## Opens the places list to choose where the flagship is delivered.
func open_body_picker() -> PlacePicker:
	if model.fleet == null or ScreenStack.is_open(_picker):
		return null
	_picker = PlacePicker.new()
	_picker.setup(model.fleet, _body_id)
	_picker.chosen.connect(func(body_id: String, _structure: int) -> void:
		_body_id = body_id
		armed = ""
		ScreenStack.close_layer(_picker)
		_picker = null
		refresh())
	ScreenStack.push_onto(self, _picker)
	return _picker


## Takes the first place of the player when nothing is chosen (or the chosen one is gone).
func _ensure_body() -> void:
	if model.fleet == null:
		return
	var places := model.fleet.fleet.places()
	for place: Fleet.Place in places:
		if place.body_id == _body_id:
			return
	_body_id = places[0].body_id if not places.is_empty() else ""


func _body_text() -> String:
	return _body_name(_body_id) if not _body_id.is_empty() else tr("ENTERPRISE_FLAGSHIP_NO_BODY")


func _body_name(body_id: String) -> String:
	var known := model.fleet.body_name(body_id) if model.fleet != null else ""
	return known if not known.is_empty() else tr("FLEET_UNKNOWN_PLACE")


func _reason_text(reason: String) -> String:
	match reason:
		"right":
			return right_needed(Enterprise.FLAG_TREASURY)
		"stock":
			return tr("ENTERPRISE_FLAGSHIP_NEEDS_STOCK")
		"body":
			return tr("ENTERPRISE_FLAGSHIP_NEEDS_BODY")
	return ""


func _units(micro: int) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	@warning_ignore("integer_division")
	return AmountFormat.units(micro / maxi(scale, 1))


func _on_order() -> void:
	if not confirm("order"):
		return
	var body := _body_id
	var ordered := await run(func() -> ApiResult: return await model.order_flagship(body), "ENTERPRISE_FLAGSHIP_ORDERED_DONE")
	# A refusal for missing goods: the price above now shows them in red.
	if not ordered and model.flagship != null and model.flagship.can_order() and not model.flagship.affordable():
		say(tr("ENTERPRISE_FLAGSHIP_NEEDS_STOCK"), AppTheme.COLOR_DANGER)
