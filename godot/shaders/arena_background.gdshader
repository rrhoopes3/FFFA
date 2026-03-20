shader_type canvas_item;

// Arena background shader — atmospheric arena floor with animated effects
uniform vec4 color_top : source_color = vec4(0.027, 0.067, 0.122, 1.0);
uniform vec4 color_mid : source_color = vec4(0.043, 0.102, 0.176, 1.0);
uniform vec4 color_bottom : source_color = vec4(0.020, 0.035, 0.075, 1.0);
uniform float grid_opacity : hint_range(0.0, 0.1) = 0.025;
uniform float grid_spacing : hint_range(10.0, 100.0) = 40.0;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.25;
uniform float spotlight_intensity : hint_range(0.0, 0.5) = 0.14;
uniform vec4 warm_light_color : source_color = vec4(1.0, 0.5, 0.36, 0.08);
uniform vec4 cool_light_color : source_color = vec4(0.376, 0.678, 1.0, 0.1);

void fragment() {
	vec2 uv = UV;
	
	// Base gradient (3-stop vertical)
	vec4 base;
	if (uv.y < 0.4) {
		base = mix(color_top, color_mid, uv.y / 0.4);
	} else {
		base = mix(color_mid, color_bottom, (uv.y - 0.4) / 0.6);
	}
	
	// Subtle grid pattern
	vec2 grid_uv = uv * vec2(textureSize(TEXTURE, 0));
	float grid_x = step(mod(grid_uv.x, grid_spacing), 1.0);
	float grid_y = step(mod(grid_uv.y, grid_spacing), 1.0);
	float grid = max(grid_x, grid_y) * grid_opacity;
	base.rgb += vec3(0.427, 0.518, 0.659) * grid;
	
	// Side light columns
	float warm_beam = smoothstep(0.24, 0.0, uv.x) * warm_light_color.a;
	float cool_beam = smoothstep(0.76, 1.0, uv.x) * cool_light_color.a;
	base.rgb += warm_light_color.rgb * warm_beam;
	base.rgb += cool_light_color.rgb * cool_beam;
	
	// Center spotlight
	float spotlight_dist = distance(uv, vec2(0.5));
	float spotlight = smoothstep(0.6, 0.0, spotlight_dist) * spotlight_intensity;
	base.rgb += vec3(0.204, 0.337, 0.557) * spotlight;
	
	// Animated shimmer
	float shimmer_x = 0.5 + sin(TIME * 2.0) * 0.15;
	float shimmer_y = 0.5 + cos(TIME * 1.5) * 0.1;
	float shimmer_dist = distance(uv, vec2(shimmer_x, shimmer_y));
	float shimmer = smoothstep(0.35, 0.0, shimmer_dist) * 0.04;
	base.rgb += vec3(0.235, 0.314, 0.471) * shimmer;
	
	// Arena ring (elliptical)
	vec2 ring_center = vec2(0.5, 0.44);
	vec2 ring_uv = (uv - ring_center) * vec2(1.0, 1.4);
	float ring_dist = length(ring_uv);
	float ring = smoothstep(0.33, 0.32, ring_dist) * smoothstep(0.30, 0.31, ring_dist);
	base.rgb += vec3(1.0, 0.847, 0.525) * ring * 0.18;
	
	// Inner ring
	float inner_ring = smoothstep(0.25, 0.24, ring_dist) * smoothstep(0.22, 0.23, ring_dist);
	base.rgb += vec3(0.49, 0.784, 1.0) * inner_ring * 0.08;
	
	// Vignette
	float vignette = smoothstep(0.3, 0.8, spotlight_dist) * vignette_strength;
	base.rgb *= 1.0 - vignette;
	
	COLOR = base;
}
