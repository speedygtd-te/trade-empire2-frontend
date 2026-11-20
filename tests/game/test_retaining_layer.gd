extends GdUnitTestSuite


func test_every_piece_has_a_model() -> void:
	var layer := RetainingLayer.new()
	for file: String in RetainingWalls.FILES:
		assert_bool(ResourceLoader.exists(RetainingLayer.MODELS + file + ".glb")).is_true()
	assert_bool(layer.ready_to_draw()).is_true()
	layer.free()


func test_pieces_are_drawn_one_multimesh_per_model_and_chunk() -> void:
	var layer := RetainingLayer.new()
	var pieces: Array[RetainingWalls.Piece] = [
		RetainingWalls.Piece.new(RetainingWalls.PANEL, Transform3D(Basis.IDENTITY, Vector3(1.0, 0.0, 1.0)), 1.0),
		RetainingWalls.Piece.new(RetainingWalls.PANEL, Transform3D(Basis.IDENTITY, Vector3(2.0, 0.0, 1.0)), 0.9),
		RetainingWalls.Piece.new(RetainingWalls.PANEL, Transform3D(Basis.IDENTITY, Vector3(40.0, 0.0, 1.0)), 1.0),
		RetainingWalls.Piece.new(RetainingWalls.CAP, Transform3D(Basis.IDENTITY, Vector3(1.0, 0.0, 1.0)), 1.0),
	]

	layer.rebuild(pieces)

	var stats := layer.stats()
	assert_int(stats.get(RetainingWalls.PANEL, 0)).is_equal(3)
	assert_int(stats.get(RetainingWalls.CAP, 0)).is_equal(1)
	assert_int(stats.get("multimeshes", 0)).is_equal(3)
	layer.free()
