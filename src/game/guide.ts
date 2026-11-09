// 練習画面の「コマンド」と、その効果の見込み（上がる能力・疲労・ケガの確率）。ゲームの計算は rules.ts のまま使う。
import { PARTS, type Part } from './body';
import { EXERCISES, PART_LABEL, SLOTS, VOLUME, type Volume } from './data';
import {
  advanceWeek, canAddAction, canUseExercise, exerciseById, injuryRisk, nutrition, projectGrowth, staminaMax, planStamina, actionStamina,
  type Action, type GameState,
} from './rules';
import { playerInput, rivalInputs, scoreCompetitor, totalScore } from './scoring';

export type CommandId = Part | 'posing' | 'cardio' | 'rest' | 'work';
export const COMMANDS: CommandId[] = [...PARTS, 'posing', 'cardio', 'rest', 'work'];
export const COMMAND_LABEL: Record<CommandId, string> = {
  chest: '胸トレ', back: '背中トレ', shoulders: '肩トレ', arms: '腕トレ', legs: '脚トレ', abs: '腹筋トレ',
  posing: 'ポーズ練習', cardio: '有酸素', rest: '休養', work: 'バイト',
};

/** その部位で今いちばん伸びる種目（使えない種目は除く）。部位が疲れている時は軽めにする */
export function bestTrain(s: GameState, part: Part): Action | null {
  const vol: Volume = s.body.partFatigue[part] > 60 ? 'light' : 'normal';
  let best: { a: Action; score: number } | null = null;
  const base = projectGrowth(s);
  for (const e of EXERCISES.filter((x) => x.part === part)) {
    if (!canUseExercise(s, e).ok) continue;
    const a: Action = { kind: 'train', ex: e.id, vol };
    const g = projectGrowth(s, [...s.plan, a]);
    const gain = PARTS.reduce((t, p) => t + (g[p] - base[p]), 0);
    const score = gain - e.risk * 8 - e.fatigue * 0.05;
    if (!best || score > best.score) best = { a, score };
  }
  return best?.a ?? null;
}

export function commandAction(s: GameState, id: CommandId): Action | null {
  if ((PARTS as readonly string[]).includes(id)) return bestTrain(s, id as Part);
  return { kind: id as 'posing' | 'cardio' | 'rest' | 'work' };
}

/** 週を終えた時の全身の疲労の見込み（疲労の計算は乱数を使わないので、実際に1週進めて確かめる） */
export function fatigueAfter(s: GameState, plan: Action[] = s.plan): { fatigue: number; part: Record<Part, number> } {
  const t = advanceWeek({ ...s, plan });
  return { fatigue: t.body.fatigue, part: t.body.partFatigue };
}

/** 今週の計画のどこかでケガをする確率 */
export function planInjury(s: GameState, plan: Action[] = s.plan): number {
  if (s.body.injury) return 0;
  const f = fatigueAfter(s, plan);
  let safe = 1;
  for (const a of plan) {
    if (a.kind !== 'train') continue;
    const ex = exerciseById(a.ex);
    safe *= 1 - injuryRisk(ex, a.vol, f.fatigue, f.part[ex.part], s.diet.cal);
  }
  return 1 - safe;
}

export interface Preview {
  id: CommandId;
  action: Action | null;
  ok: boolean;
  reason?: string;
  title: string;
  sub: string;
  /** 大きく見せる効果（例：胸 +0.42） */
  main: { label: string; value: string; good: boolean }[];
  stamina: number;
  fatigue: number; // 週末の疲労の増減
  injury: number; // 計画全体のケガの確率の増加（0〜1）
}

/** コマンドを今週の計画に足した時の効果 */
export function previewCommand(s: GameState, id: CommandId, base = { g: projectGrowth(s), f: fatigueAfter(s).fatigue, inj: planInjury(s), n: nutrition(s) }): Preview {
  const a = commandAction(s, id);
  const title = COMMAND_LABEL[id];
  if (!a) return { id, action: null, ok: false, reason: (s.body.injury?.part === id ? 'ケガで休み中' : '使える種目がない'), title, sub: '', main: [], stamina: 0, fatigue: 0, injury: 0 };
  const c = canAddAction(s, a);
  const plan = [...s.plan, a];
  const main: Preview['main'] = [];
  let sub = '';
  if (a.kind === 'train') {
    const ex = exerciseById(a.ex);
    sub = `${ex.name}・${VOLUME[a.vol].label.replace(/（.*）/, '')}`;
    const g = projectGrowth(s, plan);
    const ds = PARTS.map((p) => [p, g[p] - base.g[p]] as const).filter(([, d]) => d >= 0.02).sort((x, y) => y[1] - x[1]);
    for (const [p, d] of ds.slice(0, 3)) main.push({ label: PART_LABEL[p], value: `+${d.toFixed(2)}`, good: true });
    if (!main.length) main.push({ label: PART_LABEL[ex.part], value: '+0.00', good: false });
  } else if (a.kind === 'posing') {
    sub = '大会のポーズを磨く';
    main.push({ label: 'ポーズ', value: `+${(7.5 * (1 - s.body.posing / 115)).toFixed(1)}`, good: true });
  } else if (a.kind === 'cardio') {
    sub = '40分。脂肪を燃やす';
    const n = nutrition({ ...s, plan });
    main.push({ label: '脂肪', value: `${(n.weeklyFatChange - base.n.weeklyFatChange).toFixed(2)}kg`, good: true });
  } else if (a.kind === 'rest') {
    sub = '疲れを抜く';
  } else {
    sub = 'お金を稼ぐ';
    main.push({ label: 'お金', value: '+¥12,000', good: true });
  }
  const f = fatigueAfter(s, plan).fatigue - base.f;
  if (a.kind === 'rest') main.push(f <= -0.5 ? { label: '疲労', value: f.toFixed(0), good: true } : { label: '体調', value: '+1', good: true });
  return {
    id, action: a, ok: c.ok, reason: c.reason, title, sub, main,
    stamina: actionStamina(a), fatigue: f, injury: Math.max(0, planInjury(s, plan) - base.inj),
  };
}

/** 疲労の段階（色と言葉） */
export function fatigueLevel(v: number): { label: string; cls: 'ok' | 'mid' | 'warn' | 'bad' } {
  if (v < 30) return { label: '元気', cls: 'ok' };
  if (v < 50) return { label: 'ふつう', cls: 'mid' };
  if (v < 70) return { label: '疲れ気味', cls: 'warn' };
  return { label: '限界', cls: 'bad' };
}
/** ケガの確率の色。whole=true は1週間の予定全体（ふつうの予定で5〜10%ほど） */
export function riskLevel(p: number, whole = false): 'ok' | 'mid' | 'warn' | 'bad' {
  const [a, b, c] = whole ? [0.05, 0.1, 0.16] : [0.01, 0.02, 0.035];
  return p < a ? 'ok' : p < b ? 'mid' : p < c ? 'warn' : 'bad';
}

/** トレーナーのおすすめ（理由つき） */
export function recommend(s: GameState): { id: CommandId; why: string } | null {
  if (s.phase !== 'season' || s.plan.length >= SLOTS) return null;
  const left = staminaMax(s) - planStamina(s.plan);
  const f = fatigueAfter(s).fatigue;
  const has = (k: string) => s.plan.some((a) => a.kind === k);
  if ((f >= 60 || s.body.fatigue >= 65) && !has('rest')) return { id: 'rest', why: `疲労がたまっている（週末の見込み ${f.toFixed(0)}）。休んで伸びを落とさないように。` };
  if (s.week >= 5 && s.body.posing < 70 && !has('posing') && left >= 10) return { id: 'posing', why: '大会まで半分を切った。ポーズは毎週少しずつ磨こう。' };
  if (s.money < 15000 && !has('work') && left >= 16) return { id: 'work', why: '所持金が少ない。食費が払えないと体が育たない。' };
  // 一番遅れていて、疲れていない部位
  const trained = new Set(s.plan.filter((a) => a.kind === 'train').map((a) => exerciseById((a as { ex: string }).ex).part));
  const cand = PARTS.filter((p) => !trained.has(p) && s.body.injury?.part !== p && s.body.partFatigue[p] < 60)
    .sort((a, b) => s.body.dev[a] - s.body.dev[b]);
  for (const p of cand) {
    const a = bestTrain(s, p);
    if (a && canAddAction(s, a).ok) return { id: p, why: `${PART_LABEL[p]}が一番遅れている（${s.body.dev[p].toFixed(1)}）。今週のうちに鍛えよう。` };
  }
  if (!has('rest')) return { id: 'rest', why: '体力の残りが少ない。最後は休養で次の週に備えよう。' };
  return null;
}

/** 今の体で大会に出たら何位か（審査のぶれ無し） */
export function predictPlace(s: GameState): { place: number; of: number } {
  const cat = s.player.category;
  const me = totalScore(scoreCompetitor(playerInput(s), cat), cat);
  const others = rivalInputs(cat, s.season).map((r) => totalScore(scoreCompetitor(r, cat), cat));
  return { place: 1 + others.filter((t) => t > me).length, of: others.length + 1 };
}
