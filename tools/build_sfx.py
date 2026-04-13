#!/usr/bin/env python3
"""Generate placeholder SFX WAV files for FFFA.

Outputs 15 mono 16-bit 44100 Hz WAV files into godot4/art/sfx/.
Uses only Python stdlib (wave, struct, math, random).
Run:  python3 tools/build_sfx.py
"""

import math
import os
import random
import struct
import wave

SAMPLE_RATE = 44100
MAX_AMP = 32767  # 16-bit signed max
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "godot4", "art", "sfx")

# ---------------------------------------------------------------------------
# Waveform primitives
# ---------------------------------------------------------------------------

def sine(freq: float, t: float) -> float:
    return math.sin(2.0 * math.pi * freq * t)

def square(freq: float, t: float) -> float:
    return 1.0 if sine(freq, t) >= 0.0 else -1.0

def noise(_t: float) -> float:
    return random.uniform(-1.0, 1.0)

# ---------------------------------------------------------------------------
# Envelope helpers
# ---------------------------------------------------------------------------

def env_decay(t: float, duration: float, attack: float = 0.005) -> float:
    """Fast attack, exponential decay to ~0 at duration."""
    if t < attack:
        return t / attack
    remaining = (duration - t) / (duration - attack)
    return max(0.0, remaining * remaining)

def env_adsr(t: float, a: float, d: float, s: float, r: float, dur: float) -> float:
    if t < a:
        return t / a if a > 0 else 1.0
    t2 = t - a
    if t2 < d:
        return 1.0 - (1.0 - s) * (t2 / d)
    t3 = t - a - d
    sustain_dur = dur - a - d - r
    if t3 < sustain_dur:
        return s
    t4 = t3 - sustain_dur
    return s * max(0.0, 1.0 - t4 / r) if r > 0 else 0.0

# ---------------------------------------------------------------------------
# DSP helpers
# ---------------------------------------------------------------------------

def lowpass(samples: list[float], cutoff_ratio: float = 0.1) -> list[float]:
    """Single-pole IIR low-pass. cutoff_ratio ~ cutoff/sample_rate."""
    alpha = cutoff_ratio
    out = [0.0] * len(samples)
    out[0] = samples[0]
    for i in range(1, len(samples)):
        out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1])
    return out

def mix(*sample_lists: list[float]) -> list[float]:
    length = max(len(s) for s in sample_lists)
    out = [0.0] * length
    for sl in sample_lists:
        for i in range(len(sl)):
            out[i] += sl[i]
    return out

def clip(samples: list[float]) -> list[float]:
    return [max(-1.0, min(1.0, s)) for s in samples]

def silence(duration: float) -> list[float]:
    return [0.0] * int(SAMPLE_RATE * duration)

def n_samples(duration: float) -> int:
    return int(SAMPLE_RATE * duration)

# ---------------------------------------------------------------------------
# WAV writer
# ---------------------------------------------------------------------------

def write_wav(filename: str, samples: list[float]) -> None:
    path = os.path.join(OUT_DIR, filename)
    clipped = clip(samples)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        raw = b"".join(struct.pack("<h", int(s * MAX_AMP)) for s in clipped)
        wf.writeframes(raw)
    size_kb = os.path.getsize(path) / 1024
    print(f"  {filename:24s} {len(clipped):6d} samples  {size_kb:5.1f} KB")

# ---------------------------------------------------------------------------
# Sound generators
# ---------------------------------------------------------------------------

def gen_hit_normal() -> list[float]:
    """Short noise burst with fast decay, lowpassed. Punchy thud."""
    dur = 0.15
    random.seed(42)
    raw = [noise(0) * env_decay(i / SAMPLE_RATE, dur, 0.002)
           for i in range(n_samples(dur))]
    return lowpass(raw, 0.08)

def gen_hit_crit() -> list[float]:
    """Louder hit + descending sine sweep for crits."""
    dur = 0.25
    random.seed(43)
    n = n_samples(dur)
    burst = [noise(0) * env_decay(i / SAMPLE_RATE, dur, 0.002) * 1.3
             for i in range(n)]
    burst = lowpass(burst, 0.1)
    sweep = [sine(800 - 600 * (i / n), i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, dur, 0.001) * 0.6
             for i in range(n)]
    return clip(mix(burst, sweep))

def gen_death() -> list[float]:
    """Descending sine 400->80Hz + noise onset. Deflating feel."""
    dur = 0.4
    n = n_samples(dur)
    random.seed(44)
    tone = [sine(400 - 320 * (i / n), i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, dur, 0.01) * 0.7
            for i in range(n)]
    burst_dur = 0.06
    burst = [noise(0) * env_decay(i / SAMPLE_RATE, burst_dur) * 0.5
             if i < n_samples(burst_dur) else 0.0 for i in range(n)]
    return clip(mix(tone, burst))

def gen_ability_cast() -> list[float]:
    """Ascending sine sweep + shimmer harmonic. Magical rising tone."""
    dur = 0.35
    n = n_samples(dur)
    base = [sine(200 + 1000 * (i / n), i / SAMPLE_RATE) * env_adsr(i / SAMPLE_RATE, 0.02, 0.1, 0.4, 0.15, dur) * 0.6
            for i in range(n)]
    shimmer = [sine(400 + 2000 * (i / n), i / SAMPLE_RATE) * env_adsr(i / SAMPLE_RATE, 0.02, 0.1, 0.3, 0.15, dur) * 0.25
               for i in range(n)]
    return clip(mix(base, shimmer))

def gen_heal() -> list[float]:
    """Three ascending sine pips: C5-E5-G5. Pleasant major triad."""
    freqs = [523.25, 659.25, 783.99]  # C5, E5, G5
    pip_dur = 0.06
    gap_dur = 0.04
    samples: list[float] = []
    for freq in freqs:
        n = n_samples(pip_dur)
        pip = [sine(freq, i / SAMPLE_RATE) * env_adsr(i / SAMPLE_RATE, 0.005, 0.02, 0.6, 0.02, pip_dur) * 0.5
               for i in range(n)]
        samples.extend(pip)
        samples.extend(silence(gap_dur))
    return samples

def gen_status_apply() -> list[float]:
    """Low square + high sine pip. Lock-on feel."""
    dur = 0.2
    n = n_samples(dur)
    low = [square(150, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, dur, 0.005) * 0.3
           for i in range(n)]
    low = lowpass(low, 0.06)
    pip_dur = 0.05
    pip = [sine(600, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, pip_dur) * 0.5
           if i < n_samples(pip_dur) else 0.0 for i in range(n)]
    return clip(mix(low, pip))

def gen_buy() -> list[float]:
    """Two ascending sine pips. Coin-grab."""
    pip_dur = 0.05
    gap = 0.02
    samples: list[float] = []
    for freq in [440.0, 660.0]:
        n = n_samples(pip_dur)
        samples.extend(
            sine(freq, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, pip_dur) * 0.5
            for i in range(n)
        )
        samples.extend(silence(gap))
    return samples

def gen_sell() -> list[float]:
    """Two descending sine pips. Coin-toss-away."""
    pip_dur = 0.05
    gap = 0.02
    samples: list[float] = []
    for freq in [660.0, 440.0]:
        n = n_samples(pip_dur)
        samples.extend(
            sine(freq, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, pip_dur) * 0.5
            for i in range(n)
        )
        samples.extend(silence(gap))
    return samples

def gen_reroll() -> list[float]:
    """Fast sequence of noise clicks. Card shuffle feel."""
    clicks = 5
    click_dur = 0.015
    gap = 0.025
    samples: list[float] = []
    random.seed(45)
    for _ in range(clicks):
        n = n_samples(click_dur)
        click = [noise(0) * env_decay(i / SAMPLE_RATE, click_dur, 0.001) * 0.4
                 for i in range(n)]
        click = lowpass(click, 0.15)
        samples.extend(click)
        samples.extend(silence(gap))
    return samples

def gen_place() -> list[float]:
    """Short sine thump. Soft set-down."""
    dur = 0.1
    return [sine(180, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, dur, 0.005) * 0.5
            for i in range(n_samples(dur))]

def gen_merge() -> list[float]:
    """Rising sweep + bright chord burst. Star-up fanfare."""
    sweep_dur = 0.3
    chord_dur = 0.2
    n_sweep = n_samples(sweep_dur)
    n_chord = n_samples(chord_dur)
    sweep = [sine(300 + 600 * (i / n_sweep), i / SAMPLE_RATE)
             * env_adsr(i / SAMPLE_RATE, 0.01, 0.05, 0.7, 0.1, sweep_dur) * 0.5
             for i in range(n_sweep)]
    # Chord: fundamental + fifth
    chord_a = [sine(900, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, chord_dur, 0.005) * 0.4
               for i in range(n_chord)]
    chord_b = [sine(1350, i / SAMPLE_RATE) * env_decay(i / SAMPLE_RATE, chord_dur, 0.005) * 0.25
               for i in range(n_chord)]
    chord = clip(mix(chord_a, chord_b))
    return sweep + chord

def gen_level_up() -> list[float]:
    """Ascending square arpeggio C4-E4-G4 + held C5. Mini fanfare."""
    notes = [261.63, 329.63, 392.0]  # C4, E4, G4
    note_dur = 0.08
    samples: list[float] = []
    for freq in notes:
        n = n_samples(note_dur)
        raw = [square(freq, i / SAMPLE_RATE) * env_adsr(i / SAMPLE_RATE, 0.005, 0.02, 0.6, 0.02, note_dur) * 0.3
               for i in range(n)]
        samples.extend(lowpass(raw, 0.12))
    # Final held C5
    hold_dur = 0.16
    n = n_samples(hold_dur)
    hold = [square(523.25, i / SAMPLE_RATE) * env_adsr(i / SAMPLE_RATE, 0.005, 0.04, 0.5, 0.08, hold_dur) * 0.35
            for i in range(n)]
    samples.extend(lowpass(hold, 0.12))
    return samples

def gen_combat_start() -> list[float]:
    """Low beating rumble with crescendo. War-drum tension."""
    dur = 0.5
    n = n_samples(dur)
    # Two close frequencies create a beat
    a = [sine(60, i / SAMPLE_RATE) * (i / n) * 0.6 for i in range(n)]
    b = [sine(90, i / SAMPLE_RATE) * (i / n) * 0.4 for i in range(n)]
    rumble = clip(mix(a, b))
    # Sharp cutoff with tiny fade
    fade = n_samples(0.02)
    for i in range(fade):
        rumble[-(i + 1)] *= i / fade
    return rumble

def gen_victory() -> list[float]:
    """Ascending major arpeggio C4-E4-G4-C5. Bright and triumphant."""
    freqs = [261.63, 329.63, 392.0, 523.25]
    note_dur = 0.1
    tail_dur = 0.15
    samples: list[float] = []
    for i, freq in enumerate(freqs):
        dur = tail_dur if i == len(freqs) - 1 else note_dur
        n = n_samples(dur)
        note = [sine(freq, j / SAMPLE_RATE) * env_adsr(j / SAMPLE_RATE, 0.005, 0.03, 0.7, 0.05, dur) * 0.5
                for j in range(n)]
        samples.extend(note)
    return samples

def gen_defeat() -> list[float]:
    """Descending minor sequence with chorus detune. Melancholy."""
    freqs = [261.63, 311.13, 207.65, 196.0]  # C4, Eb4, Ab3, G3
    note_dur = 0.12
    tail_dur = 0.2
    samples: list[float] = []
    for i, freq in enumerate(freqs):
        dur = tail_dur if i == len(freqs) - 1 else note_dur
        n = n_samples(dur)
        a = [sine(freq, j / SAMPLE_RATE) * 0.4 for j in range(n)]
        b = [sine(freq * 1.005, j / SAMPLE_RATE) * 0.3 for j in range(n)]  # slight detune
        note = clip(mix(a, b))
        for j in range(n):
            note[j] *= env_adsr(j / SAMPLE_RATE, 0.01, 0.03, 0.6, 0.05, dur)
        samples.extend(note)
    return samples

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

SOUNDS = [
    ("hit_normal.wav", gen_hit_normal),
    ("hit_crit.wav", gen_hit_crit),
    ("death.wav", gen_death),
    ("ability_cast.wav", gen_ability_cast),
    ("heal.wav", gen_heal),
    ("status_apply.wav", gen_status_apply),
    ("buy.wav", gen_buy),
    ("sell.wav", gen_sell),
    ("reroll.wav", gen_reroll),
    ("place.wav", gen_place),
    ("merge.wav", gen_merge),
    ("level_up.wav", gen_level_up),
    ("combat_start.wav", gen_combat_start),
    ("victory.wav", gen_victory),
    ("defeat.wav", gen_defeat),
]

def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Generating {len(SOUNDS)} SFX into {OUT_DIR}/\n")
    for filename, generator in SOUNDS:
        samples = generator()
        write_wav(filename, samples)
    print(f"\nDone. {len(SOUNDS)} files written.")

if __name__ == "__main__":
    main()
