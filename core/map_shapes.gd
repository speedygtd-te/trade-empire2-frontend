class_name MapShapes
extends RefCounted
## Geometry the system map draws in one piece instead of one call per part: many small round dots
## (the backdrop's stars, an asteroid belt's band) as one triangle mesh, and the dashes of a dashed
## ring as one set of line segments. One draw call each instead of hundreds; built once and kept
## until what they depend on changes (the zoom for a belt, the view's size for the backdrop).

## Corners of a dot. The dots are a few pixels across, where this is as round as a circle.
const DOT_SEGMENTS := 12
## Straight pieces per dash of a dashed ring.
const DASH_PIECES := 5


## Mesh arrays (Mesh.ARRAY_MAX long: vertices, white vertex colours, indices) of a filled disc of
## `radius` around each of `centres`; empty arrays without centres.
static func dot_arrays(centres: PackedVector2Array, radius: float, segments: int = DOT_SEGMENTS) -> Array:
	var corners := maxi(segments, 3)
	var vertices := PackedVector2Array()
	var indices := PackedInt32Array()
	var ring := PackedVector2Array()
	for corner: int in corners:
		ring.append(Vector2.from_angle(TAU * corner / corners) * radius)
	for centre: Vector2 in centres:
		var first := vertices.size()
		vertices.append(centre)
		for offset: Vector2 in ring:
			vertices.append(centre + offset)
		for corner: int in corners:
			indices.append(first)
			indices.append(first + 1 + corner)
			indices.append(first + 1 + (corner + 1) % corners)
	var colors := PackedColorArray()
	colors.resize(vertices.size())
	colors.fill(Color.WHITE)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	return arrays


## The discs of `dot_arrays` as a mesh to draw with `CanvasItem.draw_mesh` (colour as its modulate);
## null without centres.
static func dot_mesh(centres: PackedVector2Array, radius: float, segments: int = DOT_SEGMENTS) -> ArrayMesh:
	if centres.is_empty():
		return null
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, dot_arrays(centres, radius, segments))
	return mesh


## Where the dots of an asteroid belt's band lie around the star (px, the star at the origin, the
## belt not yet turned): per dot of `pattern` an angle (x, radians) and a spread across the band (y,
## −1..1), on a ring of `ring` ± `half_width` map units at `zoom` px per unit.
static func belt_dots(pattern: PackedVector2Array, ring: float, half_width: float, zoom: float) -> PackedVector2Array:
	var result := PackedVector2Array()
	result.resize(pattern.size())
	for index: int in pattern.size():
		var dot := pattern[index]
		result[index] = SystemMap.on_ring((ring + dot.y * half_width) * zoom, dot.x)
	return result


## The dashes of a dashed ring around the origin as segment pairs for `draw_multiline`: `count`
## dashes from angle `start`, one every `step` radians, each half a step long and made of
## DASH_PIECES straight pieces. Angles as draw_arc counts them (clockwise on screen, y down).
static func dash_segments(radius: float, start: float, step: float, count: int,
		pieces: int = DASH_PIECES) -> PackedVector2Array:
	var result := PackedVector2Array()
	var parts := maxi(pieces, 1)
	for dash: int in maxi(count, 0):
		var from := start + dash * step
		for part: int in parts:
			result.append(Vector2.from_angle(from + step * 0.5 * part / parts) * radius)
			result.append(Vector2.from_angle(from + step * 0.5 * (part + 1) / parts) * radius)
	return result
