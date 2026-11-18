shader_type spatial;
// A small prop drawn from a V1 sprite (PropLayer): a cutout standing upright towards the fixed
// camera. It is lit as if it faced the sky, like the ground it stands on, so it darkens with the
// ground at night; glowing pixels (lava) stay bright.
render_mode cull_disabled;

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
	ALPHA_SCISSOR_THRESHOLD = 0.5;
	NORMAL = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	ROUGHNESS = 1.0;
	SPECULAR = 0.2;
}
