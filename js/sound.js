// sound.js — 배경음악 + 효과음 (assets/audio 음원, 없으면 직접 합성한 소리로 대신)
"use strict";
const Sound = {
  ctx: null,
  muted: (() => { try { return localStorage.getItem("st-muted") === "1"; } catch (e) { return false; } })(),
  // 음량: 배경음악은 게임에 방해되지 않게 작게, 효과음은 또렷하게
  VOL: { music: 0.13, sfx: 0.5 },
  BGM: { lobby: "01_lobby_sky_waiting", play: "02_spiral_tower_play", quiz: "03_quiz_thinking", finish: "04_finish_victory" },
  // 효과음 이름 → [파일, 음량]
  SFX: {
    click: ["01_button_click", 0.35], select: ["02_button_select", 0.45],
    jump: ["03_jump", 0.45], bounce: ["04_double_jump", 0.7], boing: ["04_double_jump", 0.6], land: ["05_landing", 0.3],
    correct: ["06_correct_answer", 0.8], wrong: ["07_wrong_answer", 0.7], gateWrong: ["07_wrong_answer", 0.7],
    checkpoint: ["08_checkpoint", 0.6], coin: ["09_coin_pickup", 0.6], star: ["10_star_pickup", 0.6],
    fall: ["11_fall", 0.6], respawn: ["12_respawn", 0.55], warn: ["13_timer_warning", 0.6],
    pop: ["14_chat_message", 0.55], ding: ["14_chat_message", 0.6],
    zone: ["15_stage_clear", 0.75], gate: ["15_stage_clear", 0.75], finish: ["15_stage_clear", 0.8],
    portal: ["16_portal_teleport", 0.6], pause: ["17_pause", 0.5], resume: ["18_resume", 0.5],
    knock: ["19_rotate_hazard", 0.6], start: ["20_game_start", 0.75],
  },
  buf: {}, master: null, musicBus: null, sfxBus: null, tracks: {}, want: null, loading: false,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.VOL.music; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.VOL.sfx; this.sfxBus.connect(this.master);
    this.load();
  },
  async load() {
    if (this.loading) return; this.loading = true;
    const get = async (path) => { try { const r = await fetch(path); return await this.ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { return null; } };
    // 음악 먼저 (지금 필요한 곡부터)
    const order = Object.keys(this.BGM).sort((a, b) => (b === this.want) - (a === this.want));
    for (const k of order) { this.buf["bgm:" + k] = await get(`assets/audio/bgm/${this.BGM[k]}.mp3`); if (this.want) this.music(this.want, true); }
    const files = [...new Set(Object.values(this.SFX).map((v) => v[0]))];
    await Promise.all(files.map(async (f) => { this.buf["sfx:" + f] = await get(`assets/audio/sfx/${f}.mp3`); }));
  },
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem("st-muted", this.muted ? "1" : "0"); } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  },
  // ---------- 배경음악 ----------
  // 여러 곡을 계속 돌려 두고 음량만 바꿔서 부드럽게 넘어감 (문제 풀 때 ↔ 달릴 때)
  music(name, force) {
    if (name === this.want && !force) return;
    this.want = name;
    const c = this.ctx; if (!c) return;
    const now = c.currentTime;
    for (const k of Object.keys(this.BGM)) {
      const on = k === name;
      let t = this.tracks[k];
      if (on && !t) {
        const b = this.buf["bgm:" + k]; if (!b) continue;
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = b; src.loop = k !== "finish";
        g.gain.value = 0.0001; src.connect(g).connect(this.musicBus); src.start();
        t = this.tracks[k] = { src, g };
        src.onended = () => { if (this.tracks[k] === t) delete this.tracks[k]; };
      }
      if (!t) continue;
      t.g.gain.cancelScheduledValues(now);
      t.g.gain.setTargetAtTime(on ? 1 : 0.0001, now, on ? 0.35 : 0.45);
      // 완주 음악은 한 번만: 다른 곡으로 가면 끝내기
      if (!on && k === "finish") { const s = t.src; setTimeout(() => { try { s.stop(); } catch (e) {} }, 2000); delete this.tracks[k]; }
    }
  },
  // 일시정지 등에서 음악만 살짝 줄이기
  duck(on) { if (this._duck === on) return; this._duck = on; if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.VOL.music * (on ? 0.35 : 1), this.ctx.currentTime, 0.2); },
  // ---------- 효과음 ----------
  sample(file, vol) {
    const b = this.buf["sfx:" + file]; if (!b) return false;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = b; g.gain.value = vol; src.connect(g).connect(this.sfxBus); src.start();
    return true;
  },
  tone(freq, dur, type = "sine", vol = 0.2, when = 0, slide = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    if (c.state === "suspended") c.resume();
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master || c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.15, when = 0, hp = 800) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + when, len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master || c.destination); src.start(t);
  },
  play(name, arg) {
    const c = this.ctx; if (!c || this.muted) return;
    if (c.state === "suspended") c.resume();
    const s = this.SFX[name];
    if (s && this.sample(s[0], s[1])) return;
    // 음원이 아직 없을 때 (또는 따로 만든 소리)
    switch (name) {
      case "jump": this.tone(420, 0.12, "square", 0.06, 0, 1.8); break;
      case "land": this.noise(0.05, 0.05, 0, 300); break;
      case "correct": [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.18, i * 0.08)); break;
      case "wrong": case "gateWrong": this.tone(220, 0.35, "sawtooth", 0.1, 0, 0.6); break;
      case "checkpoint": this.tone(880, 0.12, "sine", 0.12); this.tone(1175, 0.15, "sine", 0.12, 0.08); break;
      case "zone": case "gate": case "finish": case "start": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.16, i * 0.09)); break;
      case "bounce": case "boing": this.tone(300, 0.4, "sine", 0.2, 0, 3); break;
      case "fall": this.tone(600, 0.5, "triangle", 0.12, 0, 0.3); break;
      case "knock": this.noise(0.15, 0.25, 0, 400); this.tone(160, 0.2, "square", 0.08); break;
      case "wind": this.noise(0.6, 0.05, 0, 2000); break;
      case "crack": this.noise(0.2, 0.12, 0, 1200); break;
      case "note": this.tone(arg || 523, 0.25, "triangle", 0.1); break;
      case "pop": case "ding": case "click": case "select": this.tone(700, 0.08, "sine", 0.1, 0, 1.5); break;
    }
  },
};
// 버튼 누를 때 작은 딸깍 소리 (점프·방향·조이스틱은 제외)
addEventListener("pointerdown", (e) => {
  if (typeof MODE !== "undefined" && MODE === "tv") Sound.init();
  const b = e.target.closest && e.target.closest("button, .ssAv, a.tBtn");
  if (!b || b.closest("#jumpBtn, #turnPad, #joy, #skillBtn")) return;
  Sound.init();
  Sound.play(b.matches(".ssAv, #clsBtns button, .sayP, .sayS") ? "select" : "click");
}, true);
