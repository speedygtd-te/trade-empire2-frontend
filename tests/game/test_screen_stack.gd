extends GdUnitTestSuite
## ScreenStack: a root with layers over it; only the topmost shows; Back asks the topmost screen
## first and takes a layer off when it has nothing to close inside; a layer's `closed` takes it off.


class Layer:
	extends Control
	signal closed
	## What handle_back answers (true: it closed something inside).
	var inner := false
	var backs := 0

	func handle_back() -> bool:
		backs += 1
		var handled := inner
		inner = false
		return handled


func _stack() -> ScreenStack:
	var stack: ScreenStack = auto_free(ScreenStack.new())
	add_child(stack)
	return stack


func test_only_the_topmost_screen_is_visible() -> void:
	var stack := _stack()
	var root := Layer.new()
	var first := Layer.new()
	var second := Layer.new()
	stack.set_root(root)
	stack.push(first)
	stack.push(second)

	assert_int(stack.depth()).is_equal(2)
	assert_object(stack.top()).is_same(second)
	assert_bool(root.visible).is_false()
	assert_bool(first.visible).is_false()
	assert_bool(second.visible).is_true()

	assert_bool(stack.pop()).is_true()
	assert_bool(first.visible).is_true()
	assert_object(stack.top()).is_same(first)


func test_back_asks_the_top_layer_then_takes_it_off() -> void:
	var stack := _stack()
	var root := Layer.new()
	var layer := Layer.new()
	layer.inner = true
	stack.set_root(root)
	stack.push(layer)

	# The layer closes something inside first, then goes.
	assert_bool(stack.handle_back()).is_true()
	assert_int(stack.depth()).is_equal(1)
	assert_bool(stack.handle_back()).is_true()
	assert_int(stack.depth()).is_equal(0)
	assert_bool(root.visible).is_true()
	# On the root its own answer counts: nothing left.
	assert_bool(stack.handle_back()).is_false()
	assert_int(root.backs).is_equal(1)


func test_a_closed_layer_takes_the_ones_above_it_along() -> void:
	var stack := _stack()
	stack.set_root(Layer.new())
	var map := Layer.new()
	var galaxy := Layer.new()
	var other := Layer.new()
	stack.push(map)
	stack.push(galaxy)
	stack.push(other)

	map.closed.emit()

	assert_int(stack.depth()).is_equal(0)
	assert_bool(map.is_queued_for_deletion()).is_true()
	assert_bool(other.is_queued_for_deletion()).is_true()


func test_pop_to_root_and_a_new_root_clear_the_layers() -> void:
	var stack := _stack()
	var old_root := Layer.new()
	stack.set_root(old_root)
	stack.push(Layer.new())
	stack.push(Layer.new())
	var changes := [0]
	stack.changed.connect(func() -> void: changes[0] += 1)

	stack.pop_to_root()
	assert_int(stack.depth()).is_equal(0)
	assert_int(changes[0]).is_equal(1)

	stack.push(Layer.new())
	var new_root := Layer.new()
	stack.set_root(new_root)
	assert_int(stack.depth()).is_equal(0)
	assert_object(stack.root()).is_same(new_root)
	assert_bool(old_root.is_queued_for_deletion()).is_true()


func test_push_onto_finds_the_stack_above_a_screen() -> void:
	var stack := _stack()
	var root := Layer.new()
	stack.set_root(root)
	var inner := Control.new()
	root.add_child(inner)
	var layer := Layer.new()

	ScreenStack.push_onto(inner, layer)

	assert_object(ScreenStack.of(inner)).is_same(stack)
	assert_object(stack.top()).is_same(layer)
	ScreenStack.close_layer(layer)
	assert_int(stack.depth()).is_equal(0)


func test_without_a_stack_a_layer_lies_over_the_screen_and_frees_itself() -> void:
	var screen: Control = auto_free(Control.new())
	add_child(screen)
	var layer := Layer.new()

	ScreenStack.push_onto(screen, layer)
	assert_object(layer.get_parent()).is_same(screen)
	layer.closed.emit()

	assert_bool(layer.is_queued_for_deletion()).is_true()
