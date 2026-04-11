"""
build_units.py — procedural chibi-cat builder for FFFA M4.

Run inside Blender (via the BlenderMCP execute_blender_code tool, or as a
script in the Text Editor). Generates one .glb per UNIT_CONFIGS entry into
godot4/art/units/. Each cat is built from primitives (spheres / cubes / cones)
with per-unit color config, joined into a single mesh, and exported with the
active object set so headless gltf2 doesn't choke.

Faction visual conventions
--------------------------
- Alley         gritty greys, varied solid/tabby/tuxedo, often torn ear
- Persian       cream/white, fluffy (extra fluff sphere), short ear
- Siamese       cream body with darker "points" (face/ears/legs/tail) — colorpoint
- MaineCoon     brown/rust, oversized body, ear tufts (extra ear cone)
- Bengal        golden orange with darker stripe accent
- Sphynx        pinkish hairless skin (slightly translucent eye shine)
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

def make_mat(name, rgb, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
        bsdf.inputs["Roughness"].default_value = 0.7
        # 4.x renames Specular → Specular IXR / Specular Tint, leave defaults
        if emission is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.5
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
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)


def add_uv_sphere(name, location, scale, segments=20, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    return obj


def add_cone(name, location, scale, vertices=16):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=1.0, radius2=0.0, depth=2.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.shade_smooth()
    return obj


def add_cube(name, location, scale):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    return obj


def build_cat(unit_id, cfg):
    """Procedural chibi cat. Returns the joined MESH object."""
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
    points = cfg.get("points", None)  # Darker color used for face/ears/legs/tail

    point_color = points if points else fur_main

    # Material lookups (per-cat — small dupes are fine, joined later)
    m_main = make_mat(f"{unit_id}_fur", fur_main)
    m_belly = make_mat(f"{unit_id}_belly", fur_belly)
    m_accent = make_mat(f"{unit_id}_accent", accent)
    m_eye = make_mat(f"{unit_id}_eye", eye_color, emission=eye_color)
    m_point = make_mat(f"{unit_id}_point", point_color)

    parts = []

    # Body — flatter and wider for tanks
    body_w = 0.55 * s * (1.15 if tank else 1.0)
    body_h = 0.50 * s * (1.10 if tank else 1.0)
    body = add_uv_sphere("Body", (0, 0, 0.55 * s), (body_w, body_w * 0.85, body_h))
    assign_mat(body, m_main)
    parts.append(body)

    # Belly highlight (slightly forward, slightly smaller)
    belly = add_uv_sphere("Belly", (0, -body_w * 0.20, 0.45 * s), (body_w * 0.65, body_w * 0.55, body_h * 0.70))
    assign_mat(belly, m_belly)
    parts.append(belly)

    # Fluff ring for fluffy breeds (extra sphere around shoulders)
    if fluffy:
        fluff = add_uv_sphere("Fluff", (0, 0, 0.85 * s), (body_w * 1.10, body_w * 0.95, body_h * 0.65))
        assign_mat(fluff, m_main)
        parts.append(fluff)

    # Head
    head_r = 0.42 * s
    head_z = 1.05 * s + (0.05 if fluffy else 0.0)
    head = add_uv_sphere("Head", (0, -0.05 * s, head_z), (head_r, head_r, head_r))
    assign_mat(head, m_point if points else m_main)
    parts.append(head)

    # Muzzle
    muzzle = add_uv_sphere("Muzzle", (0, -head_r * 0.85, head_z - head_r * 0.18), (head_r * 0.50, head_r * 0.40, head_r * 0.38))
    assign_mat(muzzle, m_belly)
    parts.append(muzzle)

    # Nose
    nose = add_uv_sphere("Nose", (0, -head_r * 1.20, head_z - head_r * 0.10), (head_r * 0.10, head_r * 0.08, head_r * 0.08))
    assign_mat(nose, m_accent)
    parts.append(nose)

    # Eyes
    eye_x = head_r * 0.40
    eye_y = -head_r * 0.85
    eye_z = head_z + head_r * 0.10
    eye_r = head_r * 0.13
    le = add_uv_sphere("EyeL", (-eye_x, eye_y, eye_z), (eye_r, eye_r, eye_r))
    re = add_uv_sphere("EyeR", ( eye_x, eye_y, eye_z), (eye_r, eye_r, eye_r))
    assign_mat(le, m_eye)
    assign_mat(re, m_eye)
    parts.append(le)
    parts.append(re)

    # Ears
    ear_h = 0.20 * s if short_ear else 0.32 * s
    ear_r = 0.16 * s
    ear_x = head_r * 0.55
    ear_y = -head_r * 0.10
    ear_z = head_z + head_r * 0.85 - (0.05 if short_ear else 0.0)
    for sign, name in ((-1, "EarL"), (1, "EarR")):
        if torn and name == "EarR":
            # "Torn" — half-height cone
            ear = add_cone(name, (sign * ear_x, ear_y, ear_z - ear_h * 0.15), (ear_r, ear_r, ear_h * 0.35))
        else:
            ear = add_cone(name, (sign * ear_x, ear_y, ear_z), (ear_r, ear_r, ear_h * 0.5))
        assign_mat(ear, m_point if points else m_main)
        if fold_ear:
            ear.rotation_euler[0] = math.radians(60.0)  # Fold forward
            ear.scale[2] *= 0.6
        parts.append(ear)
        if ear_tufts:
            tuft = add_cone(f"{name}Tuft", (sign * ear_x, ear_y, ear_z + ear_h * 0.55), (ear_r * 0.45, ear_r * 0.45, ear_h * 0.30))
            assign_mat(tuft, m_belly)
            parts.append(tuft)

    # Limbs — four little stubby cubes (points-colored if colorpoint)
    limb_mat = m_point if points else m_main
    leg_h = 0.20 * s
    leg_w = 0.14 * s
    leg_y_f = -body_w * 0.50
    leg_y_b =  body_w * 0.50
    leg_x   =  body_w * 0.55
    leg_z   = leg_h * 0.5
    for (lx, ly, name) in (
        (-leg_x, leg_y_f, "LegFL"),
        ( leg_x, leg_y_f, "LegFR"),
        (-leg_x, leg_y_b, "LegBL"),
        ( leg_x, leg_y_b, "LegBR"),
    ):
        leg = add_cube(name, (lx, ly, leg_z), (leg_w, leg_w, leg_h))
        assign_mat(leg, limb_mat)
        parts.append(leg)

    # Tail — three stacked spheres curling up behind
    tail_mat = m_point if points else m_main
    tail_segs = [
        (0.0, body_w * 0.95, 0.55 * s, 0.10 * s),
        (0.0, body_w * 1.20, 0.78 * s, 0.085 * s),
        (0.0, body_w * 1.30, 1.00 * s, 0.075 * s),
    ]
    for i, (tx, ty, tz, tr) in enumerate(tail_segs):
        seg = add_uv_sphere(f"Tail{i}", (tx, ty, tz), (tr, tr, tr))
        assign_mat(seg, tail_mat)
        parts.append(seg)

    # Tank: extra accent collar/disc on shoulders
    if tank:
        collar = add_uv_sphere("Collar", (0, -body_w * 0.30, 0.92 * s + (0.05 if fluffy else 0.0)), (body_w * 0.50, body_w * 0.50, 0.06 * s))
        assign_mat(collar, m_accent)
        parts.append(collar)

    # Join everything
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
