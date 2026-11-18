shader_type spatial;
// The light cone of a floodlight on a lamp mast (PerimeterLayer): a fake, no real light. Added to
// what lies behind it, brightest at the lamp, fading along its length and towards its
// silhouette, so it reads as light in hazy air. `strength` follows the darkness (0 by day).
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.86, 0.62);
uniform float strength = 0.0;

void fragment() {
	// UV.y runs from the lamp (0) to the far end of the cone (1).
	float along = clamp(UV.y, 0.0, 1.0);
	float fade = pow(1.0 - along, 1.5) * smoothstep(0.0, 0.08, along);
	// Faces seen edge-on (the silhouette) fade out: no hard outline.
	float facing = abs(dot(normalize(NORMAL), normalize(VIEW)));
	ALBEDO = tint;
	ALPHA = strength * fade * facing * facing;
}
