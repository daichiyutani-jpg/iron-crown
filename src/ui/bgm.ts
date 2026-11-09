// BGM。音源ファイルは使わず、Web Audio でその場で鳴らす本作オリジナルの曲（通信なし・オフラインで動く）。
// 曲は場面ごとに5つ：タイトル・トレーニング・大会・優勝・入賞なし。最初のタップの後に鳴り始める（ブラウザの決まり）。

export type Track = 'title' | 'home' | 'contest' | 'win' | 'lose';

/** 和音：根音（MIDI）と種類 */
type Chord = [number, 'maj' | 'min' | 'sus' | 'pow'];
interface Song {
  bpm: number;
  chords: Chord[]; // 1小節に1つ
  /** 16分音符16個のパターン（文字ごと）。k=キック s=スネア h=ハイハット .=なし */
  drums: string[];
  /** ベース：16個。数字=和音の何番目の音（0=根音）、-=なし */
  bass: string;
  /** メロディ：小節ごとの16個。数字=和音の音(0〜4、5以上は1オクターブ上)、-=なし */
  lead: string[];
  leadOct: number; // メロディの高さ（根音から何オクターブ上か）
  pad: number; // 和音の伸ばし音の音量
  wave: OscillatorType; // メロディの音色
  vol: number;
}

const SONGS: Record<Track, Song> = {
  // タイトル：堂々と。ゆっくり
  title: {
    bpm: 92,
    chords: [[45, 'min'], [41, 'maj'], [43, 'maj'], [40, 'sus'], [45, 'min'], [41, 'maj'], [38, 'min'], [40, 'maj']],
    drums: ['k.......k.k.....', '....s.......s...', 'h.h.h.h.h.h.h.h.'],
    bass: '0-------0---0---',
    lead: ['2---1---0-------', '2---3---4-------', '4---3---2---1---', '1-------0-------', '2---1---0---4---', '5---4---2-------', '3---2---1---0---', '1---2---4-------'],
    leadOct: 2, pad: 0.06, wave: 'triangle', vol: 0.8,
  },
  // トレーニング（練習・食事・ショップなど）：元気に刻む
  home: {
    bpm: 124,
    chords: [[40, 'min'], [36, 'maj'], [43, 'maj'], [38, 'maj']],
    drums: ['k...k...k...k...', '....s.......s..s', '..h...h...h...hh'],
    bass: '0-0-0-0-0-0-2-1-',
    lead: ['0-2-4-2-5-4-2---', '0-2-4-2-1---0---', '4-4-2-4-5---4---', '2-1-0-1-2---3---'],
    leadOct: 2, pad: 0.035, wave: 'square', vol: 0.62,
  },
  // 大会：緊張感と迫力
  contest: {
    bpm: 104,
    chords: [[38, 'min'], [34, 'maj'], [41, 'maj'], [45, 'maj'], [38, 'min'], [34, 'maj'], [36, 'maj'], [45, 'sus']],
    drums: ['k..k..k.k..k..k.', '....s.......s.s.', 'hhhhhhhhhhhhhhhh'],
    bass: '0--0--0-0--0--2-',
    lead: ['0---2---4---2---', '1---2---4-------', '4---5---4---2---', '1---0---1-------', '0---2---4---5---', '6---5---4---2---', '4---2---1---2---', '0-------1-------'],
    leadOct: 2, pad: 0.06, wave: 'sawtooth', vol: 0.55,
  },
  // 優勝・入賞：明るく
  win: {
    bpm: 112,
    chords: [[43, 'maj'], [48, 'maj'], [45, 'min'], [50, 'maj']],
    drums: ['k.......k.......', '....s.......s...', 'h.h.h.h.h.h.h.h.'],
    bass: '0---0---0---2---',
    lead: ['0-2-4---5---4---', '4-2-0---2---4---', '2-4-5---4---2---', '1-2-4-------5---'],
    leadOct: 2, pad: 0.05, wave: 'triangle', vol: 0.75,
  },
  // 入賞なし・引退：静かに
  lose: {
    bpm: 72,
    chords: [[45, 'min'], [41, 'maj'], [36, 'maj'], [43, 'maj']],
    drums: ['k...............', '................', '....h.......h...'],
    bass: '0-------0-------',
    lead: ['2-------1---0---', '2---4-------2---', '4-------2---1---', '1-------2-------'],
    leadOct: 2, pad: 0.07, wave: 'sine', vol: 0.8,
  },
};

const INTERVALS: Record<Chord[1], number[]> = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], pow: [0, 7, 12] };
/** 和音のn番目の音（3音を上へ重ねていく） */
function chordNote(c: Chord, n: number): number {
  const iv = INTERVALS[c[1]];
  return c[0] + iv[n % 3] + 12 * Math.floor(n / 3);
}
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const KEY = 'ic-bgm';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let want: Track | null = null; // 鳴らしたい曲
let cur: { track: Track; song: Song; bus: GainNode; step: number; next: number } | null = null;
let timer = 0;

export function bgmOn(): boolean { return localStorage.getItem(KEY) !== 'off'; }

function ensure(): boolean {
  if (ctx) return true;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

// ---- 楽器 ----
function env(g: GainNode, t: number, peak: number, a: number, dec: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function kick(bus: GainNode, t: number) {
  const o = ctx!.createOscillator(); const g = ctx!.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, 0.9, 0.002, 0.22);
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
}
function noiseHit(bus: GainNode, t: number, type: BiquadFilterType, f: number, peak: number, dec: number) {
  const s = ctx!.createBufferSource(); s.buffer = noise;
  const fl = ctx!.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
  const g = ctx!.createGain(); env(g, t, peak, 0.001, dec);
  s.connect(fl).connect(g).connect(bus); s.start(t); s.stop(t + dec + 0.05);
}
function tone(bus: GainNode, t: number, m: number, len: number, type: OscillatorType, peak: number, cutoff: number) {
  const o = ctx!.createOscillator(); o.type = type; o.frequency.value = hz(m);
  const fl = ctx!.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
  const g = ctx!.createGain(); env(g, t, peak, 0.01, len);
  o.connect(fl).connect(g).connect(bus); o.start(t); o.stop(t + len + 0.05);
}
function pad(bus: GainNode, t: number, c: Chord, len: number, vol: number) {
  for (let i = 0; i < 3; i++) {
    const o = ctx!.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(chordNote(c, i) + 12);
    o.detune.value = (i - 1) * 6;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + len - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(bus); o.start(t); o.stop(t + len + 0.05);
  }
}

/** 16分音符1つ分を鳴らす */
function playStep(song: Song, bus: GainNode, step: number, t: number) {
  const s16 = 60 / song.bpm / 4;
  const bar = Math.floor(step / 16) % song.chords.length;
  const i = step % 16;
  const c = song.chords[bar];
  if (i === 0) pad(bus, t, c, s16 * 16, song.pad);
  const [kp, sp, hp] = song.drums;
  if (kp[i] === 'k') kick(bus, t);
  if (sp[i] === 's') noiseHit(bus, t, 'bandpass', 1800, 0.35, 0.16);
  if (hp[i] === 'h') noiseHit(bus, t, 'highpass', 7000, 0.12, 0.04);
  const b = song.bass[i];
  if (b !== '-') tone(bus, t, chordNote(c, Number(b)) - 12, s16 * 1.8, 'sawtooth', 0.32, 500);
  const l = song.lead[bar % song.lead.length][i];
  if (l !== '-') {
    let len = 1;
    const line = song.lead[bar % song.lead.length];
    while (i + len < 16 && line[i + len] === '-' && len < 6) len++;
    tone(bus, t, chordNote(c, Number(l)) + 12 * song.leadOct - 12, s16 * len * 0.95, song.wave, 0.16, 2600);
  }
}

function tick() {
  if (!ctx || !cur) return;
  const s16 = 60 / cur.song.bpm / 4;
  while (cur.next < ctx.currentTime + 0.15) {
    playStep(cur.song, cur.bus, cur.step, cur.next);
    cur.step++;
    cur.next += s16;
  }
}

function startTrack(track: Track) {
  if (!ctx || !master) return;
  const song = SONGS[track];
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(song.vol, ctx.currentTime + 0.8);
  bus.connect(master);
  cur = { track, song, bus, step: 0, next: ctx.currentTime + 0.1 };
  clearInterval(timer);
  timer = window.setInterval(tick, 25);
}
function stopTrack() {
  if (!ctx || !cur) return;
  const bus = cur.bus;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  setTimeout(() => bus.disconnect(), 900);
  cur = null;
  clearInterval(timer);
}

/** 場面の曲を指定する（同じ曲なら何もしない）。オフの時は覚えておくだけ */
export function setTrack(track: Track) {
  want = track;
  if (!bgmOn() || !ctx || ctx.state !== 'running') return;
  if (cur?.track === track) return;
  stopTrack();
  startTrack(track);
}

/** 最初のタップで音を使えるようにする（ブラウザは操作の前に音を出せない） */
export function unlockBgm() {
  if (!bgmOn()) return;
  if (!ensure()) return;
  if (ctx!.state !== 'running') ctx!.resume().then(() => { if (want && !cur) startTrack(want); });
  else if (want && !cur) startTrack(want);
}

/** オン／オフを切り替える */
export function toggleBgm(): boolean {
  const on = !bgmOn();
  localStorage.setItem(KEY, on ? 'on' : 'off');
  if (on) unlockBgm();
  else stopTrack();
  return on;
}

// 画面を離れている間は止める（電池の節約）
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else if (bgmOn()) ctx.resume();
});

/** テスト用：曲データ */
export const _songs = SONGS;
/** 今鳴っている曲（鳴っていなければ null） */
export function currentTrack(): Track | null { return cur?.track ?? null; }
