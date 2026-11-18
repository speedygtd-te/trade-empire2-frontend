extends GdUnitTestSuite
## Every prop variant PropRules can name has its look in PropLayer: a model or a sprite file, and
## for a tree sprite the point where its trunk meets the ground.


func test_every_variant_has_a_look_and_a_file() -> void:
	for family: String in PropRules.VARIANTS:
		assert_bool(PropLayer.LOOKS.has(family)).override_failure_message(family).is_true()
		var look: Dictionary = PropLayer.LOOKS[family]
		var files: Array = look.get("files", [])
		for variant: int in PropRules.VARIANTS[family]:
			var key := "%s_%d" % [family, variant]
			var path := PropLayer.MODELS + key + ".glb"
			if look["kind"] != PropLayer.Kind.MODEL:
				path = PropLayer.SPRITES + (files[variant] if variant < files.size() else key) + ".webp"
			assert_bool(ResourceLoader.exists(path)).override_failure_message(path).is_true()


func test_every_tree_sprite_knows_its_foot() -> void:
	for family: String in PropLayer.LOOKS:
		var look: Dictionary = PropLayer.LOOKS[family]
		if look["kind"] != PropLayer.Kind.TREE:
			continue
		var files: Array = look.get("files", [])
		for variant: int in PropRules.VARIANTS[family]:
			var file: String = files[variant] if variant < files.size() else "%s_%d" % [family, variant]
			var feet: String = file if not look.has("feet") else "%s_%d" % [look["feet"], variant]
			assert_bool(PropLayer.FEET.has(feet)).override_failure_message(feet).is_true()
			var foot: Vector2 = PropLayer.FEET[feet]
			assert_bool(foot.x > 0.0 and foot.x < 1.0 and foot.y > 0.5 and foot.y <= 1.0).override_failure_message(feet).is_true()
