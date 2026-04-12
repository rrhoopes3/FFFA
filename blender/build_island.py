"""Procedural island + arena props for FFFA. Source-of-truth pipeline.

Run from the BlenderMCP execute_blender_code tool, or in Blender's text editor:

    exec(open("B:/FFFA/blender/build_island.py").read(), {"__name__": "__main__"})

Outputs godot4/art/arena/island.glb — one parent node containing the island
mesh plus 24 prop meshes (broken columns, boulders, scattered rocks). The
island has vertex colors painted by height + radius (grass / sand / rock).

Coordinate convention: Z up in Blender. The GLTF exporter handles the
Z-up → Y-up conversion for Godot.
"""

import bpy
import bmesh
from mathutils import Vector, noise
import math
import random
import os


def smoothstep(t: float) -> float:
	t = max(0.0, min(1.0, t))
	return t * t * (3 - 2 * t)


def lerp_col(a, b, t):
	return tuple(a[i] * (1 - t) + b[i] * t for i in range(4))


# ─── Tunables ────────────────────────────────────────────────────────────────
GRID_SIZE = 130
EXTENT = 16.0
PLATEAU_RADIUS = 9.5
PLATEAU_FALLOFF = 0.8
SLOPE_END = 13.5
PLATEAU_Z = 0.0
UNDERWATER_Z = -3.8

GRASS  = (0.28, 0.52, 0.20, 1.0)
DIRT   = (0.42, 0.32, 0.20, 1.0)
SAND   = (0.82, 0.72, 0.48, 1.0)
ROCK_L = (0.50, 0.47, 0.44, 1.0)
ROCK_D = (0.22, 0.21, 0.22, 1.0)


def clear_scene():
	bpy.ops.object.select_all(action='SELECT')
	bpy.ops.object.delete(use_global=False)
	for col in [bpy.data.meshes, bpy.data.materials, bpy.data.images]:
		for item in list(col):
			if item.users == 0:
				col.remove(item)


def make_vertex_color_material(name: str):
	mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
	mat.use_nodes = True
	nt = mat.node_tree
	nt.nodes.clear()
	out = nt.nodes.new('ShaderNodeOutputMaterial')
	bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
	vc = nt.nodes.new('ShaderNodeVertexColor')
	vc.layer_name = "Col"
	bsdf.inputs['Roughness'].default_value = 0.85
	bsdf.inputs['Metallic'].default_value = 0.05
	nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
	nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
	return mat


def build_island():
	mesh = bpy.data.meshes.new("IslandMesh")
	obj = bpy.data.objects.new("Island", mesh)
	bpy.context.collection.objects.link(obj)

	bm = bmesh.new()
	bmesh.ops.create_grid(bm, x_segments=GRID_SIZE, y_segments=GRID_SIZE, size=EXTENT)
	bm.verts.ensure_lookup_table()

	for v in bm.verts:
		x, y, _ = v.co
		r = math.sqrt(x * x + y * y)

		if r < PLATEAU_RADIUS - PLATEAU_FALLOFF:
			h = PLATEAU_Z
		elif r < SLOPE_END:
			t = (r - (PLATEAU_RADIUS - PLATEAU_FALLOFF)) / (SLOPE_END - (PLATEAU_RADIUS - PLATEAU_FALLOFF))
			t = smoothstep(t)
			h = PLATEAU_Z * (1 - t) + UNDERWATER_Z * t
		else:
			far_t = min(1.0, (r - SLOPE_END) / 2.0)
			h = UNDERWATER_Z - far_t * 0.6

		n1 = noise.noise(Vector((x * 0.28, y * 0.28, 0.0)))
		n2 = noise.noise(Vector((x * 0.75, y * 0.75, 4.7)))
		n3 = noise.noise(Vector((x * 1.6,  y * 1.6,  9.3)))

		if r < PLATEAU_RADIUS - 1.5:
			noise_amp = 0.04
		elif r < PLATEAU_RADIUS + 0.5:
			t = (r - (PLATEAU_RADIUS - 1.5)) / 2.0
			noise_amp = 0.04 + t * 0.45
		else:
			noise_amp = 0.55

		h += n1 * noise_amp + n2 * noise_amp * 0.55 + n3 * noise_amp * 0.28
		v.co.z = h

	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

	color_layer = bm.loops.layers.color.new("Col")
	for f in bm.faces:
		for loop in f.loops:
			x, y, z = loop.vert.co
			r = math.sqrt(x * x + y * y)
			if z > -0.15 and r < PLATEAU_RADIUS - 0.6:
				# Mostly grass with sparse dirt patches — only positive noise
				# triggers dirt, and even then it caps at ~30% dirt mix
				n = noise.noise(Vector((x * 0.55, y * 0.55, 2.0)))
				patch = max(0.0, n) * 0.35
				col = lerp_col(GRASS, DIRT, patch)
			elif z > -0.65:
				# Plateau rim — dirt fading toward sand
				t = smoothstep((-0.15 - z) / 0.5)
				col = lerp_col(GRASS, DIRT, 1.0 - t * 0.3)
			elif z > -1.30:
				col = SAND
			elif z > -2.20:
				t = smoothstep((-1.30 - z) / 0.90)
				col = lerp_col(SAND, ROCK_L, t)
			else:
				t = smoothstep((-2.20 - z) / 1.6)
				col = lerp_col(ROCK_L, ROCK_D, t)
			loop[color_layer] = col

	bm.to_mesh(mesh)
	bm.free()

	for poly in mesh.polygons:
		poly.use_smooth = True

	return obj


def island_z_at(island, x, y):
	origin = Vector((x, y, 10.0))
	direction = Vector((0, 0, -1))
	mat_inv = island.matrix_world.inverted()
	o_local = mat_inv @ origin
	d_local = (mat_inv.to_3x3() @ direction).normalized()
	hit, loc, _, _ = island.ray_cast(o_local, d_local)
	if hit:
		return (island.matrix_world @ loc).z
	return 0.0


def make_column(name, x, y, height, tilt_deg, island, mat, color=(0.55, 0.52, 0.48)):
	bm = bmesh.new()
	bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12,
	                      radius1=0.42, radius2=0.36, depth=height)
	for v in bm.verts:
		v.co.z += height * 0.5

	mesh = bpy.data.meshes.new(f"{name}_mesh")
	bm.to_mesh(mesh)
	bm.free()

	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	obj.location = Vector((x, y, island_z_at(island, x, y) - 0.05))
	obj.rotation_euler = (math.radians(tilt_deg), math.radians(random.uniform(-15, 15)), 0)

	bm = bmesh.new()
	bm.from_mesh(mesh)
	color_layer = bm.loops.layers.color.new("Col")
	for f in bm.faces:
		for loop in f.loops:
			n = noise.noise(Vector(loop.vert.co)) * 0.08
			loop[color_layer] = (color[0] + n, color[1] + n, color[2] + n, 1.0)
	bm.to_mesh(mesh)
	bm.free()

	for poly in mesh.polygons:
		poly.use_smooth = True
	obj.data.materials.append(mat)
	return obj


def make_tree(name, x, y, scale, island, mat,
              trunk_col=(0.30, 0.20, 0.10),
              foliage_col=(0.16, 0.30, 0.13)):
	"""Stylized cone-stack tree — trunk + 3 stacked foliage cones."""
	bm = bmesh.new()
	trunk_verts = set()

	res = bmesh.ops.create_cone(
		bm, cap_ends=True, cap_tris=False, segments=8,
		radius1=0.18 * scale, radius2=0.16 * scale, depth=1.4 * scale,
	)
	for v in res['verts']:
		v.co.z += 0.7 * scale
		trunk_verts.add(v)

	# Three stacked foliage cones, decreasing radius
	for cone_z, cone_r, cone_h in [(1.30, 1.05, 1.20),
	                                (2.00, 0.80, 1.05),
	                                (2.65, 0.55, 0.95)]:
		res = bmesh.ops.create_cone(
			bm, cap_ends=True, cap_tris=False, segments=10,
			radius1=cone_r * scale, radius2=0.04 * scale, depth=cone_h * scale,
		)
		for v in res['verts']:
			v.co.z += cone_z * scale

	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

	color_layer = bm.loops.layers.color.new("Col")
	for f in bm.faces:
		for loop in f.loops:
			if loop.vert in trunk_verts:
				n = noise.noise(Vector(loop.vert.co)) * 0.04
				col = (trunk_col[0] + n, trunk_col[1] + n, trunk_col[2] + n, 1.0)
			else:
				n = noise.noise(Vector(loop.vert.co * 1.5)) * 0.06
				col = (foliage_col[0] + n, foliage_col[1] + n * 1.4, foliage_col[2] + n * 0.6, 1.0)
			loop[color_layer] = col

	mesh = bpy.data.meshes.new(f"{name}_mesh")
	bm.to_mesh(mesh)
	bm.free()

	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	obj.location = Vector((x, y, island_z_at(island, x, y) - 0.05))
	obj.rotation_euler = (random.uniform(-0.04, 0.04),
	                      random.uniform(-0.04, 0.04),
	                      random.uniform(0, math.tau))

	# Flat shading reads better for stylized cones
	for poly in mesh.polygons:
		poly.use_smooth = False
	obj.data.materials.append(mat)
	return obj


def make_monolith(name, x, y, height, island, mat, color=(0.42, 0.40, 0.38)):
	"""Tall flat stone slab — like a banner stone or megalith."""
	bm = bmesh.new()
	bmesh.ops.create_cube(bm, size=1.0)

	for v in bm.verts:
		v.co.x *= 0.55
		v.co.y *= 0.18
		v.co.z *= height
		# Subtle organic noise displacement
		n = noise.noise(Vector((v.co.x * 1.5, v.co.y * 1.5, v.co.z * 0.8)))
		v.co.x += n * 0.04
		v.co.y += n * 0.02
		v.co.z += height * 0.5

	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

	color_layer = bm.loops.layers.color.new("Col")
	for f in bm.faces:
		for loop in f.loops:
			# Vertical bands of slight color variation — looks like weathering
			band = math.sin(loop.vert.co.z * 4.0) * 0.04
			n = noise.noise(Vector(loop.vert.co * 2.0)) * 0.05
			col = (color[0] + band + n,
			       color[1] + band + n,
			       color[2] + band + n,
			       1.0)
			loop[color_layer] = col

	mesh = bpy.data.meshes.new(f"{name}_mesh")
	bm.to_mesh(mesh)
	bm.free()

	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	obj.location = Vector((x, y, island_z_at(island, x, y) - 0.05))
	obj.rotation_euler = (random.uniform(-0.06, 0.06),
	                      random.uniform(-0.06, 0.06),
	                      random.uniform(0, math.tau))

	for poly in mesh.polygons:
		poly.use_smooth = False
	obj.data.materials.append(mat)
	return obj


def make_boulder(name, x, y, scale, island, mat, color=(0.40, 0.38, 0.36)):
	bm = bmesh.new()
	bmesh.ops.create_icosphere(bm, subdivisions=2, radius=scale)

	sx = random.uniform(0.8, 1.4)
	sy = random.uniform(0.8, 1.4)
	sz = random.uniform(0.55, 0.95)
	for v in bm.verts:
		v.co.x *= sx
		v.co.y *= sy
		v.co.z *= sz
		n = noise.noise(Vector((v.co.x * 1.2, v.co.y * 1.2, v.co.z * 1.2)))
		v.co += v.co.normalized() * n * 0.18 * scale

	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

	mesh = bpy.data.meshes.new(f"{name}_mesh")
	color_layer = bm.loops.layers.color.new("Col")
	for f in bm.faces:
		for loop in f.loops:
			n = noise.noise(Vector(loop.vert.co)) * 0.06
			loop[color_layer] = (color[0] + n, color[1] + n, color[2] + n, 1.0)
	bm.to_mesh(mesh)
	bm.free()

	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	obj.location = Vector((x, y, island_z_at(island, x, y) + scale * 0.15))
	obj.rotation_euler = (random.uniform(-0.2, 0.2),
	                      random.uniform(-0.2, 0.2),
	                      random.uniform(0, math.tau))
	for poly in mesh.polygons:
		poly.use_smooth = True
	obj.data.materials.append(mat)
	return obj


# ─── Prop placement tables (cardinal so they don't overlap main.tscn pillars) ─
COLUMN_POSITIONS = [
	( 8.4,  0.0, 1.4,   6),
	(-8.4,  0.0, 1.0,  -8),
	( 0.0,  8.6, 0.7,  12),
	( 0.0, -8.6, 1.6,  -4),
	( 6.2,  6.4, 0.55, 18),
	(-6.2,  6.4, 1.25,-10),
	( 6.2, -6.4, 0.9,   5),
	(-6.2, -6.4, 0.45, 22),
]

BOULDER_POSITIONS = [
	(11.0,  3.0, 0.95),
	(-11.0, -2.5, 1.20),
	( 3.0, 11.5, 1.05),
	(-3.5, -11.0, 0.85),
	(10.5, -8.5, 1.30),
	(-10.0, 9.0, 0.90),
	( 1.5, -12.5, 0.70),
	(-1.5, 12.8, 0.85),
]

SMALL_ROCK_POSITIONS = [
	( 7.5,  1.5, 0.22),
	(-2.5,  6.5, 0.18),
	( 1.5, -7.0, 0.16),
	(-7.0, -1.5, 0.24),
	( 4.5, -2.5, 0.14),
	( 7.5,  4.0, 0.19),
	(-7.0,  3.0, 0.21),
	( 3.0,  7.5, 0.17),
]

# Trees scattered around the plateau perimeter, well clear of the existing
# main.tscn corner pillars at (±5, ±3).
TREE_POSITIONS = [
	(  5.5,  7.2, 1.15),
	( -5.5,  7.2, 1.05),
	(  5.5, -7.2, 1.10),
	( -5.5, -7.2, 1.20),
	(  7.5,  3.5, 0.95),
	( -7.5,  3.5, 1.00),
	(  7.5, -3.5, 1.10),
	( -7.5, -3.5, 0.90),
	(  2.5,  8.4, 0.85),
	( -2.5,  8.4, 0.80),
]

# Stone slab monoliths between the corner pillars and the plateau edge,
# adding banner-stone vibes to the perimeter.
MONOLITH_POSITIONS = [
	(  2.8,  9.0, 2.6),
	( -2.8,  9.0, 2.4),
	(  2.8, -9.0, 2.5),
	( -2.8, -9.0, 2.7),
	(  9.0,  2.4, 2.2),
	( -9.0,  2.4, 2.5),
	(  9.0, -2.4, 2.6),
	( -9.0, -2.4, 2.3),
]


def build_all():
	random.seed(42)
	clear_scene()
	mat = make_vertex_color_material("StoneVC")
	island = build_island()
	if island.data.materials:
		island.data.materials[0] = mat
	else:
		island.data.materials.append(mat)

	for i, (x, y, h, tilt) in enumerate(COLUMN_POSITIONS):
		make_column(f"Column_{i:02d}", x, y, h, tilt, island, mat)
	for i, (x, y, s) in enumerate(BOULDER_POSITIONS):
		make_boulder(f"Boulder_{i:02d}", x, y, s, island, mat)
	for i, (x, y, s) in enumerate(SMALL_ROCK_POSITIONS):
		make_boulder(f"SmallRock_{i:02d}", x, y, s, island, mat)
	for i, (x, y, s) in enumerate(TREE_POSITIONS):
		make_tree(f"Tree_{i:02d}", x, y, s, island, mat)
	for i, (x, y, h) in enumerate(MONOLITH_POSITIONS):
		make_monolith(f"Monolith_{i:02d}", x, y, h, island, mat)

	# Active object required by gltf exporter (the M3 export crash gotcha)
	bpy.ops.object.select_all(action='DESELECT')
	for obj in bpy.data.objects:
		if obj.type == 'MESH':
			obj.select_set(True)
	bpy.context.view_layer.objects.active = island

	out_path = "B:/FFFA/godot4/art/arena/island.glb"
	os.makedirs(os.path.dirname(out_path), exist_ok=True)
	bpy.ops.export_scene.gltf(
		filepath=out_path,
		export_format='GLB',
		use_selection=True,
		export_apply=True,
		export_yup=True,
		export_materials='EXPORT',
		export_vertex_color='ACTIVE',
		export_all_vertex_colors=True,
		export_attributes=True,
		export_normals=True,
		export_cameras=False,
		export_lights=False,
		export_animations=False,
	)
	print(f"exported {out_path}")


if __name__ == "__main__":
	build_all()
