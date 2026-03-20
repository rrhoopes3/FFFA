# merge_system.gd — Star merge system
# When 3 identical units (same id + same stars) exist, merge into 1 unit with stars+1
extends Node

func _ready() -> void:
	EventBus.unit_bought.connect(_on_unit_bought)
	EventBus.unit_placed.connect(func(_a, _b): check_merges())

func check_merges() -> bool:
	var merged := false
	# Check all unit IDs present on board and bench
	var unit_groups: Dictionary = {}  # unit_id -> Array of {location, index/key, stars}
	
	# Scan bench
	for i in GameState.bench.size():
		var unit = GameState.bench[i]
		if unit == null:
			continue
		var key: String = str(unit.id) + "_" + str(unit.stars)
		if not unit_groups.has(key):
			unit_groups[key] = []
		unit_groups[key].append({"location": "bench", "index": i, "id": str(unit.id), "stars": int(unit.stars)})
	
	# Scan board
	for hex_key in GameState.player_board:
		var unit = GameState.player_board[hex_key]
		var unit_id: String = unit.id if unit is Dictionary else unit
		var stars: int = unit.stars if unit is Dictionary else 1
		var key := unit_id + "_" + str(stars)
		if not unit_groups.has(key):
			unit_groups[key] = []
		unit_groups[key].append({"location": "board", "hex_key": hex_key, "id": unit_id, "stars": stars})
	
	# Check for groups of 3
	for key in unit_groups:
		var group: Array = unit_groups[key]
		if group.size() >= 3:
			var stars: int = int(group[0].stars)
			if stars >= 3:
				continue  # Max star level
			
			var unit_id: String = str(group[0].id)
			var new_stars := stars + 1
			
			# Remove 2 of the 3 units (keep the first one and upgrade it)
			var kept = group[0]
			var removed_count := 0
			
			for j in range(1, group.size()):
				if removed_count >= 2:
					break
				var entry = group[j]
				if entry.location == "bench":
					GameState.bench[entry.index] = null
					removed_count += 1
				elif entry.location == "board":
					GameState.player_board.erase(entry.hex_key)
					removed_count += 1
			
			# Upgrade the kept unit
			if removed_count == 2:
				if kept.location == "bench":
					GameState.bench[kept.index] = {"id": unit_id, "stars": new_stars}
				elif kept.location == "board":
					GameState.player_board[kept.hex_key] = {"id": unit_id, "stars": new_stars}
				
				merged = true
				EventBus.unit_merged.emit(unit_id, new_stars)
				SoundManager.play_merge()
				
				# Recursively check for more merges (e.g., three 2-stars -> 3-star)
				check_merges()
				break
	
	return merged

func _on_unit_bought(_unit_id: String, _slot: int) -> void:
	# Check for merges after buying a unit
	call_deferred("check_merges")
