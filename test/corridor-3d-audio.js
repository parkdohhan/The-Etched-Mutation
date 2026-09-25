/**
 * 통로 3D (T1′) — 합성 소리 (실험 전용, 본 코드 미반영) (2026-09-25)
 *
 * 목적: 외부 음원 없이 WebAudio 로 장면 소리 5종(비·웅웅·종·삐·벨 잔향) + 도착 드론·허밍 + 발소리 + 뒤쪽 저음을 낸다.
 *       헤드리스에선 들리지 않으므로 volumes() 로 현재 음량을 숫자로 낸다(캡처 검증용).
 * 결정론: 노이즈 버퍼는 고정 씨앗 LCG. 간헐 소리(종·삐·벨·저음)는 경과 시간의 정수 박자로만 울린다. Math.random 없음.
 * 규칙(Among the Sleep 조사 항목 "소리가 전환을 잇는 방식"): 도착 소리는 남은 거리에 반비례로 커지고(= t 에 비례),
 *       발소리는 바닥재(출발/도착)를 t 로 섞고, 뒤쪽 사각지대에서 간헐 저음.
 * 소비자: test/corridor-3d-test.html 만.
 */

const STEP_FILTER = {   // 바닥재 → 발소리 음색 (필터·길이)
  wood:   { type: 'lowpass',  freq: 700,  q: 0.8, dur: 0.09, gain: 0.9 },
  tile:   { type: 'bandpass', freq: 2200, q: 1.2, dur: 0.05, gain: 0.7 },
  snow:   { type: 'highpass', freq: 1800, q: 0.6, dur: 0.14, gain: 0.55 },
  carpet: { type: 'lowpass',  freq: 350,  q: 0.7, dur: 0.11, gain: 0.5 },
};

export class CorridorAudio {
  constructor() {
    this.ctx = null; this.ok = false;
    this.vol = { A: 0, B: 0, hum: 0, drone: 0, step: 0, thump: 0, master: 0.8 };
    this.presetA = null; this.presetB = null;
    this.tMix = 0; this.beats = { bell: -1, beep: -1, ring: -1, thump: -1 };
    this.muted = false;
  }
  /** 사용자 제스처 뒤에 부른다 — 컨텍스트 생성 + 상시 소리 노드 */
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master; this.master.connect(ctx.destination);
    // 노이즈 버퍼 (씨앗 고정)
    const N = ctx.sampleRate * 2, buf = ctx.createBuffer(1, N, ctx.sampleRate), d = buf.getChannelData(0);
    let s = 12345; for (let i = 0; i < N; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    this.noiseBuf = buf;
    this.chan = { A: this._mkChannel('A'), B: this._mkChannel('B') };
    // 도착 드론 (110/111 Hz 두 사인) + 허밍 (삼각파 196 Hz, 5 Hz 비브라토 ±3 Hz)
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0; this.droneG.connect(this.master);
    for (const f of [110, 111.3]) { const o = ctx.createOscillator(); o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; o.connect(lp); lp.connect(this.droneG); o.start(); }
    this.humG = ctx.createGain(); this.humG.gain.value = 0; this.humG.connect(this.master);
    const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 196;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lfoG = ctx.createGain(); lfoG.gain.value = 3; lfo.connect(lfoG); lfoG.connect(hum.frequency); lfo.start();
    const humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 900; hum.connect(humLp); humLp.connect(this.humG); hum.start();
    this.ok = true;
    this._applyPresets();
  }
  _mkChannel(name) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.master);
    // 비: 노이즈 → 밴드패스 1.8k
    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = this.noiseBuf; rainSrc.loop = true;
    const rainBp = ctx.createBiquadFilter(); rainBp.type = 'bandpass'; rainBp.frequency.value = 1800; rainBp.Q.value = 0.6;
    const rainG = ctx.createGain(); rainG.gain.value = 0; rainSrc.connect(rainBp); rainBp.connect(rainG); rainG.connect(out); rainSrc.start();
    // 웅웅: 55 + 55.7 Hz → 로패스 200
    const humG = ctx.createGain(); humG.gain.value = 0; humG.connect(out);
    for (const f of [55, 55.7]) { const o = ctx.createOscillator(); o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; o.connect(lp); lp.connect(humG); o.start(); }
    // 벨 잔향용 딜레이
    const evG = ctx.createGain(); evG.gain.value = 1; evG.connect(out);
    const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.45; const dlG = ctx.createGain(); dlG.gain.value = 0;
    evG.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dlG); dlG.connect(out);
    return { name, out, rainG, humG, evG, dlG, kind: null };
  }
  setPresets(a, b) { this.presetA = a; this.presetB = b; this._applyPresets(); }
  _applyPresets() {
    if (!this.ok) return;
    for (const [ch, p] of [[this.chan.A, this.presetA], [this.chan.B, this.presetB]]) {
      if (!p) continue;
      ch.kind = p.sound;
      ch.rainG.gain.value = p.sound === 'rain' ? 0.35 : 0;
      ch.humG.gain.value = p.sound === 'hum' ? 0.5 : 0;
      ch.dlG.gain.value = p.sound === 'ring' ? 0.6 : 0;
    }
  }
  /** 관객 위치 t(0 출발 문 · 1 도착 문) — 매 프레임 */
  setMix(t) {
    this.tMix = Math.max(0, Math.min(1, t));
    const A = 1 - this.tMix, B = this.tMix;
    this.vol.A = +(A * 0.8).toFixed(3); this.vol.B = +(B * 0.8).toFixed(3);
    this.vol.drone = +(B * 0.22).toFixed(3); this.vol.hum = +(Math.pow(B, 1.5) * 0.16).toFixed(3);
    if (!this.ok) return;
    const now = this.ctx.currentTime, tc = 0.25;
    this.chan.A.out.gain.setTargetAtTime(this.muted ? 0 : this.vol.A, now, tc);
    this.chan.B.out.gain.setTargetAtTime(this.muted ? 0 : this.vol.B, now, tc);
    this.droneG.gain.setTargetAtTime(this.muted ? 0 : this.vol.drone, now, tc);
    this.humG.gain.setTargetAtTime(this.muted ? 0 : this.vol.hum, now, tc);
  }
  /** 경과 시간(초) 박자 — 간헐 소리 (결정론) */
  update(elapsed) {
    const fire = (key, period, fn) => { const b = Math.floor(elapsed / period); if (b !== this.beats[key]) { this.beats[key] = b; if (b > 0) fn(); } };
    for (const ch of this.ok ? [this.chan.A, this.chan.B] : []) {
      const g = ch === this.chan.A ? (1 - this.tMix) : this.tMix;
      if (ch.kind === 'bell') fire('bell' + ch.name, 7, () => this._bell(ch.evG, 0.25 * g));
      if (ch.kind === 'beep') fire('beep' + ch.name, 1.0, () => this._beep(ch.evG, 0.18 * g));
      if (ch.kind === 'ring') fire('ring' + ch.name, 3.0, () => this._ring(ch.evG, 0.22 * g));
    }
    fire('thump', 9, () => this.thump());
    // 발소리·저음 음량 표시값 감쇠 (숫자 노출용)
    this.vol.step = +(this.vol.step * 0.9).toFixed(3); this.vol.thump = +(this.vol.thump * 0.94).toFixed(3);
  }
  _env(node, g0, dur) { const ctx = this.ctx, g = ctx.createGain(); g.gain.setValueAtTime(g0, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur); g.connect(node); return g; }
  _bell(dst, amp) { const ctx = this.ctx; for (const [f, a] of [[880, 1], [1760, 0.4], [2637, 0.2]]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(this._env(dst, amp * a, 2.4)); o.start(); o.stop(ctx.currentTime + 2.5); } }
  _beep(dst, amp) { const ctx = this.ctx; const o = ctx.createOscillator(); o.frequency.value = 1000; o.connect(this._env(dst, amp, 0.07)); o.start(); o.stop(ctx.currentTime + 0.08); }
  _ring(dst, amp) { const ctx = this.ctx; for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; const e = this._env(dst, amp * 0.5, 0.9); o.connect(e); o.start(); o.stop(ctx.currentTime + 1.0); } }
  /** 발소리 — 출발/도착 바닥재를 t 로 섞는다 */
  step(stepA, stepB) {
    const t = this.tMix; this.vol.step = +(0.5).toFixed(3);
    if (!this.ok) return;
    const ctx = this.ctx;
    for (const [kind, g] of [[stepA, 1 - t], [stepB, t]]) {
      const f = STEP_FILTER[kind] || STEP_FILTER.wood; if (g < 0.02) continue;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loopStart = 0; src.loopEnd = 0.3;
      const bq = ctx.createBiquadFilter(); bq.type = f.type; bq.frequency.value = f.freq; bq.Q.value = f.q;
      src.connect(bq); bq.connect(this._env(this.master, 0.5 * f.gain * g * (this.muted ? 0 : 1), f.dur)); src.start(); src.stop(ctx.currentTime + f.dur + 0.02);
    }
  }
  /** 뒤쪽 사각지대의 저음 (60 Hz, 0.6 초) */
  thump() {
    this.vol.thump = 0.3;
    if (!this.ok) return;
    const ctx = this.ctx; const o = ctx.createOscillator(); o.frequency.value = 58; o.connect(this._env(this.master, this.muted ? 0 : 0.3, 0.6)); o.start(); o.stop(ctx.currentTime + 0.7);
  }
  setMuted(m) { this.muted = !!m; this.setMix(this.tMix); }
  volumes() { return Object.assign({ ctx: this.ctx ? this.ctx.state : 'none', t: +this.tMix.toFixed(3) }, this.vol); }
}
