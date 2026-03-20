# CLAUDE.md

## Project: FFFA (Feline Factions) — Godot 4

**Multiplayer auto-battler** (8 players, round-robin matchups): Shop phase → combat sim → results. Players buy/position cat units (1-5 cost, 7 factions with synergies at 2/4/6 thresholds), level up, reroll shop.

### Development

**Engine**: Godot 4
**Project file**: `godot/project.godot`
Open the `godot/` directory in the Godot 4 editor.

**Asset setup** — sprite sheets and portraits live in the repo root. Symlink them into Godot:
```bash
cd godot/assets/sprites && ln -s ../../../sheets/*_sheet.png .
cd godot/assets/portraits && ln -s ../../../portraits/*.png .
```

No build step, tests, or CI.

### Architecture

```
godot/
├── project.godot
├── scenes/main.tscn
├── scripts/
│   ├── main.gd                    # Entry point, round flow
│   ├── autoload/
│   │   ├── game_data.gd           # Unit definitions, constants (ported from shared.js)
│   │   ├── game_state.gd          # Mutable game state (gold, health, board, bench, shop)
│   │   ├── event_bus.gd           # Signal-based event system
│   │   └── sound_manager.gd       # Audio
│   ├── board/
│   │   ├── hex_board.gd           # Hex grid math & rendering
│   │   ├── combat_unit.gd         # Unit node with stats, abilities, animation
│   │   └── input_handler.gd       # Drag-drop, mouse/touch input
│   ├── combat/
│   │   └── combat_system.gd       # Combat sim, abilities, tick loop
│   └── ui/
│       ├── shop_panel.gd          # Shop display & buy logic
│       ├── bench_panel.gd         # Bench slots
│       ├── synergy_panel.gd       # Faction synergy display
│       ├── hud.gd                 # Gold, health, level, round info
│       ├── lobby_screen.gd        # Mode select & lobby
│       ├── tooltip.gd             # Unit tooltip hover
│       ├── banner.gd              # Round/result banners
│       ├── merge_system.gd        # Star merge (3→1 upgrade)
│       └── particles_vfx.gd       # Visual effects
├── shaders/
│   ├── arena_background.gdshader
│   ├── hex_glow.gdshader
│   └── unit_outline.gdshader
└── assets/
    ├── sprites/   (symlinked from sheets/)
    └── portraits/ (symlinked from portraits/)
```

### Assets (repo root)
- `sheets/` — sprite sheets per unit (e.g. `alley_tabby_thug_sheet.png`)
- `portraits/` — unit portrait images

### Guidelines
- Increment version number for each update
- Think step-by-step before responding
- For fixes: identify root cause, propose minimal changes, provide diffs
- Stay focused on current task before moving on
