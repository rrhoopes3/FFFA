# FFFA — Feline Free-Fur-All

A multiplayer auto-battler with **cats**. Eight factions, 48 units, hex board, shop phase → combat → results. Riot's TFT, but you're a cat.

## Repo state — v3.7.0 (multiplayer-capable)

Single Godot project at `godot4/`: 3D hex arena sitting on a sculpted island in an animated ocean, 48 detailed procedural chibi cats with skeletal-style animation, full shop → combat → results loop, combat AI (tanks taunt, melee pounce, ranged kite), camera shake + hit-pause + cast halos, a 15-clip procedural audio SFX pack wired through `AudioManager`, and an 8-slot WebSocket multiplayer lobby (`NetworkManager` + `Lobby` autoloads) where bots fill empty slots and get replaced as players join. The legacy v2 `godot/` 2D port was removed at the end of M6 — it lives on only in git history (`git log --follow godot/`). See the [Post-M6 polish passes](#post-m6-polish-passes) section for the v3.1–v3.7 changelog.

### Running multiplayer

```bash
# Dedicated server (no UI, listens on :7575)
./tools/godot/Godot_v4.4-stable_linux.x86_64 --headless --path godot4 -- --server

# Client — pick "Join Multiplayer" from the main menu, default URL ws://localhost:7575
./tools/godot/Godot_v4.4-stable_linux.x86_64 --path godot4
```

The first connecting client replaces a bot slot; the next 6 do the same; bots remain in any unfilled slots and play out the round-robin alongside humans. Picking "Single Player" from the menu skips the lobby entirely and runs the v3.6.0 single-player loop locally.

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
│   │   ├── event_bus.gd           Central signal hub — sim emits, view listens
│   │   └── audio_manager.gd       12-voice SFX pool, listens to 13 EventBus signals (v3.5.0)
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
│   ├── arena/island.glb           Sculpted island (v3.2.0, replaces the old broken arena.glb)
│   ├── units/                     48 procedural chibi cats (M4, detail pass v3.1.0, anim bake v3.4.1)
│   ├── portraits/                 48 shop-card portrait PNGs
│   └── sfx/                       15 procedural WAV clips (regen via tools/build_sfx.py)
└── shaders/water.gdshader         Gerstner-wave ocean with shore foam (v3.2.0)
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

## Known issues

- **No rigging.** Cats are still static meshes. v3.3.0 and v3.4.1 stacked rich procedural transform animation on top (3-phase attack, knockback, tumble-death, pounce, butt-wiggle, breathing idle, tail dynamics), which plays well at game distance. A shared cat armature would unlock more expressive anims but isn't planned.
- **Headless `--import` floods stderr** with `progress_dialog`/`task_step` errors. They're benign — the import succeeds. No fix planned; just filter them.
- **Audio is procedural placeholder.** `tools/build_sfx.py` synthesizes all 15 WAVs from `wave`+`struct`+`math` — serviceable but obviously chiptune. Replacing with recorded samples is a future pass.
- **Intra-faction unit differentiation is mostly color.** v3.1.0 added whiskers, chibi eyes, cylinder limbs, bezier tails, ear tufts — factions read clearly from across the board, but within a faction it's mostly palette + scale. A proper character-art pass (or Hyper3D once funded) is the next level.

## Milestone status

| | | |
|---|---|---|
| **M1** | Sim core extracted, headless test passing | ✅ done |
| **M2** | 3D arena + 7×8 clickable hex grid | ✅ done |
| **M3** | Pilot cat (Tabby Thug) full pipeline, 1v1 fight in 3D | ✅ done |
| **M4** | Generate all 48 units with faction palettes | ✅ done |
| **M5** | Shop / bench / merge / synergies UI | ✅ done |
| **M6** | Polish — camera orbit, VFX, banner, arena decor | ✅ done |

(The legacy `godot/` v2 port was deleted at the end of M6; this tree is now v3-only.)

### Post-M6 polish passes

| | | |
|---|---|---|
| **v3.1.0**   | Procedural cat v2 — bigger chibi eyes w/ pupils, whiskers, cylinder limbs + paws, bezier tails, ear tufts, pink inner ears | ✅ done |
| **web**      | Web export — `CPUParticles3D` swap, shop-card portrait PNGs, `export_presets.cfg` (`public/`) | ✅ done |
| **v3.2.0–2** | Island arena + Gerstner ocean, trees, monoliths, dawn sky, shore-mist particle ring, plateau bushes; old `arena.glb` deleted | ✅ done |
| **v3.3.0–1** | Combat animation — attack windup/strike/recover, face-target, directional knockback, tumble-death, camera shake, hit-pause on crits, cast halos | ✅ done |
| **v3.4.0**   | Combat AI — tanks taunt (1-hex), melee pounce at combat start, ranged kite on independent cooldown | ✅ done |
| **v3.4.1**   | Skeletal-style anim polish — breathing idle, butt-wiggle pounce, death twitch, bracing defend, crit tail-whip | ✅ done |
| **v3.5.0**   | Audio SFX — `AudioManager` autoload, 12-voice polyphonic pool, 15 procedural WAVs wired to 13 EventBus signals | ✅ done |
| **v3.6.0**   | Single-player polish — win/loss streak gold, themed enemy boards (faction primary + splash), TFT-style stage labels, INCOME + STREAK HUD chips, 3D damage numbers, spectator crowd, bench portraits, in-world star pips, game-over screen with restart | ✅ done |
| **v3.7.0**   | Multiplayer — WebSocket host/client, 8-slot lobby with bot fill, round-robin pairings, server-authoritative HP/streaks/eliminations, main menu, lobby roster panel, dedicated headless server (`-- --server`) | ✅ done |
| **v3.7.1**   | MP fixes — deterministic combat seed (server hands client a seed so the cinematic matches the canonical result), HP/streak deferred until local cinematic ends (banner no longer spoiled mid-fight), MP-aware Play Again returns to main menu instead of restarting locally, late joiners taking a dead bot slot get revived with fresh HP/gold, RPC sends gated on `is_peer_reachable` (smoke harness now silent) | ✅ done |

### M6 polish notes

- **Camera rig** — no pivot Node3D; `arena_view.gd::_process` recomputes the camera transform each frame from `CAMERA_POS`, a `pivot_yaw` accumulator, and a `dolly` multiplier. On `combat_started` a Tween punches `dolly` from 1.0 → 0.82 (0.55s, cubic ease out); on `combat_ended` both `dolly` and `pivot_yaw` tween back to their neutral values. `pivot_yaw` accumulates at ~0.10 rad/s during the combat phase for a slow cinematic orbit.
- **VFX** — `_spawn_hit_spark` and `_spawn_death_puff` create one-shot `GPUParticles3D` nodes on the fly with inline `ParticleProcessMaterial` setup. Crit hits get more particles + a redder tint. Cleanup is a 1–2s `create_timer().timeout → queue_free`.
- **Banner** — `game_ui.gd::_show_banner` drives a scale-in + fade-out Tween on a centered Label. It's fed by the existing `EventBus.banner_requested` signal, so `CombatSim` already emits "FIGHT!" / "VICTORY!" / "DEFEAT!" without any additional wiring.
- **Arena decor** — four corner pillars (CylinderMesh + BoxMesh cap), torch spheres with emission materials, and per-torch `OmniLight3D` nodes. The old broken `art/arena/arena.glb` was bypassed with sub_resources in `main.tscn`, then replaced entirely by the v3.2.0 island and deleted.
- **Sound** — stubbed in M6 as "out of scope", landed in v3.5.0. See the post-M6 section below.

### Post-M6 polish notes

- **Procedural cat v2 (v3.1.0)** — rewrite of `blender/build_units.py`. Chibi eyes ~2× larger with dark pupils + white highlights, whiskers (3/side, skipped on sphynx), inner-pink ears, 60°→70° Scottish fold angle, 16-vert cylinder legs with paw pads, 6-point bezier tail converted to mesh before join, metallic tank collars, roughness varied by breed. Rebuilds all 48 `.glb`s.
- **Web export** — replaced `GPUParticles3D` with `CPUParticles3D` in `arena_view.gd` (hit sparks, death puffs) so VFX survive the Compatibility renderer. Added 48 `art/portraits/*.png` shown on shop cards (cards 96 → 160px tall). Export preset in `export_presets.cfg`, built output lives in `public/` (the 46-file re-encode fix in commit `85fbc87` rescued JPEG-as-PNG files Godot was rejecting as corrupt).
- **Island arena (v3.2.0–v3.2.2)** — `blender/build_island.py` sculpts a 130×130 subdivided plane with radius-based plateau/slope + FBM noise, paints vertex colors by height (grass → dirt → sand → rock → deep), raycasts props onto the surface (column stumps, boulders, 10 cone-stack trees with 6 color variants, 8 stone monoliths, 16 clumpy bushes). `shaders/water.gdshader` is a Compatibility-renderer-friendly Gerstner wave shader (5 octaves, FBM foam, fresnel deep/shallow mix, shore-distance foam ring) — no `SCREEN_TEXTURE` / `DEPTH_TEXTURE` so it works in-browser. Main scene got a dawn-mauve horizon, warmer sun, aerial-perspective fog, and a 120-particle `ShoreMist` ring. `arena_view.gd::_enable_vertex_colors` patches imported materials at `_ready` to turn on `vertex_color_use_as_albedo` (Godot doesn't set it automatically from GLB `COLOR_0`).
- **Combat animation (v3.3.0)** — procedural transform anims on the joined meshes, all driven from `unit_view.gd::_process`. Attack: 3-phase windup → strike → recover (0.12/0.18/0.12s) with face-target pivot via `base_yaw` + `target_yaw` lerp. Hurt: directional knockback via pre-loaded `pending_hurt_dir` set in `arena_view._on_unit_attacked` so the direction is correct when the next-frame `unit_damaged` signal arrives. Death: tumble on a horizontal-biased axis + 0.4-unit airborne arc + scale-fade + material-alpha tween. Idle: XZ sway in addition to vertical bob for a loose ellipse. Walk: extra `abs(sin(t*7))` bounce when `(position - prev_position).length() > 0`. **Important:** `_apply_tumble` rebuilds the basis from `base_yaw + axis_rotation` each tick — never accumulates (revisit of the M3 drift bug).
- **Combat polish (v3.3.1)** — `shake_strength` trauma value (0..1) decays at 6/s and applies `trauma²` offset to both camera position *and* look-at (translation + tilt together). `add_camera_trauma()` public for VFX to stack. 0.18 trauma on hits, 0.85 on crits, 0.25 on cast. Crit hit-pause: `Engine.time_scale = 0.30` for 0.10 real seconds; restore timer uses `ignore_time_scale=true` so it fires on time while everything else is slowed. Dramatic cast: spin around Y (TAU × 1.2), float up 0.32 on a sin arc, stretch 22% / narrow 10%, emission 4.0 → 5.0. `_spawn_cast_halo` is an expanding team-colored torus ring at the caster's feet.
- **Combat AI (v3.4.0)** — tanks taunt enemies within 1 hex via `_find_target()`, overriding nearest; auto-attacks and single-target casts both respect the taunt. Melee units pounce at combat start to a free hex adjacent to their nearest enemy (processed in spawn order for stable claims). Ranged units kite back when an enemy is closer than preferred range, on an independent `move_cooldown` so they shoot *and* retreat in the same tick — backup hex must still keep a target in range. Headless regression stays green (player win, 274 ticks).
- **Anim polish (v3.4.1)** — 7 animations, 48 models. Idle breathes (scale pulse, asymmetric ear flicks, weight shifting). Attack pins ears on windup, asymmetric paw swipe, back-leg push, tail bristle. Pounce has the classic cat butt-wiggle before launch + tail extends mid-flight. Defend is a bracing tremor with tucked tail. Death wobble-fights-then-falls with progressive ear droop and a final twitch. Crit tail whips counter-spin with impact-hold. Hurt stagger with puffed tail and head shake on recovery.
- **Audio (v3.5.0)** — `AudioManager` autoload is a 12-voice polyphonic pool listening to 13 `EventBus` signals (`unit_attacked`, `unit_damaged`, `unit_died`, `unit_ability_cast`, `status_applied`, shop `buy`/`sell`/`reroll`, `unit_placed`, `unit_merged`, `level_changed`, `combat_started`, `combat_ended`). `tools/build_sfx.py` is a pure-stdlib (`wave` + `struct` + `math`) WAV synthesizer that regenerates all 15 clips: `python3 tools/build_sfx.py`.
- **Multiplayer (v3.7.0)** — WebSocket-based, server-authoritative auto-battler. Files:
    - `scripts/net/network_manager.gd` (autoload) — owns the `WebSocketMultiplayerPeer`. `host_lobby(port, name, dedicated)` / `join_lobby(url, name)` / `leave()`. Defines all RPC stubs; server-broadcast RPCs use `@rpc("authority", "call_local", "reliable")` so the host processes its own messages.
    - `scripts/net/lobby.gd` — server-only state. 8 fixed `Slot` records (peer_id, hp, gold, win/loss streak, alive, board, faction theme). `register_player` finds the first bot slot and replaces it; `unregister_player` reverts a slot back to a bot with a fresh `BotBrain`. Phase machine ticks `WAITING → PLACEMENT (30s timeout, or all humans submit) → COMBAT → RESULT (4s) → next placement` until ≤1 alive.
    - `scripts/net/bot_brain.gd` — per-bot board synthesizer. Persistent `RandomNumberGenerator` keyed on slot index so each bot's roster is reproducible across rounds. 80% on-theme rolls via `GameData.roll_unit_in_faction`; star-up scales with round.
    - `scripts/ui/main_menu.gd` + `scenes/main_menu.tscn` — entry scene (the project's `run/main_scene` now points here). Three buttons: Single Player, Host Multiplayer, Join Multiplayer. With `-- --server` on the CLI, the menu auto-bootstraps a dedicated host without rendering.
    - **Round flow.** Server → client: `placement_phase_rpc(round, gold)` resets shop/economy on the client. Client buys/places, clicks READY → `submit_board_rpc(board)`. After everyone submits (or timeout), server pairs alive players via random shuffle (odd count plays a ghost board), runs `CombatSim.run_headless` for each pair, and broadcasts `round_start_rpc(opponent_name, opponent_board, seed)` + `round_result_rpc(won, damage, new_hp)` to each human. Client renders a local cinematic with the supplied opponent board; HP/banner come from the server.
    - **Server-authoritative.** Gold is set by the server at placement; HP, streaks, and damage are computed and broadcast by the server. The client does spend gold locally during placement (no per-purchase RPC) — fine for trusted users; cheat-resistance is a future pass. `combat_sim._end_combat` now early-returns on `is_multiplayer_round` so the local sim never mutates economy.
    - **Lobby roster panel** in `game_ui.gd::_build_roster_panel` — right-edge column of 8 mini-cards, color-coded HP, streak badge, 🤖/👤 prefix, dimmed when eliminated. Hidden in single-player.
    - **Smoke test** — `scripts/lobby_test.gd` runs the lobby in-process without a network: registers a fake player, submits boards each round, watches the phase machine cycle 16+ rounds to a winner. Use as a CI hook: `godot --headless --path godot4 -s res://scripts/lobby_test.gd`.
- **Single-player polish (v3.6.0)** — gameplay-side:
    - **Streak system.** `GameState.win_streak` / `loss_streak` track consecutive results; `get_streak_bonus_gold()` pays 0/0/+1/+1/+2/+2/+3 from streak length 0..6+, applied on top of the per-round base reward and interest. Loss-streaking is now an intentional economic move, not just a defeat.
    - **Themed enemy boards.** `combat_sim.generate_enemy_board` picks a primary faction theme each round (and a secondary splash from round 4); 70% of slots roll within the theme via `GameData.roll_unit_in_faction`, so the AI actually has synergies on its board. Round 1 stays mixed so the very first fight isn't already running a 4-piece bonus.
    - **Stage labels.** `GameState.get_stage_label()` converts the raw round number into TFT-style "1-3" / "2-4" notation (stage 1 = 3 rounds, subsequent stages = 4). Purely cosmetic; `current_round` is still the source of truth in the sim.
    - **HUD chips.** New `INCOME +N` chip (via `get_round_income_preview()` summing base + interest + streak) and a `STREAK W3` / `L3` chip that hides itself below 2. Round chip relabeled to `STAGE`.
    - **Game-over screen.** `EventBus.game_over` now wakes a centered modal in `game_ui` (semi-transparent dim + bordered panel + "Reached Stage X · Level Y" + Play Again). `_on_play_again_pressed` calls `GameState.start_game()` which now also emits `game_started`; `arena_view._on_game_started` clears combat views and rebuilds the (empty) shop view so the next run starts clean.
    - **Visual layer (also v3.6.0):** floating 3D damage numbers (Label3D, billboarded, jittered start, crit tint), 28-cat spectator ring around the arena (deterministic seed, idle bob, faster bob during combat), bench portraits matching shop cards, in-world `★`/`★★` pips on placed 2★/3★ units, "PLACE UNITS FIRST!" banner on empty-board fight click.

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
