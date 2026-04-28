Original prompt: new multiplayer updates on github, but the game needs polish overall. animation specifically. see what you can do. https://fffa.cat is live site also. here's repo https://github.com/rrhoopes3/FFFA

## 2026-04-27

- Fetched and fast-forwarded `main` from `origin/main` to include the latest multiplayer fixes through `de45adc`.
- Local untracked `blender/Untitled.blend` and `blender/__pycache__/` existed before this pass; leave them untouched.
- Focus: Godot 4 client animation and overall polish, especially visual feedback during combat/placement.
- Implemented a v3.7.2 polish pass in the Godot client: arced unit movement, spawn/placement pop-ins, eased HP bars, team-disc pulse beats, heal/status VFX, and small UI purchase/reroll/level-up tweens.
- Verified the polish pass (still uncommitted): `sim_test.tscn` + `lobby_test.tscn` pass; `FFFA_SHOTS=2` autotest regenerates `tmp/m5_*.png` and `m6_banner.png` cleanly. Damage numbers shrunk per the new sizes, spawn pop / disc pulse / arced moves render without artifacts.
- Wiring sanity-check: `EventBus.unit_healed` and `EventBus.status_applied` are emitted by `combat_sim.gd` (heals lines 310/389, status line 457) and now consumed by `arena_view._on_unit_healed` / `_on_status_applied`. No new sim-side work needed.
- Pending: commit + (optional) rebuild Web export and bump live `fffa.cat` to v3.7.2 — awaiting user confirmation before touching git/deploy.
