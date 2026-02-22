# CLAUDE.md

You are a helpful and honest assistant.

When analyzing or fixing code, especially large files:
- First, outline a step-by-step plan for the task. Refer back to this plan in every response to stay on track.
- Break large code into chunks (e.g., by functions, classes, or sections). Summarize each chunk before proceeding.
- Maintain a running summary of key elements: variables, functions, dependencies, and changes made so far.
- If the code exceeds context limits, request specific sections from the user or process incrementally.
- Stay focused: Do not digress or switch tasks mid-response. Complete the current step before moving on.
- For fixes: Identify issues, explain root causes, propose minimal changes, and provide diffs or updated snippets.
- Use clear formatting: Code blocks for code, numbered lists for plans, bold for summaries.
- increment the version number appropriately if defined, for each update.

Always think step-by-step before responding.
## Development Commands
```
npm install
npm start  # Runs `node server.js` — starts HTTP server on PORT 3001 (or $PORT) serving static files + WebSocket
```

No tests, linting, or build step. Client is single-page `index.html` (embedded JS/CSS). Assets: sprite sheets in `sheets/`, portraits, `unit_animations.json`.

## Architecture
- **Multiplayer auto-battler** (8 players, round-robin matchups): Shop phase → combat sim → results. Players buy/position cat units (1-5 cost, 7 factions with synergies at 2/4/6 thresholds), level up (cap +2 units), reroll shop (cost 2).
- **shared.js**: Game data/constants (66 units by faction/role/stats/abilities; shop odds by level; faction synergies; hexDistance; createCombatUnit with stars/tank/synergy scaling).
- **server.js**: HTTP static server + WebSocket. Lobbies (solo/party queue, practice mode), PlayerState (board hexes "col,row" rows 4-7; bench[9]; shop[5]). BotAI buys toward synergies/merges/positions tanks front. Server-side tick-based combat sim (pathing/AI targeting/crits/armor/lifesteal).
- **Client (index.html)**: Canvas hex board + animations via `sprite_animator.js` (SpriteAnimator per unit sheet row=anim, `unit_animations.json` config).
Game loop: Shared logic → server simulates battles ghost armies → client replays positions.

---

## ACTIVE TASK: Modularize index.html

### Goal
Split the 6,827-line `index.html` (which has ~6,100 lines of embedded JS) into 14 separate JS modules under `/js/`. The HTML/CSS stays in `index.html`, JS goes to separate files loaded via `<script>` tags. No build tools — plain script tags, global window scope.

### Architecture Pattern
- **Shared state**: `window.FFFA` namespace object (created in `fffa-state.js`) holds ALL mutable game state (gold, health, board, bench, combatUnits, canvas refs, etc.)
- **Each module**: IIFE wrapping code, aliases `const G = window.FFFA` for brevity, exposes public API on `window.ModuleName`
- **Cross-module calls**: `window.ModuleName.functionName()` (e.g. `window.RenderSystem.renderBoard()`)
- **Global variable migration**: All bare globals (gold, health, playerBoard, etc.) → `G.property`
- **Load order matters**: Dependencies load first via script tag order

### Script Load Order (for index.html `<script>` tags)
```
shared.js                    (existing — game data constants)
unit_animations_data.js      (existing — sprite config)
js/fffa-state.js             (FFFA namespace + all shared state)
js/fffa-sound.js             (Web Audio synthesis)
js/fffa-sprites.js           (sprite sheet loading & drawing)
js/fffa-particles.js         (visual effects & particles)
js/fffa-tooltip.js           (unit tooltip display)
js/fffa-synergy.js           (faction synergy calc & UI)
js/fffa-player.js            (Player class, GameState, BotAI, MultiplayerCombat)
js/fffa-merge.js             (star merge system)
js/fffa-hexboard.js          (canvas setup, hex math, drawing primitives)
js/fffa-render.js            (renderBoard, renderShop, renderBench, drag ghost)
js/fffa-input.js             (mouse + touch drag-drop, control buttons)
js/fffa-combat.js            (combat sim, abilities, combat loop, MP combat flow)
js/fffa-network.js           (NetworkManager WebSocket)
js/fffa-lobby.js             (mode select, lobby UI, initialization — ENTRY POINT)
```

### Module Details

| # | File | Exposes | Status |
|---|------|---------|--------|
| 1 | `fffa-state.js` | `window.FFFA` | DONE |
| 2 | `fffa-sound.js` | `window.SoundSystem` | DONE |
| 3 | `fffa-sprites.js` | `window.SpriteSystem` | DONE |
| 4 | `fffa-particles.js` | `window.ParticleSystem` | DONE |
| 5 | `fffa-tooltip.js` | `window.TooltipSystem` | DONE |
| 6 | `fffa-synergy.js` | `window.SynergySystem` | DONE |
| 7 | `fffa-player.js` | `window.Player`, `window.GameState`, `window.BotAI`, `window.MultiplayerCombat` | DONE |
| 8 | `fffa-merge.js` | `window.MergeSystem` | DONE |
| 9 | `fffa-hexboard.js` | `window.HexBoard` | DONE |
| 10 | `fffa-render.js` | `window.RenderSystem` | DONE (writing) |
| 11 | `fffa-input.js` | `window.InputSystem` | DONE (writing) |
| 12 | `fffa-combat.js` | `window.CombatSystem` | DONE (writing) |
| 13 | `fffa-network.js` | `window.NetworkManager` | DONE |
| 14 | `fffa-lobby.js` | `window.LobbySystem` | DONE |

### What's Left To Do
1. **Update index.html**: Strip ALL the JS between `<script>` and `</script>` (lines 700-6826), replace with 16 `<script src="...">` tags in the load order above. Keep CSS (lines 7-549) and HTML DOM (lines 551-696) untouched.
2. **Test locally**: `npm start`, open localhost:3001, verify:
   - Lobby screen loads
   - Solo Practice works (shop, buy, place, merge, combat, round progression)
   - No console errors
   - FFFA namespace accessible in console
   - All 16 JS files load 200 OK in network tab
3. **Version bump** to `0.3.0.0`

### Key Global Variable Mappings
```
gold            → G.gold
health          → G.health
playerLevel     → G.playerLevel
currentRound    → G.currentRound
playerBoard     → G.playerBoard
enemyBoard      → G.enemyBoard
bench           → G.bench
shopUnits       → G.shopUnits
combatState     → G.combatState
combatUnits     → G.combatUnits
canvas/ctx      → G.canvas / G.ctx
hexSize         → G.hexSize
boardHexes      → G.boardHexes
visualEffects   → G.visualEffects
particles       → G.particles
draggedUnit     → G.draggedUnit
highlightHex    → G.highlightHex
roundBanner     → G.roundBanner
unitImages      → G.unitImages
spriteSheets    → G.spriteSheets
```

### Cross-Module Call Pattern
Functions call each other through `window.*` globals:
```javascript
// In fffa-combat.js:
window.RenderSystem.renderBoard();
window.SynergySystem.getSynergyBonuses();
window.ParticleSystem.addDamageNumber(hexKey, damage);
window.SpriteSystem.setUnitAnimation(instanceId, 'attack');
window.SoundSystem.playMeow();
```

### Server Notes
- `server.js` serves any file under `__dirname` — `/js/*.js` works automatically with no changes
- Security blocks: server.js, .git, node_modules, .htaccess, .env
- MIME types include `.js → 'application/javascript'`

### Source Line Mapping (index.html → module)
```
Lines 700-712   → fffa-state.js (rollShopUnit wrapper)
Lines 714-1229  → fffa-network.js (NetworkManager)
Lines 1231-1383 → fffa-tooltip.js
Lines 1387-1475 → fffa-particles.js (part 1)
Lines 1477-1559 → fffa-synergy.js
Lines 1561-2397 → fffa-player.js (Player, GameState, BotAI, MultiplayerCombat)
Lines 2399-2422 → fffa-state.js (global state vars)
Lines 2426-2505 → fffa-sound.js
Lines 2507-2727 → fffa-sprites.js
Lines 2729-2843 → fffa-merge.js
Lines 2845-2961 → fffa-particles.js (part 2)
Lines 2963-3342 → fffa-hexboard.js
Lines 3346-4038 → fffa-render.js
Lines 4040-5095 → fffa-input.js
Lines 5097-6506 → fffa-combat.js
Lines 6508-6826 → fffa-lobby.js
```
