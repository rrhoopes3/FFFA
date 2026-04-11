# FFFA — Feline Free-Fur-All

A multiplayer auto-battler with **cats**. Eight factions, 48 units, hex board, shop phase → combat → results. Riot's TFT, but you're a cat.

## Repo state — v3.0.0-dev rewrite in progress

The repo currently has **two parallel Godot projects**:

- **`godot/`** — the v2 2D Godot 4 port. Working but visually dated (sprite sheets, canvas_item shaders). Will be deleted at the end of M6.
- **`godot4/`** — the v3 **3D rewrite** in progress. New main project going forward. Built around a clean sim/view split so the visual layer can be iterated on without touching gameplay logic.

Until the rewrite is feature-complete, both projects coexist. **All new work happens in `godot4/`.**

## Quick start

### Tools

This repo expects a Godot 4.4 binary in `tools/godot/`. It's `.gitignore`d so each machine installs its own. If yours is missing:

```bash
mkdir -p tools/godot && cd tools/godot
curl -L -o godot.zip https://github.com/godotengine/godot/releases/download/4.4-stable/Godot_v4.4-stable_win64.exe.zip
unzip godot.zip && rm godot.zip
```

You'll get `Godot_v4.4-stable_win64.exe` (windowed) and `Godot_v4.4-stable_win64_console.exe` (prints to stdout — use this from CLI).

### Run the v3 main scene (3D arena + pilot fight)

```bash
./tools/godot/Godot_v4.4-stable_win64_console.exe --path godot4
```

Press F5 in the editor or run the binary directly. The current main scene loads straight into the M5 game loop: shop phase, bench, hex board, action buttons (Reroll / Level Up / Start Fight), synergy panel. Click a shop card to buy, drag a bench slot onto a player-half hex to place, drag a bench slot onto the SELL panel to sell, click a placed unit's hex to return it to the bench. Press Start Fight to run combat against a procedurally rolled enemy team — combat self-resolves, gold/health update, the round advances, and a fresh shop is rolled.

### Run the headless sim test (no rendering)

Useful for fast validation that combat math works without launching a window:

```bash
./tools/godot/Godot_v4.4-stable_win64_console.exe --headless --path godot4 res://scenes/sim_test.tscn
```

You should see spawn lines, attack/move/cast/death events, and a `RESULT: player|enemy in N ticks` line.

### Take an in-engine screenshot

The arena scene self-screenshots when run with `FFFA_SHOTS=1` set. Useful for headless visual validation from CLI:

```bash
FFFA_SHOTS=1 ./tools/godot/Godot_v4.4-stable_win64_console.exe --path godot4
# tmp/m5_shop.png — static shop-phase screenshot
FFFA_SHOTS=2 ./tools/godot/Godot_v4.4-stable_win64_console.exe --path godot4
# Same plus a scripted autotest: buys 3 units, places them, starts a fight,
# saves m5_shop.png, m5_placed.png, m5_combat.png, m5_postcombat.png
```

This needs a windowed run (not `--headless`) since headless skips rendering.

## Architecture (godot4/)

```
godot4/
├── project.godot                  Forward+ renderer; autoloads listed below
├── scenes/
│   ├── main.tscn                  3D arena, camera, lights, hex grid, runs pilot demo
│   └── sim_test.tscn              Headless 4 Bengals vs 4 Persians
├── scripts/
│   ├── autoload/
│   │   └── event_bus.gd           Central signal hub — sim emits, view listens
│   ├── sim/                       PURE LOGIC. No Godot rendering deps.
│   │   ├── game_data.gd           48 unit defs, 8 synergies, shop odds, combat-unit factory  (autoload: GameData)
│   │   ├── game_state.gd          gold/health/board/bench/shop/level                          (autoload: GameState)
│   │   ├── combat_sim.gd          Tick loop, attacks, abilities, status fx, win/loss          (autoload: CombatSim)
│   │   └── hex.gd                 Hex math (offset coords, 7×8, odd-r) — preload, NO class_name
│   ├── view/                      3D presentation. Subscribes to EventBus.
│   │   ├── arena_view.gd          Top-level 3D scene; phases between "shop" and "combat" view modes
│   │   ├── hex_grid_3d.gd         56 clickable hex tiles, hover/click pick via Camera3D raycast
│   │   └── unit_view.gd           One unit's 3D presentation: mesh, team disc, HP bar, anims
│   ├── ui/                        2D Control overlay built programmatically — no .tscn babysitting
│   │   ├── game_ui.gd             HUD, synergy panel, bench, shop, sell zone, action buttons
│   │   ├── bench_slot.gd          Drag-source / drop-target Panel (swap on bench-bench drop)
│   │   ├── sell_zone.gd           Drop target that sells the dragged bench unit
│   │   └── drop_catcher.gd        Fullscreen drop target — routes drops over the 3D arena to a hex pick
│   └── sim_test.gd                M1 headless validation
├── art/
│   ├── arena/arena.glb            (currently broken, see Known Issues)
│   └── units/                     48 procedural chibi cats, one .glb per unit (M4)
└── shaders/                       Empty for now; M6 polish item
```

### sim/view split

The sim layer **never** imports view code, sound, or particles. It only emits `EventBus` signals. The view layer subscribes and animates. This is the load-bearing architectural decision — it makes the sim testable in isolation, lets the visuals be rebuilt without touching gameplay, and keeps state changes deterministic.

### Phases — `arena_view.gd`

The 3D scene controller has two view modes:

- **`shop`** — listens for `unit_placed` / `unit_removed` / `units_swapped` / `unit_merged` from `GameState` and keeps a `hex_key → UnitView` map in sync. No combat math, full HP, no animation beyond the idle bob.
- **`combat`** — listens for `combat_unit_spawned` and friends from `CombatSim` and keeps a `uid → UnitView` map. On `combat_ended` it tears down all combat views and rebuilds the shop view from `GameState.player_board` (which `CombatSim` restores from `pre_combat_board`).

Important ordering bug worth remembering: `CombatSim.start_combat()` must emit `combat_started` **before** calling `_spawn_units`, because the latter fires `combat_unit_spawned` and the view layer needs the phase flip first or it ignores the spawn signals.

Key signals (see `event_bus.gd` for the full list):

- `combat_unit_spawned(uid, unit_id, hex_key, is_player, stars)`
- `unit_attacked(attacker_uid, target_uid, damage, is_crit)`
- `unit_damaged(uid, hp, max_hp)`
- `unit_died(uid)`
- `unit_moved(uid, from_hex, to_hex)`
- `unit_ability_cast(uid, ability_name)`
- `status_applied(uid, status_type, duration)`
- `unit_placed(unit_id, hex_key)` / `unit_removed(unit_id, hex_key)` — shop-phase placement
- `units_swapped(hex_a, hex_b)` — board-board swap
- `unit_merged(unit_id, new_stars)` — auto 3-of-a-kind upgrade
- `synergies_updated(synergy_data: Dictionary)` — emitted whenever the player board changes
- `gold_changed`, `health_changed`, `level_changed`, `round_changed`, `shop_refreshed`

## Asset pipeline — Blender MCP → Godot

Cats and the arena are authored in Blender via the BlenderMCP add-on, exported as `.glb`, and dropped into `godot4/art/`.

### Cat units (procedural primitives)

`blender/build_units.py` is the source-of-truth pipeline. It defines `UNIT_CONFIGS` (one entry per cat) and a `build_cat()` function that assembles a chibi from spheres/cubes/cones, joins them, and exports a `.glb`. Re-run via the BlenderMCP `execute_blender_code` tool:

```python
import os
ns = {}
exec(open("B:/FFFA/blender/build_units.py").read(), ns)
ns["build_all"]()  # writes 48 .glbs into godot4/art/units/
```

After regenerating, run `Godot_v4.4-stable_win64_console.exe --headless --path godot4 --import` to refresh the `.glb.import` sidecars.

Per-unit visual config:

```python
"alley_tabby_thug": {
    "fur_main":  (0.34, 0.27, 0.20),
    "fur_belly": (0.78, 0.72, 0.60),
    "accent":    (0.10, 0.10, 0.12),  # jacket
    "eye_color": EYE_GOLD,
    "torn_ear":  True,
    "scale":     0.95,
}
```

Optional config flags: `fluffy` (extra shoulder sphere), `short_ear` (Persians), `fold_ear` (Scottish Folds — cones rotated forward), `ear_tufts` (MaineCoons), `points` (a darker face/ear/leg color for colorpoints — Siamese, Ragdoll, Himalayan), `tank` (wider body + collar), `hairless` (Sphynx). Cost-derived `scale` keeps 5-cost units visibly larger than 1-cost.

After joining, exporting expects an active object set (`bpy.context.view_layer.objects.active = obj`), otherwise gltf2 throws `'Context' object has no attribute 'active_object'`. The script handles this.

**Mesh origins land at body-center, not feet.** The view layer corrects this at runtime via `mesh_root_base_y = -aabb.position.y` in `unit_view.gd::_load_mesh`.

### Arena

`blender/arena.blend` is the source for the stone hex floor + pillars + torches + banners. **Currently disabled** in main.tscn — see Known Issues.

### Hyper3D Rodin (deferred)

The MCP server has a Hyper3D Rodin integration for AI-generated meshes. **The free trial key is exhausted** (`API_INSUFFICIENT_FUNDS`). The pipeline is wired and ready — to enable AI-generated cats:

1. Sign up at hyperhuman.deemos.com, get a paid key.
2. In Blender's BlenderMCP sidebar, set the Hyper3D API key field.
3. The flag `bpy.context.scene.blendermcp_use_hyper3d` resets to False whenever you load a new file — set it back to True after each `wm.read_homefile()`.
4. Regenerate units via `mcp__blender-mcp__generate_hyper3d_model_via_text`.

Estimated cost: ~$10–20 for all 48 units.

## Known issues (deferred to M6 polish)

- **`art/arena/arena.glb` still doesn't import cleanly into Godot** (M3 issue). M6 sidestepped it entirely by building the arena from sub_resources in `main.tscn` — stone ring, corner pillars, torches, omni-lights. The `.glb` can be deleted at any time.
- **No rigging.** Cats are static meshes — animation is procedural via transforms and shader flashes (idle bob, attack lunge, hurt material flash, death scale-fade). Good enough at game distance, but adding a shared cat armature would unlock more expressive anims (a possible M6 stretch).
- **Headless `--import` floods stderr** with `progress_dialog`/`task_step` errors. They're benign — the import succeeds. No fix planned; just filter them.
- **Procedural cats are still primitive blobs.** M4 gave them faction palettes, points, fold-ears, ear tufts, fluff, etc., which is enough to tell factions apart at game distance — but the per-unit silhouette differentiation inside a faction is mostly color, not geometry. A proper character-art pass (or AI mesh gen via Hyper3D once a paid key is in place) is M6 polish work.

## Milestone status

| | | |
|---|---|---|
| **M1** | Sim core extracted, headless test passing | ✅ done |
| **M2** | 3D arena + 7×8 clickable hex grid | ✅ done |
| **M3** | Pilot cat (Tabby Thug) full pipeline, 1v1 fight in 3D | ✅ done |
| **M4** | Generate all 48 units with faction palettes | ✅ done |
| **M5** | Shop / bench / merge / synergies UI | ✅ done |
| **M6** | Polish — camera orbit, VFX, banner, arena decor | ✅ done |

The legacy `godot/` v2 project is kept in tree only as a reference during the cutover; it's no longer built or launched by anything. Delete it when you're ready to fully commit to v3 (`git rm -r godot/`).

### M6 polish notes

- **Camera rig** — no pivot Node3D; `arena_view.gd::_process` recomputes the camera transform each frame from `CAMERA_POS`, a `pivot_yaw` accumulator, and a `dolly` multiplier. On `combat_started` a Tween punches `dolly` from 1.0 → 0.82 (0.55s, cubic ease out); on `combat_ended` both `dolly` and `pivot_yaw` tween back to their neutral values. `pivot_yaw` accumulates at ~0.10 rad/s during the combat phase for a slow cinematic orbit.
- **VFX** — `_spawn_hit_spark` and `_spawn_death_puff` create one-shot `GPUParticles3D` nodes on the fly with inline `ParticleProcessMaterial` setup. Crit hits get more particles + a redder tint. Cleanup is a 1–2s `create_timer().timeout → queue_free`.
- **Banner** — `game_ui.gd::_show_banner` drives a scale-in + fade-out Tween on a centered Label. It's fed by the existing `EventBus.banner_requested` signal, so `CombatSim` already emits "FIGHT!" / "VICTORY!" / "DEFEAT!" without any additional wiring.
- **Arena decor** — four corner pillars (CylinderMesh + BoxMesh cap), torch spheres with emission materials, and per-torch `OmniLight3D` nodes. The old broken `art/arena/arena.glb` is now fully bypassed and the scene is built entirely from sub_resources in `main.tscn`. Rebuilding the .glb is no longer a blocker.
- **Sound** — no sound library is set up yet and one wasn't in scope. Every click/hit is currently silent.

## Bugs caught during the rewrite (notes for future-me)

These were non-obvious enough to be worth writing down:

- **`class_name X` is invisible to autoloads.** Autoloads parse before the global script class cache populates, so `combat_sim.gd` referencing `Hex.foo` fails with "Identifier not declared". Fix: drop `class_name`, use `const Hex = preload("res://scripts/sim/hex.gd")` in every consumer. Applies to any class an autoload depends on.
- **Blender per-scene properties reset on `wm.read_homefile()`.** `blendermcp_use_hyper3d` is a `Scene` property, not a global preference. Reloading the home file blanks it. Status checks lie about it — they read the value, but the handler dict is rebuilt per command from the same flag.
- **Mesh origins land at body-center after `bpy.ops.object.join()`.** The join inherits the active object's origin, not the bounds bottom. Either fix in Blender (`origin_set` to `BOUNDS` then translate) or in the view code (offset `mesh_root.y` by `-aabb.position.y`). Currently doing the latter so the .glb is reusable.
- **glTF export crashes headless** with `AttributeError: 'Context' object has no attribute 'active_object'` if no object is active. Always `view_layer.objects.active = something` before `export_scene.gltf`.
- **`mesh_root.position += offset` in `_process` accumulates.** Spent ~30 minutes on this one. Compute the position from base + offsets each frame; never `+=` a transient offset onto a transform. The bug is invisible until the unit drifts off-screen because direct-child siblings (team disc, HP bar) stay put.

## Where Godot lives on this machine

`B:\FFFA\tools\godot\Godot_v4.4-stable_win64_console.exe`

The previous Godot ports (v1, v2) were committed without ever being run — there was no Godot binary on the system until this session. If a future session can't find Godot, install it via the steps above.
