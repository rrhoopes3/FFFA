# CLAUDE.md

## Project: FFFA (Feline Free-Fur-All) — Godot 4

**Multiplayer auto-battler** (8 players, round-robin matchups): shop phase → combat sim → results. Players buy/position cat units (1–5 cost, 8 factions with synergies at 2/4/6 thresholds), level up, reroll shop.

See `README.md` for the full v3.0.0-dev architecture, asset pipeline, and milestone status. The highlights that matter when making code changes:

### Engine and project layout

- Godot 4.4. Binary expected at `B:/FFFA/tools/godot/Godot_v4.4-stable_win64_console.exe` (install per-machine, `.gitignore`d).
- Single project: `godot4/`. The legacy v2 `godot/` port was removed at the end of M6 — don't resurrect it.
- Main scene: `godot4/scenes/main.tscn`. Launch with `./tools/godot/Godot_v4.4-stable_win64_console.exe --path godot4`.

### Architecture — sim / view split

The load-bearing architectural decision: the sim layer (`godot4/scripts/sim/`) is pure logic and emits `EventBus` signals; the view layer (`godot4/scripts/view/`, `scripts/ui/`) subscribes and renders. Sim never imports view, sound, or particles. This is what makes the combat deterministic, headless-testable, and independently re-skinnable.

When modifying combat rules, touch `scripts/sim/` only and verify with the headless test:

```bash
./tools/godot/Godot_v4.4-stable_win64_console.exe --headless --path godot4 res://scenes/sim_test.tscn
```

When modifying visuals/UI, touch `scripts/view/` and `scripts/ui/` only. Use `FFFA_SHOTS=2` to run the end-to-end autotest with phase screenshots into `tmp/`.

### Key file map

```
godot4/
├── project.godot                  autoloads: EventBus, GameData, GameState, CombatSim
├── scenes/
│   ├── main.tscn                  3D arena + hex grid + UI CanvasLayer
│   └── sim_test.tscn              headless combat regression
├── scripts/
│   ├── autoload/event_bus.gd      central signal hub (sim → view)
│   ├── sim/                       pure logic, no rendering deps
│   │   ├── game_data.gd           48 unit defs, 8 synergies, shop odds, combat-unit factory
│   │   ├── game_state.gd          gold/health/board/bench/shop/level, placement, merge
│   │   ├── combat_sim.gd          tick loop (50ms), attacks, abilities, status fx
│   │   └── hex.gd                 hex math (odd-r 7×8) — preload, NO class_name
│   ├── view/
│   │   ├── arena_view.gd          phase-aware 3D scene controller (shop | combat)
│   │   ├── hex_grid_3d.gd         56 clickable hex tiles + ray picker
│   │   └── unit_view.gd           per-unit mesh, team disc, HP bar, procedural anims
│   └── ui/
│       ├── game_ui.gd             HUD / synergies / bench / shop / sell / banner / buttons
│       ├── bench_slot.gd          drag source + swap target
│       ├── sell_zone.gd           drop-to-sell target
│       └── drop_catcher.gd        catches drops over the 3D arena, routes to hex picker
└── art/units/                     48 procedural chibi .glb files (regen via blender/build_units.py)
```

### Gotchas that will bite you

- **`class_name` is invisible to autoloads.** Use `const Foo = preload("res://path")` in every autoload consumer. `hex.gd` intentionally has no `class_name`.
- **Mesh origins land at body-center after Blender `object.join()`.** `unit_view.gd::_load_mesh` corrects this at runtime via `mesh_root_base_y = -aabb.position.y`.
- **Never `+=` a transient offset onto a transform.** Compute position from base + offsets each frame. The drift bug that ate 30 minutes in M3.
- **`CombatSim.start_combat` must emit `combat_started` BEFORE `_spawn_units`** so `arena_view` flips its phase flag before the spawn signals arrive. Found while debugging the blank combat view in M5.

### Guidelines

- Increment version number for each update (currently `v3.0.0-dev`).
- Think step-by-step before responding.
- For fixes: identify root cause, propose minimal changes, provide diffs.
- Stay focused on the current task before moving on.
