shader_type spatial;
// The concrete around a large base (BaseGroundsLayer): one quad per cell lying on the relief, a slab
// of dirty exposed concrete with joints at its edges. Per vertex: CUSTOM0.xy the cell (mod 64, for the
// grime that runs on across slabs), CUSTOM0.zw where in the texture this slab cuts its window;
// CUSTOM1.r its brightness, CUSTOM1.g its quarter turn (0, 1/3, 2/3, 1), CUSTOM1.b · 255 the sides
// facing the open land (BaseGrounds.Plan.outward bits): there the slab stops at the cell's middle,
// under the fence.

uniform sampler2D paving : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D noise : filter_linear, repeat_enable;
// Share of the texture one slab shows, and the overall brightness.
uniform float window = 0.5;
uniform float brightness = 0.66;
// Large blotches of grime running across slabs: their size in cells and how dark they get.
uniform float grime_cells = 9.0;
uniform float grime = 0.32;
// Joints between slabs: width (share of a cell) and how dark.
uniform float joint_width = 0.022;
uniform float joint_darkness = 0.5;

varying vec4 slab;
varying vec3 shade_turn;

void vertex() {
	slab = CUSTOM0;
	shade_turn = CUSTOM1.rgb;
}

void fragment() {
	// Cut away the parts beyond the fence (cell x is UV.x, cell y runs against UV.y).
	int sides = int(shade_turn.b * 255.0 + 0.5);
	if (sides != 0) {
		vec2 cell = vec2(UV.x - 0.5, 0.5 - UV.y);
		bool north = cell.y > 0.0;
		bool east = cell.x > 0.0;
		if (((sides & 1) != 0 && north) || ((sides & 2) != 0 && east) || ((sides & 4) != 0 && !north)
				|| ((sides & 8) != 0 && !east) || ((sides & 16) != 0 && north && east)
				|| ((sides & 32) != 0 && !north && east) || ((sides & 64) != 0 && !north && !east)
				|| ((sides & 128) != 0 && north && !east)) {
			discard;
		}
	}
	vec2 local = UV - 0.5;
	int turn = int(shade_turn.g * 3.0 + 0.5);
	if (turn == 1) {
		local = vec2(-local.y, local.x);
	} else if (turn == 2) {
		local = -local;
	} else if (turn == 3) {
		local = vec2(local.y, -local.x);
	}
	vec3 color = texture(paving, slab.zw + (local + 0.5) * window).rgb;
	// Grime: continuous across slabs (cell + position in it), in the noise texture's 64-cell tile.
	vec2 place = (slab.xy + UV * vec2(1.0, -1.0) + vec2(0.0, 1.0)) / 64.0;
	float blotch = texture(noise, place * (64.0 / grime_cells)).b;
	color *= 1.0 - grime * smoothstep(0.35, 0.8, blotch);
	// Joints at the slab's edges, smoothed over a pixel.
	float edge = min(min(UV.x, 1.0 - UV.x), min(UV.y, 1.0 - UV.y));
	float soft = fwidth(edge);
	float joint = 1.0 - smoothstep(joint_width - soft, joint_width + soft, edge);
	color *= mix(1.0, joint_darkness, joint);
	ALBEDO = color * brightness * shade_turn.r;
	ROUGHNESS = 0.93;
	SPECULAR = 0.3;
}
