shader_type spatial;
// The chain link of the fence around a large base (grounds.py: the see-through face of
// fence_half; BaseGroundsLayer puts this shader on it). A diamond wire pattern drawn from the
// model's own coordinates (the face lies in its y-z plane), so it costs no triangles. Where a
// diamond gets smaller than about a pixel, the pattern fades to its mean cover: a grey haze
// instead of flicker.

render_mode blend_mix, cull_disabled, depth_draw_opaque;

uniform vec3 wire : source_color = vec3(0.44, 0.47, 0.48);
// Diamonds per cell along the fence, and the share of a diamond's width the wire takes.
uniform float diamonds = 24.0;
uniform float wire_share = 0.14;
// Cover left everywhere (dust, the far side of the wire).
uniform float haze = 0.06;

varying vec2 plane;

void vertex() {
	plane = vec2(VERTEX.z, VERTEX.y);
}

void fragment() {
	vec2 p = plane * diamonds;
	vec2 d = vec2(p.x + p.y, p.x - p.y);
	// Distance to the nearest wire in each direction, in diamonds (0 on the wire).
	vec2 off = 0.5 - abs(fract(d) - 0.5);
	vec2 pixel = fwidth(d);
	vec2 half_wire = vec2(wire_share * 0.5);
	vec2 cover = 1.0 - smoothstep(half_wire - pixel * 0.5, half_wire + pixel * 0.5, off);
	// Smaller than a pixel: the mean.
	vec2 far = clamp(pixel * 1.5 - 0.6, 0.0, 1.0);
	cover = mix(cover, vec2(wire_share), far);
	float both = 1.0 - (1.0 - cover.x) * (1.0 - cover.y);
	ALBEDO = wire;
	ALPHA = clamp(both + haze, 0.0, 1.0);
	ROUGHNESS = 0.55;
	METALLIC = 0.3;
}
