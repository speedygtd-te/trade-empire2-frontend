shader_type canvas_item;
// Shimmering hot air over the colony on a hot body (HeatShimmer, Rudi 2026-11-20): set as the
// material of the SubViewportContainer that shows the 3D view, so it bends only the 3D picture
// when it is drawn to the screen - no extra pass, no screen copy, the UI on top stays sharp.
// Off (no material at all) when the strength is 0.
//
// A few sine waves, each bent by another, drift upward like rising air; the picture is moved
// mostly sideways, by at most MAX_SHIFT canvas pixels near the bottom (close to the camera) and
// less towards the top (far away).

// 0..1 (HeatShimmer.shown).
uniform float strength : hint_range(0.0, 1.0) = 0.0;
// Largest shift in pixels of a 1280 px high canvas.
uniform float max_shift = 3.2;
// Share of the shift left at the top of the picture.
uniform float top_share = 0.3;

void fragment() {
	vec2 texture_size = 1.0 / TEXTURE_PIXEL_SIZE;
	// Canvas pixels (height 1280), so waves keep their size on every screen.
	float scale = 1280.0 / texture_size.y;
	vec2 p = UV * texture_size * scale;
	float t = TIME;
	// Waves rise: their phase follows y + speed * t (y grows downward). The bend of one wave by
	// another breaks the straight bands into wobbling cells.
	float bend = sin(p.x * 0.021 + t * 0.9) * 2.2 + sin(p.x * 0.047 - t * 1.3) * 0.9;
	float dx = sin(p.y * 0.12 + t * 8.4 + bend) * 0.6
		+ sin(p.y * 0.27 + p.x * 0.04 + t * 13.0) * 0.4;
	float dy = sin(p.y * 0.16 + t * 9.7 + bend * 1.4) * 0.35;
	float weight = mix(top_share, 1.0, UV.y * UV.y);
	vec2 shift = vec2(dx, dy) * (max_shift * strength * weight / scale);
	vec2 uv = clamp(UV + shift * TEXTURE_PIXEL_SIZE, TEXTURE_PIXEL_SIZE * 0.5, 1.0 - TEXTURE_PIXEL_SIZE * 0.5);
	COLOR = texture(TEXTURE, uv);
}
