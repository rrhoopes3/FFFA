extends Control
## Fullscreen, mouse-pass drop target that catches releases that fall over
## the 3D arena (i.e. anywhere not eaten by a smaller Control). Routes the
## drop position to the camera-ray hex picker on game_ui.

func _can_drop_data(_pos: Vector2, data: Variant) -> bool:
	return data is Dictionary and data.get("source", "") == "bench"


func _drop_data(pos: Vector2, data: Variant) -> void:
	var ui = get_meta("ui", null)
	if ui:
		# pos is local-to-this-control; this control is fullscreen so it's
		# already viewport coords.
		ui.handle_drop_on_arena(pos, data)
