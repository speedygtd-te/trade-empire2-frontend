// The ground of one surface block (GroundLayer): a flat quad of BLOCK × BLOCK cells. Each cell
// shows its biome's texture from the atlas (a Texture2DArray, one layer per biome variant),
// picked by the cell texture (GroundTiles.cell_image). With `soft`, neighbouring cells blend
// into each other across a narrow band along their borders, wobbled by a noise texture (after
// V1's noisy biome transitions); the atlas textures are tileable, so the blend has no seam.
// Works in the Compatibility renderer (GLSL ES 3.0: texelFetch, textureGrad, sampler2DArray).
shader_type spatial;

uniform sampler2DArray atlas : filter_linear_mipmap, repeat_enable;
uniform sampler2D noise : filter_linear, repeat_enable;
uniform sampler2D cells : filter_nearest, repeat_disable;
// Cells per side of the block.
uniform int block_size = 16;
// The V1 tile colours are graded dark for 2D; lit in 3D they need lifting.
uniform float brightness = 1.9;
// Lifted colour above which the lift eases off toward 1.
uniform float knee = 0.7;
// Whole-ground tint (darker on airless bodies, ColonyView.set_sun).
uniform vec3 tint = vec3(1.0);
// Blend neighbours at the cell borders (off on the SLOW detail tier: one texture read).
uniform bool soft = true;
// Half width of the blend across a border, in cells, and how far the noise moves it. A narrow
// blend keeps the border crisp and noisy (V1); a wide one would show as soft, flat strips.
// band + wobble must stay below 0.5, so the blend never reaches a cell's middle.
uniform float band = 0.05;
uniform float wobble = 0.3;
// Noise repeats every 1 / noise_scale cells; that must divide block_size (the blocks meet).
uniform float noise_scale = 0.25;
// Unexplored cells (alpha 0 in the cell texture, draft.31) are fog: a dark, grainy slate, with a
// soft and ragged edge toward the explored ground and a faint cyan rim along it.
uniform vec3 fog_color = vec3(0.10, 0.11, 0.14);
uniform vec3 fog_rim = vec3(0.10, 0.36, 0.42);

// Position on the block in cells: x east, y north, 0..block_size.
varying vec2 block_pos;

void vertex() {
	float half_size = float(block_size) * 0.5;
	block_pos = vec2(VERTEX.x + half_size, half_size - VERTEX.z);
}

// Data of a cell of this block (or of the ring around it: -1..block_size).
vec4 cell_data(ivec2 cell) {
	return texelFetch(cells, cell + ivec2(1), 0);
}

// Colour of a cell's texture continued to the point t (east, south; tileable, period 1).
vec3 cell_color(vec4 data, vec2 t, vec2 gx, vec2 gy) {
	int orientation = int(data.g * 255.0 + 0.5);
	if ((orientation & 1) != 0) {
		t = t.yx;
		gx = gx.yx;
		gy = gy.yx;
	}
	if ((orientation & 2) != 0) {
		t.x = -t.x;
		gx.x = -gx.x;
		gy.x = -gy.x;
	}
	if ((orientation & 4) != 0) {
		t.y = -t.y;
		gx.y = -gx.y;
		gy.y = -gy.y;
	}
	float layer = floor(data.r * 255.0 + 0.5);
	// Explicit gradients: fract() jumps at the cell borders and would pick the smallest mip.
	vec3 color = textureGrad(atlas, vec3(fract(t), layer), gx, gy).rgb;
	return color * (data.b + 0.5);
}

// The neighbour's data, or the own when the neighbour is fog: the biomes never blend into fog.
vec4 explored_or(vec4 own, ivec2 cell) {
	vec4 data = cell_data(cell);
	return data.a < 0.5 ? own : data;
}

// How explored a point is, 0..1: the cells' flags interpolated between the cell centres.
float explored_at(vec2 p) {
	vec2 q = p - vec2(0.5);
	ivec2 c = ivec2(floor(q));
	vec2 f = q - vec2(c);
	float a = cell_data(c).a;
	float b = cell_data(c + ivec2(1, 0)).a;
	float d = cell_data(c + ivec2(0, 1)).a;
	float e = cell_data(c + ivec2(1, 1)).a;
	return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}

void fragment() {
	vec2 p = block_pos;
	ivec2 cell = clamp(ivec2(floor(p)), ivec2(0), ivec2(block_size - 1));
	vec2 f = p - vec2(cell);
	vec2 t = vec2(p.x, -p.y);
	vec2 gx = dFdx(t);
	vec2 gy = dFdy(t);
	vec4 own = cell_data(cell);
	if (own.a < 0.5) {
		// A fog cell next to explored ground shows that ground under the fog's soft edge.
		own = explored_or(explored_or(explored_or(explored_or(own, cell + ivec2(1, 0)),
			cell + ivec2(-1, 0)), cell + ivec2(0, 1)), cell + ivec2(0, -1));
	}
	vec3 color = cell_color(own, t, gx, gy);
	if (soft) {
		// Toward the nearer border on each axis; the weight is 0.5 on the border itself, so
		// both cells agree there.
		ivec2 side = ivec2(f.x < 0.5 ? -1 : 1, f.y < 0.5 ? -1 : 1);
		vec2 to_edge = vec2(side.x < 0 ? f.x : 1.0 - f.x, side.y < 0 ? f.y : 1.0 - f.y);
		vec2 shift = (texture(noise, p * noise_scale).rg - 0.5) * 2.0 * wobble;
		vec2 weight = smoothstep(vec2(-band), vec2(band), vec2(side) * shift - to_edge);
		// Only the reads that matter: inside the band of one border two, in a corner four.
		bool blend_x = weight.x > 0.002;
		bool blend_y = weight.y > 0.002;
		if (blend_x) {
			color = mix(color, cell_color(explored_or(own, cell + ivec2(side.x, 0)), t, gx, gy), weight.x);
		}
		if (blend_y) {
			vec3 row = cell_color(explored_or(own, cell + ivec2(0, side.y)), t, gx, gy);
			if (blend_x) {
				row = mix(row, cell_color(explored_or(own, cell + side), t, gx, gy), weight.x);
			}
			color = mix(color, row, weight.y);
		}
	}
	// The lift would push bright biomes (desert, salt, snow) past 1 and flatten their texture:
	// above the knee it bends smoothly toward 1 instead.
	vec3 lifted = color * brightness;
	vec3 over = max(lifted - knee, vec3(0.0));
	lifted = min(lifted, vec3(knee)) + (1.0 - knee) * (vec3(1.0) - exp(-over / (1.0 - knee)));
	vec3 albedo = lifted * tint;
	float explored = explored_at(p);
	if (explored < 0.999) {
		// Periods of 16 and 4 cells: they divide block_size, so the fog meets across blocks.
		float coarse = texture(noise, p * 0.0625).r;
		float fine = texture(noise, p * 0.25 + vec2(0.37, 0.11)).g;
		float shown = smoothstep(0.36, 0.64, explored + (coarse - 0.5) * 0.45 + (fine - 0.5) * 0.25);
		vec3 fog = fog_color * (0.55 + 0.9 * coarse + 0.6 * (fine - 0.5));
		// A faint survey grid every 4 cells: blank map, not water or a hole.
		vec2 grid = abs(fract(p * 0.25 + 0.5) - 0.5) / max(fwidth(p * 0.25), vec2(0.0001));
		float line = 1.0 - clamp(min(grid.x, grid.y) - 0.5, 0.0, 1.0);
		fog += fog_rim * line * 0.22;
		float rim = 1.0 - abs(shown * 2.0 - 1.0);
		fog += fog_rim * rim * rim * 0.9;
		albedo = mix(fog, albedo, shown);
	}
	ALBEDO = albedo;
	ROUGHNESS = 0.95;
}
