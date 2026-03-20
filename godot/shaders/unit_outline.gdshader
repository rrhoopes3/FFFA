shader_type canvas_item;

// Unit outline shader — adds colored outline and star-level glow
uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 0.8);
uniform float outline_width : hint_range(0.0, 5.0) = 2.0;
uniform float glow_strength : hint_range(0.0, 3.0) = 1.0;
uniform bool is_hurt = false;
uniform float hurt_flash : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	vec2 pixel_size = TEXTURE_PIXEL_SIZE;
	
	// Sample neighbors for outline detection
	float alpha_sum = 0.0;
	for (float x = -outline_width; x <= outline_width; x += 1.0) {
		for (float y = -outline_width; y <= outline_width; y += 1.0) {
			if (x == 0.0 && y == 0.0) continue;
			vec2 offset = vec2(x, y) * pixel_size;
			alpha_sum += texture(TEXTURE, UV + offset).a;
		}
	}
	
	// Create outline where neighbors have alpha but current pixel doesn't
	float outline = clamp(alpha_sum, 0.0, 1.0) * (1.0 - tex.a);
	
	// Glow effect (softer, wider outline)
	float glow = smoothstep(0.0, 1.0, alpha_sum / (outline_width * outline_width * 4.0));
	glow *= (1.0 - tex.a) * glow_strength;
	
	vec4 final_color = tex;
	// Add outline
	final_color = mix(final_color, outline_color, outline * outline_color.a);
	// Add glow behind
	final_color.rgb += outline_color.rgb * glow * 0.5;
	final_color.a = max(final_color.a, max(outline * outline_color.a, glow * 0.3));
	
	// Damage flash
	if (is_hurt) {
		final_color.rgb = mix(final_color.rgb, vec3(1.0), hurt_flash);
	}
	
	COLOR = final_color;
}
