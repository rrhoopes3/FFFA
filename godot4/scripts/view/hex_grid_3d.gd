extends Node3D
## 7×8 odd-r hex grid in 3D world space.
## Generates 56 hex tile children, each a StaticBody3D + CollisionShape3D + MeshInstance3D.
## Tracks hover via mouse picking and emits hover/click signals.
##
## World layout:
##   - X axis = column direction
##   - Z axis = row direction (positive Z = enemy side, negative Z = player side)
##   - Y axis = up
##
## Hex world coords are computed from (col, row) using flat-top is NOT used —
## we use pointy-top odd-r layout to match the sim's neighbor math.

const Hex = preload("res://scripts/sim/hex.gd")

# ─── Layout constants ───────────────────────────────────────────────────────
const HEX_SIZE := 0.55                # Hex circumradius in world units
const TILE_HEIGHT := 0.06             # Tile thickness
const TILE_GAP := 0.04                # Visual gap between tiles
const PLAYER_TINT := Color(0.18, 0.32, 0.55)
const ENEMY_TINT := Color(0.55, 0.18, 0.22)
const NEUTRAL_TINT := Color(0.22, 0.24, 0.28)
const HOVER_TINT := Color(0.95, 0.85, 0.35)

# ─── Signals ────────────────────────────────────────────────────────────────
signal hex_hovered(hex_key: String)
signal hex_clicked(hex_key: String)
signal hex_unhovered

# ─── State ──────────────────────────────────────────────────────────────────
var tiles: Dictionary = {}            # hex_key → {body, mesh, base_color}
var hovered_key: String = ""
var _hex_mesh: ArrayMesh
var _hex_shape: ConvexPolygonShape3D


func _ready() -> void:
	_build_shared_resources()
	_generate_grid()
	set_process_unhandled_input(true)


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

## Convert (col, row) offset coords to world position. Center of grid is at origin.
static func hex_to_world(col: int, row: int) -> Vector3:
	var w := sqrt(3.0) * HEX_SIZE
	var h := 1.5 * HEX_SIZE
	var x := col * w + (row & 1) * (w * 0.5)
	var z := row * h
	# Center the grid (col 0..6, row 0..7)
	x -= w * 3.0 + w * 0.25
	z -= h * 3.5
	return Vector3(x, 0.0, z)


# ═══════════════════════════════════════════════════════════════════════════
#  GENERATION
# ═══════════════════════════════════════════════════════════════════════════

func _build_shared_resources() -> void:
	# Build a flat hex prism mesh, shared by every tile.
	var verts := PackedVector3Array()
	var indices := PackedInt32Array()
	var normals := PackedVector3Array()

	var r := HEX_SIZE - TILE_GAP
	var h := TILE_HEIGHT

	# Top hexagon (6 verts at y = h/2)
	for i in 6:
		var a := PI / 6.0 + i * (PI / 3.0)
		verts.append(Vector3(cos(a) * r, h * 0.5, sin(a) * r))
		normals.append(Vector3.UP)
	# Center top vertex
	verts.append(Vector3(0, h * 0.5, 0))
	normals.append(Vector3.UP)
	var center_top := 6
	for i in 6:
		indices.append(center_top)
		indices.append(i)
		indices.append((i + 1) % 6)

	# Side quads (12 verts: 6 top + 6 bottom edges)
	var side_top_start := verts.size()
	for i in 6:
		var a := PI / 6.0 + i * (PI / 3.0)
		verts.append(Vector3(cos(a) * r, h * 0.5, sin(a) * r))
		var na := Vector3(cos(a), 0, sin(a))
		normals.append(na)
	var side_bot_start := verts.size()
	for i in 6:
		var a := PI / 6.0 + i * (PI / 3.0)
		verts.append(Vector3(cos(a) * r, -h * 0.5, sin(a) * r))
		var na := Vector3(cos(a), 0, sin(a))
		normals.append(na)
	for i in 6:
		var ni := (i + 1) % 6
		var t0 := side_top_start + i
		var t1 := side_top_start + ni
		var b0 := side_bot_start + i
		var b1 := side_bot_start + ni
		indices.append(t0); indices.append(b0); indices.append(t1)
		indices.append(t1); indices.append(b0); indices.append(b1)

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	_hex_mesh = ArrayMesh.new()
	_hex_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

	# Shared collision shape — convex hull of the verts
	_hex_shape = ConvexPolygonShape3D.new()
	_hex_shape.points = verts


func _generate_grid() -> void:
	for row in Hex.ROWS:
		for col in Hex.COLS:
			_make_tile(col, row)


func _make_tile(col: int, row: int) -> void:
	var key := Hex.key(col, row)
	var pos := hex_to_world(col, row)
	var base_color := NEUTRAL_TINT
	if row in Hex.PLAYER_ROWS:
		base_color = PLAYER_TINT
	elif row in Hex.ENEMY_ROWS:
		base_color = ENEMY_TINT

	var body := StaticBody3D.new()
	body.name = "Tile_%s" % key
	body.position = pos
	body.set_meta("hex_key", key)
	# Use input ray pickable; layer 1 is enough.
	body.input_ray_pickable = true
	add_child(body)

	var mesh := MeshInstance3D.new()
	mesh.mesh = _hex_mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = base_color
	mat.metallic = 0.0
	mat.roughness = 0.7
	mat.emission_enabled = true
	mat.emission = base_color
	mat.emission_energy_multiplier = 0.15
	mesh.material_override = mat
	body.add_child(mesh)

	var col_shape := CollisionShape3D.new()
	col_shape.shape = _hex_shape
	body.add_child(col_shape)

	tiles[key] = {"body": body, "mesh": mesh, "material": mat, "base_color": base_color}


# ═══════════════════════════════════════════════════════════════════════════
#  HOVER PICKING
# ═══════════════════════════════════════════════════════════════════════════

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_update_hover(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if hovered_key != "":
			hex_clicked.emit(hovered_key)


func _update_hover(mouse_pos: Vector2) -> void:
	var camera := get_viewport().get_camera_3d()
	if camera == null:
		return
	var from := camera.project_ray_origin(mouse_pos)
	var dir := camera.project_ray_normal(mouse_pos)
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(from, from + dir * 100.0)
	query.collide_with_areas = false
	query.collide_with_bodies = true
	var hit := space.intersect_ray(query)
	var new_key := ""
	if hit and hit.collider and hit.collider.has_meta("hex_key"):
		new_key = hit.collider.get_meta("hex_key")
	if new_key != hovered_key:
		_set_hover(new_key)


func _set_hover(new_key: String) -> void:
	if hovered_key != "" and tiles.has(hovered_key):
		var prev = tiles[hovered_key]
		prev.material.albedo_color = prev.base_color
		prev.material.emission = prev.base_color
		prev.material.emission_energy_multiplier = 0.15
	hovered_key = new_key
	if new_key != "" and tiles.has(new_key):
		var cur = tiles[new_key]
		cur.material.albedo_color = HOVER_TINT
		cur.material.emission = HOVER_TINT
		cur.material.emission_energy_multiplier = 0.6
		hex_hovered.emit(new_key)
	else:
		hex_unhovered.emit()
