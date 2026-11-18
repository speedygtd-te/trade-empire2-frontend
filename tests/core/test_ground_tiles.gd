extends GdUnitTestSuite

const FIRST := {"PLAINS": 0, "MOUNTAIN": 4}
const FALLBACK := 8


func _tiles() -> GroundTiles:
	return GroundTiles.new(FIRST, 4, FALLBACK)


func _cell(biome: String, variant: int, vegetation: int = 0, elevation: int = 500) -> SurfacePatch.Cell:
	var cell := SurfacePatch.Cell.new()
	cell.biome = biome
	cell.variant = variant
	cell.vegetation = vegetation
	cell.elevation = elevation
	return cell


func test_layer_is_first_layer_plus_variant() -> void:
	var tiles := _tiles()

	assert_int(tiles.layer("PLAINS", 0)).is_equal(0)
	assert_int(tiles.layer("MOUNTAIN", 3)).is_equal(7)


func test_variant_out_of_range_is_clamped_and_unknown_biome_falls_back() -> void:
	var tiles := _tiles()

	assert_int(tiles.layer("MOUNTAIN", 9)).is_equal(7)
	assert_int(tiles.layer("MOUNTAIN", -1)).is_equal(4)
	assert_int(tiles.layer("NEW_BIOME", 1)).is_equal(FALLBACK)


func test_cell_hash_is_stable_and_spreads() -> void:
	assert_int(GroundTiles.cell_hash(3, -7)).is_equal(GroundTiles.cell_hash(3, -7))
	assert_int(GroundTiles.cell_hash(-5, 2)).is_greater_equal(0)
	var seen: Dictionary = {}
	for x: int in 8:
		for y: int in 8:
			seen[GroundTiles.cell_hash(x, y)] = true
	assert_int(seen.size()).is_equal(64)


func test_orientation_is_deterministic_and_half_of_the_cells_mirror() -> void:
	var mirrored := 0
	for x: int in 20:
		for y: int in 20:
			var orientation := GroundTiles.orientation(x, y, GroundTiles.SWAP)
			assert_int(orientation).is_equal(GroundTiles.orientation(x, y, GroundTiles.SWAP))
			assert_bool(orientation == 0 or orientation == GroundTiles.SWAP).is_true()
			if orientation != 0:
				mirrored += 1
			# The same cells mirror whichever mirroring the biome uses.
			assert_bool(GroundTiles.orientation(x, y) == 0).is_equal(orientation == 0)
	assert_int(mirrored).is_between(150, 250)


func test_mirror_is_per_biome_with_flip_v_as_default() -> void:
	var tiles := GroundTiles.new(FIRST, 4, FALLBACK, {"PLAINS": GroundTiles.SWAP})

	assert_int(tiles.mirror("PLAINS")).is_equal(GroundTiles.SWAP)
	assert_int(tiles.mirror("MOUNTAIN")).is_equal(GroundTiles.FLIP_V)


func test_shade_darkens_with_vegetation_and_lightens_with_elevation() -> void:
	assert_float(GroundTiles.shade(0, 500)).is_equal_approx(1.0, 0.0001)
	assert_float(GroundTiles.shade(6, 500)).is_less(1.0)
	assert_float(GroundTiles.shade(0, 1000)).is_greater(1.0)


func test_cell_image_encodes_layer_orientation_and_shade_with_a_ring() -> void:
	var cells := {
		Vector2i(10, 20): _cell("MOUNTAIN", 2, 0, 500),
		Vector2i(11, 20): _cell("PLAINS", 1),
		Vector2i(9, 20): _cell("PLAINS", 3),
	}
	var lookup := func(x: int, y: int) -> SurfacePatch.Cell:
		return cells.get(Vector2i(x, y)) as SurfacePatch.Cell

	var image := _tiles().cell_image(10, 20, 2, 0, lookup)

	assert_int(image.get_width()).is_equal(4)
	assert_int(image.get_height()).is_equal(4)
	var data := image.get_data()
	# Texel (1, 1) is cell (10, 20).
	var at := (1 * 4 + 1) * 4
	assert_int(data[at]).is_equal(6)
	assert_int(data[at + 1]).is_equal(GroundTiles.orientation(10, 20))
	assert_int(data[at + 2]).is_equal(roundi(0.5 * 255.0))
	assert_int(data[at + 3]).is_equal(255)
	# Texel (0, 1) is the ring cell (9, 20), which is loaded.
	assert_int(data[(1 * 4 + 0) * 4]).is_equal(3)
	# Texel (2, 1) is cell (11, 20).
	assert_int(data[(1 * 4 + 2) * 4]).is_equal(1)


func test_missing_ring_cells_repeat_the_edge_and_missing_cells_fall_back() -> void:
	var cells := {Vector2i(0, 0): _cell("MOUNTAIN", 1)}
	var lookup := func(x: int, y: int) -> SurfacePatch.Cell:
		return cells.get(Vector2i(x, y)) as SurfacePatch.Cell

	var data := _tiles().cell_image(0, 0, 2, 0, lookup).get_data()

	# Ring texel (0, 0) is cell (-1, -1): missing, so it repeats cell (0, 0), orientation too.
	assert_int(data[0]).is_equal(5)
	assert_int(data[1]).is_equal(GroundTiles.orientation(0, 0))
	# Texel (2, 2) is cell (1, 1) of the block: missing, so the fallback layer.
	assert_int(data[(2 * 4 + 2) * 4]).is_equal(FALLBACK)


func test_orientation_uses_the_wrapped_cell() -> void:
	var cells := {Vector2i(0, 0): _cell("PLAINS", 0)}
	var lookup := func(x: int, y: int) -> SurfacePatch.Cell:
		return cells.get(Vector2i(posmod(x, 32), y)) as SurfacePatch.Cell

	# A block at the seam of a 32 cells wide body (x 30..31): its ring texel (3, 1) is cell
	# (32, 0), which is cell (0, 0) and must turn the same way.
	var data := _tiles().cell_image(30, 0, 2, 32, lookup).get_data()

	assert_int(data[(1 * 4 + 3) * 4 + 1]).is_equal(GroundTiles.orientation(0, 0))
