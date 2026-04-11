extends RefCounted
## Pure hex-grid math (offset coordinates "col,row", 7 cols × 8 rows, odd-r layout).
## No rendering. Used by combat_sim and game_state.
##
## NOTE: Intentionally no `class_name` — autoloads parse before the global
## class cache populates, so consumers must `preload()` this file directly.

const COLS := 7
const ROWS := 8
const PLAYER_ROWS: Array[int] = [4, 5, 6, 7]
const ENEMY_ROWS: Array[int] = [0, 1, 2, 3]


static func key(col: int, row: int) -> String:
	return "%d,%d" % [col, row]


static func parse(hex_key: String) -> Vector2i:
	var parts := hex_key.split(",")
	return Vector2i(int(parts[0]), int(parts[1]))


static func in_bounds(col: int, row: int) -> bool:
	return col >= 0 and col < COLS and row >= 0 and row < ROWS


## Offset → cube conversion, then cube distance.
static func distance(key_a: String, key_b: String) -> int:
	var a := parse(key_a)
	var b := parse(key_b)
	var ax := a.x - int((a.y - (a.y & 1)) / 2)
	var az := a.y
	var ay := -ax - az
	var bx := b.x - int((b.y - (b.y & 1)) / 2)
	var bz := b.y
	var by := -bx - bz
	return int((absi(ax - bx) + absi(ay - by) + absi(az - bz)) / 2)


static func neighbors(hex_key: String) -> Array[String]:
	var pos := parse(hex_key)
	var col := pos.x
	var row := pos.y
	var is_odd := row & 1
	var directions: Array
	if is_odd:
		directions = [[1,0], [1,-1], [0,-1], [-1,0], [0,1], [1,1]]
	else:
		directions = [[1,0], [0,-1], [-1,-1], [-1,0], [-1,1], [0,1]]
	var result: Array[String] = []
	for dir in directions:
		var nc: int = col + dir[0]
		var nr: int = row + dir[1]
		if in_bounds(nc, nr):
			result.append(key(nc, nr))
	return result
