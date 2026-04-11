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

Press F5 in the editor or run the binary directly. The current main scene runs a hardcoded 1v1 demo (Tabby Thug vs Tabby Thug) one second after load to validate the sim → view bridge.

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
# image lands at tmp/m3_pilot.png
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
│   │   ├── arena_view.gd          Top-level 3D scene controller; spawns UnitView per signal
│   │   ├── hex_grid_3d.gd         56 clickable hex tiles, hover/click pick via Camera3D raycast
│   │   └── unit_view.gd           One unit's 3D presentation: mesh, team disc, HP bar, anims
│   └── sim_test.gd                M1 headless validation
├── art/
│   ├── arena/arena.glb            (currently broken, see Known Issues)
│   └── units/                     Per-unit chibi cats — alley_tabby_thug.glb is the M3 pilot
└── shaders/                       Empty for now; M6 polish item
```

### sim/view split

The sim layer **never** imports view code, sound, or particles. It only emits `EventBus` signals. The view layer subscribes and animates. This is the load-bearing architectural decision — it makes the sim testable in isolation, lets the visuals be rebuilt without touching gameplay, and keeps state changes deterministic.

Key signals (see `event_bus.gd` for the full list):

- `combat_unit_spawned(uid, unit_id, hex_key, is_player, stars)`
- `unit_attacked(attacker_uid, target_uid, damage, is_crit)`
- `unit_damaged(uid, hp, max_hp)`
- `unit_died(uid)`
- `unit_moved(uid, from_hex, to_hex)`
- `unit_ability_cast(uid, ability_name)`
- `status_applied(uid, status_type, duration)`

## Asset pipeline — Blender MCP → Godot

Cats and the arena are authored in Blender via the BlenderMCP add-on, exported as `.glb`, and dropped into `godot4/art/`.

### Cat units (procedural primitives)

`blender/units_pilot.blend` is the source. The pipeline script (currently inline in chat history; will be lifted to `blender/build_units.py` in M4) builds chibi cats from spheres/cubes/cones with per-unit color config:

```python
UNIT = {
  "id": "alley_tabby_thug",
  "fur_main":  (0.34, 0.27, 0.20),
  "fur_belly": (0.78, 0.72, 0.60),
  "accent":    (0.10, 0.10, 0.12),  # jacket
  "eye_color": (0.85, 0.75, 0.20),
  "torn_ear":  True,
}
```

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

- **`art/arena/arena.glb` doesn't import cleanly into Godot.** Materials are read with garbage colors and the embedded Sun light fights with the scene's own DirectionalLight3D, causing washed-out white floors and pure-black props. Currently bypassed with a procedural `PlaneMesh` floor in `main.tscn`. Whole arena visual pass is an M6 task.
- **No rigging.** Cats are static meshes — animation is procedural via transforms and shader flashes (idle bob, attack lunge, hurt material flash, death scale-fade). Good enough at game distance, but adding a shared cat armature would unlock more expressive anims (a possible M6 stretch).
- **Headless `--import` floods stderr** with `progress_dialog`/`task_step` errors. They're benign — the import succeeds. No fix planned; just filter them.
- **Procedural cats don't visually distinguish factions much yet.** M4 will fix this with per-faction palettes and accessory variation.

## Milestone status

| | | |
|---|---|---|
| **M1** | Sim core extracted, headless test passing | ✅ done |
| **M2** | 3D arena + 7×8 clickable hex grid | ✅ done |
| **M3** | Pilot cat (Tabby Thug) full pipeline, 1v1 fight in 3D | ✅ done |
| **M4** | Generate all 48 units with faction palettes | pending |
| **M5** | Shop / bench / merge / synergies UI | pending |
| **M6** | Polish — camera, VFX, sound, fix arena.glb, optional rigging | pending |

When M6 lands, `godot/` (the v2 2D port) gets deleted and `godot4/` becomes the only project.

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
