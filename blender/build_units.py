"""
build_units.py — procedural chibi-cat builder for FFFA.

Run inside Blender (via the BlenderMCP execute_blender_code tool, or as a
script in the Text Editor). Generates one .glb per UNIT_CONFIGS entry into
godot4/art/units/. Each cat is built from primitives (spheres, cones,
cylinders) plus a bezier-curve tail, joined into a single mesh with multiple
material surfaces, and exported with the active object set so headless gltf2
doesn't choke.

v2 detail pass (polish): rounded cylinder legs with foot overhangs, tapered
bezier tail, larger eyes with pupils + highlights, inner-ear pink, whiskers,
chin, cheek tufts for fluffy breeds, multi-cone ear tufts for mainecoon,
metallic accent for tank collars, AgX-friendly material roughness.

Faction visual conventions
--------------------------
- Alley         gritty greys, varied solid/tabby/tuxedo, often torn ear
- Persian       cream/white, fluffy (ruff + cheek tufts), short ear
- Siamese       cream body with darker "points" (face/ears/legs/tail) — colorpoint
- MaineCoon     brown/rust, oversized body, triple-cone ear tufts
- Bengal        golden orange with darker stripe accent
- Sphynx        pinkish hairless skin (no whiskers, lower roughness)
- ScottishFold  greys, folded ears (cones rotated forward + scaled flat)
- Ragdoll       light blue-grey body with darker face/ears/feet points

Cost → scale: 1-cost = 0.95, 5-cost = 1.20.

Mesh origins land at body-center after join — the Godot view layer corrects
this at runtime via aabb.position.y, so we leave it as-is.
"""

import bpy
import math
import os

OUT_DIR = "B:/FFFA/godot4/art/units"

# ─── Color helpers ──────────────────────────────────────────────────────────

def hex_rgb(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def darken(rgb, f=0.55):
    return tuple(max(0.0, c * f) for c in rgb)


def lighten(rgb, f=0.4):
    return tuple(min(1.0, c + (1.0 - c) * f) for c in rgb)


# ─── Unit configs ───────────────────────────────────────────────────────────
# Each entry: id → dict with fur_main, fur_belly, accent (jacket/markings),
# eye_color, plus per-unit flags for ears/scale/specials.

ALLEY_BASE = hex_rgb("#A0AEC1")
PERSIAN_BASE = hex_rgb("#F3E5F5")
SIAMESE_BASE = hex_rgb("#60A5FA")
MAINECOON_BASE = hex_rgb("#92400E")
BENGAL_BASE = hex_rgb("#F59E0B")
SPHYNX_BASE = hex_rgb("#F3A5B6")
SCOTTISH_BASE = hex_rgb("#D1D5DB")
RAGDOLL_BASE = hex_rgb("#93C5FD")

EYE_GOLD = (0.90, 0.78, 0.20)
EYE_GREEN = (0.30, 0.85, 0.45)
EYE_BLUE = (0.35, 0.70, 0.95)
EYE_AMBER = (0.95, 0.55, 0.10)
EYE_RED = (0.90, 0.20, 0.25)
EYE_VIOLET = (0.65, 0.40, 0.90)

UNIT_CONFIGS = {
    # ===== ALLEY =====
    "alley_tabby_thug":   {"fur_main": (0.34, 0.27, 0.20), "fur_belly": (0.78, 0.72, 0.60), "accent": (0.10, 0.10, 0.12), "eye_color": EYE_GOLD,  "torn_ear": True,  "scale": 0.95},
    "alley_ginger_rogue": {"fur_main": (0.85, 0.45, 0.18), "fur_belly": (0.95, 0.78, 0.55), "accent": (0.55, 0.20, 0.05), "eye_color": EYE_GREEN, "torn_ear": True,  "scale": 0.95},
    "alley_tuxedo_con":   {"fur_main": (0.05, 0.05, 0.07), "fur_belly": (0.95, 0.95, 0.95), "accent": (0.10, 0.10, 0.12), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.00},
    "alley_street_yowler":{"fur_main": (0.45, 0.42, 0.40), "fur_belly": (0.70, 0.66, 0.62), "accent": (0.15, 0.13, 0.12), "eye_color": EYE_AMBER, "torn_ear": True,  "scale": 1.00},
    "alley_dumpster_king":{"fur_main": (0.30, 0.25, 0.22), "fur_belly": (0.55, 0.50, 0.42), "accent": (0.65, 0.50, 0.10), "eye_color": EYE_GOLD,  "torn_ear": True,  "scale": 1.10, "tank": True},
    "alley_feral_boss":   {"fur_main": (0.22, 0.18, 0.15), "fur_belly": (0.40, 0.34, 0.28), "accent": (0.75, 0.10, 0.10), "eye_color": EYE_RED,   "torn_ear": True,  "scale": 1.20, "tank": True},

    # ===== PERSIAN =====
    "persian_pampered":   {"fur_main": lighten(PERSIAN_BASE, 0.10), "fur_belly": (1.00, 0.98, 0.95), "accent": (0.85, 0.55, 0.85), "eye_color": EYE_BLUE,  "torn_ear": False, "scale": 0.95, "fluffy": True, "short_ear": True, "tank": True},
    "persian_princess":   {"fur_main": (0.96, 0.92, 0.95),           "fur_belly": (1.00, 1.00, 1.00), "accent": (0.92, 0.45, 0.65), "eye_color": EYE_BLUE,  "torn_ear": False, "scale": 1.00, "fluffy": True, "short_ear": True, "tank": True},
    "persian_groomer":    {"fur_main": (0.92, 0.86, 0.78),           "fur_belly": (0.98, 0.96, 0.92), "accent": (0.75, 0.55, 0.30), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.00, "fluffy": True, "short_ear": True},
    "persian_snob":       {"fur_main": (0.88, 0.82, 0.78),           "fur_belly": (0.98, 0.94, 0.90), "accent": (0.40, 0.10, 0.55), "eye_color": EYE_VIOLET,"torn_ear": False, "scale": 1.05, "fluffy": True, "short_ear": True, "tank": True},
    "persian_himalayan":  {"fur_main": (0.88, 0.82, 0.72),           "fur_belly": (0.98, 0.94, 0.86), "accent": (0.30, 0.20, 0.55), "eye_color": EYE_BLUE,  "torn_ear": False, "scale": 1.10, "fluffy": True, "short_ear": True, "points": (0.30, 0.18, 0.12)},
    "persian_emperor":    {"fur_main": (0.98, 0.95, 0.88),           "fur_belly": (1.00, 1.00, 0.96), "accent": (0.85, 0.65, 0.10), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.20, "fluffy": True, "short_ear": True, "tank": True},

    # ===== SIAMESE =====
    "siamese_screamer":   {"fur_main": (0.92, 0.86, 0.72), "fur_belly": (0.98, 0.95, 0.82), "accent": (0.10, 0.10, 0.12), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 0.95, "points": (0.18, 0.14, 0.12)},
    "siamese_chatterbox": {"fur_main": (0.92, 0.86, 0.72), "fur_belly": (0.98, 0.95, 0.82), "accent": (0.30, 0.22, 0.18), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 0.95, "points": (0.20, 0.16, 0.13)},
    "siamese_soprano":    {"fur_main": (0.94, 0.88, 0.74), "fur_belly": (1.00, 0.96, 0.84), "accent": (0.80, 0.20, 0.40), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.00, "points": (0.18, 0.14, 0.12)},
    "siamese_gossip":     {"fur_main": (0.92, 0.86, 0.72), "fur_belly": (0.98, 0.95, 0.82), "accent": (0.55, 0.35, 0.78), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.05, "points": (0.20, 0.15, 0.12)},
    "siamese_opera":      {"fur_main": (0.95, 0.90, 0.78), "fur_belly": (1.00, 0.97, 0.86), "accent": (0.85, 0.10, 0.55), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.10, "points": (0.18, 0.13, 0.10)},
    "siamese_conductor":  {"fur_main": (0.96, 0.92, 0.80), "fur_belly": (1.00, 0.98, 0.88), "accent": (0.10, 0.10, 0.12), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.20, "points": (0.16, 0.12, 0.10)},

    # ===== MAINECOON =====
    "mainecoon_cub":      {"fur_main": (0.55, 0.34, 0.18), "fur_belly": (0.85, 0.68, 0.42), "accent": (0.30, 0.18, 0.10), "eye_color": EYE_GREEN, "torn_ear": False, "scale": 0.95, "fluffy": True, "ear_tufts": True, "tank": True},
    "mainecoon_guardian": {"fur_main": (0.50, 0.30, 0.16), "fur_belly": (0.78, 0.62, 0.40), "accent": (0.25, 0.15, 0.08), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.05, "fluffy": True, "ear_tufts": True, "tank": True},
    "mainecoon_titan":    {"fur_main": (0.45, 0.28, 0.14), "fur_belly": (0.72, 0.55, 0.34), "accent": (0.20, 0.12, 0.06), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.20, "fluffy": True, "ear_tufts": True, "tank": True},
    "mainecoon_brawler":  {"fur_main": (0.42, 0.26, 0.14), "fur_belly": (0.68, 0.52, 0.32), "accent": (0.65, 0.10, 0.10), "eye_color": EYE_AMBER, "torn_ear": True,  "scale": 1.10, "fluffy": True, "ear_tufts": True},
    "mainecoon_elder":    {"fur_main": (0.62, 0.50, 0.42), "fur_belly": (0.85, 0.78, 0.70), "accent": (0.35, 0.25, 0.18), "eye_color": EYE_GREEN, "torn_ear": False, "scale": 1.10, "fluffy": True, "ear_tufts": True},
    "mainecoon_alpha":    {"fur_main": (0.40, 0.24, 0.12), "fur_belly": (0.70, 0.55, 0.32), "accent": (0.85, 0.65, 0.10), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.25, "fluffy": True, "ear_tufts": True, "tank": True},

    # ===== BENGAL =====
    "bengal_kitten":      {"fur_main": (0.95, 0.65, 0.20), "fur_belly": (1.00, 0.85, 0.55), "accent": (0.25, 0.15, 0.05), "eye_color": EYE_GREEN, "torn_ear": False, "scale": 0.95},
    "bengal_stalker":     {"fur_main": (0.92, 0.60, 0.18), "fur_belly": (0.98, 0.80, 0.50), "accent": (0.18, 0.10, 0.04), "eye_color": EYE_GREEN, "torn_ear": False, "scale": 1.00},
    "bengal_hunter":      {"fur_main": (0.88, 0.55, 0.15), "fur_belly": (0.95, 0.78, 0.46), "accent": (0.15, 0.08, 0.03), "eye_color": EYE_AMBER, "torn_ear": False, "scale": 1.00},
    "bengal_assassin":    {"fur_main": (0.82, 0.48, 0.12), "fur_belly": (0.92, 0.70, 0.40), "accent": (0.05, 0.04, 0.04), "eye_color": EYE_RED,   "torn_ear": False, "scale": 1.05},
    "bengal_pack_leader": {"fur_main": (0.95, 0.62, 0.18), "fur_belly": (1.00, 0.82, 0.50), "accent": (0.85, 0.10, 0.10), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.15},
    "bengal_apex":        {"fur_main": (0.98, 0.68, 0.22), "fur_belly": (1.00, 0.88, 0.55), "accent": (0.10, 0.05, 0.05), "eye_color": EYE_AMBER, "torn_ear": True,  "scale": 1.25},

    # ===== SPHYNX =====
    "sphynx_creeper":     {"fur_main": (0.93, 0.74, 0.72), "fur_belly": (0.98, 0.85, 0.82), "accent": (0.55, 0.30, 0.32), "eye_color": EYE_AMBER, "torn_ear": False, "scale": 0.95, "hairless": True},
    "sphynx_warmer":      {"fur_main": (0.95, 0.78, 0.74), "fur_belly": (1.00, 0.88, 0.84), "accent": (0.60, 0.35, 0.40), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.00, "hairless": True},
    "sphynx_menace":      {"fur_main": (0.88, 0.68, 0.66), "fur_belly": (0.95, 0.80, 0.78), "accent": (0.35, 0.10, 0.20), "eye_color": EYE_RED,   "torn_ear": False, "scale": 1.05, "hairless": True},
    "sphynx_cultist":     {"fur_main": (0.85, 0.65, 0.65), "fur_belly": (0.92, 0.78, 0.76), "accent": (0.35, 0.10, 0.55), "eye_color": EYE_VIOLET,"torn_ear": False, "scale": 1.05, "hairless": True},
    "sphynx_oracle":      {"fur_main": (0.92, 0.74, 0.72), "fur_belly": (0.97, 0.85, 0.82), "accent": (0.30, 0.55, 0.95), "eye_color": EYE_BLUE,  "torn_ear": False, "scale": 1.10, "hairless": True},
    "sphynx_overlord":    {"fur_main": (0.80, 0.60, 0.60), "fur_belly": (0.90, 0.74, 0.72), "accent": (0.10, 0.05, 0.10), "eye_color": EYE_VIOLET,"torn_ear": False, "scale": 1.20, "hairless": True},

    # ===== SCOTTISH FOLD =====
    "scottish_lucky":     {"fur_main": (0.72, 0.72, 0.74), "fur_belly": (0.92, 0.92, 0.94), "accent": (0.20, 0.55, 0.25), "eye_color": EYE_GREEN, "torn_ear": False, "scale": 0.95, "fold_ear": True},
    "scottish_gambler":   {"fur_main": (0.65, 0.65, 0.68), "fur_belly": (0.88, 0.88, 0.90), "accent": (0.85, 0.15, 0.15), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.00, "fold_ear": True},
    "scottish_dealer":    {"fur_main": (0.68, 0.68, 0.70), "fur_belly": (0.90, 0.90, 0.92), "accent": (0.10, 0.10, 0.12), "eye_color": EYE_AMBER, "torn_ear": False, "scale": 1.00, "fold_ear": True},
    "scottish_bettor":    {"fur_main": (0.62, 0.62, 0.65), "fur_belly": (0.86, 0.86, 0.88), "accent": (0.85, 0.65, 0.10), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.05, "fold_ear": True},
    "scottish_fortune":   {"fur_main": (0.70, 0.70, 0.72), "fur_belly": (0.92, 0.92, 0.94), "accent": (0.55, 0.20, 0.78), "eye_color": EYE_VIOLET,"torn_ear": False, "scale": 1.10, "fold_ear": True},
    "scottish_jackpot":   {"fur_main": (0.75, 0.75, 0.78), "fur_belly": (0.95, 0.95, 0.96), "accent": (0.95, 0.78, 0.10), "eye_color": EYE_GOLD,  "torn_ear": False, "scale": 1.20, "fold_ear": True},

    # ===== RAGDOLL =====
    "ragdoll_faker":      {"fur_main": (0.88, 0.88, 0.94), "fur_belly": (0.97, 0.97, 1.00), "accent": (0.30, 0.35, 0.55), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 0.95, "fluffy": True, "points": (0.30, 0.30, 0.45), "tank": True},
    "ragdoll_lazy":       {"fur_main": (0.90, 0.90, 0.95), "fur_belly": (0.98, 0.98, 1.00), "accent": (0.40, 0.45, 0.62), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.00, "fluffy": True, "points": (0.32, 0.32, 0.48), "tank": True},
    "ragdoll_flopper":    {"fur_main": (0.86, 0.86, 0.92), "fur_belly": (0.96, 0.96, 1.00), "accent": (0.32, 0.36, 0.55), "eye_color": EYE_BLUE, "torn_ear": False, "scale": 1.05, "fluffy": True, "points": (0.28, 0.28, 0.42), "tank": True},
    "ragdoll_dreamer":    {"fur_main": (0.92, 0.92, 0.96), "fur_belly": (0.98, 0.98, 1.00), "accent": (0.55, 0.35, 0.78), "eye_color": EYE_VIOLET,"torn_ear": False, "scale": 1.05, "fluffy": True, "points": (0.40, 0.32, 0.55)},
    "ragdoll_therapist":  {"fur_main": (0.95, 0.95, 0.98), "fur_belly": (1.00, 1.00, 1.00), "accent": (0.30, 0.78, 0.55), "eye_color": EYE_GREEN,"torn_ear": False, "scale": 1.10, "fluffy": True, "points": (0.34, 0.42, 0.55)},
    "ragdoll_zen":        {"fur_main": (0.93, 0.93, 0.97), "fur_belly": (0.99, 0.99, 1.00), "accent": (0.85, 0.65, 0.10), "eye_color": EYE_AMBER,"torn_ear": False, "scale": 1.20, "fluffy": True, "points": (0.28, 0.28, 0.42), "tank": True},
}


# ─── Material helpers ───────────────────────────────────────────────────────

def make_mat(name, rgb, emission=None, emission_strength=1.8,
             roughness=0.78, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
        bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def assign_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ─── Cat builder ────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.curves):
        bpy.data.curves.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.armatures):
        bpy.data.armatures.remove(block)
    for block in list(bpy.data.actions):
        bpy.data.actions.remove(block)


def add_uv_sphere(name, location, scale, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    return obj


def add_cone(name, location, scale, vertices=20):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=1.0, radius2=0.0, depth=2.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    return obj


def add_cylinder(name, location, scale, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=1.0, depth=2.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    return obj


def add_tail_curve(name, control_pts, radii, bevel_res=6, res_u=8):
    """Tapered tube from a bezier curve. control_pts: [(x,y,z), ...]; radii
    parallel list per control point. Auto-handles; converted to mesh so it
    joins with the rest of the cat."""
    curve_data = bpy.data.curves.new(name=f"{name}_curve", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.resolution_u = res_u
    curve_data.bevel_mode = 'ROUND'
    curve_data.bevel_depth = 1.0
    curve_data.bevel_resolution = bevel_res
    spline = curve_data.splines.new('BEZIER')
    spline.bezier_points.add(len(control_pts) - 1)
    for i, pt in enumerate(control_pts):
        bp = spline.bezier_points[i]
        bp.co = pt
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
        bp.radius = radii[i]
    curve_obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(curve_obj)
    bpy.ops.object.select_all(action='DESELECT')
    curve_obj.select_set(True)
    bpy.context.view_layer.objects.active = curve_obj
    bpy.ops.object.convert(target='MESH')
    mesh_obj = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return mesh_obj


# ─── Shared palette for detail features ────────────────────────────────────
INNER_EAR_COL = (0.96, 0.68, 0.72)
PAW_PAD_COL   = (0.80, 0.48, 0.52)
PUPIL_COL     = (0.02, 0.02, 0.03)
HILITE_COL    = (1.00, 1.00, 1.00)
WHISKER_COL   = (0.96, 0.95, 0.92)


def build_cat(unit_id, cfg):
    """Procedural chibi cat v2. Returns the joined MESH object.

    Adds over v1: rounded cylinder legs + foot overhang spheres, pupils and
    eye highlights, inner-ear pink, whiskers, chin, cheek tufts for fluffy,
    triple-cone ear tufts for mainecoon, tapered bezier tail, metallic tank
    collar with dangling tag.
    """
    fur_main = cfg["fur_main"]
    fur_belly = cfg["fur_belly"]
    accent = cfg["accent"]
    eye_color = cfg["eye_color"]
    s = cfg.get("scale", 1.0)
    fluffy = cfg.get("fluffy", False)
    short_ear = cfg.get("short_ear", False)
    fold_ear = cfg.get("fold_ear", False)
    ear_tufts = cfg.get("ear_tufts", False)
    torn = cfg.get("torn_ear", False)
    tank = cfg.get("tank", False)
    hairless = cfg.get("hairless", False)
    points = cfg.get("points", None)

    point_color = points if points else fur_main
    body_rough = 0.45 if hairless else 0.80

    m_main    = make_mat(f"{unit_id}_fur",     fur_main,  roughness=body_rough)
    m_belly   = make_mat(f"{unit_id}_belly",   fur_belly, roughness=body_rough)
    m_accent  = make_mat(f"{unit_id}_accent",  accent,    roughness=0.55,
                         metallic=(0.8 if tank else 0.0))
    m_eye     = make_mat(f"{unit_id}_eye",     eye_color, emission=eye_color,
                         emission_strength=2.8, roughness=0.08)
    m_pupil   = make_mat(f"{unit_id}_pupil",   PUPIL_COL, roughness=0.35)
    m_hilite  = make_mat(f"{unit_id}_hilite",  HILITE_COL,
                         emission=HILITE_COL, emission_strength=3.5, roughness=0.08)
    m_point   = make_mat(f"{unit_id}_point",   point_color, roughness=body_rough)
    m_inner   = make_mat(f"{unit_id}_inner",   INNER_EAR_COL, roughness=0.55)
    m_paw     = make_mat(f"{unit_id}_paw",     PAW_PAD_COL,   roughness=0.5)
    m_whisker = make_mat(f"{unit_id}_whisker", WHISKER_COL,   roughness=0.3)

    parts = []

    # ── Body/belly ──────────────────────────────────────────────────────
    body_w = 0.55 * s * (1.15 if tank else 1.0)
    body_h = 0.50 * s * (1.10 if tank else 1.0)
    body_z = 0.52 * s

    body = add_uv_sphere("Body", (0, 0, body_z),
                         (body_w, body_w * 0.92, body_h), segments=32, rings=22)
    assign_mat(body, m_main); parts.append(body)

    belly = add_uv_sphere("Belly",
                          (0, -body_w * 0.25, body_z - body_h * 0.10),
                          (body_w * 0.72, body_w * 0.58, body_h * 0.74),
                          segments=24, rings=16)
    assign_mat(belly, m_belly); parts.append(belly)

    if fluffy:
        ruff = add_uv_sphere("Ruff",
                             (0, -body_w * 0.08, body_z + body_h * 0.62),
                             (body_w * 0.92, body_w * 0.82, body_h * 0.32),
                             segments=26, rings=16)
        assign_mat(ruff, m_main); parts.append(ruff)

    # ── Head ───────────────────────────────────────────────────────────
    head_r = 0.46 * s
    head_z = 1.10 * s + (0.02 if fluffy else 0.0)
    head_y = -0.08 * s
    head = add_uv_sphere("Head", (0, head_y, head_z),
                         (head_r * 1.02, head_r * 0.98, head_r * 0.97),
                         segments=32, rings=22)
    assign_mat(head, m_point if points else m_main); parts.append(head)

    # Cheek tufts for fluffy non-hairless (persian, mainecoon, ragdoll)
    if fluffy and not hairless:
        for sign, nm in ((-1, "CheekL"), (1, "CheekR")):
            c = add_uv_sphere(nm,
                              (sign * head_r * 0.85, head_y - head_r * 0.35,
                               head_z - head_r * 0.12),
                              (head_r * 0.32, head_r * 0.30, head_r * 0.30),
                              segments=16, rings=12)
            assign_mat(c, m_belly); parts.append(c)

    chin = add_uv_sphere("Chin",
                         (0, head_y - head_r * 0.62, head_z - head_r * 0.48),
                         (head_r * 0.36, head_r * 0.28, head_r * 0.20),
                         segments=16, rings=12)
    assign_mat(chin, m_belly); parts.append(chin)

    muz_z = head_z - head_r * 0.22
    muzzle = add_uv_sphere("Muzzle",
                           (0, head_y - head_r * 0.88, muz_z),
                           (head_r * 0.56, head_r * 0.44, head_r * 0.40),
                           segments=20, rings=14)
    assign_mat(muzzle, m_belly); parts.append(muzzle)

    nose = add_uv_sphere("Nose",
                         (0, head_y - head_r * 1.22, muz_z + head_r * 0.06),
                         (head_r * 0.16, head_r * 0.11, head_r * 0.10),
                         segments=16, rings=12)
    assign_mat(nose, m_accent); parts.append(nose)

    # ── Eyes (iris + vertical pupil + highlight) ───────────────────────
    eye_x = head_r * 0.44
    eye_y = head_y - head_r * 0.78
    eye_z = head_z + head_r * 0.10
    eye_r = head_r * 0.24
    for sign, nm in ((-1, "EyeL"), (1, "EyeR")):
        e = add_uv_sphere(nm,
                          (sign * eye_x, eye_y, eye_z),
                          (eye_r, eye_r * 0.93, eye_r * 1.05),
                          segments=22, rings=16)
        assign_mat(e, m_eye); parts.append(e)
        p = add_uv_sphere(nm + "Pupil",
                          (sign * eye_x, eye_y - eye_r * 0.72, eye_z),
                          (eye_r * 0.38, eye_r * 0.26, eye_r * 0.85),
                          segments=16, rings=12)
        assign_mat(p, m_pupil); parts.append(p)
        hl = add_uv_sphere(nm + "HL",
                           (sign * (eye_x - eye_r * 0.30),
                            eye_y - eye_r * 0.82,
                            eye_z + eye_r * 0.45),
                           (eye_r * 0.22, eye_r * 0.15, eye_r * 0.22),
                           segments=12, rings=8)
        assign_mat(hl, m_hilite); parts.append(hl)

    # ── Whiskers (skipped on hairless) ─────────────────────────────────
    if not hairless:
        for sign, side in ((-1, "L"), (1, "R")):
            for i, ang in enumerate((-0.24, 0.0, 0.24)):
                wlen = head_r * 0.45
                wx = sign * (head_r * 0.48 + wlen * 0.40 * math.cos(ang))
                wy = head_y - head_r * 1.02 - wlen * 0.28
                wz = muz_z + ang * head_r * 0.30
                w = add_cone(f"Whisker{side}{i}",
                             (wx, wy, wz),
                             (0.010 * s, 0.010 * s, wlen * 0.55),
                             vertices=6)
                w.rotation_euler = (math.radians(90), 0,
                                    sign * math.radians(78) + ang * 0.6)
                assign_mat(w, m_whisker); parts.append(w)

    # ── Ears + inner pink + optional tufts ─────────────────────────────
    ear_h = 0.22 * s if short_ear else 0.38 * s
    ear_r = 0.19 * s
    ear_x = head_r * 0.60
    ear_y = head_y - head_r * 0.05
    ear_z = head_z + head_r * 0.82 - (0.05 if short_ear else 0.0)
    for sign, name in ((-1, "EarL"), (1, "EarR")):
        if torn and name == "EarR":
            ear = add_cone(name,
                           (sign * ear_x, ear_y, ear_z - ear_h * 0.22),
                           (ear_r, ear_r * 0.9, ear_h * 0.32), vertices=18)
        else:
            ear = add_cone(name,
                           (sign * ear_x, ear_y, ear_z),
                           (ear_r, ear_r * 0.9, ear_h * 0.55), vertices=22)
        assign_mat(ear, m_point if points else m_main)
        if fold_ear:
            ear.rotation_euler[0] = math.radians(70.0)
            ear.scale[2] *= 0.50
        parts.append(ear)

        if not (torn and name == "EarR"):
            inner = add_cone(f"{name}Inner",
                             (sign * ear_x, ear_y - ear_r * 0.10,
                              ear_z - ear_h * 0.08),
                             (ear_r * 0.58, ear_r * 0.52, ear_h * 0.46),
                             vertices=18)
            if fold_ear:
                inner.rotation_euler[0] = math.radians(70.0)
                inner.scale[2] *= 0.50
            assign_mat(inner, m_inner); parts.append(inner)

        if ear_tufts:
            for j, offy in enumerate((0.0, ear_r * 0.18, -ear_r * 0.18)):
                tx = sign * (ear_x + offy * 0.5)
                ty = ear_y + offy
                tz = ear_z + ear_h * (0.55 + j * 0.06)
                tuft = add_cone(f"{name}Tuft{j}",
                                (tx, ty, tz),
                                (ear_r * 0.30, ear_r * 0.30, ear_h * 0.40),
                                vertices=10)
                assign_mat(tuft, m_belly); parts.append(tuft)

    # ── Legs: rounded cylinders + foot-overhang sphere + paw pad ───────
    limb_mat = m_point if points else m_main
    leg_h = 0.26 * s
    leg_r = 0.12 * s
    leg_y_f = -body_w * 0.48
    leg_y_b =  body_w * 0.50
    leg_x   =  body_w * 0.55
    leg_z   = leg_h * 0.5 + 0.01
    for (lx, ly, name) in (
        (-leg_x, leg_y_f, "LegFL"),
        ( leg_x, leg_y_f, "LegFR"),
        (-leg_x, leg_y_b, "LegBL"),
        ( leg_x, leg_y_b, "LegBR"),
    ):
        leg = add_cylinder(name, (lx, ly, leg_z),
                           (leg_r, leg_r, leg_h * 0.5), vertices=16)
        assign_mat(leg, limb_mat); parts.append(leg)
        foot = add_uv_sphere(f"{name}Foot",
                             (lx, ly - leg_r * 0.30, leg_r * 0.40),
                             (leg_r * 1.20, leg_r * 1.50, leg_r * 0.60),
                             segments=16, rings=12)
        assign_mat(foot, limb_mat); parts.append(foot)
        pad = add_uv_sphere(f"{name}Pad",
                            (lx, ly - leg_r * 0.10, 0.005),
                            (leg_r * 0.70, leg_r * 0.75, leg_r * 0.10),
                            segments=12, rings=8)
        assign_mat(pad, m_paw); parts.append(pad)

    # ── Tail: bezier curve with tapered bevel ──────────────────────────
    # Peak kept under 1.55*body_h to avoid clipping the HP bar on large units.
    base_r = 0.13 * s
    tail_pts = [
        (0.0, body_w * 0.35, body_z + body_h * 0.10),
        (0.0, body_w * 0.75, body_z + body_h * 0.50),
        (0.0, body_w * 1.05, body_z + body_h * 0.95),
        (0.0, body_w * 1.00, body_z + body_h * 1.40),
        (0.0, body_w * 0.80, body_z + body_h * 1.55),
        (0.0, body_w * 0.55, body_z + body_h * 1.60),
    ]
    tail_radii = [base_r * 1.00, base_r * 0.95, base_r * 0.82,
                  base_r * 0.65, base_r * 0.48, base_r * 0.22]
    tail = add_tail_curve("Tail", tail_pts, tail_radii)
    assign_mat(tail, m_point if points else m_main); parts.append(tail)

    # ── Tank collar + dangling tag ─────────────────────────────────────
    if tank:
        collar = add_uv_sphere("Collar",
                               (0, -body_w * 0.35, body_z + body_h * 0.55),
                               (body_w * 0.62, body_w * 0.56, 0.06 * s),
                               segments=26, rings=12)
        assign_mat(collar, m_accent); parts.append(collar)
        tag = add_uv_sphere("Tag",
                            (0, -body_w * 0.94, body_z + body_h * 0.36),
                            (0.08 * s, 0.02 * s, 0.08 * s),
                            segments=16, rings=12)
        assign_mat(tag, m_accent); parts.append(tag)

    # Join everything into a single mesh with multiple material surfaces
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()

    joined = bpy.context.active_object
    joined.name = unit_id
    return joined


# ─── Armature + Animation pipeline ────────────────────────────────────
# Adds a skeletal rig with 12 bones and 7 combat animation actions to each
# cat mesh, exported as embedded glTF animations.  Bone positions are
# derived from the same per-unit config that build_cat uses, so the rig
# always matches the mesh proportions.

from mathutils import Quaternion

def _quat_x(deg):
    return Quaternion((1, 0, 0), math.radians(deg))

def _quat_y(deg):
    return Quaternion((0, 1, 0), math.radians(deg))

def _quat_z(deg):
    return Quaternion((0, 0, 1), math.radians(deg))

def _quat_xz(xdeg, zdeg):
    return _quat_x(xdeg) @ _quat_z(zdeg)

_REST_Q = (1, 0, 0, 0)
_REST_S = (1, 1, 1)


def _key_bone(rig, bone_name, frame, loc=None, rot=None, scale=None):
    pb = rig.pose.bones[bone_name]
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert(data_path="location", frame=frame)
    if rot is not None:
        pb.rotation_quaternion = rot
        pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    if scale is not None:
        pb.scale = scale
        pb.keyframe_insert(data_path="scale", frame=frame)


def _push_nla(rig, action, name, end_frame):
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.action_frame_end = end_frame
    rig.animation_data.action = None


def add_armature(unit_id, cfg):
    """Create an armature matching the cat mesh proportions."""
    s = cfg.get("scale", 1.0)
    fluffy = cfg.get("fluffy", False)
    short_ear = cfg.get("short_ear", False)
    tank = cfg.get("tank", False)

    body_w = 0.55 * s * (1.15 if tank else 1.0)
    body_h = 0.50 * s * (1.10 if tank else 1.0)
    body_z = 0.52 * s
    head_r = 0.46 * s
    head_z = 1.10 * s + (0.02 if fluffy else 0.0)
    head_y = -0.08 * s
    leg_h = 0.26 * s
    leg_x = body_w * 0.55
    leg_y_f = -body_w * 0.48
    leg_y_b = body_w * 0.50
    ear_h_val = (0.22 if short_ear else 0.38) * s
    ear_x_pos = head_r * 0.60
    ear_z_pos = head_z + head_r * 0.82 - (0.05 if short_ear else 0.0)

    arm_data = bpy.data.armatures.new(f"{unit_id}_Armature")
    arm_obj = bpy.data.objects.new(f"{unit_id}_Rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)

    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    root = eb.new("Root")
    root.head = (0, 0, 0)
    root.tail = (0, 0, 0.15 * s)

    body = eb.new("Body")
    body.head = (0, 0, body_z - body_h * 0.4)
    body.tail = (0, 0, body_z + body_h * 0.4)
    body.parent = root

    head = eb.new("Head")
    head.head = (0, head_y * 0.3, body_z + body_h * 0.5)
    head.tail = (0, head_y, head_z + head_r * 0.3)
    head.parent = body

    for side, sign in [("L", -1), ("R", 1)]:
        ear = eb.new(f"Ear.{side}")
        ear.head = (sign * ear_x_pos, head_y, ear_z_pos - ear_h_val * 0.1)
        ear.tail = (sign * ear_x_pos, head_y, ear_z_pos + ear_h_val * 0.5)
        ear.parent = head

    tail_pts = [
        (0, body_w * 0.35, body_z + body_h * 0.10),
        (0, body_w * 0.75, body_z + body_h * 0.50),
        (0, body_w * 1.05, body_z + body_h * 0.95),
        (0, body_w * 0.80, body_z + body_h * 1.55),
    ]
    prev = body
    for i in range(3):
        t = eb.new(f"Tail.{i+1:03d}")
        t.head = tail_pts[i]
        t.tail = tail_pts[i + 1]
        t.parent = prev if i == 0 else prev_tail
        t.use_connect = (i > 0)
        prev_tail = t

    for name, (lx, ly) in [
        ("Leg.FL", (-leg_x, leg_y_f)),
        ("Leg.FR", ( leg_x, leg_y_f)),
        ("Leg.BL", (-leg_x, leg_y_b)),
        ("Leg.BR", ( leg_x, leg_y_b)),
    ]:
        leg = eb.new(name)
        leg.head = (lx, ly, body_z - body_h * 0.15)
        leg.tail = (lx, ly, 0.01)
        leg.parent = body

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


def parent_mesh_to_rig(cat_mesh, rig):
    """Parent mesh to armature with automatic weights."""
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    cat_mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def add_animations(rig, cfg):
    """Create 7 polished combat animation actions on the armature.

    Location offsets are scaled by the unit's scale factor so animations
    look proportional across 1-cost runts and 5-cost tanks.

    v2 polish pass: breathing idle, asymmetric ear flicks, butt-wiggle
    pounce, tremor defend, death twitch, tail whip crit, stagger hurt.
    """
    s = cfg.get("scale", 1.0)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.context.scene.render.fps = 60

    def reset():
        for pb in rig.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.scale = (1, 1, 1)

    def kb(bone, f, loc=None, rot=None, sc=None):
        if loc is not None:
            loc = (loc[0] * s, loc[1] * s, loc[2] * s)
        _key_bone(rig, bone, f, loc=loc, rot=rot, scale=sc)

    def new_action(name):
        a = bpy.data.actions.new(name=name)
        rig.animation_data_create()
        rig.animation_data.action = a
        reset()
        return a

    # ── idle (60 frames, loop) ────────────────────────────────────────
    # Lifelike breathing, weight shifts, asymmetric ear flicks, lively
    # tail S-wave, subtle head looking around.
    act = new_action("idle")
    # Body: breathing cycle (Z scale pulse) + gentle weight shift
    for f in range(1, 61, 3):
        ph = (f - 1) / 60.0 * 2 * math.pi
        breath_z = math.sin(ph * 2) * 0.018      # breathing bob
        sway_x  = math.sin(ph) * 0.006            # side-to-side sway
        shift_y = math.sin(ph * 0.5) * 0.004      # front-back weight shift
        breath_sc_z = 1.0 + math.sin(ph * 2) * 0.025  # chest expansion
        breath_sc_x = 1.0 - math.sin(ph * 2) * 0.008  # counterpart
        kb("Body", f,
           loc=(sway_x, shift_y, breath_z),
           sc=(breath_sc_x, breath_sc_x, breath_sc_z))
    # Head: looks around with tilt + nod (two overlapping sine waves)
    for f in range(1, 61, 4):
        ph = (f - 1) / 60.0 * 2 * math.pi
        tilt  = math.sin(ph) * 4.5                # Z-axis tilt
        nod   = math.sin(ph * 1.5 + 0.5) * 2.5    # X-axis nod
        kb("Head", f, rot=tuple(_quat_x(nod) @ _quat_z(tilt)))
    # Tail: lively S-wave with wider motion, denser keyframes
    for f in range(1, 61, 3):
        ph = (f - 1) / 60.0 * 2 * math.pi
        kb("Tail.001", f, rot=_quat_z(math.sin(ph) * 16))
        kb("Tail.002", f, rot=_quat_z(math.sin(ph + 0.9) * 24))
        kb("Tail.003", f, rot=_quat_z(math.sin(ph + 1.8) * 30))
    # Ears: ASYMMETRIC flicks — left ear twitches at different time than right
    for f in range(1, 61, 5):
        ph = (f - 1) / 60.0 * 2 * math.pi
        # Left ear: quick flick around frame 18-24
        l_flick = 8.0 * max(0, math.sin((ph - 1.0) * 3)) ** 4
        # Right ear: flick around frame 38-44
        r_flick = 8.0 * max(0, math.sin((ph - 2.8) * 3)) ** 4
        kb("Ear.L", f, rot=_quat_x(-l_flick))
        kb("Ear.R", f, rot=_quat_x(-r_flick))
    # Legs: subtle alternating weight shift
    for f in range(1, 61, 8):
        ph = (f - 1) / 60.0 * 2 * math.pi
        shift = math.sin(ph) * 0.006
        kb("Leg.FL", f, loc=(0, 0, -shift * 0.5))
        kb("Leg.FR", f, loc=(0, 0,  shift * 0.5))
        kb("Leg.BL", f, loc=(0, 0,  shift * 0.3))
        kb("Leg.BR", f, loc=(0, 0, -shift * 0.3))
    _push_nla(rig, act, "idle", 60)

    # ── attack (25 frames, ~0.42s) ────────────────────────────────────
    # Ears flatten on windup, asymmetric paw swipe, back legs push,
    # tail bristles during strike.
    act = new_action("attack")
    # rest pose
    kb("Body", 1, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 1, rot=_REST_Q); kb("Root", 1, loc=(0,0,0))
    kb("Leg.FL", 1, rot=_REST_Q); kb("Leg.FR", 1, rot=_REST_Q)
    kb("Leg.BL", 1, rot=_REST_Q); kb("Leg.BR", 1, rot=_REST_Q)
    kb("Ear.L", 1, rot=_REST_Q); kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q); kb("Tail.002", 1, rot=_REST_Q)
    kb("Tail.003", 1, rot=_REST_Q)
    # windup — crouch back, ears pin, tail raises
    kb("Body", 7, loc=(0, 0.07, -0.04), sc=(1.10, 1.10, 0.85))
    kb("Head", 7, rot=_quat_x(14)); kb("Root", 7, loc=(0, 0.05, -0.01))
    kb("Ear.L", 7, rot=_quat_x(35)); kb("Ear.R", 7, rot=_quat_x(35))
    kb("Tail.001", 7, rot=_quat_x(-15)); kb("Tail.002", 7, rot=_quat_z(10))
    kb("Leg.BL", 7, rot=_quat_x(8)); kb("Leg.BR", 7, rot=_quat_x(8))
    # strike — lunge forward, one paw swipes (FL does the main swipe)
    kb("Body", 12, loc=(0, -0.18, 0.03), sc=(0.90, 0.90, 1.15))
    kb("Head", 12, rot=_quat_x(-22)); kb("Root", 12, loc=(0, -0.14, 0))
    kb("Leg.FL", 12, rot=_quat_x(-40))  # main swipe paw
    kb("Leg.FR", 12, rot=_quat_x(-20))  # secondary paw
    kb("Leg.BL", 12, rot=_quat_x(-15)); kb("Leg.BR", 12, rot=_quat_x(-15))
    kb("Ear.L", 12, rot=_quat_x(25)); kb("Ear.R", 12, rot=_quat_x(25))
    kb("Tail.001", 12, rot=_quat_x(-30))  # tail bristles up
    kb("Tail.002", 12, rot=_quat_z(-15)); kb("Tail.003", 12, rot=_quat_z(-20))
    # follow-through — slight overshoot, paws return
    kb("Body", 17, loc=(0, -0.08, 0.01), sc=(1.03, 1.03, 0.97))
    kb("Head", 17, rot=_quat_x(-6)); kb("Root", 17, loc=(0, -0.05, 0))
    kb("Leg.FL", 17, rot=_quat_x(-10)); kb("Leg.FR", 17, rot=_quat_x(-5))
    kb("Leg.BL", 17, rot=_REST_Q); kb("Leg.BR", 17, rot=_REST_Q)
    kb("Ear.L", 17, rot=_quat_x(8)); kb("Ear.R", 17, rot=_quat_x(8))
    kb("Tail.001", 17, rot=_quat_x(-10)); kb("Tail.002", 17, rot=_quat_z(-5))
    # return to rest
    kb("Body", 25, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 25, rot=_REST_Q); kb("Root", 25, loc=(0,0,0))
    kb("Leg.FL", 25, rot=_REST_Q); kb("Leg.FR", 25, rot=_REST_Q)
    kb("Leg.BL", 25, rot=_REST_Q); kb("Leg.BR", 25, rot=_REST_Q)
    kb("Ear.L", 25, rot=_REST_Q); kb("Ear.R", 25, rot=_REST_Q)
    kb("Tail.001", 25, rot=_REST_Q); kb("Tail.002", 25, rot=_REST_Q)
    kb("Tail.003", 25, rot=_REST_Q)
    _push_nla(rig, act, "attack", 25)

    # ── pounce (36 frames — with butt wiggle) ─────────────────────────
    # Classic cat hunting crouch → butt wiggle → explosive launch → land.
    act = new_action("pounce")
    kb("Body", 1, loc=(0,0,0), sc=_REST_S, rot=_REST_Q)
    kb("Root", 1, loc=(0,0,0)); kb("Head", 1, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 1, rot=_REST_Q, sc=_REST_S)
    kb("Ear.L", 1, rot=_REST_Q); kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q); kb("Tail.002", 1, rot=_REST_Q)
    kb("Tail.003", 1, rot=_REST_Q)
    # crouch down — lower, wider stance
    kb("Body", 5, loc=(0, 0, -0.10), sc=(1.14, 1.14, 0.70))
    kb("Root", 5, loc=(0, 0.02, -0.02)); kb("Head", 5, rot=_quat_x(12))
    kb("Ear.L", 5, rot=_quat_x(20)); kb("Ear.R", 5, rot=_quat_x(20))
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 5, sc=(1.12, 1.12, 0.75))
    # butt wiggle 1 — shift left
    kb("Body", 8, loc=(-0.03, 0, -0.10), sc=(1.14, 1.14, 0.70), rot=_quat_z(3))
    kb("Root", 8, loc=(-0.02, 0.02, -0.02))
    kb("Tail.001", 8, rot=_quat_z(-15)); kb("Tail.002", 8, rot=_quat_z(-20))
    kb("Tail.003", 8, rot=_quat_z(-25))
    # butt wiggle 2 — shift right
    kb("Body", 11, loc=(0.03, 0, -0.10), sc=(1.14, 1.14, 0.70), rot=_quat_z(-3))
    kb("Root", 11, loc=(0.02, 0.02, -0.02))
    kb("Tail.001", 11, rot=_quat_z(15)); kb("Tail.002", 11, rot=_quat_z(20))
    kb("Tail.003", 11, rot=_quat_z(25))
    # butt wiggle 3 — center + deeper crouch (ready to spring)
    kb("Body", 14, loc=(0, 0, -0.12), sc=(1.16, 1.16, 0.68), rot=_REST_Q)
    kb("Root", 14, loc=(0, 0.03, -0.03)); kb("Head", 14, rot=_quat_x(15))
    kb("Ear.L", 14, rot=_quat_x(35)); kb("Ear.R", 14, rot=_quat_x(35))
    kb("Tail.001", 14, rot=_REST_Q); kb("Tail.002", 14, rot=_REST_Q)
    kb("Tail.003", 14, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 14, sc=(1.14, 1.14, 0.70))
    # launch — explosive upward + forward
    kb("Body", 18, loc=(0, -0.10, 0.20), sc=(0.85, 0.85, 1.25))
    kb("Root", 18, loc=(0, -0.12, 0.16)); kb("Head", 18, rot=_quat_x(-18))
    kb("Ear.L", 18, rot=_quat_x(40)); kb("Ear.R", 18, rot=_quat_x(40))
    for lg in ["Leg.FL","Leg.FR"]:
        kb(lg, 18, rot=_quat_x(-40), sc=_REST_S)
    for lg in ["Leg.BL","Leg.BR"]:
        kb(lg, 18, rot=_quat_x(25), sc=_REST_S)
    # tail streams out straight behind
    kb("Tail.001", 18, rot=_quat_x(-20))
    kb("Tail.002", 18, rot=_quat_x(-10))
    kb("Tail.003", 18, rot=_quat_x(-5))
    # apex — stretched out mid-air
    kb("Body", 23, loc=(0, -0.20, 0.28), sc=(0.92, 0.92, 1.10))
    kb("Root", 23, loc=(0, -0.25, 0.22)); kb("Head", 23, rot=_quat_x(-10))
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 23, rot=_quat_x(-18), sc=_REST_S)
    kb("Tail.001", 23, rot=_quat_x(-15))
    kb("Tail.002", 23, rot=_quat_x(-8))
    kb("Tail.003", 23, rot=_quat_x(-3))
    # land — impact squash
    kb("Body", 28, loc=(0, -0.26, -0.05), sc=(1.18, 1.18, 0.75))
    kb("Root", 28, loc=(0, -0.32, -0.01)); kb("Head", 28, rot=_quat_x(10))
    kb("Ear.L", 28, rot=_REST_Q); kb("Ear.R", 28, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 28, sc=(1.12, 1.12, 0.82))
    kb("Tail.001", 28, rot=_quat_z(8))
    kb("Tail.002", 28, rot=_quat_z(5))
    # settle to rest
    kb("Body", 36, loc=(0,0,0), sc=_REST_S, rot=_REST_Q)
    kb("Root", 36, loc=(0,0,0)); kb("Head", 36, rot=_REST_Q)
    kb("Ear.L", 36, rot=_REST_Q); kb("Ear.R", 36, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 36, rot=_REST_Q, sc=_REST_S)
    kb("Tail.001", 36, rot=_REST_Q); kb("Tail.002", 36, rot=_REST_Q)
    kb("Tail.003", 36, rot=_REST_Q)
    _push_nla(rig, act, "pounce", 36)

    # ── defend (24 frames — brace with tremor) ────────────────────────
    # Not a static hold: subtle bracing tremor, tail tucks, front paw
    # raises slightly for a guard stance.
    act = new_action("defend")
    kb("Body", 1, loc=(0,0,0), sc=_REST_S); kb("Head", 1, rot=_REST_Q)
    kb("Root", 1, loc=(0,0,0)); kb("Ear.L", 1, rot=_REST_Q)
    kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q); kb("Tail.002", 1, rot=_REST_Q)
    kb("Tail.003", 1, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 1, rot=_REST_Q, sc=_REST_S)
    # hunker down
    kb("Body", 8, loc=(0, 0.01, -0.07), sc=(1.16, 1.16, 0.76))
    kb("Head", 8, rot=_quat_x(18), loc=(0, -0.02, -0.04))
    kb("Root", 8, loc=(0, 0, -0.03))
    kb("Ear.L", 8, rot=_quat_x(45)); kb("Ear.R", 8, rot=_quat_x(45))
    # tail tucks down and curls toward body
    kb("Tail.001", 8, rot=_quat_x(-30))
    kb("Tail.002", 8, rot=_quat_x(-20))
    kb("Tail.003", 8, rot=_quat_x(-15))
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 8, sc=(1.10, 1.10, 0.82))
    # front paw lifts slightly (guard)
    kb("Leg.FL", 8, rot=_quat_x(-8), sc=(1.10, 1.10, 0.82))
    # tremor oscillation 1 — shift slightly right
    kb("Body", 12, loc=(0.008, 0.01, -0.065), sc=(1.15, 1.15, 0.77))
    kb("Root", 12, loc=(0.005, 0, -0.03))
    kb("Head", 12, rot=_quat_xz(17, -2), loc=(0, -0.02, -0.04))
    # tremor oscillation 2 — shift slightly left
    kb("Body", 16, loc=(-0.008, 0.01, -0.072), sc=(1.17, 1.17, 0.75))
    kb("Root", 16, loc=(-0.005, 0, -0.03))
    kb("Head", 16, rot=_quat_xz(19, 2), loc=(0, -0.02, -0.04))
    # tremor oscillation 3 — center, tense
    kb("Body", 20, loc=(0.004, 0.01, -0.068), sc=(1.15, 1.15, 0.76))
    kb("Root", 20, loc=(0.003, 0, -0.03))
    kb("Head", 20, rot=_quat_x(18), loc=(0, -0.02, -0.04))
    # hold at brace
    kb("Body", 24, loc=(0, 0.01, -0.07), sc=(1.16, 1.16, 0.76))
    kb("Head", 24, rot=_quat_x(18), loc=(0, -0.02, -0.04))
    kb("Root", 24, loc=(0, 0, -0.03))
    kb("Ear.L", 24, rot=_quat_x(45)); kb("Ear.R", 24, rot=_quat_x(45))
    kb("Tail.001", 24, rot=_quat_x(-30))
    kb("Tail.002", 24, rot=_quat_x(-20))
    kb("Tail.003", 24, rot=_quat_x(-15))
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 24, sc=(1.10, 1.10, 0.82))
    kb("Leg.FL", 24, rot=_quat_x(-8), sc=(1.10, 1.10, 0.82))
    _push_nla(rig, act, "defend", 24)

    # ── death (40 frames — stagger, fall, twitch) ─────────────────────
    # Ears droop, tail goes limp, final twitch before stillness.
    act = new_action("death")
    kb("Body", 1, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 1, rot=_REST_Q); kb("Root", 1, loc=(0,0,0), rot=_REST_Q)
    kb("Ear.L", 1, rot=_REST_Q); kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q); kb("Tail.002", 1, rot=_REST_Q)
    kb("Tail.003", 1, rot=_REST_Q)
    for lg in ["Leg.FL","Leg.FR","Leg.BL","Leg.BR"]:
        kb(lg, 1, rot=_REST_Q)
    # stagger — hit from the left
    kb("Body", 6, loc=(0.04, 0.02, 0.02), rot=_quat_z(-10))
    kb("Head", 6, rot=_quat_z(-15)); kb("Root", 6, loc=(0.03, 0, 0.01))
    kb("Ear.L", 6, rot=_quat_x(15)); kb("Ear.R", 6, rot=_quat_x(10))
    # wobble back — fight to stay up
    kb("Body", 12, loc=(-0.02, 0.01, 0.01), rot=_quat_z(5))
    kb("Head", 12, rot=_quat_z(8)); kb("Root", 12, loc=(-0.01, 0, 0))
    kb("Ear.L", 12, rot=_quat_x(25)); kb("Ear.R", 12, rot=_quat_x(20))
    # falling — give in
    kb("Body", 20, loc=(0.09, 0.04, -0.06), rot=_quat_z(-50), sc=(1.06, 1.0, 0.90))
    kb("Head", 20, rot=_quat_z(-35))
    kb("Root", 20, loc=(0.07, 0, -0.04), rot=_quat_z(-25))
    kb("Ear.L", 20, rot=_quat_x(50)); kb("Ear.R", 20, rot=_quat_x(45))
    kb("Tail.001", 20, rot=_quat_z(18))
    kb("Tail.002", 20, rot=_quat_x(10))  # tail starting to droop
    # collapse to ground
    kb("Body", 28, loc=(0.13, 0.06, -0.13), rot=_quat_z(-88), sc=(1.08, 1.0, 0.86))
    kb("Head", 28, rot=_quat_z(-65), loc=(0, -0.04, -0.06))
    kb("Root", 28, loc=(0.11, 0, -0.09), rot=_quat_z(-48))
    kb("Ear.L", 28, rot=_quat_x(60)); kb("Ear.R", 28, rot=_quat_x(55))
    for lg in ["Leg.FL","Leg.FR"]:
        kb(lg, 28, rot=_quat_x(-35))
    for lg in ["Leg.BL","Leg.BR"]:
        kb(lg, 28, rot=_quat_x(22))
    # tail goes limp
    kb("Tail.001", 28, rot=_quat_z(28))
    kb("Tail.002", 28, rot=_quat_x(25))
    kb("Tail.003", 28, rot=_quat_x(30))
    # final twitch — small spasm
    kb("Body", 33, loc=(0.14, 0.06, -0.12), rot=_quat_z(-85), sc=(1.06, 1.0, 0.88))
    kb("Leg.FL", 33, rot=_quat_x(-42))  # leg kicks
    kb("Tail.003", 33, rot=_quat_x(20))  # tail flick
    kb("Head", 33, rot=_quat_z(-62), loc=(0, -0.04, -0.06))
    # settle into stillness
    kb("Body", 40, loc=(0.13, 0.06, -0.13), rot=_quat_z(-88), sc=(1.08, 1.0, 0.86))
    kb("Head", 40, rot=_quat_z(-65), loc=(0, -0.04, -0.06))
    kb("Root", 40, loc=(0.11, 0, -0.09), rot=_quat_z(-48))
    kb("Ear.L", 40, rot=_quat_x(60)); kb("Ear.R", 40, rot=_quat_x(55))
    for lg in ["Leg.FL","Leg.FR"]:
        kb(lg, 40, rot=_quat_x(-35))
    for lg in ["Leg.BL","Leg.BR"]:
        kb(lg, 40, rot=_quat_x(22))
    kb("Tail.001", 40, rot=_quat_z(28))
    kb("Tail.002", 40, rot=_quat_x(25))
    kb("Tail.003", 40, rot=_quat_x(30))
    _push_nla(rig, act, "death", 40)

    # ── crit (34 frames — dramatic spin with tail whip) ──────────────
    # Ears flatten, tail whips during spin, impact lingers for
    # dramatic sell, more vertical arc during flight.
    act = new_action("crit")
    kb("Body", 1, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 1, rot=_REST_Q); kb("Root", 1, loc=(0,0,0), rot=_REST_Q)
    kb("Leg.FL", 1, rot=_REST_Q); kb("Leg.FR", 1, rot=_REST_Q)
    kb("Leg.BL", 1, rot=_REST_Q); kb("Leg.BR", 1, rot=_REST_Q)
    kb("Ear.L", 1, rot=_REST_Q); kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q); kb("Tail.002", 1, rot=_REST_Q)
    kb("Tail.003", 1, rot=_REST_Q)
    # dramatic crouch — ears pin, tail coils
    kb("Body", 6, loc=(0, 0.09, -0.08), sc=(1.18, 1.18, 0.68))
    kb("Head", 6, rot=_quat_x(20)); kb("Root", 6, loc=(0, 0.07, -0.03))
    kb("Ear.L", 6, rot=_quat_x(40)); kb("Ear.R", 6, rot=_quat_x(40))
    kb("Tail.001", 6, rot=_quat_z(-25)); kb("Tail.002", 6, rot=_quat_z(-20))
    kb("Tail.003", 6, rot=_quat_z(-15))
    kb("Leg.BL", 6, rot=_quat_x(10)); kb("Leg.BR", 6, rot=_quat_x(10))
    # spin launch — upward + rotation begins
    spin_90 = Quaternion((0, 0, 1), math.radians(90))
    kb("Body", 10, loc=(0, -0.05, 0.14), rot=tuple(spin_90), sc=(0.85, 0.85, 1.22))
    kb("Head", 10, rot=_quat_x(-12)); kb("Root", 10, loc=(0, -0.07, 0.10))
    # tail whips the opposite direction of the spin
    kb("Tail.001", 10, rot=_quat_z(30)); kb("Tail.002", 10, rot=_quat_z(25))
    kb("Tail.003", 10, rot=_quat_z(20))
    kb("Leg.FL", 10, rot=_quat_x(-25)); kb("Leg.FR", 10, rot=_quat_x(-25))
    kb("Leg.BL", 10, rot=_quat_x(15)); kb("Leg.BR", 10, rot=_quat_x(15))
    # spin mid — full rotation, peak height
    spin_270 = Quaternion((0, 0, 1), math.radians(270))
    kb("Body", 14, loc=(0, -0.12, 0.16), rot=tuple(spin_270), sc=(0.88, 0.88, 1.18))
    kb("Root", 14, loc=(0, -0.14, 0.10))
    # tail trails dramatically
    kb("Tail.001", 14, rot=_quat_z(-35)); kb("Tail.002", 14, rot=_quat_z(-30))
    kb("Tail.003", 14, rot=_quat_z(-25))
    # power strike — coming down hard
    spin_360 = Quaternion((0, 0, 1), math.radians(355))
    kb("Body", 19, loc=(0, -0.25, -0.03), rot=tuple(spin_360), sc=(0.82, 0.82, 1.25))
    kb("Head", 19, rot=_quat_x(-28)); kb("Root", 19, loc=(0, -0.22, -0.01))
    kb("Leg.FL", 19, rot=_quat_x(-42)); kb("Leg.FR", 19, rot=_quat_x(-42))
    kb("Leg.BL", 19, rot=_REST_Q); kb("Leg.BR", 19, rot=_REST_Q)
    kb("Tail.001", 19, rot=_quat_z(20)); kb("Tail.002", 19, rot=_quat_z(15))
    kb("Tail.003", 19, rot=_quat_z(10))
    # impact HOLD — linger here for dramatic sell (2 frames)
    kb("Body", 21, loc=(0, -0.24, -0.05), rot=_REST_Q, sc=(1.22, 1.22, 0.72))
    kb("Head", 21, rot=_quat_x(-15)); kb("Root", 21, loc=(0, -0.18, -0.02))
    kb("Leg.FL", 21, rot=_quat_x(-20)); kb("Leg.FR", 21, rot=_quat_x(-20))
    kb("Ear.L", 21, rot=_quat_x(20)); kb("Ear.R", 21, rot=_quat_x(20))
    # bounce back up from impact
    kb("Body", 26, loc=(0, -0.08, 0.02), rot=_REST_Q, sc=(0.96, 0.96, 1.06))
    kb("Head", 26, rot=_quat_x(-4)); kb("Root", 26, loc=(0, -0.06, 0))
    kb("Leg.FL", 26, rot=_quat_x(-5)); kb("Leg.FR", 26, rot=_quat_x(-5))
    kb("Ear.L", 26, rot=_quat_x(5)); kb("Ear.R", 26, rot=_quat_x(5))
    kb("Tail.001", 26, rot=_quat_z(5)); kb("Tail.002", 26, rot=_REST_Q)
    # return to rest
    kb("Body", 34, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 34, rot=_REST_Q); kb("Root", 34, loc=(0,0,0), rot=_REST_Q)
    kb("Leg.FL", 34, rot=_REST_Q); kb("Leg.FR", 34, rot=_REST_Q)
    kb("Leg.BL", 34, rot=_REST_Q); kb("Leg.BR", 34, rot=_REST_Q)
    kb("Ear.L", 34, rot=_REST_Q); kb("Ear.R", 34, rot=_REST_Q)
    kb("Tail.001", 34, rot=_REST_Q); kb("Tail.002", 34, rot=_REST_Q)
    kb("Tail.003", 34, rot=_REST_Q)
    _push_nla(rig, act, "crit", 34)

    # ── hurt (18 frames — flinch with stagger) ────────────────────────
    # Ears pin, tail puffs, sideways stagger, head shake on recovery.
    act = new_action("hurt")
    kb("Body", 1, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 1, rot=_REST_Q); kb("Root", 1, loc=(0,0,0))
    kb("Ear.L", 1, rot=_REST_Q); kb("Ear.R", 1, rot=_REST_Q)
    kb("Tail.001", 1, rot=_REST_Q, sc=_REST_S)
    kb("Tail.002", 1, rot=_REST_Q, sc=_REST_S)
    kb("Tail.003", 1, rot=_REST_Q, sc=_REST_S)
    # flinch — recoil back + sideways stagger
    kb("Body", 4, loc=(0.025, 0.07, -0.04), rot=_quat_xz(10, -5), sc=(1.12, 1.12, 0.82))
    kb("Head", 4, rot=_quat_xz(18, -8)); kb("Root", 4, loc=(0.02, 0.06, -0.02))
    kb("Ear.L", 4, rot=_quat_x(45)); kb("Ear.R", 4, rot=_quat_x(40))
    # tail puffs up (bristle)
    kb("Tail.001", 4, rot=_quat_x(-20), sc=(1.3, 1.3, 1.0))
    kb("Tail.002", 4, rot=_quat_z(10), sc=(1.25, 1.25, 1.0))
    kb("Tail.003", 4, sc=(1.2, 1.2, 1.0))
    # bounce — rebound
    kb("Body", 8, loc=(-0.01, 0.03, 0.015), rot=_quat_xz(3, 3), sc=(0.95, 0.95, 1.06))
    kb("Head", 8, rot=_quat_xz(5, 6)); kb("Root", 8, loc=(-0.01, 0.02, 0))
    kb("Ear.L", 8, rot=_quat_x(20)); kb("Ear.R", 8, rot=_quat_x(18))
    kb("Tail.001", 8, sc=(1.15, 1.15, 1.0))
    kb("Tail.002", 8, sc=(1.12, 1.12, 1.0))
    # head shake on recovery
    kb("Head", 11, rot=_quat_z(-4))
    kb("Head", 14, rot=_quat_z(3))
    # return to rest
    kb("Body", 18, loc=(0,0,0), rot=_REST_Q, sc=_REST_S)
    kb("Head", 18, rot=_REST_Q); kb("Root", 18, loc=(0,0,0))
    kb("Ear.L", 18, rot=_REST_Q); kb("Ear.R", 18, rot=_REST_Q)
    kb("Tail.001", 18, rot=_REST_Q, sc=_REST_S)
    kb("Tail.002", 18, rot=_REST_Q, sc=_REST_S)
    kb("Tail.003", 18, rot=_REST_Q, sc=_REST_S)
    _push_nla(rig, act, "hurt", 18)

    bpy.ops.object.mode_set(mode='OBJECT')


def export_glb(unit_id):
    out_path = os.path.join(OUT_DIR, f"{unit_id}.glb").replace("\\", "/")
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Select both mesh and rig for export
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj = bpy.data.objects.get(unit_id)
    rig_obj = bpy.data.objects.get(f"{unit_id}_Rig")
    if mesh_obj:
        mesh_obj.select_set(True)
    if rig_obj:
        rig_obj.select_set(True)
        bpy.context.view_layer.objects.active = rig_obj
    elif mesh_obj:
        bpy.context.view_layer.objects.active = mesh_obj

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
    )
    return out_path


def build_one(unit_id):
    cfg = UNIT_CONFIGS[unit_id]
    clear_scene()
    cat_mesh = build_cat(unit_id, cfg)
    rig = add_armature(unit_id, cfg)
    parent_mesh_to_rig(cat_mesh, rig)
    add_animations(rig, cfg)
    return export_glb(unit_id)


def build_all():
    paths = []
    for uid in UNIT_CONFIGS.keys():
        p = build_one(uid)
        paths.append(p)
        print(f"[build_units] wrote {p}")
    print(f"[build_units] done — {len(paths)} units written to {OUT_DIR}")
    return paths


if __name__ == "__main__":
    build_all()
