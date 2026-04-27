extends SceneTree
## Headless multiplayer smoke test.
##
## Bypasses the network entirely — instantiates the Lobby directly and
## simulates a player by spoofing register_player + receive_player_board.
## Validates: bot fill, round phase machine, combat resolution, HP updates,
## elimination cascading. Run with:
##   godot --headless --path godot4 -s res://scripts/lobby_test.gd

const Lobby = preload("res://scripts/net/lobby.gd")
const SIM_DURATION := 90.0
const TICK_RATE := 30.0

var lobby: Lobby
var elapsed: float = 0.0
var fake_player_board: Dictionary = {}


func _initialize() -> void:
	# Wait for autoloads (GameData rebuilds units_by_tier on _ready).
	await process_frame
	await process_frame

	lobby = Lobby.new()
	lobby.name = "Lobby"
	root.add_child(lobby)

	# Spoof a "player" in slot 0. Without a real RPC channel, the lobby's
	# RPC broadcasts won't have anywhere to land — that's fine, we just
	# want to watch the server-side state evolve.
	lobby.register_player(42, "TestPlayer")
	print("[test] lobby roster after register:")
	_dump_roster()

	# Build a small but valid player board so combat has something to pair.
	fake_player_board = {
		"3,4": {"id": "alley_tabby_thug", "stars": 1},
		"4,4": {"id": "alley_ginger_rogue", "stars": 1},
		"5,4": {"id": "alley_tuxedo_con", "stars": 1},
	}

	var dt := 1.0 / TICK_RATE
	var rounds_seen: int = 0
	var last_round: int = 0

	while elapsed < SIM_DURATION and lobby.phase != Lobby.Phase.ENDED:
		# Drive the lobby's _process by hand — SceneTree's idle ticking would
		# also work, but explicit driving keeps timing predictable.
		lobby._process(dt)

		# Submit player's board the moment we enter a placement phase.
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
	quit()


func _dump_roster() -> void:
	for s in lobby.slots:
		var tag := "BOT" if s.is_bot else "HUMAN"
		print("  slot %d %-6s name=%-22s hp=%-3d gold=%-3d alive=%s w=%d l=%d" %
			[s.index, tag, s.display_name, s.hp, s.gold, s.alive,
			s.win_streak, s.loss_streak])
