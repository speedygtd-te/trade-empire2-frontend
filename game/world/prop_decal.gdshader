shader_type spatial;
// A flat prop lying on the ground, drawn from a V1 sprite (PropLayer): craters, lava puddles,
// ice floes. Soft-edged, so it is blended over the ground; lit like the ground, glowing pixels
// (lava) stay bright.
render_mode blend_mix, depth_draw_never, cull_disabled;

uniform sampler2D sprite : source_color, filter_linear_mipmap, repeat_disable;
// 1 for families whose orange-red pixels glow (lava), 0 otherwise.
uniform float glow = 0.0;
// The V1 sprites are graded dark for 2D, like the V1 tiles the ground lifts (GroundLayer).
uniform float lift = 1.5;

void fragment() {
	vec4 texel = texture(sprite, UV);
	float hot = glow * clamp((texel.r - texel.b - 0.35) * 3.0, 0.0, 1.0);
	ALBEDO = min(texel.rgb * lift, vec3(1.0)) * COLOR.rgb * (1.0 - hot);
	EMISSION = texel.rgb * hot * 1.6;
	ALPHA = texel.a;
	NORMAL = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	ROUGHNESS = 1.0;
	SPECULAR = 0.2;
}
