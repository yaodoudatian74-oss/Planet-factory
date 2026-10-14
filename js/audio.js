'use strict';
/* 効果音はすべてWebAudioで合成（音声ファイルなし）。最初のタップまで鳴らない。 */

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const on = () => S.settings.sound && ensure();

  function tone(freq, dur, type, vol, when, slide) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, freq, when, q) {
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.15), t + dur);
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  return {
    unlock() { if (S.settings.sound) ensure(); },
    tap() {
      if (!on()) return;
      const f = 700 + Math.random() * 260;
      tone(f, 0.09, 'sine', 0.07);
      tone(f * 2, 0.06, 'triangle', 0.025);
    },
    buy() {
      if (!on()) return;
      tone(392, 0.09, 'square', 0.035);
      tone(784, 0.16, 'triangle', 0.07, 0.05);
      tone(1175, 0.2, 'sine', 0.04, 0.1);
    },
    upgrade() {
      if (!on()) return;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.06));
    },
    deny() {
      if (!on()) return;
      tone(160, 0.14, 'square', 0.04, 0, 0.7);
    },
    evolve() {
      if (!on()) return;
      noise(2.4, 0.16, 3000, 0, 0.5);
      [130.8, 196, 261.6, 329.6, 392, 523.3].forEach((f, i) => {
        tone(f, 3.2, i < 2 ? 'sawtooth' : 'triangle', i < 2 ? 0.03 : 0.05, 0.1 + i * 0.12);
      });
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'sine', 0.04, 0.9 + i * 0.1));
    },
    thunder() {
      if (!on()) return;
      noise(1.1, 0.35, 1800, 0, 1.2);
      tone(70, 0.8, 'sawtooth', 0.06, 0, 0.5);
    },
    coins() {
      if (!on()) return;
      for (let i = 0; i < 10; i++) tone(1800 + Math.random() * 1600, 0.12, 'sine', 0.035, i * 0.07);
    },
    warp() {
      if (!on()) return;
      tone(200, 1.2, 'sawtooth', 0.04, 0, 6);
      noise(1.0, 0.08, 6000, 0.1);
    },
    meteor() {
      if (!on()) return;
      noise(0.5, 0.12, 4000);
      [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.4, 'sine', 0.06, 0.03 + i * 0.05));
    },
    whoosh() {
      if (!on()) return;
      noise(0.9, 0.06, 2500, 0, 2);
    },
    bigbang() {
      if (!on()) return;
      noise(4.0, 0.3, 5000, 0, 0.6);
      tone(55, 4.0, 'sawtooth', 0.08, 0, 0.5);
      [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => tone(f, 3, 'triangle', 0.05, 1.4 + i * 0.1));
    },
  };
})();
