extends Node
## Headless multiplayer smoke test.
##
## Bypasses the network entirely — instantiates the Lobby directly and
## simulates a player by spoofing register_player + receive_player_board.
## Validates: bot fill, round phase machine, combat resolution, HP updates,
## elimination cascading. Run via the bundled scene so autoloads are
## guaranteed initialized before this script parses (a SceneTree-based
## test races the autoload registry):
##   godot --headless --path godot4 res://scenes/lobby_test.tscn

const Lobby = preload("res://scripts/net/lobby.gd")
const SIM_DURATION := 90.0
const TICK_RATE := 30.0

var lobby: Lobby
var fake_player_board: Dictionary = {}


func _ready() -> void:
	lobby = Lobby.new()
	lobby.name = "Lobby"
	add_child(lobby)

	# Spoof a "player" in slot 0. With no real peer behind the id, the
	# lobby's RPCs are guarded by NetworkManager.is_peer_reachable() and
	# silently skipped — exactly what we want for a server-state test.
	lobby.register_player(42, "TestPlayer")
	print("[test] lobby roster after register:")
	_dump_roster()

	# Build a small but valid player board so combat has something to pair.
	fake_player_board = {
		"3,4": {"id": "alley_tabby_thug", "stars": 1},
		"4,4": {"id": "alley_ginger_rogue", "stars": 1},
		"5,4": {"id": "alley_tuxedo_con", "stars": 1},
	}

	_run_sim()


func _run_sim() -> void:
	var dt := 1.0 / TICK_RATE
	var elapsed := 0.0
	var rounds_seen := 0
	var last_round := 0
	while elapsed < SIM_DURATION and lobby.phase != Lobby.Phase.ENDED:
		lobby._process(dt)
		if lobby.phase == Lobby.Phase.PLACEMENT and lobby.round_num != last_round:
			last_round = lobby.round_num
			rounds_seen += 1
			print("[test] R%d placement — submitting board" % lobby.round_num)
			lobby.receive_player_board(42, fake_player_board)
		elapsed += dt

	print("\n[test] simulation ended (phase=%d rounds_seen=%d alive=%d)" %
		[lobby.phase, rounds_seen, lobby._count_alive()])
	print("[test] final roster:")
	_dump_roster()
	get_tree().quit()


func _dump_roster() -> void:
	for s in lobby.slots:
		var tag := "BOT" if s.is_bot else "HUMAN"
		print("  slot %d %-6s name=%-22s hp=%-3d gold=%-3d alive=%s w=%d l=%d" %
			[s.index, tag, s.display_name, s.hp, s.gold, s.alive,
			s.win_streak, s.loss_streak])
