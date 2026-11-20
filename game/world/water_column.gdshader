// The water of a water column in the cutaway (UndergroundLayer, deep water, draft.39): one quad
// per cell of the active level that still lies in the water, a see-through deep blue over the
// water biome drawn beneath, darker the deeper the level, with slow caustic ripples. Cells of the
// sea floor right under the water get a faint blue wash (instance colour alpha), so the player sees
// where the column ends. Unshaded: the warm lamp of the underground would turn it brown.
// Compatibility renderer: one noise texture, two reads.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;

uniform sampler2D noise : filter_linear, repeat_enable;
// Levels below the ground (1 at z = -1).
uniform float depth = 1.0;
uniform vec3 shallow = vec3(0.06, 0.30, 0.48);
uniform vec3 deep = vec3(0.01, 0.035, 0.11);
// Levels over which the water turns from `shallow` to `deep`.
uniform float darkening = 16.0;
// Cover of a water cell (the instance colour's alpha scales it).
uniform float cover = 0.84;

varying vec3 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float d = clamp((depth - 1.0) / darkening, 0.0, 1.0);
	vec3 water = mix(shallow, deep, sqrt(d));
	vec2 p = world.xz;
	float a = texture(noise, p * 0.11 + vec2(TIME * 0.013, TIME * 0.007)).r;
	float b = texture(noise, p * 0.17 - vec2(TIME * 0.009, -TIME * 0.011)).g;
	// Bright where the two layers meet: thin moving lines, fading with depth.
	float caustic = pow(1.0 - abs(a - b), 10.0) * (1.0 - 0.75 * d);
	// The wash on the sea floor (alpha below 1) stays a clear blue, so it reads as wet, not grey.
	if (COLOR.a < 0.99) {
		water = mix(water, shallow * 1.3, 0.6);
	}
	ALBEDO = water * COLOR.rgb + vec3(0.25, 0.50, 0.60) * caustic * 0.16;
	ALPHA = cover * COLOR.a;
}
