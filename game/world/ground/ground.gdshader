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

void fragment() {
	vec2 p = block_pos;
	ivec2 cell = clamp(ivec2(floor(p)), ivec2(0), ivec2(block_size - 1));
	vec2 f = p - vec2(cell);
	vec2 t = vec2(p.x, -p.y);
	vec2 gx = dFdx(t);
	vec2 gy = dFdy(t);
	vec4 own = cell_data(cell);
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
			color = mix(color, cell_color(cell_data(cell + ivec2(side.x, 0)), t, gx, gy), weight.x);
		}
		if (blend_y) {
			vec3 row = cell_color(cell_data(cell + ivec2(0, side.y)), t, gx, gy);
			if (blend_x) {
				row = mix(row, cell_color(cell_data(cell + side), t, gx, gy), weight.x);
			}
			color = mix(color, row, weight.y);
		}
	}
	// The lift would push bright biomes (desert, salt, snow) past 1 and flatten their texture:
	// above the knee it bends smoothly toward 1 instead.
	vec3 lifted = color * brightness;
	vec3 over = max(lifted - knee, vec3(0.0));
	lifted = min(lifted, vec3(knee)) + (1.0 - knee) * (vec3(1.0) - exp(-over / (1.0 - knee)));
	ALBEDO = lifted * tint;
	ROUGHNESS = 0.95;
}
