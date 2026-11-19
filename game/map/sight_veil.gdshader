shader_type canvas_item;
// The fog over undiscovered space on the galaxy map (GalaxyView): everything outside the player's
// sight spheres is veiled a little, the spheres themselves get a soft glow at their rim and a faint
// tint inside. The circles come in view pixels: x, y, radius, kind (1 = telescope, 0 = home or a
// structure's system).

const int MAX_CIRCLES = 48;

uniform vec4 circles[48];
uniform int count = 0;
uniform vec2 rect_size = vec2(720.0, 1280.0);
uniform vec4 veil_color : source_color = vec4(0.039, 0.059, 0.110, 1.0);
// How strongly undiscovered space is veiled (0 = not at all).
uniform float veil = 0.5;
uniform vec4 telescope_color : source_color = vec4(0.133, 0.827, 0.933, 1.0);
uniform vec4 other_color : source_color = vec4(0.898, 0.906, 0.922, 1.0);
// Brightness of the rim glow, and how far (px) the fog takes to set in outside a sphere.
uniform float rim_strength = 0.55;
uniform float rim_px = 7.0;
uniform float fade_px = 28.0;

void fragment() {
	vec2 p = UV * rect_size;
	float nearest = 1.0e9;
	float kind = 0.0;
	for (int i = 0; i < MAX_CIRCLES; i++) {
		if (i >= count) {
			break;
		}
		vec4 c = circles[i];
		float d = distance(p, c.xy) - c.z;
		if (d < nearest) {
			nearest = d;
			kind = c.w;
		}
	}
	float fog = veil * smoothstep(0.0, fade_px, nearest);
	// Telescope spheres glow in their colour; home and structure systems only faintly.
	float strength = rim_strength * mix(0.3, 1.0, kind);
	float glow = exp(-abs(nearest) / rim_px) * strength;
	if (nearest < 0.0) {
		glow += 0.05 * kind;
	}
	glow = clamp(glow, 0.0, 1.0);
	vec3 tint = mix(other_color.rgb, telescope_color.rgb, kind);
	float alpha = glow + fog * (1.0 - glow);
	vec3 rgb = (tint * glow + veil_color.rgb * fog * (1.0 - glow)) / max(alpha, 0.0001);
	COLOR = vec4(rgb, alpha);
}
