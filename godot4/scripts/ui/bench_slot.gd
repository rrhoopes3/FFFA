extends Panel
## A bench slot. Source-and-target for drag-drop. Sources to its current
## bench unit (if any), accepts drops from any other bench slot to swap.

func _get_drag_data(_pos: Vector2) -> Variant:
	var index: int = get_meta("index", -1)
	if index < 0:
		return null
	if GameState.bench[index] == null:
		return null
	var ui = get_meta("ui", null)
	if ui:
		var preview = ui.make_bench_drag_preview(index)
		if preview:
			set_drag_preview(preview)
	return {"source": "bench", "index": index}


func _can_drop_data(_pos: Vector2, data: Variant) -> bool:
	return data is Dictionary and data.get("source", "") == "bench"


func _drop_data(_pos: Vector2, data: Variant) -> void:
	var index: int = get_meta("index", -1)
	var ui = get_meta("ui", null)
	if ui and index >= 0:
		ui.handle_drop_on_bench(index, data)
