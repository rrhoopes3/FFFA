extends Node
## Audio manager autoload. Subscribes to EventBus signals and plays SFX.
## Pure view layer — sim never references this.

# ─── SFX preloads ────────────────────────────────────────────────────────────
const SFX := {
	"hit_normal":    preload("res://art/sfx/hit_normal.wav"),
	"hit_crit":      preload("res://art/sfx/hit_crit.wav"),
	"death":         preload("res://art/sfx/death.wav"),
	"ability_cast":  preload("res://art/sfx/ability_cast.wav"),
	"heal":          preload("res://art/sfx/heal.wav"),
	"status_apply":  preload("res://art/sfx/status_apply.wav"),
	"buy":           preload("res://art/sfx/buy.wav"),
	"sell":          preload("res://art/sfx/sell.wav"),
	"reroll":        preload("res://art/sfx/reroll.wav"),
	"place":         preload("res://art/sfx/place.wav"),
	"merge":         preload("res://art/sfx/merge.wav"),
	"level_up":      preload("res://art/sfx/level_up.wav"),
	"combat_start":  preload("res://art/sfx/combat_start.wav"),
	"victory":       preload("res://art/sfx/victory.wav"),
	"defeat":        preload("res://art/sfx/defeat.wav"),
}

# ─── Volume tiers (dB) ──────────────────────────────────────────────────────
const VOL_COMBAT := -6.0
const VOL_UI := -3.0
const VOL_FLOW := 0.0

# ─── Polyphonic pool ────────────────────────────────────────────────────────
const POOL_SIZE := 12
var _pool: Array[AudioStreamPlayer] = []
var _pool_idx: int = 0

func _ready() -> void:
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = &"Master"
		add_child(p)
		_pool.append(p)

	# Combat
	EventBus.unit_attacked.connect(_on_unit_attacked)
	EventBus.unit_died.connect(_on_unit_died)
	EventBus.unit_ability_cast.connect(_on_unit_ability_cast)
	EventBus.unit_healed.connect(_on_unit_healed)
	EventBus.status_applied.connect(_on_status_applied)
	EventBus.combat_started.connect(_on_combat_started)
	EventBus.combat_ended.connect(_on_combat_ended)

	# Shop / board
	EventBus.unit_bought.connect(_on_unit_bought)
	EventBus.unit_sold.connect(_on_unit_sold)
	EventBus.shop_refreshed.connect(_on_shop_refreshed)
	EventBus.unit_placed.connect(_on_unit_placed)
	EventBus.unit_merged.connect(_on_unit_merged)
	EventBus.level_changed.connect(_on_level_changed)

# ─── Playback ────────────────────────────────────────────────────────────────

func _play(key: String, volume_db: float = 0.0) -> void:
	var player := _pool[_pool_idx]
	_pool_idx = (_pool_idx + 1) % POOL_SIZE
	player.stream = SFX[key]
	player.volume_db = volume_db
	player.play()

# ─── Combat handlers ─────────────────────────────────────────────────────────

func _on_unit_attacked(_attacker_uid: int, _target_uid: int, _damage: int, is_crit: bool) -> void:
	_play("hit_crit" if is_crit else "hit_normal", VOL_COMBAT)

func _on_unit_died(_uid: int) -> void:
	_play("death", VOL_COMBAT)

func _on_unit_ability_cast(_uid: int, _ability_name: String) -> void:
	_play("ability_cast", VOL_COMBAT)

func _on_unit_healed(_uid: int, _amount: int) -> void:
	_play("heal", VOL_COMBAT)

func _on_status_applied(_uid: int, _status_type: String, _duration: float) -> void:
	_play("status_apply", VOL_COMBAT)

func _on_combat_started() -> void:
	_play("combat_start", VOL_FLOW)

func _on_combat_ended(player_won: bool) -> void:
	_play("victory" if player_won else "defeat", VOL_FLOW)

# ─── Shop / board handlers ───────────────────────────────────────────────────

func _on_unit_bought(_unit_id: String, _slot: int) -> void:
	_play("buy", VOL_UI)

func _on_unit_sold(_unit_id: String, _source: String) -> void:
	_play("sell", VOL_UI)

func _on_shop_refreshed() -> void:
	_play("reroll", VOL_UI)

func _on_unit_placed(_unit_id: String, _hex_key: String) -> void:
	_play("place", VOL_UI)

func _on_unit_merged(_unit_id: String, _new_stars: int) -> void:
	_play("merge", VOL_UI)

func _on_level_changed(_new_level: int) -> void:
	_play("level_up", VOL_UI)
