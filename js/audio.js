'use strict';
/* All sound is synthesised with WebAudio — no asset files to ship. */

const Sound = (() => {
  let ctx = null, master = null, windGain = null, muted = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);

      // Looping brown noise through a low-pass = wind.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      src.connect(lp); lp.connect(windGain); windGain.connect(master);
      src.start();
    } catch (e) { ctx = null; }
  }

  function tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  return {
    init,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    get muted() { return muted; },
    wind(level) { if (windGain && ctx) windGain.gain.setTargetAtTime(level, ctx.currentTime, 0.25); },
    chirp(pitch = 1, vol = 0.16) {
      tone(3100 * pitch, 4500 * pitch, 0.06, vol);
      tone(4300 * pitch, 2900 * pitch, 0.08, vol, 'sine', 0.075);
      tone(3500 * pitch, 4900 * pitch, 0.05, vol * 0.8, 'sine', 0.17);
    },
    peep(pitch = 1, vol = 0.08) { tone(3600 * pitch, 4400 * pitch, 0.07, vol); },
    peck() { tone(900 + Math.random() * 500, 300, 0.035, 0.07, 'triangle'); },
    good() {
      [660, 880, 990, 1320].forEach((f, i) => tone(f, f * 1.01, 0.22, 0.13, 'triangle', i * 0.09));
    },
    bad() {
      tone(330, 220, 0.22, 0.14, 'sawtooth');
      tone(247, 165, 0.3, 0.12, 'sawtooth', 0.16);
    },
    lost() { tone(2600, 1400, 0.35, 0.1); tone(1900, 900, 0.4, 0.08, 'sine', 0.2); },
    hawk() {
      tone(2300, 1500, 0.55, 0.16, 'sawtooth');
      tone(2100, 1200, 0.7, 0.13, 'sawtooth', 0.45);
    },
    ready() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.3, 0.12, 'triangle', i * 0.11));
    },
    win() {
      [523, 659, 784, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.34, 0.12, 'triangle', i * 0.14));
    },
    lose() {
      [392, 349, 311, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.5, 0.12, 'triangle', i * 0.26));
    },
  };
})();
