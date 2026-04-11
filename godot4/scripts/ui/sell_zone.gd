extends Panel
## Drop target that sells the dragged bench unit.

func _can_drop_data(_pos: Vector2, data: Variant) -> bool:
	return data is Dictionary and data.get("source", "") == "bench"


func _drop_data(_pos: Vector2, data: Variant) -> void:
	var ui = get_meta("ui", null)
	if ui:
		ui.handle_drop_on_sell(data)
