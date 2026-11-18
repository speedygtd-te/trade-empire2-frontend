shader_type spatial;
// A tree drawn from a V1 sprite (PropLayer): an upright card on the tree's foot, turned towards
// the fixed camera, so the sprite shows exactly as drawn. The part of the sprite below the foot
// (roots, ash) lies flat on the ground in front of it. Lit by the sun like the ground, with a
// rounded crown: the side towards the sun is brighter. Glowing pixels (embers) stay bright.
//
// Shadows: in the shadow pass the card turns towards the light around its foot, so the shadow
// is the tree's silhouette, never a sliver, and the roots on the ground cast none. Whether the
// tree lies in a shadow is decided at the top of its crown, not per pixel: its own shadow card
// would otherwise darken its lower half whenever the sun stands behind the camera.
render_mode cull_disabled;

uniform sampler2D sprite : source_color, filter_linear_mipmap, repeat_disable;
// 1 for families whose orange-red pixels glow (embers), 0 otherwise.
uniform float glow = 0.0;
// The V1 sprites are graded dark for 2D, like the V1 tiles the ground lifts (GroundLayer).
uniform float lift = 1.5;
// Height of the upright part above the foot and the widest reach to either side of the foot,
// in the mesh's own units.
uniform float height = 0.4;
uniform float half_width = 0.1;
// How much the crown is shaded as a round body (0 = flat, lit like the ground).
uniform float roundness = 0.55;

varying float across;
varying float rise;
varying float lying;
varying vec3 crown_top;
varying float shadow_pass;

void vertex() {
	float flip = sign(determinant(mat3(MODEL_MATRIX)));
	across = VERTEX.x * flip / half_width;
	rise = VERTEX.y / height;
	lying = VERTEX.z > 0.0001 ? 1.0 : 0.0;
	crown_top = (MODEL_MATRIX * vec4(0.0, height * 1.05, 0.0, 1.0)).xyz;
	// Any view that is not the main camera's direction is a light's shadow pass.
	shadow_pass = dot(INV_VIEW_MATRIX[2].xyz, MAIN_CAM_INV_VIEW_MATRIX[2].xyz) < 0.9999 ? 1.0 : 0.0;
	if (shadow_pass > 0.5) {
		vec3 to_light = transpose(mat3(MODEL_MATRIX)) * INV_VIEW_MATRIX[2].xyz;
		vec2 facing = length(to_light.xz) > 0.0001 ? normalize(to_light.xz) : vec2(0.0, 1.0);
		// Upright, across the light; the flat part folds onto the foot line.
		VERTEX = vec3(facing.y * VERTEX.x, VERTEX.y, -facing.x * VERTEX.x);
		NORMAL = vec3(facing.x, 0.0, facing.y);
	}
}

void fragment() {
	vec4 texel = texture(sprite, UV);
	float hot = glow * clamp((texel.r - texel.b - 0.35) * 3.0, 0.0, 1.0);
	ALBEDO = min(texel.rgb * lift, vec3(1.0)) * COLOR.rgb * (1.0 - hot);
	EMISSION = texel.rgb * hot * 1.6;
	ALPHA = texel.a;
	// The shadow map is coarse: a lower cut keeps the thin trunk, whose alpha the mipmaps thin
	// out, so the crown's shadow does not float apart from the tree.
	ALPHA_SCISSOR_THRESHOLD = shadow_pass > 0.5 ? 0.15 : 0.5;
	vec3 up = normalize((VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	// Towards the camera, level with the ground; the camera's right is +x in view space.
	vec3 front = normalize(vec3(0.0, -up.z, up.y));
	vec3 round_normal = up * (0.6 + 0.4 * clamp(rise, 0.0, 1.0)) + vec3(roundness * across, 0.0, 0.0) + front * 0.3 * roundness;
	NORMAL = lying > 0.5 ? up : normalize(round_normal);
	LIGHT_VERTEX = (VIEW_MATRIX * vec4(crown_top, 1.0)).xyz;
	ROUGHNESS = 1.0;
	SPECULAR = 0.2;
}
