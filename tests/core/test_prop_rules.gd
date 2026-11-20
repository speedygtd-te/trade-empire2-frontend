extends GdUnitTestSuite
## The expected V1 values were computed with the V1 functions (propLayout.ts) copied verbatim.


func test_hashes_match_v1() -> void:
	assert_int(PropRules.floor_variant(0, 0, 7)).is_equal(0)
	assert_int(PropRules.floor_variant(123, 456, 1000)).is_equal(346)
	assert_int(PropRules.floor_variant(-5, 9, 16)).is_equal(13)
	assert_int(PropRules.floor_variant(2827439, 706859, 97)).is_equal(93)
	assert_int(PropRules.key_hash(0, 0, 1000)).is_equal(0)
	assert_int(PropRules.key_hash(123, 456, 1000)).is_equal(425)
	assert_int(PropRules.key_hash(-5, 9, 16)).is_equal(10)
	assert_int(PropRules.key_hash(2827439, 706859, 97)).is_equal(45)
	assert_int(PropRules.key_hash(123, 456, 0x100000000)).is_equal(3666165425)
	assert_int(PropRules.key_hash(-5, 9, 0x100000000)).is_equal(3726116490)


func test_count_follows_the_band_over_g() -> void:
	var forest: Array[int] = []
	var crater: Array[int] = []
	for g: int in 7:
		forest.append(PropRules.count_for_g(g, 7, 18))
		crater.append(PropRules.count_for_g(g, 1, 2, 0))
	assert_array(forest).is_equal([0, 7, 9, 11, 14, 16, 18])
	assert_array(crater).is_equal([1, 1, 1, 2, 2, 2, 2])
	assert_int(PropRules.count_for_g(9, 7, 18)).is_equal(18)


func test_forest_cell_matches_v1() -> void:
	var props := PropRules.layout(64, 350001, "FOREST", 6)

	assert_int(props.size()).is_equal(18)
	var variants: Array[int] = []
	for prop: PropRules.Prop in props:
		assert_str(prop.family).is_equal("tree")
		variants.append(prop.variant)
	assert_array(variants).is_equal([2, 0, 6, 4, 6, 3, 1, 1, 5, 3, 0, 2, 4, 6, 0, 7, 1, 5])
	# First prop: position buckets 8 and 12 of 16, size bucket 5 of 8.
	var half := PropRules.SCATTER_SPAN * 0.5
	assert_vector(props[0].offset).is_equal_approx(Vector2(1.0 / 15.0, 0.6) * half, Vector2(1e-5, 1e-5))
	assert_float(props[0].scale).is_equal_approx(0.85 + 5.0 / 7.0 * 0.3, 1e-6)


func test_swamp_cell_matches_v1() -> void:
	var props := PropRules.layout(64, 350000, "SWAMP", 5)

	var variants: Array[int] = []
	for prop: PropRules.Prop in props:
		variants.append(prop.variant)
	assert_array(variants).is_equal([5, 7, 1, 0, 2, 4, 2, 0, 5, 5])
	var half := PropRules.SCATTER_SPAN * 0.5
	assert_vector(props[1].offset).is_equal_approx(Vector2(-1.0, 0.6) * half, Vector2(1e-5, 1e-5))
	assert_float(props[1].scale).is_equal_approx(0.85 + 1.0 / 7.0 * 0.3, 1e-6)


func test_plains_drop_the_empty_keys_without_shifting_the_rest() -> void:
	var props := PropRules.layout(70, 200010, "PLAINS", 6)

	var drawn: Array[String] = []
	for prop: PropRules.Prop in props:
		drawn.append("%s_%d" % [prop.family, prop.variant])
	assert_array(drawn).is_equal(["tree_leafy_1", "bush_1", "tree_leafy_3", "bush_1"])


func test_crater_uses_its_subset_and_lies_near_the_centre() -> void:
	var props := PropRules.layout(1000, 20, "CRATER", 0)

	assert_int(props.size()).is_equal(1)
	assert_str(props[0].family).is_equal("crater_decal")
	assert_int(props[0].variant).is_equal(3)
	assert_vector(props[0].offset).is_equal_approx(Vector2(-1.0 / 15.0, -0.6) * PropRules.DECAL_JITTER, Vector2(1e-5, 1e-5))
	for x: int in 200:
		for prop: PropRules.Prop in PropRules.layout(x, 7, "REGOLITH", 4):
			assert_bool(prop.variant in [1, 2]).is_true()


func test_no_props_without_a_theme_or_below_the_lowest_g() -> void:
	assert_array(PropRules.layout(5, 5, "OCEAN", 2)).is_empty()
	assert_array(PropRules.layout(5, 5, "FROZEN_LAKE", 2)).is_empty()
	assert_array(PropRules.layout(5, 5, "FOREST", 0)).is_empty()
	assert_bool(PropRules.has_props("FOREST")).is_true()
	assert_bool(PropRules.has_props("OCEAN")).is_false()


func test_layout_is_deterministic_and_stays_in_bounds() -> void:
	var half := PropRules.SCATTER_SPAN * 0.5
	for y: int in range(-3, 40):
		for x: int in range(0, 40):
			for biome: String in ["FOREST", "BEACH", "CALDERA", "GLACIER", "ICE_SHELF"]:
				var props := PropRules.layout(x, y, biome, 6)
				var again := PropRules.layout(x, y, biome, 6)
				assert_int(again.size()).is_equal(props.size())
				for index: int in props.size():
					var prop := props[index]
					assert_str(again[index].family).is_equal(prop.family)
					assert_vector(again[index].offset).is_equal(prop.offset)
					var reach := PropRules.DECAL_JITTER if prop.family in PropRules.DECALS else half
					assert_bool(absf(prop.offset.x) <= reach + 1e-6 and absf(prop.offset.y) <= reach + 1e-6).is_true()
					var available: int = PropRules.VARIANTS[prop.family]
					assert_bool(prop.variant >= 0 and prop.variant < available).is_true()
					assert_bool(prop.scale >= PropRules.SCALE_MIN - 1e-6 and prop.scale <= PropRules.SCALE_MAX + 1e-6).is_true()
					assert_bool(prop.turn >= 0.0 and prop.turn < TAU).is_true()
					assert_bool(prop.rank >= 0.0 and prop.rank < 1.0).is_true()


func test_every_family_of_a_theme_has_variants() -> void:
	for biome: String in PropRules.THEMES:
		var theme: Dictionary = PropRules.THEMES[biome]
		for family: String in theme["keys"]:
			if not family.is_empty():
				assert_bool(PropRules.VARIANTS.has(family)).override_failure_message(family).is_true()
	for family: String in PropRules.VENT_KEYS:
		assert_bool(PropRules.VARIANTS.has(family)).is_true()


func test_vents_match_v1_and_a_lower_density_keeps_a_subset() -> void:
	var hits: Array[int] = []
	for x: int in 40:
		if PropRules.vent(x, 7) != null:
			hits.append(x)
	assert_array(hits).contains([6])
	assert_str(PropRules.vent(6, 7).family).is_equal("vent_pipe")
	assert_object(PropRules.vent(5, 7)).is_null()
	for x: int in 300:
		if PropRules.vent(x, 3, 0.05) != null:
			assert_object(PropRules.vent(x, 3, 0.2)).is_not_null()


func test_detail_drops_small_props_first() -> void:
	var fast := DetailGovernor.Tier.FAST
	var slow := DetailGovernor.Tier.SLOW
	assert_float(PropRules.visible_share(fast, 9.0, true)).is_equal(1.0)
	assert_float(PropRules.visible_share(fast, 9.0, false)).is_equal(1.0)
	assert_float(PropRules.visible_share(fast, 40.0, true)).is_equal_approx(0.6, 1e-6)
	assert_float(PropRules.visible_share(fast, 40.0, false)).is_equal(0.0)
	assert_float(PropRules.visible_share(slow, 9.0, false)).is_equal(0.0)
	assert_bool(PropRules.visible_share(slow, 9.0, true) > 0.0).is_true()
	var previous := 2.0
	for zoom: int in range(3, 41):
		var share := PropRules.visible_share(DetailGovernor.Tier.MEDIUM, float(zoom), true)
		assert_bool(share <= previous).is_true()
		previous = share
	assert_int(PropRules.reach(slow)).is_less(PropRules.reach(fast))


func test_shadows_only_close_up_and_never_on_the_slow_tier() -> void:
	assert_bool(PropRules.casts_shadows(DetailGovernor.Tier.FAST, 9.0)).is_true()
	assert_bool(PropRules.casts_shadows(DetailGovernor.Tier.MEDIUM, 9.0)).is_true()
	assert_bool(PropRules.casts_shadows(DetailGovernor.Tier.FAST, 40.0)).is_false()
	assert_bool(PropRules.casts_shadows(DetailGovernor.Tier.MEDIUM, 16.0)).is_false()
	assert_bool(PropRules.casts_shadows(DetailGovernor.Tier.SLOW, 3.0)).is_false()


## The top tier only swaps the models of modules and hulls: props as on FAST.
func test_ultra_treats_props_like_fast() -> void:
	var ultra := DetailGovernor.Tier.ULTRA
	var fast := DetailGovernor.Tier.FAST
	for zoom: float in [5.0, 20.0, 40.0]:
		assert_float(PropRules.visible_share(ultra, zoom, true)).is_equal(PropRules.visible_share(fast, zoom, true))
		assert_float(PropRules.visible_share(ultra, zoom, false)).is_equal(PropRules.visible_share(fast, zoom, false))
		assert_bool(PropRules.casts_shadows(ultra, zoom)).is_equal(PropRules.casts_shadows(fast, zoom))
	assert_int(PropRules.reach(ultra)).is_equal(PropRules.reach(fast))
