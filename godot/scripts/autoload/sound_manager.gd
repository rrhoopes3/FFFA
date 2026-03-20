# sound_manager.gd — Web Audio-style synthesized cat sounds via AudioServer
extends Node

var audio_enabled := true

func _ready() -> void:
	pass

func play_meow(pitch_scale := 1.0) -> void:
	if not audio_enabled:
		return
	_play_synth_tone(440.0 * pitch_scale, 0.15, 0.3)

func play_attack_meow() -> void:
	if not audio_enabled or randf() > 0.3:
		return
	play_meow(randf_range(0.8, 1.4))

func play_death_meow() -> void:
	if not audio_enabled:
		return
	_play_synth_tone(220.0, 0.3, 0.5)

func play_hiss() -> void:
	if not audio_enabled:
		return
	# Use noise-based sound for hiss
	_play_noise(0.2, 0.15)

func play_buy() -> void:
	if not audio_enabled:
		return
	_play_synth_tone(660.0, 0.05, 0.15)

func play_sell() -> void:
	if not audio_enabled:
		return
	_play_synth_tone(330.0, 0.08, 0.2)

func play_merge() -> void:
	if not audio_enabled:
		return
	# Rising tone for merge
	_play_synth_tone(440.0, 0.1, 0.2)
	await get_tree().create_timer(0.1).timeout
	_play_synth_tone(660.0, 0.1, 0.2)
	await get_tree().create_timer(0.1).timeout
	_play_synth_tone(880.0, 0.15, 0.3)

func _play_synth_tone(freq: float, duration: float, volume: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = 44100.0
	gen.buffer_length = duration + 0.1
	player.stream = gen
	player.volume_db = linear_to_db(volume)
	player.play()
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
	var samples := int(44100.0 * duration)
	for i in samples:
		var t := float(i) / 44100.0
		var envelope := clampf(1.0 - t / duration, 0.0, 1.0)
		envelope *= envelope
		var sample := sin(TAU * freq * t) * envelope * 0.5
		playback.push_frame(Vector2(sample, sample))
	# Auto-cleanup
	await get_tree().create_timer(duration + 0.2).timeout
	player.queue_free()

func _play_noise(duration: float, volume: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = 44100.0
	gen.buffer_length = duration + 0.1
	player.stream = gen
	player.volume_db = linear_to_db(volume)
	player.play()
	var playback: AudioStreamGeneratorPlayback = player.get_stream_playback()
	var samples := int(44100.0 * duration)
	for i in samples:
		var t := float(i) / 44100.0
		var envelope := clampf(1.0 - t / duration, 0.0, 1.0)
		var sample := (randf() * 2.0 - 1.0) * envelope * 0.3
		playback.push_frame(Vector2(sample, sample))
	await get_tree().create_timer(duration + 0.2).timeout
	player.queue_free()
