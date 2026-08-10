// ---------------------------------------------------------------------------
// AudioManager
// Everything is synthesized at runtime with the WebAudio API — no binary
// audio assets ship with the repo. Covers laser SFX, explosions (small/big),
// hit alarm, power-up chime, engine hum, and a generative darksynth-style
// ambient loop for background music.
// ---------------------------------------------------------------------------

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engineNode = null;
    this._musicTimer = null;
    this._unlocked = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this._unlocked = true;
  }

  setMusicVolume(v) {
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  setSfxVolume(v) {
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  // -------------------------------------------------------------- SFX ----
  playLaser() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.11);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playExplosion(kind = 'small') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = kind === 'big' ? 0.9 : 0.4;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'big' ? 1200 : 2200, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(kind === 'big' ? 0.55 : 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filter).connect(gain).connect(this.sfxGain);
    noise.start(t);

    if (kind === 'big') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      oscGain.gain.setValueAtTime(0.4, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(oscGain).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.55);
    }
  }

  playHit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(90, t + 0.25);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playPowerup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 880, 1100].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.2, t + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.2);
      osc.connect(gain).connect(this.sfxGain);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.22);
    });
  }

  startEngine() {
    if (!this.ctx || this.engineNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    gain.gain.value = 0.06;
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    osc.start();
    this.engineNode = { osc, gain, filter };
  }

  setEngineIntensity(boost) {
    if (!this.engineNode) return;
    const target = boost ? 0.12 : 0.06;
    this.engineNode.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineNode.osc.frequency.setTargetAtTime(boost ? 95 : 60, this.ctx.currentTime, 0.15);
  }

  stopEngine() {
    if (!this.engineNode) return;
    this.engineNode.osc.stop();
    this.engineNode = null;
  }

  // ------------------------------------------------------------ MUSIC ----
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const scale = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish, in semitones
    const baseFreq = 110; // A2
    let step = 0;

    const padOsc1 = this.ctx.createOscillator();
    const padOsc2 = this.ctx.createOscillator();
    const padGain = this.ctx.createGain();
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 700;
    padOsc1.type = 'sawtooth';
    padOsc2.type = 'sawtooth';
    padOsc1.frequency.value = baseFreq;
    padOsc2.frequency.value = baseFreq * 1.005;
    padGain.gain.value = 0.05;
    padOsc1.connect(padFilter);
    padOsc2.connect(padFilter);
    padFilter.connect(padGain).connect(this.musicGain);
    padOsc1.start();
    padOsc2.start();

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(padFilter.frequency);
    lfo.start();

    this._musicNodes = [padOsc1, padOsc2, lfo];

    const playArpNote = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const semitone = scale[step % scale.length];
      const octaveUp = (step % (scale.length * 2)) >= scale.length ? 2 : 1;
      const freq = baseFreq * 2 * octaveUp * Math.pow(2, semitone / 12);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.55);
      step++;
      this._musicTimer = setTimeout(playArpNote, 260);
    };
    playArpNote();
  }

  stopMusic() {
    if (this._musicTimer) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
    if (this._musicNodes) {
      this._musicNodes.forEach((n) => {
        try { n.stop(); } catch (e) { /* already stopped */ }
      });
      this._musicNodes = null;
    }
  }
}
