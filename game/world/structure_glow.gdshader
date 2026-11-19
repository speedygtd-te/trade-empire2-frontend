shader_type spatial;
// The glow of a structure's lamps on the ground around it at night (StructureGlowLayer): one quad
// over the footprint and a few cells around it, added to the ground. `field` holds how close each
// spot lies to the footprint (GlowField: 1 on it, 0 a few cells out); the glow falls off softly,
// so the light follows the structure's shape. `strength` follows the darkness (0 by day).
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D field : filter_linear, repeat_disable;
uniform vec3 tint : source_color = vec3(1.0, 0.80, 0.56);
uniform float strength = 0.0;

void fragment() {
	float near = texture(field, UV).r;
	// Brightest along the walls, a long soft tail outwards.
	float glow = pow(near, 1.6);
	ALBEDO = tint;
	ALPHA = strength * glow;
}
