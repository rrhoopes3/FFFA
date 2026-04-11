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


def export_glb(unit_id):
    out_path = os.path.join(OUT_DIR, f"{unit_id}.glb").replace("\\", "/")
    os.makedirs(OUT_DIR, exist_ok=True)
    # Make sure something is active before gltf2 reads context.active_object
    obj = bpy.data.objects.get(unit_id)
    if obj is not None:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    return out_path


def build_one(unit_id):
    cfg = UNIT_CONFIGS[unit_id]
    clear_scene()
    build_cat(unit_id, cfg)
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
