extends Control
## Entry-point menu. Three modes: single-player, host a multiplayer lobby,
## or join an existing one. Picking a mode transitions to `main.tscn`, which
## reads the chosen mode off `GameState.mode`.
##
## Built programmatically (matching `game_ui.gd`'s style); the .tscn file is
## a one-liner that just attaches this script to a root Control.

const HOST_GAME_SCENE := "res://scenes/main.tscn"
const DEFAULT_JOIN_URL_LOCAL := "ws://localhost:7575"
const DEFAULT_JOIN_URL_WEB := "wss://fffa.cat/ws"

var status_label: Label
var url_field: LineEdit
var name_field: LineEdit


func _ready() -> void:
	anchor_right = 1.0
	anchor_bottom = 1.0
	mouse_filter = Control.MOUSE_FILTER_STOP

	# Headless dedicated-server entry: when launched with `-- --server`,
	# skip the UI build entirely and just bring up the host. The Lobby
	# autoload keeps ticking under NetworkManager regardless of any scene.
	for arg in OS.get_cmdline_user_args():
		if arg == "--server":
			_run_dedicated_server()
			return

	_build_ui()
	NetworkManager.connection_state_changed.connect(_on_connection_state)


func _build_ui() -> void:
	# Backdrop
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.05, 0.09, 1)
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	add_child(bg)

	var center := VBoxContainer.new()
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 14)
	center.anchor_left = 0.5
	center.anchor_top = 0.5
	center.anchor_right = 0.5
	center.anchor_bottom = 0.5
	center.offset_left = -260
	center.offset_top = -260
	center.offset_right = 260
	center.offset_bottom = 260
	add_child(center)

	var title := Label.new()
	title.text = "FFFA"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 96)
	title.add_theme_color_override("font_color", Color("#FBBF24"))
	title.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	title.add_theme_constant_override("outline_size", 8)
	center.add_child(title)

	var subtitle := Label.new()
	subtitle.text = "Feline Free-Fur-All"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 22)
	subtitle.add_theme_color_override("font_color", Color("#94A3B8"))
	center.add_child(subtitle)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 18)
	center.add_child(spacer)

	# Name field — used as display name in multiplayer.
	var name_row := _row("Display name:")
	name_field = LineEdit.new()
	name_field.text = "Player%d" % (randi() % 1000)
	name_field.custom_minimum_size = Vector2(220, 32)
	name_row.add_child(name_field)
	center.add_child(name_row)

	# URL field — used by Join. Defaults differ between web export (points
	# at the production server) and desktop builds (localhost for dev).
	var url_row := _row("Join URL:")
	url_field = LineEdit.new()
	url_field.text = DEFAULT_JOIN_URL_WEB if OS.has_feature("web") else DEFAULT_JOIN_URL_LOCAL
	url_field.custom_minimum_size = Vector2(220, 32)
	url_row.add_child(url_field)
	center.add_child(url_row)

	var spacer2 := Control.new()
	spacer2.custom_minimum_size = Vector2(0, 8)
	center.add_child(spacer2)

	# Action buttons
	var single := _make_button("▶  SINGLE PLAYER", Color("#06D6A0"))
	single.pressed.connect(_on_single_pressed)
	center.add_child(single)

	# Hosting from a browser tab doesn't work — WebSocketMultiplayerPeer
	# can't bind a listening socket inside a browser sandbox. Hide the
	# Host button on web; users join the dedicated server instead.
	if not OS.has_feature("web"):
		var host := _make_button("⌂  HOST MULTIPLAYER (8-slot lobby)", Color("#FBBF24"))
		host.pressed.connect(_on_host_pressed)
		center.add_child(host)

	var join := _make_button("⤴  JOIN MULTIPLAYER", Color("#60A5FA"))
	join.pressed.connect(_on_join_pressed)
	center.add_child(join)

	status_label = Label.new()
	status_label.text = ""
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", Color("#94A3B8"))
	center.add_child(status_label)


func _row(label_text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var lbl := Label.new()
	lbl.text = label_text
	lbl.custom_minimum_size = Vector2(120, 0)
	lbl.add_theme_font_size_override("font_size", 14)
	lbl.add_theme_color_override("font_color", Color("#E5E7EB"))
	row.add_child(lbl)
	return row


func _make_button(label: String, color: Color) -> Button:
	var btn := Button.new()
	btn.text = label
	btn.custom_minimum_size = Vector2(420, 48)
	btn.add_theme_font_size_override("font_size", 18)
	btn.add_theme_color_override("font_color", color)
	return btn


# ─── Mode entry handlers ────────────────────────────────────────────────────

func _on_single_pressed() -> void:
	GameState.mode = "single"
	get_tree().change_scene_to_file(HOST_GAME_SCENE)


func _on_host_pressed() -> void:
	GameState.mode = "multiplayer"
	if not NetworkManager.host_lobby(NetworkManager.DEFAULT_PORT, name_field.text):
		_set_status("Failed to host on port %d" % NetworkManager.DEFAULT_PORT, true)
		return
	get_tree().change_scene_to_file(HOST_GAME_SCENE)


func _on_join_pressed() -> void:
	GameState.mode = "multiplayer"
	var url := url_field.text.strip_edges()
	if url == "":
		_set_status("Enter a join URL first.", true)
		return
	_set_status("Connecting to %s…" % url, false)
	if not NetworkManager.join_lobby(url, name_field.text):
		_set_status("Failed to start client.", true)


func _on_connection_state(state: String) -> void:
	match state:
		"connecting":
			_set_status("Connecting…", false)
		"online":
			_set_status("Connected.", false)
			# Once we're online (after a join), drop into the game scene.
			if NetworkManager.mode == NetworkManager.Mode.CLIENT:
				get_tree().change_scene_to_file(HOST_GAME_SCENE)
		"offline":
			_set_status("Disconnected.", true)
		"error":
			_set_status("Connection error.", true)


func _set_status(text: String, is_error: bool) -> void:
	if status_label == null:
		return
	status_label.text = text
	status_label.add_theme_color_override("font_color",
		Color("#F87171") if is_error else Color("#94A3B8"))


func _run_dedicated_server() -> void:
	# Headless launch: start hosting and stay alive. No scene change — the
	# server doesn't render. Keeps the menu Control mounted as a no-op.
	GameState.mode = "multiplayer"
	NetworkManager.host_lobby(NetworkManager.DEFAULT_PORT, "Server", true)
	print("[server] dedicated FFFA host ready on :%d" % NetworkManager.DEFAULT_PORT)
