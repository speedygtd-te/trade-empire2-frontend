class_name ScreenStack
extends Control
## The screens of one tab: a root, and layers pushed over it (Map → galaxy → another system;
## Fleet → route editor; Profile → enterprise; Base → map pick → landing site). Only the topmost
## screen is visible, so the ones below stop drawing; they keep their state.
##
## A layer that has a `closed` signal is taken off when it sends it. Back goes to the topmost
## screen first: its `handle_back() -> bool` closes something inside it (true) or, with false, the
## layer itself is taken off. On the root, `handle_back` decides alone; false means nothing was left
## to close.

## The root or the layers changed.
signal changed

var _root: Control = null
var _layers: Array[Control] = []


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


## The stack a node lies in (the nearest one above it); null when it is in none.
static func of(node: Node) -> ScreenStack:
	var at := node.get_parent() if node != null else null
	while at != null:
		if at is ScreenStack:
			return at as ScreenStack
		at = at.get_parent()
	return null


## Pushes `layer` onto the stack `from` lies in. Without a stack (a review scene shows a screen on
## its own) the layer goes over `from` as a child and is freed when it closes.
static func push_onto(from: Node, layer: Control) -> void:
	var stack := of(from)
	if stack != null:
		stack.push(layer)
		return
	if layer.has_signal("closed"):
		layer.connect("closed", layer.queue_free)
	from.add_child(layer)


## Takes a layer off (with everything above it); one outside a stack is freed.
## `layer` may already be gone (a kept reference to a closed layer): then nothing happens.
static func close_layer(layer: Variant) -> void:
	if not is_open(layer):
		return
	var screen := layer as Control
	var stack := screen.get_parent() as ScreenStack
	if stack != null and stack.has_layer(screen):
		stack.remove(screen)
	else:
		screen.queue_free()


## Whether a kept reference still points at a screen that is open (not freed, not closing).
static func is_open(layer: Variant) -> bool:
	if not is_instance_valid(layer):
		return false
	var screen := layer as Control
	return screen != null and not screen.is_queued_for_deletion()


func root() -> Control:
	return _root


## The topmost screen: the last layer, or the root.
func top() -> Control:
	return _layers.back() as Control if not _layers.is_empty() else _root


## How many layers lie over the root.
func depth() -> int:
	return _layers.size()


func has_layer(layer: Control) -> bool:
	return _layers.has(layer)


## Replaces the root (the old one is freed, the layers are taken off).
func set_root(node: Control) -> void:
	while not _layers.is_empty():
		_discard(_layers.pop_back() as Control)
	if _root != null:
		_discard(_root)
	_root = node
	if node != null:
		_fit(node)
		add_child(node)
		move_child(node, 0)
	_update()
	changed.emit()


func push(layer: Control) -> void:
	_fit(layer)
	_layers.append(layer)
	if layer.has_signal("closed"):
		layer.connect("closed", remove.bind(layer))
	add_child(layer)
	_update()
	changed.emit()


## Takes the topmost layer off; false when only the root is left.
func pop() -> bool:
	if _layers.is_empty():
		return false
	_discard(_layers.pop_back() as Control)
	_update()
	changed.emit()
	return true


## Takes `layer` and everything above it off.
func remove(layer: Control) -> void:
	var index := _layers.find(layer)
	if index < 0:
		return
	while _layers.size() > index:
		_discard(_layers.pop_back() as Control)
	_update()
	changed.emit()


## Takes every layer off; the root shows again.
func pop_to_root() -> void:
	if _layers.is_empty():
		return
	while not _layers.is_empty():
		_discard(_layers.pop_back() as Control)
	_update()
	changed.emit()


## Back on this stack: the topmost layer closes something inside it or is taken off (true); on
## the root its own `handle_back` answers.
func handle_back() -> bool:
	if not _layers.is_empty():
		var layer := _layers.back() as Control
		if not ScreenStack.ask_back(layer):
			remove(layer)
		return true
	return _root != null and ScreenStack.ask_back(_root)


## Calls a screen's `handle_back() -> bool`; false when it has none.
static func ask_back(screen: Control) -> bool:
	if screen == null or not screen.has_method("handle_back"):
		return false
	var handled: Variant = screen.call("handle_back")
	return handled is bool and handled


func _fit(node: Control) -> void:
	node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func _discard(node: Control) -> void:
	if node == null or not is_instance_valid(node):
		return
	node.visible = false
	node.queue_free()


## Only the topmost screen is visible.
func _update() -> void:
	var shown := top()
	if _root != null:
		_root.visible = _root == shown
	for layer: Control in _layers:
		layer.visible = layer == shown
