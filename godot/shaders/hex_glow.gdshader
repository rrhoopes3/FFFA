shader_type canvas_item;

// Hex glow shader — adds pulsing glow effect to hex tiles
uniform vec4 glow_color : source_color = vec4(0.4, 0.65, 1.0, 0.5);
uniform float glow_intensity : hint_range(0.0, 3.0) = 1.0;
uniform float pulse_speed : hint_range(0.0, 5.0) = 2.0;
uniform float glow_radius : hint_range(0.0, 0.5) = 0.15;

void fragment() {
	vec4 tex_color = texture(TEXTURE, UV);
	
	// Distance from center for radial glow
	vec2 center = vec2(0.5);
	float dist = distance(UV, center);
	
	// Pulsing glow
	float pulse = sin(TIME * pulse_speed) * 0.3 + 0.7;
	float glow = smoothstep(0.5, 0.5 - glow_radius, dist) * glow_intensity * pulse;
	
	// Edge glow (stronger at borders)
	float edge = smoothstep(0.35, 0.5, dist) * smoothstep(0.55, 0.5, dist);
	edge *= glow_intensity * pulse * 2.0;
	
	vec4 final_color = tex_color;
	final_color.rgb += glow_color.rgb * glow;
	final_color.rgb += glow_color.rgb * edge;
	final_color.a = max(tex_color.a, glow * glow_color.a);
	
	COLOR = final_color;
}
