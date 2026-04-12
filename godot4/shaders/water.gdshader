shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;
// Compatibility-renderer friendly: no SCREEN_TEXTURE, no DEPTH_TEXTURE, no derivatives.

uniform vec3 deep_color    : source_color = vec3(0.04, 0.10, 0.20);
uniform vec3 shallow_color : source_color = vec3(0.18, 0.45, 0.55);
uniform vec3 foam_color    : source_color = vec3(0.92, 0.96, 1.00);
uniform float time_scale = 1.0;
uniform float shore_radius = 10.5;
uniform float shore_band_width = 3.0;
uniform float crest_threshold = 0.10;
uniform float crest_softness = 0.12;

varying float v_wave_height;
varying vec3  v_world_pos;

vec2 gerstner(vec2 dir, float amp, float k, float speed, vec2 pos, float t, out float y_out) {
	vec2 d = normalize(dir);
	float f = k * dot(d, pos) - speed * t;
	y_out = amp * sin(f);
	return d * amp * cos(f);
}

void vertex() {
	vec4 world4 = MODEL_MATRIX * vec4(VERTEX, 1.0);
	vec2 p = world4.xz;
	float t = TIME * time_scale;

	vec2 disp_xz = vec2(0.0);
	float disp_y = 0.0;
	float yi;

	disp_xz += gerstner(vec2( 1.0,  0.3), 0.22, 0.55, 1.0, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2(-0.4,  1.0), 0.16, 0.85, 1.4, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2( 0.7, -0.7), 0.10, 1.40, 1.9, p, t, yi); disp_y += yi;
	disp_xz += gerstner(vec2(-0.9, -0.4), 0.06, 2.10, 2.6, p, t, yi); disp_y += yi;

	VERTEX.x += disp_xz.x;
	VERTEX.z += disp_xz.y;
	VERTEX.y += disp_y;

	v_wave_height = disp_y;
	v_world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Cheap analytic normal from accumulated horizontal displacement
	NORMAL = normalize(vec3(-disp_xz.x * 1.6, 1.0, -disp_xz.y * 1.6));
}

void fragment() {
	float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	vec3 base = mix(deep_color, shallow_color, fresnel);

	// Foam on wave crests
	float crest = smoothstep(crest_threshold, crest_threshold + crest_softness, v_wave_height);

	// Foam in a ring around the island shoreline (radius set so it lands where
	// the island slope meets the water level — adjust shore_radius in inspector)
	float dist = length(v_world_pos.xz);
	float shore = 1.0 - smoothstep(0.0, shore_band_width, abs(dist - shore_radius));

	// Cheap animated noise to break up the shore foam ring
	float n = fract(sin(dot(v_world_pos.xz * 3.0, vec2(12.9898, 78.233)) + TIME * 1.4) * 43758.5453);
	shore *= 0.45 + 0.65 * n;
	shore = clamp(shore, 0.0, 1.0);

	float foam = clamp(crest * 0.55 + shore * 0.8, 0.0, 1.0);

	ALBEDO = mix(base, foam_color, foam);
	METALLIC = 0.05;
	ROUGHNESS = 0.18;
}
