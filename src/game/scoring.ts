// 大会の採点。採点式は scoreCompetitor に集約し、カテゴリー別の比重は data.ts の CATEGORIES で調整する。
import { PARTS, type Frame, type Part } from './body';
import { CATEGORIES, CONTEST, RIVALS, SCORE_LABEL, TRUNKS, type Category, type ScoreKey } from './data';
import { bodyStats, leanMass, nextRand, stageFinish, type GameState } from './rules';
import type { TrunksLook } from './body';

export interface CompetitorInput {
  name: string;
  heightCm: number;
  frame: Frame;
  dev: Record<Part, number>;
  bodyFat: number;
  weight: number;
  imbalance: number;
  posing: number;
  condition: number;
  fatigue: number;
  fullness: number;
  tan: number;
  uneven: number;
  skin: number;
  shine: number;
  trunks: TrunksLook | null;
  trunksViolation: string | null;
}

export interface CompetitorScore {
  name: string;
  isPlayer: boolean;
  scores: Record<ScoreKey, number>;
  total: number;
  place: number;
  weight: number;
  bodyFat: number;
}

export interface ContestResult {
  category: Category;
  ranking: CompetitorScore[];
  playerPlace: number;
  prize: number;
  good: string[];
  improve: string[];
  notes: string[];
  compareWith: string;
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function trunksLook(key: string): TrunksLook {
  const [mid, cid] = key.split(':');
  const m = TRUNKS.find((t) => t.id === mid) ?? TRUNKS[0];
  const c = m.colors.find((x) => x.id === cid) ?? m.colors[0];
  return { color: c.color, accent: c.accent, material: m.material, design: m.design, cut: m.cut };
}

/** 衣装が大会規定に合うか（違反内容を返す） */
export function trunksViolation(key: string, cat: Category): string | null {
  const m = TRUNKS.find((t) => t.id === key.split(':')[0]);
  if (!m) return null;
  const r = CATEGORIES[cat];
  if (m.cut !== r.cut) return r.cut === 'classic' ? 'クラシック部門は脚の付け根を覆う長めのカットが規定' : 'ボディビル部門は標準カットが規定';
  if (r.bannedMaterials.includes(m.material)) return `${r.short}部門ではメタリック素材は使えない`;
  if (r.bannedDesigns.includes(m.design)) return `${r.short}部門ではラインストーン装飾は使えない`;
  return null;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

/** 一人分の採点（0〜100 の項目別得点） */
export function scoreCompetitor(c: CompetitorInput, cat: Category): Record<ScoreKey, number> {
  const rule = CATEGORIES[cat];
  const d = c.dev;
  const devVals = PARTS.map((p) => d[p]);
  const weighted = (d.chest + d.back * 1.2 + d.shoulders + d.arms + d.legs * 1.2 + d.abs * 0.6) / 6;
  const mean = devVals.reduce((a, b) => a + b, 0) / 6;
  const std = Math.sqrt(devVals.reduce((a, b) => a + (b - mean) ** 2, 0) / 6);
  const weakest = Math.min(...devVals);

  const muscle = clamp(weighted * 1.25 + 5) * (0.86 + 0.14 * Math.min(1.1, c.fullness));
  const balance = clamp(100 - Math.abs(c.imbalance) * 5 - std * 1.4 - (mean - weakest) * 0.6);

  const upper = (d.chest + d.back + d.shoulders + d.arms) / 4;
  const taper = (d.shoulders + d.back) / 2;
  const frameBonus = c.frame === 'ecto' ? (cat === 'classic' ? 7 : 3) : c.frame === 'meso' ? 4 : (cat === 'classic' ? -4 : 1);
  const proportion = clamp(22 + taper * 0.75 + frameBonus - Math.abs(upper - d.legs) * 0.9 - Math.max(0, c.bodyFat - 6) * 2 * rule.ideal.waist + d.abs * 0.08);

  let conditioning = clamp(100 - Math.max(0, c.bodyFat - 4) * 9);
  conditioning *= 0.75 + 0.25 * (c.condition / 100);
  if (c.fullness < 0.75) conditioning -= (0.75 - c.fullness) * 60;
  if (c.bodyFat < 3.8) conditioning -= 6; // 絞りすぎて張りがない
  conditioning = clamp(conditioning);

  const posing = clamp(c.posing * (0.8 + 0.2 * (c.condition / 100)) - c.fatigue * 0.08);

  let skin = (100 - Math.abs(85 - c.tan) * 1.3) * 0.55 + (100 - c.uneven) * 0.35 + c.skin * 0.1;
  skin += c.shine > 0.6 ? 5 : 0;
  if (c.trunks) {
    // 濃い肌色に対して明度差・彩度のある衣装は映える（効果は小さく、価格とは無関係）
    const contrast = Math.abs(luminance(c.trunks.color) - 0.18);
    skin += Math.min(3, contrast * 8);
  }
  skin = clamp(skin);

  let fit = 78;
  if (cat === 'bodybuilding') fit += (weighted - 50) * 0.35;
  else {
    fit += (proportion - 60) * 0.35 - Math.max(0, weighted - 62) * 0.8;
    const cap = rule.weightCap!(c.heightCm);
    if (c.weight > cap) fit -= (c.weight - cap) * 12;
  }
  if (c.trunksViolation) fit -= 35;
  fit = clamp(fit);

  return { muscle, balance, proportion, conditioning, posing, skin, fit };
}

export function totalScore(s: Record<ScoreKey, number>, cat: Category): number {
  const w = CATEGORIES[cat].weights;
  return (Object.keys(w) as ScoreKey[]).reduce((t, k) => t + s[k] * w[k], 0);
}

export function playerInput(s: GameState): CompetitorInput {
  const fin = stageFinish(s);
  const st = bodyStats(s);
  return {
    name: s.player.name, heightCm: s.player.heightCm, frame: s.player.frame, dev: s.body.dev, bodyFat: st.bf, weight: st.weight,
    imbalance: s.body.imbalance, posing: s.body.posing, condition: s.body.condition, fatigue: s.body.fatigue, fullness: fin.fullness,
    tan: fin.level, uneven: fin.uneven, skin: s.tan.skin, shine: fin.shine,
    trunks: trunksLook(s.trunksEquipped), trunksViolation: trunksViolation(s.trunksEquipped, s.player.category),
  };
}

/** ライバルも毎年鍛えてくる（2回目以降の大会。伸びは少しずつ鈍る） */
export function rivalGrowth(season = 1): number {
  const n = Math.max(0, season - 1);
  return 9 * (1 - Math.exp(-n / 3));
}
export function rivalInputs(cat: Category, season = 1): CompetitorInput[] {
  const up = rivalGrowth(season);
  return RIVALS.map((r0) => {
    const r = { ...r0, dev: Object.fromEntries(Object.entries(r0.dev).map(([k, v]) => [k, Math.min(98, v + up)])) as typeof r0.dev, posing: Math.min(95, r0.posing + up * 0.8), condition: Math.min(95, r0.condition + up * 0.4) };
    const lean = leanMass(r.dev, r.heightCm, r.frame);
    const weight = lean / (1 - r.bodyFat / 100);
    // ライバルもカテゴリー規定に合わせて準備してくる
    const classicTrunks: TrunksLook = { color: '#1b2f8c', accent: '#1b2f8c', material: 'satin', design: 'solid', cut: 'classic' };
    const bbTrunks: TrunksLook = { color: '#121214', accent: '#121214', material: 'satin', design: 'solid', cut: 'standard' };
    return {
      name: r.name, heightCm: r.heightCm, frame: r.frame, dev: r.dev, bodyFat: r.bodyFat, weight, imbalance: r.imbalance,
      posing: r.posing, condition: r.condition, fatigue: 20, fullness: r.fullness, tan: r.tan, uneven: r.uneven, skin: 70, shine: 0.75,
      trunks: cat === 'classic' ? classicTrunks : bbTrunks, trunksViolation: null,
    };
  });
}

const HINT: Record<ScoreKey, string> = {
  muscle: '筋肉量が足りない。増量期を長めに取り、各部位に週10〜18セットの刺激を継続する。',
  balance: '左右差や弱点部位が目立つ。片側種目（ダンベル・ブルガリアンスクワット等）と弱い部位の優先を。',
  proportion: '逆三角形が弱い。肩（三角筋中部）と背中の広がりを優先し、体脂肪を落としてウエストを締める。',
  conditioning: '絞りが不十分か、体調・張りが落ちている。減量開始を早め、終盤は疲労を抜いて炭水化物で張りを戻す。',
  posing: 'ポージングの練習量が不足。週1〜2回の練習を大会の数週間前から継続する。',
  skin: '肌の仕上がりが不足。2〜3週前からタンニングで下地を作り、前日に大会用カラーを。スクラブでムラを防ぐ。',
  fit: 'カテゴリーに合っていない。衣装規定・体重上限・求められる体型を確認する。',
};

export function runContest(s: GameState): ContestResult {
  const cat = s.player.category;
  const inputs = [playerInput(s), ...rivalInputs(cat, s.season)];
  const scored: CompetitorScore[] = inputs.map((c, i) => {
    const sc = scoreCompetitor(c, cat);
    const noise = (nextRand(s) - 0.5) * 1.6; // 審査員ごとの僅かな差
    return { name: c.name, isPlayer: i === 0, scores: sc, total: totalScore(sc, cat) + noise, place: 0, weight: c.weight, bodyFat: c.bodyFat };
  });
  scored.sort((a, b) => b.total - a.total);
  scored.forEach((c, i) => (c.place = i + 1));
  const me = scored.find((c) => c.isPlayer)!;
  const others = scored.filter((c) => !c.isPlayer);
  const keys = Object.keys(SCORE_LABEL) as ScoreKey[];
  const avg = (k: ScoreKey) => others.reduce((t, c) => t + c.scores[k], 0) / others.length;
  const rel = keys.map((k) => ({ k, d: me.scores[k] - avg(k) })).sort((a, b) => b.d - a.d);
  const good = rel.slice(0, 2).filter((r) => r.d > -3).map((r) => `${SCORE_LABEL[r.k]}（ライバル平均より ${r.d >= 0 ? '+' : ''}${r.d.toFixed(1)}）`);
  const w = CATEGORIES[cat].weights;
  const weakest = keys.map((k) => ({ k, loss: (100 - me.scores[k]) * w[k] })).sort((a, b) => b.loss - a.loss).slice(0, 2);
  const improve = weakest.map((x) => `${SCORE_LABEL[x.k]}：${HINT[x.k]}`);
  const notes: string[] = [];
  const pi = playerInput(s);
  if (pi.trunksViolation) notes.push(`衣装の規定違反で減点：${pi.trunksViolation}`);
  const cap = CATEGORIES[cat].weightCap?.(s.player.heightCm);
  if (cap && pi.weight > cap) notes.push(`体重上限（${cap.toFixed(0)}kg）を ${(pi.weight - cap).toFixed(1)}kg 超過して減点`);
  const prize = CONTEST.prize[me.place - 1] ?? 0;
  const compareWith = me.place === 1 ? scored[1].name : scored[0].name;
  return { category: cat, ranking: scored, playerPlace: me.place, prize, good, improve, notes, compareWith };
}
