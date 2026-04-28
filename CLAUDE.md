# CLAUDE.md

## Project: FFFA (Feline Free-Fur-All) — Godot 4

**Multiplayer auto-battler** (8 players, round-robin matchups): shop phase → combat sim → results. Players buy/position cat units (1–5 cost, 8 factions with synergies at 2/4/6 thresholds), level up, reroll shop.

Currently **v3.7.1, live at <https://fffa.cat>** (web export + dedicated server). See `README.md` for the full architecture, asset pipeline, milestone status, and deployment ops. The highlights that matter when making code changes:

### Engine and project layout

- Godot 4.4. Binary path is per-machine and `.gitignore`d. On this VPS: `./tools/godot/Godot_v4.4-stable_linux.x86_64`. On the Windows dev box: `B:/FFFA/tools/godot/Godot_v4.4-stable_win64_console.exe`.
- Single project: `godot4/`. The legacy v2 `godot/` port was removed at the end of M6 — don't resurrect it.
- **Main scene is `godot4/scenes/main_menu.tscn`** (changed from `main.tscn` in v3.7.0). The menu loads `main.tscn` once a mode is picked, so `main.tscn` is still where the in-game UI/arena lives. Headless tests run their own scenes (`sim_test.tscn`, `lobby_test.tscn`).

### Architecture — sim / net / view split

The load-bearing architectural decision: the sim layer (`godot4/scripts/sim/`) is pure logic and emits `EventBus` signals; the net layer (`scripts/net/`) talks to peers via RPC and feeds GameState; the view layer (`scripts/view/`, `scripts/ui/`) subscribes and renders. Sim never imports view, sound, particles, or net. Net is server-authoritative — the lobby server decides HP/gold/streaks; clients render.

When modifying combat rules, touch `scripts/sim/` only and verify with the two headless tests:

```bash
./tools/godot/Godot_v4.4-stable_linux.x86_64 --headless --path godot4 res://scenes/sim_test.tscn      # combat math
./tools/godot/Godot_v4.4-stable_linux.x86_64 --headless --path godot4 res://scenes/lobby_test.tscn   # multiplayer phase machine
```

When modifying visuals/UI, touch `scripts/view/` and `scripts/ui/` only. Use `FFFA_SHOTS=2` to run the end-to-end autotest with phase screenshots into `tmp/`.

When modifying multiplayer, touch `scripts/net/` and the relevant `EventBus` signals; sim should remain ignorant of which client/peer it's running on. The `is_multiplayer_round` flag in `GameState` is the bridge — it tells `combat_sim._end_combat` to skip economy mutation since the server already computed the canonical result.

### Key file map

```
godot4/
├── project.godot                  autoloads: EventBus, GameData, GameState, CombatSim, AudioManager, NetworkManager
├── scenes/
│   ├── main_menu.tscn             entry — Single / Host / Join (v3.7.0+)
│   ├── main.tscn                  3D arena + hex grid + UI CanvasLayer (loaded by menu)
│   ├── sim_test.tscn              headless combat regression
│   └── lobby_test.tscn            headless multiplayer smoke
├── scripts/
│   ├── autoload/event_bus.gd      central signal hub (sim → view, net → ui)
│   ├── sim/                       pure logic, no rendering deps
│   │   ├── game_data.gd           48 unit defs, 8 synergies, shop odds, combat-unit factory
│   │   ├── game_state.gd          gold/health/board/bench/shop/level + mp client handlers
│   │   ├── combat_sim.gd          tick loop (50ms), seeded RNG, attacks, abilities, status fx
│   │   └── hex.gd                 hex math (odd-r 7×8) — preload, NO class_name
│   ├── net/                       multiplayer (v3.7.0+)
│   │   ├── network_manager.gd     WebSocketMultiplayerPeer host/join/leave + RPC stubs
│   │   ├── lobby.gd               server-only — 8-slot phase machine, round-robin, combat orchestration
│   │   └── bot_brain.gd           per-bot themed-faction board synthesizer (seeded)
│   ├── view/
│   │   ├── arena_view.gd          phase-aware 3D scene controller (shop | combat)
│   │   ├── hex_grid_3d.gd         56 clickable hex tiles + ray picker
│   │   └── unit_view.gd           per-unit mesh, team disc, HP bar, procedural anims
│   └── ui/
│       ├── main_menu.gd           Single / Host / Join, --server CLI flag handler
│       ├── game_ui.gd             HUD / synergies / bench / shop / sell / banner / lobby roster / game-over
│       ├── bench_slot.gd          drag source + swap target
│       ├── sell_zone.gd           drop-to-sell target
│       └── drop_catcher.gd        catches drops over the 3D arena, routes to hex picker
└── art/units/                     48 procedural chibi .glb files (regen via blender/build_units.py)
```

### Live deployment (fffa.cat)

The build at `public/game/` is the v3.7.1 web export. The dedicated server runs as **`fffa-server.service`** (systemd unit at `/etc/systemd/system/fffa-server.service`) bound to `127.0.0.1:7575`. Caddy's `fffa.cat` block reverse-proxies `/ws` to the server. Rollback artifacts are on disk (`public/game.old.20260428/`, `public/index.html.bak.*`).

```bash
sudo systemctl status fffa-server          # health
sudo journalctl -u fffa-server -f          # tail logs
sudo systemctl restart fffa-server         # restart after a code/binary change
./tools/godot/Godot_v4.4-stable_linux.x86_64 --headless --path godot4 --export-release Web   # rebuild web export
```

### Gotchas that will bite you

- **`class_name` is invisible to autoloads.** Use `const Foo = preload("res://path")` in every autoload consumer. `hex.gd` intentionally has no `class_name`.
- **Mesh origins land at body-center after Blender `object.join()`.** `unit_view.gd::_load_mesh` corrects this at runtime via `mesh_root_base_y = -aabb.position.y`.
- **Never `+=` a transient offset onto a transform.** Compute position from base + offsets each frame. The drift bug that ate 30 minutes in M3.
- **`CombatSim.start_combat` must emit `combat_started` BEFORE `_spawn_units`** so `arena_view` flips its phase flag before the spawn signals arrive. Found while debugging the blank combat view in M5.

### Guidelines

- Increment version number for each update (currently `v3.7.1`; `project.godot` is the source of truth).
- Think step-by-step before responding.
- For fixes: identify root cause, propose minimal changes, provide diffs.
- Stay focused on the current task before moving on.
- **Touching anything outside `/home/support/sites/FFFA/` is infra/security work** — follow the careful-mode protocol from the user-level `~/CLAUDE.md` (Caddyfile edits, systemd units, Cloudflare DNS, etc.). Per-step proposal + thumbs-up before executing.
