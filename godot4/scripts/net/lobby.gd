extends Node
## Server-side multiplayer lobby. Owns 8 slots (each player or bot), drives the
## phase loop (placement → combat → result), and broadcasts state to clients
## via NetworkManager RPCs. Lives only on the host.
##
## Design notes
##  - Slots are stable. A bot occupies an empty slot; a joining player
##    replaces the first bot slot. When a player leaves, their slot reverts
##    to a bot (HP/gold preserved so the game keeps progressing).
##  - Combat reuses the existing CombatSim by spinning up a temporary
##    GameState-style snapshot per matchup. CombatSim.run_headless already
##    accepts (player_board, enemy_board) and returns a winner — we don't
##    need GameState involvement on the server.
##  - The per-fight RNG seed is derived from `round_num * 1009 + slot_index`
##    so future deterministic-replay work has a stable handle.

const BotBrain = preload("res://scripts/net/bot_brain.gd")
const SLOT_COUNT := 8
const STARTING_HP := 100
const STARTING_GOLD := 50
const PLACEMENT_DURATION := 30.0       # seconds
const RESULT_DURATION := 4.0
const FIRST_ROUND_DELAY := 1.0         # tiny breath after host comes up

enum Phase { WAITING, PLACEMENT, COMBAT, RESULT, ENDED }

class Slot:
	var index: int = -1
	var peer_id: int = 0           # 0 == bot
	var display_name: String = ""
	var hp: int = STARTING_HP
	var gold: int = STARTING_GOLD
	var level: int = 1
	var win_streak: int = 0
	var loss_streak: int = 0
	var is_bot: bool = true
	var alive: bool = true
	var board: Dictionary = {}     # last submitted (or bot-generated) board
	var submitted_this_round: bool = false
	var bot_brain: BotBrain = null
	var faction_theme: String = ""

	func to_roster_entry() -> Dictionary:
		return {
			"index": index,
			"name": display_name,
			"hp": hp,
			"is_bot": is_bot,
			"alive": alive,
			"streak_w": win_streak,
			"streak_l": loss_streak,
		}


var slots: Array[Slot] = []
var phase: int = Phase.WAITING
var round_num: int = 0
var phase_timer: float = 0.0
var human_count: int = 0


func _ready() -> void:
	_init_slots()
	# Quick breath before the first round so a single-host start doesn't
	# fire round 1 before the UI is ready.
	phase = Phase.WAITING
	phase_timer = FIRST_ROUND_DELAY


func _process(delta: float) -> void:
	if phase == Phase.ENDED:
		return
	phase_timer -= delta
	match phase:
		Phase.WAITING:
			# Don't run rounds until at least one human has joined. Bots alone
			# would auto-resolve in a few seconds and that's no fun to watch.
			if human_count > 0 and phase_timer <= 0.0:
				_start_placement_phase()
		Phase.PLACEMENT:
			if phase_timer <= 0.0 or _all_humans_submitted():
				_start_combat_phase()
		Phase.RESULT:
			if phase_timer <= 0.0:
				_start_placement_phase()


# ─── Slot lifecycle ─────────────────────────────────────────────────────────

func _init_slots() -> void:
	slots.clear()
	var bot_names := ["Tabby", "Whiskers", "Felix", "Mittens",
		"Oreo", "Smokey", "Patches", "Salem"]
	var factions := ["Alley", "Persian", "Siamese", "MaineCoon",
		"Bengal", "Sphynx", "ScottishFold", "Ragdoll"]
	for i in SLOT_COUNT:
		var s := Slot.new()
		s.index = i
		s.peer_id = 0
		s.display_name = "Bot %s" % bot_names[i]
		s.is_bot = true
		s.faction_theme = factions[i]
		s.bot_brain = BotBrain.new(s.faction_theme, i)
		slots.append(s)


func register_player(peer_id: int, player_name: String) -> void:
	# Find first bot slot (preferring still-alive slots so the joiner has HP
	# to play with), or first available slot regardless if all bots are dead.
	var target: Slot = null
	for s in slots:
		if s.is_bot and s.alive:
			target = s
			break
	var revived := false
	if target == null:
		for s in slots:
			if s.is_bot:
				target = s
				revived = true
				break
	if target == null:
		print("[lobby] no slot available for peer %d, lobby is full" % peer_id)
		return
	target.peer_id = peer_id
	target.display_name = player_name if player_name != "" else "Player %d" % peer_id
	target.is_bot = false
	target.bot_brain = null
	# A late joiner taking a dead bot slot would otherwise be skipped in
	# every placement loop. Reset their core state so they actually play —
	# fresh HP/gold, level 1, no inherited streak penalty.
	if revived:
		target.alive = true
		target.hp = STARTING_HP
		target.gold = STARTING_GOLD
		target.level = 1
		target.win_streak = 0
		target.loss_streak = 0
		target.board = {}
		target.submitted_this_round = false
		print("[lobby] revived dead slot %d for late joiner %s" % [target.index, target.display_name])
	human_count += 1
	print("[lobby] peer %d (%s) took slot %d" % [peer_id, target.display_name, target.index])
	_broadcast_roster()


func unregister_player(peer_id: int) -> void:
	for s in slots:
		if s.peer_id == peer_id:
			s.peer_id = 0
			s.display_name = "Bot (was %s)" % s.display_name
			s.is_bot = true
			s.bot_brain = BotBrain.new(s.faction_theme, s.index)
			human_count = maxi(0, human_count - 1)
			print("[lobby] peer %d left, slot %d reverted to bot" % [peer_id, s.index])
			_broadcast_roster()
			return


func receive_player_board(peer_id: int, board: Dictionary) -> void:
	if phase != Phase.PLACEMENT:
		return
	for s in slots:
		if s.peer_id == peer_id:
			s.board = board.duplicate(true)
			s.submitted_this_round = true
			return


func mark_ready(_peer_id: int) -> void:
	# Reserved for future "skip placement timer" voting. No-op for v1.
	pass


# ─── Phase machine ──────────────────────────────────────────────────────────

func _start_placement_phase() -> void:
	round_num += 1
	phase = Phase.PLACEMENT
	phase_timer = PLACEMENT_DURATION
	# Per-round economy and bot synthesis.
	var alive_count := _count_alive()
	for s in slots:
		if not s.alive:
			continue
		var income: int = 5 + round_num
		var interest: int = mini(s.gold / 10, 5)
		var streak_bonus := _streak_bonus(s)
		var total := income + interest + streak_bonus
		s.gold += total
		s.submitted_this_round = false
		if s.is_bot and s.bot_brain:
			# Bots auto-buy + auto-place every round, scaled with round_num.
			s.board = s.bot_brain.generate_board(round_num)
			s.submitted_this_round = true
	_broadcast_roster()
	# Notify each human of their gold income for the round. Skip peers we
	# can't actually reach (e.g. the smoke-test spoofed peer, or someone
	# who dropped between rounds and hasn't been unregistered yet).
	for s in slots:
		if s.alive and not s.is_bot and NetworkManager.is_peer_reachable(s.peer_id):
			NetworkManager.placement_phase_rpc.rpc_id(s.peer_id, round_num, s.gold)
	print("[lobby] placement R%d (alive=%d humans=%d)" %
		[round_num, alive_count, human_count])


func _start_combat_phase() -> void:
	phase = Phase.COMBAT
	# Pair alive slots. _make_pairings handles odd counts via ghost match.
	var alive: Array[Slot] = []
	for s in slots:
		if s.alive:
			alive.append(s)
	if alive.size() <= 1:
		_end_match()
		return
	var pairings := _make_pairings(alive)
	# Run each combat synchronously (run_headless is fast — ms range).
	for pair in pairings:
		var a: Slot = pair[0]
		var b: Slot = pair[1]
		# Seed is round-stable but pair-specific so two paired clients running
		# the cinematic with the same seed reach the canonical outcome.
		var seed_val: int = round_num * 1009 + a.index * 17 + b.index
		var result := CombatSim.run_headless(a.board, b.board, false, seed_val)
		var a_won: bool = result.winner == "player"
		_apply_combat_result(a, b, a_won, seed_val, false)
		_apply_combat_result(b, a, not a_won and result.winner != "draw", seed_val, true)
	# After all combats, handle eliminations.
	for s in slots:
		if s.alive and s.hp <= 0:
			s.alive = false
			print("[lobby] slot %d (%s) eliminated" % [s.index, s.display_name])
	_broadcast_roster()
	# Hold result phase briefly before next placement.
	phase = Phase.RESULT
	phase_timer = RESULT_DURATION
	if _count_alive() <= 1:
		_end_match()


func _apply_combat_result(self_slot: Slot, opp: Slot, won: bool, seed_val: int, is_b_perspective: bool) -> void:
	# Damage formula matches single-player: sum of surviving enemy unit costs,
	# floor 2. We don't have access to surviving units from run_headless —
	# fall back to a flat round-scaled damage when the slot lost.
	var damage := 0
	if not won:
		damage = maxi(2, round_num + opp.board.size())
		self_slot.hp -= damage
	# Streak bookkeeping (server is authoritative — clients display from here).
	if won:
		self_slot.win_streak += 1
		self_slot.loss_streak = 0
	else:
		self_slot.loss_streak += 1
		self_slot.win_streak = 0
	# Tell the human player what happened. Bots don't need RPCs, and peers
	# that aren't actually connected (smoke-test spoof, mid-round drops)
	# get skipped to avoid Godot's "unknown peer ID" error spam.
	if not self_slot.is_bot and NetworkManager.is_peer_reachable(self_slot.peer_id):
		var opp_board: Dictionary = opp.board.duplicate(true)
		NetworkManager.round_start_rpc.rpc_id(self_slot.peer_id,
			round_num, opp.display_name, opp_board, seed_val)
		NetworkManager.round_result_rpc.rpc_id(self_slot.peer_id,
			won, damage, self_slot.hp)
	# Param `is_b_perspective` is unused now but kept so future code can
	# distinguish "player A view" / "player B view" of the same matchup.
	var _ignore := is_b_perspective


func _make_pairings(alive: Array[Slot]) -> Array:
	# Random shuffle, pair adjacent. Odd count → one player ghosts against the
	# board of a recently-eliminated slot (or a bot's board) so they still
	# have a fight to play.
	var working := alive.duplicate()
	working.shuffle()
	var pairings: Array = []
	while working.size() >= 2:
		var a: Slot = working.pop_back()
		var b: Slot = working.pop_back()
		pairings.append([a, b])
	if working.size() == 1:
		var lone: Slot = working[0]
		var ghost := _pick_ghost_for(lone)
		pairings.append([lone, ghost])
	return pairings


func _pick_ghost_for(self_slot: Slot) -> Slot:
	# Prefer a recently-eliminated player's board over a random bot — feels
	# more like TFT. Falls back to any slot that isn't `self`.
	var dead_with_boards: Array[Slot] = []
	for s in slots:
		if s == self_slot:
			continue
		if not s.board.is_empty():
			dead_with_boards.append(s)
	if dead_with_boards.is_empty():
		return self_slot  # degenerate; shouldn't happen post-round-1
	return dead_with_boards[randi() % dead_with_boards.size()]


func _streak_bonus(s: Slot) -> int:
	var streak: int = maxi(s.win_streak, s.loss_streak)
	if streak >= 5: return 3
	if streak >= 3: return 2
	if streak >= 2: return 1
	return 0


func _all_humans_submitted() -> bool:
	for s in slots:
		if s.alive and not s.is_bot and not s.submitted_this_round:
			return false
	return true


func _count_alive() -> int:
	var n := 0
	for s in slots:
		if s.alive:
			n += 1
	return n


# ─── End of match ───────────────────────────────────────────────────────────

func _end_match() -> void:
	phase = Phase.ENDED
	var winner: Slot = null
	for s in slots:
		if s.alive:
			winner = s
			break
	var winner_name: String = winner.display_name if winner else "(none)"
	print("[lobby] match ended — winner: %s" % winner_name)
	# Tell every connected human their placement.
	var ranked := slots.duplicate()
	ranked.sort_custom(func(a, b): return a.hp > b.hp)
	var placement_by_index: Dictionary = {}
	for i in ranked.size():
		placement_by_index[ranked[i].index] = i + 1
	for s in slots:
		if not s.is_bot and NetworkManager.is_peer_reachable(s.peer_id):
			var place: int = placement_by_index.get(s.index, SLOT_COUNT)
			NetworkManager.mp_game_over_rpc.rpc_id(s.peer_id, place, winner_name)


# ─── Roster broadcast ───────────────────────────────────────────────────────

func _broadcast_roster() -> void:
	var roster: Array = []
	for s in slots:
		roster.append(s.to_roster_entry())
	# Use rpc() (broadcast) — clients receive via NetworkManager.roster_update_rpc.
	NetworkManager.roster_update_rpc.rpc(roster)
