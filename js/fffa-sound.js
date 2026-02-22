// ============================================================
//  FFFA — Sound System
//  Version: 0.3.0.0
//  Web Audio API synthesis: meow, hiss, death sounds
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  let attackCounter = 0;
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  function playMeow(type = 'attack') {
    if (!G.soundEnabled) return;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'death') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'attack') {
      osc.type = 'triangle';
      const basePitch = 400 + Math.random() * 200;
      osc.frequency.setValueAtTime(basePitch, now);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.5, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 0.8, now + 0.15);
      gainNode.gain.setValueAtTime(0.12, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'hiss') {
      const bufferSize = audioContext.sampleRate * 0.2;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const noise = audioContext.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(0.1, now);
      noise.connect(noiseGain);
      noiseGain.connect(audioContext.destination);
      noise.start(now);
    }
  }

  function maybePlayAttackMeow() {
    attackCounter++;
    if (attackCounter % 5 === 0) {
      playMeow('attack');
    }
  }

  function playDeathMeow() {
    playMeow('death');
  }

  function playHiss() {
    playMeow('hiss');
  }

  window.SoundSystem = {
    playMeow,
    maybePlayAttackMeow,
    playDeathMeow,
    playHiss
  };
})();
