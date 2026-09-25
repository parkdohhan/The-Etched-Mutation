/**
 * 통로 3D (T1′) — 합성 소리 (실험 전용, 본 코드 미반영) (2026-09-25)
 *
 * 목적: 외부 음원 없이 WebAudio 로 장면 소리 5종(비·웅웅·바람·삐·벨 잔향) + 도착 드론·허밍 + 발소리 + 뒤쪽 저음을 낸다.
 *       헤드리스에선 들리지 않으므로 volumes() 로 현재 음량을 숫자로 낸다(캡처 검증용).
 * 결정론: 노이즈 버퍼는 고정 씨앗 LCG. 간헐 소리(종·삐·벨·저음)는 경과 시간의 정수 박자로만 울린다. Math.random 없음.
 * 260925 오후 재설계(기억별 공간): 첫눈의 마당은 종 → 바람(노이즈 → 로패스 320 Hz, 0.08 Hz 로 돌풍처럼 커졌다 작아짐).
 *       열린 땅의 소리는 벽이 없는 공간의 재료 — 통로에서 t 로 섞이는 규칙은 다른 소리와 같다.
 * 규칙(Among the Sleep 조사 항목 "소리가 전환을 잇는 방식"): 도착 소리는 남은 거리에 반비례로 커지고(= t 에 비례),
 *       발소리는 바닥재(출발/도착)를 t 로 섞고, 뒤쪽 사각지대에서 간헐 저음.
 *
 * ─── 260925 저녁 — 검토 반영 (소리 3건 + 시간차) ─────────────────────────────────────────────
 *   1. 기억별 소리 선택: 도착 드론·허밍·뒤쪽 저음의 양은 재료 세트의 audio {drone, hum, thump} 가 정한다(빌더 MATERIAL_SETS).
 *      오전판은 다섯 기억 공통(0.22/0.16/0.3)이라 열린 눈밭에도 음산한 결이 깔렸다. 눈밭·빈 방 0, 병실은 형광등 허밍만.
 *   2. 자리가 있는 소리: 사건 소리(전화벨·삐·종)는 PannerNode(HRTF) 를 지나 그 사물(전화기·링거대)의 세계 좌표에서 난다 —
 *      setSourcePos('A'|'B', {x,y,z}). 관객(카메라)은 setListener(pos, forward, up) 으로 매 프레임. 비·바람·웅웅은 공간 전체의
 *      소리라 자리 없음(종전). 뒤쪽 저음(thump)은 울리는 순간 관객 뒤 3 m 에 자리를 잡는다 — 고개를 돌리면 방향이 바뀐다(모노였음).
 *   3. 닫힌 문 너머는 먹먹: 채널마다 로패스(muffle) — setMuffle(mA, mB) 0..1, 컷오프 = 350·(16000/350)^m Hz. 어느 문이 사이에
 *      있는지는 페이지가 계산한다(닫힌 공간의 문만 막는다 — 홀로 선 문은 소리를 안 막음).
 *   4. 시간차(검토 #2): 배경 소리 섞임 tAmb · 발소리 섞임 tStep · 도착 소리 tArrive 를 따로 받는다 — setMix(tAmb, tStep, tArrive).
 *      곡선(눈이 먼저 / 귀가 먼저 / 동시)은 페이지가 갖는다. 종전 setMix(t) 하나 = 셋 다 t.
 * 소비자: test/corridor-3d-test.html 만.
 */

const STEP_FILTER = {   // 바닥재 → 발소리 음색 (필터·길이)
  wood:   { type: 'lowpass',  freq: 700,  q: 0.8, dur: 0.09, gain: 0.9 },
  tile:   { type: 'bandpass', freq: 2200, q: 1.2, dur: 0.05, gain: 0.7 },
  snow:   { type: 'highpass', freq: 1800, q: 0.6, dur: 0.14, gain: 0.55 },
  carpet: { type: 'lowpass',  freq: 350,  q: 0.7, dur: 0.11, gain: 0.5 },
};
const DEFAULT_AUDIO = Object.freeze({ drone: 0.22, hum: 0.16, thump: 0.3 });   // 오전판 공통값 — 프리셋에 audio 가 없을 때만
const MUFFLE_LO = 350, MUFFLE_HI = 16000;
const THUMP_PERIOD = 9, THUMP_BEHIND_M = 3;

export class CorridorAudio {
  constructor() {
    this.ctx = null; this.ok = false;
    this.vol = { A: 0, B: 0, hum: 0, drone: 0, step: 0, thump: 0, master: 0.8, muffleA: 1, muffleB: 1, thumpAmt: 0 };
    this.presetA = null; this.presetB = null;
    this.tAmb = 0; this.tStep = 0; this.tArrive = 0; this.tMix = 0;
    this.beats = { bell: -1, beep: -1, ring: -1, thump: -1 };
    this.muted = false;
    this.muffle = { A: 1, B: 1 };
    this.src = { A: null, B: null };                                       // 사건 소리 자리 (세계 좌표)
    this.lis = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 };
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
    // 도착 드론 (110/111 Hz 두 사인) + 허밍 (삼각파 196 Hz, 5 Hz 비브라토 ±3 Hz) — 양은 도착 기억의 audio 가 정한다
    this.droneG = ctx.createGain(); this.droneG.gain.value = 0; this.droneG.connect(this.master);
    for (const f of [110, 111.3]) { const o = ctx.createOscillator(); o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; o.connect(lp); lp.connect(this.droneG); o.start(); }
    this.humG = ctx.createGain(); this.humG.gain.value = 0; this.humG.connect(this.master);
    const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 196;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lfoG = ctx.createGain(); lfoG.gain.value = 3; lfo.connect(lfoG); lfoG.connect(hum.frequency); lfo.start();
    const humLp = ctx.createBiquadFilter(); humLp.type = 'lowpass'; humLp.frequency.value = 900; hum.connect(humLp); humLp.connect(this.humG); hum.start();
    this.ok = true;
    this._applyPresets();
    this._applyListener();
    for (const n of ['A', 'B']) this._applySource(n);
    this._applyMuffle();
  }
  _mkPanner() {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.maxDistance = 40; p.rolloffFactor = 1;
    p.coneInnerAngle = 360; p.coneOuterAngle = 360;
    return p;
  }
  _mkChannel(name) {
    const ctx = this.ctx;
    // out → muffle(로패스, 닫힌 문 너머) → master
    const muff = ctx.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = MUFFLE_HI; muff.Q.value = 0.5; muff.connect(this.master);
    const out = ctx.createGain(); out.gain.value = 0; out.connect(muff);
    // 비: 노이즈 → 밴드패스 1.8k
    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = this.noiseBuf; rainSrc.loop = true;
    const rainBp = ctx.createBiquadFilter(); rainBp.type = 'bandpass'; rainBp.frequency.value = 1800; rainBp.Q.value = 0.6;
    const rainG = ctx.createGain(); rainG.gain.value = 0; rainSrc.connect(rainBp); rainBp.connect(rainG); rainG.connect(out); rainSrc.start();
    // 웅웅: 55 + 55.7 Hz → 로패스 200
    const humG = ctx.createGain(); humG.gain.value = 0; humG.connect(out);
    for (const f of [55, 55.7]) { const o = ctx.createOscillator(); o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; o.connect(lp); lp.connect(humG); o.start(); }
    // 바람: 노이즈 → 로패스 320 (Q 0.5) → 게인. 게인은 0.08 Hz 사인으로 ±(기본의 45 %) 흔들린다 — 돌풍 (결정론, 오실레이터)
    const windSrc = ctx.createBufferSource(); windSrc.buffer = this.noiseBuf; windSrc.loop = true;
    const windLp = ctx.createBiquadFilter(); windLp.type = 'lowpass'; windLp.frequency.value = 320; windLp.Q.value = 0.5;
    const windG = ctx.createGain(); windG.gain.value = 0; windSrc.connect(windLp); windLp.connect(windG); windG.connect(out); windSrc.start();
    const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.08; const windLfoG = ctx.createGain(); windLfoG.gain.value = 0; windLfo.connect(windLfoG); windLfoG.connect(windG.gain); windLfo.start();
    // 사건 소리(벨·삐·종) + 잔향 딜레이 → 패너(자리) → out
    const pan = this._mkPanner(); pan.connect(out);
    const evG = ctx.createGain(); evG.gain.value = 1; evG.connect(pan);
    const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.45; const dlG = ctx.createGain(); dlG.gain.value = 0;
    evG.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(dlG); dlG.connect(pan);
    return { name, out, muff, pan, rainG, humG, windG, windLfoG, evG, dlG, kind: null };
  }
  setPresets(a, b) { this.presetA = a; this.presetB = b; this._applyPresets(); }
  _audioOf(p) { return (p && p.audio) || DEFAULT_AUDIO; }
  _applyPresets() {
    if (!this.ok) return;
    for (const [ch, p] of [[this.chan.A, this.presetA], [this.chan.B, this.presetB]]) {
      if (!p) continue;
      ch.kind = p.sound;
      ch.rainG.gain.value = p.sound === 'rain' ? 0.35 : 0;
      ch.humG.gain.value = p.sound === 'hum' ? 0.5 : 0;
      ch.windG.gain.value = p.sound === 'wind' ? 0.42 : 0;
      ch.windLfoG.gain.value = p.sound === 'wind' ? 0.19 : 0;
      ch.dlG.gain.value = p.sound === 'ring' ? 0.6 : 0;
    }
  }
  /** 사건 소리의 자리 (세계 좌표, 없으면 관객 자리에서) */
  setSourcePos(name, pos) { this.src[name] = pos ? { x: pos.x, y: pos.y == null ? 1.0 : pos.y, z: pos.z } : null; this._applySource(name); }
  _applySource(name) {
    if (!this.ok) return;
    const p = this.src[name] || this.lis, pan = this.chan[name].pan, now = this.ctx.currentTime;
    if (pan.positionX) { pan.positionX.setTargetAtTime(p.x, now, 0.05); pan.positionY.setTargetAtTime(p.y, now, 0.05); pan.positionZ.setTargetAtTime(p.z, now, 0.05); }
    else pan.setPosition(p.x, p.y, p.z);
  }
  /** 관객 = 카메라 (매 프레임). forward·up 은 단위 벡터 */
  setListener(pos, fwd, up) {
    Object.assign(this.lis, { x: pos.x, y: pos.y, z: pos.z, fx: fwd.x, fy: fwd.y, fz: fwd.z, ux: up.x, uy: up.y, uz: up.z });
    this._applyListener();
  }
  _applyListener() {
    if (!this.ok) return;
    const l = this.ctx.listener, s = this.lis, now = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(s.x, now, 0.03); l.positionY.setTargetAtTime(s.y, now, 0.03); l.positionZ.setTargetAtTime(s.z, now, 0.03);
      l.forwardX.setTargetAtTime(s.fx, now, 0.03); l.forwardY.setTargetAtTime(s.fy, now, 0.03); l.forwardZ.setTargetAtTime(s.fz, now, 0.03);
      l.upX.setTargetAtTime(s.ux, now, 0.03); l.upY.setTargetAtTime(s.uy, now, 0.03); l.upZ.setTargetAtTime(s.uz, now, 0.03);
    } else { l.setPosition(s.x, s.y, s.z); l.setOrientation(s.fx, s.fy, s.fz, s.ux, s.uy, s.uz); }
  }
  /** 닫힌 문 너머 먹먹함 — 0 = 완전히 막힘(350 Hz), 1 = 열림(16 kHz). 어느 문이 사이에 있는지는 페이지가 정한다 */
  setMuffle(mA, mB) {
    this.muffle.A = Math.max(0, Math.min(1, mA)); this.muffle.B = Math.max(0, Math.min(1, mB));
    this.vol.muffleA = +this.muffle.A.toFixed(3); this.vol.muffleB = +this.muffle.B.toFixed(3);
    this._applyMuffle();
  }
  _applyMuffle() {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    for (const n of ['A', 'B']) this.chan[n].muff.frequency.setTargetAtTime(MUFFLE_LO * Math.pow(MUFFLE_HI / MUFFLE_LO, this.muffle[n]), now, 0.25);
  }
  /**
   * 관객 위치의 섞임 — 매 프레임. tAmb 배경 소리(비·바람·삐…) · tStep 발소리 바닥재 · tArrive 도착 드론·허밍.
   * 셋을 따로 받는 것이 검토 #2(감각의 시간차). 하나만 주면 종전처럼 셋 다 같은 t.
   */
  setMix(tAmb, tStep, tArrive) {
    const c = (v) => Math.max(0, Math.min(1, v));
    this.tAmb = c(tAmb); this.tStep = tStep == null ? this.tAmb : c(tStep); this.tArrive = tArrive == null ? this.tAmb : c(tArrive);
    this.tMix = this.tAmb;
    const A = 1 - this.tAmb, B = this.tAmb, ar = this._audioOf(this.presetB);
    this.vol.A = +(A * 0.8).toFixed(3); this.vol.B = +(B * 0.8).toFixed(3);
    this.vol.drone = +(this.tArrive * ar.drone).toFixed(3); this.vol.hum = +(Math.pow(this.tArrive, 1.5) * ar.hum).toFixed(3);
    this.vol.thumpAmt = +(this._audioOf(this.presetA).thump * (1 - this.tAmb) + ar.thump * this.tAmb).toFixed(3);
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
      const g = ch === this.chan.A ? (1 - this.tAmb) : this.tAmb;
      if (ch.kind === 'bell') fire('bell' + ch.name, 7, () => this._bell(ch.evG, 0.25 * g));
      if (ch.kind === 'beep') fire('beep' + ch.name, 1.0, () => this._beep(ch.evG, 0.18 * g));
      if (ch.kind === 'ring') fire('ring' + ch.name, 3.0, () => this._ring(ch.evG, 0.22 * g));
    }
    // 뒤쪽 저음 — 양은 두 기억의 audio.thump 를 tAmb 로 섞은 값. 0 이면 안 울린다(눈밭 → 눈밭엔 없다)
    fire('thump', THUMP_PERIOD, () => { if (this.vol.thumpAmt > 0.02) this.thump(this.vol.thumpAmt); });
    // 발소리·저음 음량 표시값 감쇠 (숫자 노출용)
    this.vol.step = +(this.vol.step * 0.9).toFixed(3); this.vol.thump = +(this.vol.thump * 0.94).toFixed(3);
  }
  _env(node, g0, dur) { const ctx = this.ctx, g = ctx.createGain(); g.gain.setValueAtTime(Math.max(0.0009, g0), ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur); g.connect(node); return g; }
  _bell(dst, amp) { const ctx = this.ctx; for (const [f, a] of [[880, 1], [1760, 0.4], [2637, 0.2]]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(this._env(dst, amp * a, 2.4)); o.start(); o.stop(ctx.currentTime + 2.5); } }
  _beep(dst, amp) { const ctx = this.ctx; const o = ctx.createOscillator(); o.frequency.value = 1000; o.connect(this._env(dst, amp, 0.07)); o.start(); o.stop(ctx.currentTime + 0.08); }
  _ring(dst, amp) { const ctx = this.ctx; for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; const e = this._env(dst, amp * 0.5, 0.9); o.connect(e); o.start(); o.stop(ctx.currentTime + 1.0); } }
  /** 발소리 — 출발/도착 바닥재를 tStep 으로 섞는다 (시각보다 늦게 바뀌는 것이 검토 #2 의 예: 눈은 안 보이는데 발밑은 눈) */
  step(stepA, stepB) {
    const t = this.tStep; this.vol.step = +(0.5).toFixed(3);
    if (!this.ok) return;
    const ctx = this.ctx;
    for (const [kind, g] of [[stepA, 1 - t], [stepB, t]]) {
      const f = STEP_FILTER[kind] || STEP_FILTER.wood; if (g < 0.02) continue;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loopStart = 0; src.loopEnd = 0.3;
      const bq = ctx.createBiquadFilter(); bq.type = f.type; bq.frequency.value = f.freq; bq.Q.value = f.q;
      src.connect(bq); bq.connect(this._env(this.master, 0.5 * f.gain * g * (this.muted ? 0 : 1), f.dur)); src.start(); src.stop(ctx.currentTime + f.dur + 0.02);
    }
  }
  /** 뒤쪽 사각지대의 저음 (58 Hz, 0.6 초) — 울리는 순간 관객 뒤 3 m 에 자리를 잡는다(HRTF). 고개를 돌리면 방향이 바뀐다 */
  thump(amp) {
    const a = amp == null ? 0.3 : amp;
    this.vol.thump = +a.toFixed(3);
    if (!this.ok) return;
    const ctx = this.ctx, s = this.lis;
    const pan = this._mkPanner(); pan.connect(this.master);
    const px = s.x - s.fx * THUMP_BEHIND_M, py = Math.max(0.3, s.y - 0.6), pz = s.z - s.fz * THUMP_BEHIND_M;
    if (pan.positionX) { pan.positionX.value = px; pan.positionY.value = py; pan.positionZ.value = pz; } else pan.setPosition(px, py, pz);
    const o = ctx.createOscillator(); o.frequency.value = 58; o.connect(this._env(pan, this.muted ? 0 : a * 2.2, 0.6)); o.start(); o.stop(ctx.currentTime + 0.7);
    setTimeout(() => { try { pan.disconnect(); } catch (e) { /* 이미 끊김 */ } }, 900);
  }
  setMuted(m) { this.muted = !!m; this.setMix(this.tAmb, this.tStep, this.tArrive); }
  volumes() {
    return Object.assign({ ctx: this.ctx ? this.ctx.state : 'none', t: +this.tAmb.toFixed(3), tStep: +this.tStep.toFixed(3), tArrive: +this.tArrive.toFixed(3),
                           src: { A: this.src.A, B: this.src.B }, listener: { x: +this.lis.x.toFixed(2), z: +this.lis.z.toFixed(2), fx: +this.lis.fx.toFixed(2), fz: +this.lis.fz.toFixed(2) } }, this.vol);
  }
}
