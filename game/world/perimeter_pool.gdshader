shader_type spatial;
// The pool of light a floodlight throws on the ground (PerimeterLayer): a quad lying on the
// ground, added to it, soft towards its rim. `strength` follows the darkness (0 by day).
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.86, 0.62);
uniform float strength = 0.0;

void fragment() {
	// UV.y runs from the side of the lamp (0) to the far side (1): the near half is brighter.
	vec2 point = (UV - 0.5) * 2.0;
	float pool = 1.0 - smoothstep(0.0, 1.0, length(point));
	float near = mix(1.15, 0.8, UV.y);
	ALBEDO = tint;
	ALPHA = strength * pool * pool * near;
}
