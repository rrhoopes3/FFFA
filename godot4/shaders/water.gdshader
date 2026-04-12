shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;
// Compatibility-renderer friendly: no SCREEN_TEXTURE, no DEPTH_TEXTURE, no derivatives.

uniform vec3 deep_color    : source_color = vec3(0.02, 0.07, 0.18);
uniform vec3 shallow_color : source_color = vec3(0.18, 0.55, 0.66);
uniform vec3 foam_color    : source_color = vec3(0.96, 0.98, 1.00);
uniform float time_scale = 1.0;
uniform float shore_radius = 10.7;
uniform float shore_band_width = 2.5;
uniform float crest_threshold = 0.08;
uniform float crest_softness = 0.14;
uniform float wave_strength = 1.0;
uniform float specular_intensity = 0.7;

varying float v_wave_height;
varying vec3  v_world_pos;
varying float v_shore_dist;

vec2 gerstner(vec2 dir, float amp, float k, float speed, vec2 pos, float t, out float y_out) {
	vec2 d = normalize(dir);
	float f = k * dot(d, pos) - speed * t;
	y_out = amp * sin(f);
	return d * amp * cos(f);
}

// Cheap value-noise for foam pattern
float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i + vec2(0,0)), hash21(i + vec2(1,0)), u.x),
	           mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * value_noise(p);
		p *= 2.07;
		a *= 0.5;
	}
	return v;
}

void vertex() {
	vec4 world4 = MODEL_MATRIX * vec4(VERTEX, 1.0);
	vec2 p = world4.xz;
	float t = TIME * time_scale;

	vec2 disp_xz = vec2(0.0);
	float disp_y = 0.0;
	float yi;

	disp_xz += gerstner(vec2( 1.0,  0.3), 0.28 * wave_strength, 0.50, 1.0, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2(-0.4,  1.0), 0.20 * wave_strength, 0.78, 1.4, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2( 0.7, -0.7), 0.12 * wave_strength, 1.30, 1.9, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2(-0.9, -0.4), 0.07 * wave_strength, 2.10, 2.6, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2( 0.2,  0.9), 0.05 * wave_strength, 3.10, 3.2, p, t, yi); disp_y += yi;

	VERTEX.x += disp_xz.x;
	VERTEX.z += disp_xz.y;
	VERTEX.y += disp_y;

	v_wave_height = disp_y;
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_shore_dist = length(v_world_pos.xz);

	NORMAL = normalize(vec3(-disp_xz.x * 1.8, 1.0, -disp_xz.y * 1.8));
}

void fragment() {
	float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	vec3 base = mix(deep_color, shallow_color, fresnel);

	// Wave crest foam
	float crest = smoothstep(crest_threshold, crest_threshold + crest_softness, v_wave_height);

	// Shore foam ring — distance from origin (island is centered there)
	float shore_offset = abs(v_shore_dist - shore_radius);
	float shore = 1.0 - smoothstep(0.0, shore_band_width, shore_offset);

	// FBM-noise modulation breaks up the ring into chunks
	vec2 noise_uv = v_world_pos.xz * 0.35 + vec2(TIME * 0.20, TIME * -0.13);
	float foam_noise = fbm(noise_uv);
	shore *= smoothstep(0.30, 0.75, foam_noise);

	// Inner band: more solid foam right against the shore
	float inner = 1.0 - smoothstep(0.0, 1.2, shore_offset);
	shore = max(shore, inner * smoothstep(0.20, 0.55, foam_noise));

	float foam = clamp(crest * 0.6 + shore * 1.1, 0.0, 1.0);

	// Subtle depth tint — deeper water further from shore
	float depth_factor = smoothstep(15.0, 60.0, v_shore_dist);
	vec3 deep = mix(base, deep_color * 0.55, depth_factor);

	ALBEDO = mix(deep, foam_color, foam);
	METALLIC = 0.05;
	ROUGHNESS = 0.10;
	SPECULAR = specular_intensity;
}
