extends Node
## Multiplayer network entrypoint. Owns the WebSocketMultiplayerPeer and the
## `multiplayer.multiplayer_peer` lifecycle. Routes peer connect/disconnect
## events into Lobby (server side) and GameState (client side).
##
## Usage:
##   NetworkManager.host_lobby(7575)              # server side, also player 1
##   NetworkManager.join_lobby("ws://host", "Bob") # client side
##   NetworkManager.leave()
##
## Single-player mode never touches this autoload — `mode` stays "off".

const DEFAULT_PORT := 7575

enum Mode { OFF, HOST, CLIENT, DEDICATED_SERVER }

var mode: int = Mode.OFF
var local_player_name: String = ""
var peer: WebSocketMultiplayerPeer = null

# Server-only — built lazily on first host call. Holds slot/round state.
var lobby = null

signal connection_state_changed(state: String)  # "connecting"|"online"|"offline"|"error"
signal lobby_roster_updated(roster: Array)       # client-side mirror of server roster


func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)


# ─── Mode entry points ──────────────────────────────────────────────────────

func host_lobby(port: int = DEFAULT_PORT, player_name: String = "Host", dedicated: bool = false) -> bool:
	leave()
	peer = WebSocketMultiplayerPeer.new()
	var err := peer.create_server(port)
	if err != OK:
		push_error("[net] create_server(%d) failed: %s" % [port, err])
		emit_signal("connection_state_changed", "error")
		return false
	multiplayer.multiplayer_peer = peer
	mode = Mode.DEDICATED_SERVER if dedicated else Mode.HOST
	local_player_name = player_name
	_ensure_lobby()
	if not dedicated:
		# Host is also player 1 — register them locally without an RPC roundtrip.
		lobby.register_player(1, player_name)
	emit_signal("connection_state_changed", "online")
	print("[net] hosting on port %d (dedicated=%s)" % [port, dedicated])
	return true


func join_lobby(url: String, player_name: String) -> bool:
	leave()
	peer = WebSocketMultiplayerPeer.new()
	var err := peer.create_client(url)
	if err != OK:
		push_error("[net] create_client(%s) failed: %s" % [url, err])
		emit_signal("connection_state_changed", "error")
		return false
	multiplayer.multiplayer_peer = peer
	mode = Mode.CLIENT
	local_player_name = player_name
	emit_signal("connection_state_changed", "connecting")
	print("[net] joining %s as %s" % [url, player_name])
	return true


func leave() -> void:
	if multiplayer.multiplayer_peer:
		multiplayer.multiplayer_peer.close()
	multiplayer.multiplayer_peer = null
	peer = null
	mode = Mode.OFF
	if lobby:
		lobby.queue_free()
		lobby = null
	emit_signal("connection_state_changed", "offline")


func is_server() -> bool:
	return mode == Mode.HOST or mode == Mode.DEDICATED_SERVER


func is_online() -> bool:
	return mode != Mode.OFF


# ─── Helpers for game_ui / GameState (avoids local rpc edge cases) ──────────

func submit_board(board: Dictionary) -> void:
	# On the host we'd otherwise need to roundtrip through an RPC and
	# stumble on get_remote_sender_id() returning 0 for local calls.
	# Just call the lobby method directly when we are the server.
	if is_server():
		if lobby:
			lobby.receive_player_board(1, board)
	else:
		submit_board_rpc.rpc_id(1, board)


# ─── Lobby plumbing ─────────────────────────────────────────────────────────

func _ensure_lobby() -> void:
	if lobby != null:
		return
	var Lobby = preload("res://scripts/net/lobby.gd")
	lobby = Lobby.new()
	lobby.name = "Lobby"
	add_child(lobby)


# ─── Peer lifecycle ─────────────────────────────────────────────────────────

func _on_peer_connected(peer_id: int) -> void:
	# Server side: a new client connected, but they haven't told us their name
	# yet. The lobby waits for a `register_player` RPC from the client.
	if is_server():
		print("[net] peer %d connected" % peer_id)


func _on_peer_disconnected(peer_id: int) -> void:
	if is_server() and lobby:
		print("[net] peer %d disconnected — replacing slot with bot" % peer_id)
		lobby.unregister_player(peer_id)


func _on_connected_to_server() -> void:
	# Client side. Tell the server who we are.
	emit_signal("connection_state_changed", "online")
	rpc_id(1, "register_player_rpc", local_player_name)


func _on_connection_failed() -> void:
	emit_signal("connection_state_changed", "error")
	leave()


func _on_server_disconnected() -> void:
	emit_signal("connection_state_changed", "offline")
	leave()


# ─── RPCs (client → server) ─────────────────────────────────────────────────

@rpc("any_peer", "call_remote", "reliable")
func register_player_rpc(player_name: String) -> void:
	# Server only. The remote sender's id is the new player's peer_id.
	if not is_server() or lobby == null:
		return
	var sender_id := multiplayer.get_remote_sender_id()
	lobby.register_player(sender_id, player_name)


@rpc("any_peer", "call_remote", "reliable")
func submit_board_rpc(board_data: Dictionary) -> void:
	if not is_server() or lobby == null:
		return
	var sender_id := multiplayer.get_remote_sender_id()
	lobby.receive_player_board(sender_id, board_data)


@rpc("any_peer", "call_remote", "reliable")
func ready_for_next_round_rpc() -> void:
	if not is_server() or lobby == null:
		return
	lobby.mark_ready(multiplayer.get_remote_sender_id())


# ─── RPCs (server → client) ─────────────────────────────────────────────────

@rpc("authority", "call_local", "reliable")
func roster_update_rpc(roster: Array) -> void:
	emit_signal("lobby_roster_updated", roster)
	GameState.on_remote_roster(roster)


@rpc("authority", "call_local", "reliable")
func round_start_rpc(round_num: int, opponent_name: String, opponent_board: Dictionary, combat_seed: int) -> void:
	# Client side. Hand off to GameState so it can drive the local sim.
	GameState.on_remote_round_start(round_num, opponent_name, opponent_board, combat_seed)


@rpc("authority", "call_local", "reliable")
func round_result_rpc(player_won: bool, damage_taken: int, new_hp: int) -> void:
	GameState.on_remote_round_result(player_won, damage_taken, new_hp)


@rpc("authority", "call_local", "reliable")
func placement_phase_rpc(round_num: int, gold_award: int) -> void:
	GameState.on_remote_placement_phase(round_num, gold_award)


@rpc("authority", "call_local", "reliable")
func mp_game_over_rpc(placement: int, winner_name: String) -> void:
	GameState.on_remote_game_over(placement, winner_name)
