// ゲームの計算ルールを一元管理する（体重・体脂肪・筋肉・疲労・ケガ・日焼け・所持金）。
import { PARTS, type Frame, type Part } from './body';
import {
  CALORIE_PLANS, CATEGORIES, CONTEST, EXERCISES, EXTRA_SHIFT_PAY, ITEMS, MACRO_PLANS, PART_LABEL, PUBLIC_GYM, SLOTS,
  START_MONEY, VOLUME, WEEKLY_INCOME, WEEKS, BASE_FOOD_COST,
  type CaloriePlan, type Category, type Equip, type Exercise, type MacroPlan, type Volume,
} from './data';

export type Action =
  | { kind: 'train'; ex: string; vol: Volume }
  | { kind: 'posing' }
  | { kind: 'cardio' }
  | { kind: 'rest' }
  | { kind: 'work' };

/** 顔（絵は public/art/hero/<顔>-s<段階>-<用途>.webp） */
export type Face = 'a' | 'b' | 'c';
/** 成長タイプ: 早熟は前半に伸びて後半は鈍る、晩成はその逆 */
export type GrowthType = 'early' | 'normal' | 'late';

export interface PlayerInfo {
  name: string;
  heightCm: number;
  frame: Frame;
  category: Category;
  skinTone: number;
  face?: Face;
  growth?: GrowthType;
  /** 伸びやすい部位（発達 ×1.2） */
  strong?: Part;
  /** 才能（発達の倍率 0.9〜1.12） */
  talent?: number;
  /** 始めの能力（無ければ体格から決める） */
  start?: { dev: Record<Part, number>; bf: number; posing: number; imbalance: number };
}

export interface BodyState {
  dev: Record<Part, number>;
  imbalance: number;
  fat: number; // 脂肪量 kg
  fullness: number;
  condition: number;
  fatigue: number;
  partFatigue: Record<Part, number>;
  injury: { part: Part; weeks: number } | null;
  posing: number;
  adapt: number; // 代謝適応（kcal/日）
}

export interface TanState {
  level: number;
  uneven: number;
  skin: number;
  orange: number;
  fade: number;
  usedThisWeek: string[]; // 今週使ったアイテム
}

export interface WeekReport {
  week: number;
  lines: string[];
  weightBefore: number;
  weightAfter: number;
  bfBefore: number;
  bfAfter: number;
  devDelta: Record<Part, number>;
  /** その週に練習で得た筋肉ポイント */
  ptsGain?: Record<Part, number>;
  moneyDelta: number;
  injury: string | null;
}

export interface HistoryPoint { week: number; weight: number; bf: number; muscle: number; fatigue: number; condition: number }

export interface ContestPrep { color: boolean; gloss: boolean; carbUp: boolean }

export interface GameState {
  v: 1;
  player: PlayerInfo;
  week: number; // 1〜12 = 準備週、13 = 大会当日
  money: number;
  body: BodyState;
  diet: { cal: CaloriePlan; macro: MacroPlan };
  plan: Action[];
  inv: Record<string, number>;
  trunksOwned: string[]; // "model:color"
  trunksEquipped: string;
  tan: TanState;
  gymWeeks: number;
  proteinWeeks: number;
  history: HistoryPoint[];
  trainLog: { week: number; part: Part; sets: number }[];
  prep: ContestPrep;
  phase: 'season' | 'contestDay' | 'done';
  result: import('./scoring').ContestResult | null;
  rng: number;
  lastReport: WeekReport | null;
  /** 何回目の大会に向けたシーズンか（無ければ1） */
  season?: number;
  /** これまでの大会の結果 */
  records?: { season: number; place: number; prize: number; category: Category }[];
  /** 直前のオフで育った分（次のシーズンの最初に見せる） */
  offGain?: Record<Part, number>;
  /** 部位ごとの筋肉ポイント（練習でたまり、筋肉を大きくする時に使う） */
  pts?: Record<Part, number>;
}

// ---- 乱数 ----
export function nextRand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const PART_KG: Record<Part, number> = { chest: 0.05, back: 0.07, shoulders: 0.04, arms: 0.05, legs: 0.1, abs: 0.02 };

// ---- 体の計算 ----
export function leanMass(dev: Record<Part, number>, heightCm: number, frame: Frame): number {
  let sum = 52;
  for (const p of PARTS) sum += PART_KG[p] * dev[p];
  const fm = frame === 'ecto' ? 0.95 : frame === 'endo' ? 1.04 : 1;
  return sum * Math.pow(heightCm / 175, 2.3) * fm;
}
export function bodyStats(s: Pick<GameState, 'body' | 'player'>) {
  const lean = leanMass(s.body.dev, s.player.heightCm, s.player.frame);
  const weight = lean + s.body.fat;
  return { lean, weight, bf: (s.body.fat / weight) * 100 };
}
export function muscleIndex(dev: Record<Part, number>): number {
  return (dev.chest + dev.back * 1.2 + dev.shoulders + dev.arms + dev.legs * 1.2 + dev.abs * 0.6) / 6;
}

// ---- 栄養 ----
export function nutrition(s: GameState) {
  const { lean, weight } = bodyStats(s);
  const bmr = 370 + 21.6 * lean;
  const base = bmr * 1.5;
  const cal = CALORIE_PLANS[s.diet.cal];
  const mac = MACRO_PLANS[s.diet.macro];
  const kcal = Math.round((base + cal.offset) / 10) * 10;
  const protein = Math.round(mac.protein * weight);
  const fat = Math.round(Math.max(mac.fatMin * weight, (kcal * 0.2) / 9));
  const carbs = Math.max(40, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const sets = planSets(s.plan);
  const cardio = s.plan.filter((a) => a.kind === 'cardio').length;
  const work = s.plan.filter((a) => a.kind === 'work').length;
  const expend = base - s.body.adapt + (sets * 6 + cardio * 320 + work * 120) / 7;
  const balance = kcal - expend;
  const food = foodCost(s);
  return { bmr, base, kcal, protein, fat, carbs, expend, balance, food, weeklyFatChange: (balance * 7) / 7700 };
}
export function foodCost(s: GameState): number {
  let c = BASE_FOOD_COST + CALORIE_PLANS[s.diet.cal].food + MACRO_PLANS[s.diet.macro].food;
  if (s.diet.macro === 'highProtein' && s.proteinWeeks > 0) c -= 2000;
  return Math.max(4000, c);
}

// ---- 行動 ----
export function exerciseById(id: string): Exercise {
  return EXERCISES.find((e) => e.id === id)!;
}
export function availableEquip(s: GameState): Equip[] {
  return s.gymWeeks > 0 ? ['barbell', 'dumbbell', 'rack', 'bench', 'cable', 'machine', 'pullup'] : PUBLIC_GYM;
}
export function canUseExercise(s: GameState, ex: Exercise): { ok: boolean; reason?: string } {
  const eq = availableEquip(s);
  if (!ex.equip.every((e) => eq.includes(e))) return { ok: false, reason: '会員制ジムのパスが必要' };
  if (s.body.injury && s.body.injury.part === ex.part) return { ok: false, reason: `${PART_LABEL[ex.part]}を負傷中` };
  return { ok: true };
}
export function actionStamina(a: Action): number {
  switch (a.kind) {
    case 'train': return Math.round(VOLUME[a.vol].stamina * exerciseById(a.ex).stamina);
    case 'posing': return 10;
    case 'cardio': return 12;
    case 'work': return 16;
    case 'rest': return 0;
  }
}
export function staminaMax(s: GameState): number {
  return Math.round(clamp(100 - s.body.fatigue * 0.35 - (s.body.injury ? 10 : 0), 40, 100));
}
export function planStamina(plan: Action[]): number {
  return plan.reduce((t, a) => t + actionStamina(a), 0);
}
export function planSets(plan: Action[]): number {
  return plan.reduce((t, a) => t + (a.kind === 'train' ? VOLUME[a.vol].sets : 0), 0);
}
export function canAddAction(s: GameState, a: Action): { ok: boolean; reason?: string } {
  if (s.phase !== 'season') return { ok: false, reason: '準備期間は終了しました' };
  if (s.plan.length >= SLOTS) return { ok: false, reason: '予定がいっぱい' };
  if (planStamina(s.plan) + actionStamina(a) > staminaMax(s)) return { ok: false, reason: '体力が足りない' };
  if (a.kind === 'train') {
    const c = canUseExercise(s, exerciseById(a.ex));
    if (!c.ok) return c;
  }
  return { ok: true };
}
export function actionLabel(a: Action): string {
  switch (a.kind) {
    case 'train': return `${exerciseById(a.ex).name}・${VOLUME[a.vol].label.replace(/（.*）/, '')}`;
    case 'posing': return 'ポージング練習';
    case 'cardio': return '有酸素運動（40分）';
    case 'rest': return '完全休養';
    case 'work': return '追加シフト（アルバイト）';
  }
}

/** 部位ごとの刺激量（セット換算） */
export function stimulusByPart(plan: Action[]): Record<Part, number> {
  const st = Object.fromEntries(PARTS.map((p) => [p, 0])) as Record<Part, number>;
  for (const a of plan) {
    if (a.kind !== 'train') continue;
    const ex = exerciseById(a.ex);
    const sets = VOLUME[a.vol].sets;
    st[ex.part] += sets * ex.stimulus;
    for (const [p, c] of Object.entries(ex.secondary)) st[p as Part] += sets * ex.stimulus * (c as number);
  }
  return st;
}

const CAL_GROWTH: Record<CaloriePlan, number> = { bulk: 1.2, maintain: 1.0, cutMild: 0.72, cut: 0.48, cutHard: 0.18 };
const CAL_ATROPHY: Record<CaloriePlan, number> = { bulk: 0, maintain: 0.04, cutMild: 0.16, cut: 0.34, cutHard: 0.78 };
const PROT_GROWTH: Record<MacroPlan, number> = { balanced: 1.0, highProtein: 1.12, highCarb: 0.97 };
const PROT_ATROPHY: Record<MacroPlan, number> = { balanced: 1.0, highProtein: 0.68, highCarb: 1.08 };

// ---- 筋肉ポイントとランク ----
/** 伸びしろ0の時に +1 するのに要るポイント。伸びしろが減るほど必要なポイントは増える */
export const PT_PER_DEV = 20;
/** 伸びしろ（発達が100に近いほど小さい） */
export function potential(dev: number): number {
  return Math.pow(Math.max(0, 1 - dev / 105), 1.2);
}
/** 筋肉を +1 するのに要るポイント */
export function raiseCost(dev: number): number {
  return Math.ceil(PT_PER_DEV / Math.max(0.05, potential(dev)));
}
export type Rank = 'G' | 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';
/** ランクの下限（SS は 99 以上） */
export const RANKS: [Rank, number][] = [['SS', 99], ['S', 90], ['A', 80], ['B', 70], ['C', 60], ['D', 50], ['E', 40], ['F', 30], ['G', 0]];
export function rankOf(dev: number): Rank {
  return RANKS.find(([, min]) => dev >= min)![0];
}
/** 次のランクまでの値（SS なら null） */
export function nextRank(dev: number): { rank: Rank; at: number } | null {
  const i = RANKS.findIndex(([, min]) => dev >= min);
  return i > 0 ? { rank: RANKS[i - 1][0], at: RANKS[i - 1][1] } : null;
}
export const ptsOf = (s: GameState): Record<Part, number> =>
  s.pts ?? (Object.fromEntries(PARTS.map((p) => [p, 0])) as Record<Part, number>);

/** 筋肉ポイントを使って、その部位を +1 する（times 回まで）。上がった回数を返す */
export function raisePart(s: GameState, p: Part, times = 1): number {
  const pts = { ...ptsOf(s) };
  let n = 0;
  while (n < times && s.body.dev[p] < 100) {
    const c = raiseCost(s.body.dev[p]);
    if (pts[p] < c) break;
    pts[p] -= c;
    s.body.dev[p] = Math.min(100, s.body.dev[p] + 1);
    n++;
  }
  s.pts = pts;
  return n;
}
/** 全部位のポイントを使えるだけ使う */
export function raiseAll(s: GameState): number {
  return PARTS.reduce((t, p) => t + raisePart(s, p, 999), 0);
}

/** 1週間の見込み（ランダム要素なし）：練習で得る筋肉ポイントと、減量などで落ちる筋肉 */
export function projectWeek(s: GameState, plan: Action[] = s.plan): { pts: Record<Part, number>; loss: Record<Part, number> } {
  const st = stimulusByPart(plan);
  const { bf } = bodyStats(s);
  const pts = {} as Record<Part, number>;
  const loss = {} as Record<Part, number>;
  const frameG = (s.player.frame === 'endo' ? 1.05 : s.player.frame === 'ecto' ? 0.95 : 1) * growthRate(s.player, s.week);
  for (const p of PARTS) {
    const stim = st[p];
    const sat = 1 - Math.exp(-stim / 10);
    let nutr = CAL_GROWTH[s.diet.cal] * PROT_GROWTH[s.diet.macro];
    if (bf < 6) nutr *= 0.75;
    const recov = 1 - s.body.fatigue / 160;
    const eff = 1 - Math.max(0, s.body.partFatigue[p] - 55) / 90;
    let g = 2.6 * sat * nutr * recov * eff * frameG * (s.player.strong === p ? 1.2 : 1);
    if (stim > 26) g *= Math.max(0.3, 1 - (stim - 26) / 40);
    let atrophy = CAL_ATROPHY[s.diet.cal] * (1 - 0.85 * sat) * PROT_ATROPHY[s.diet.macro];
    if (bf < 5) atrophy += 0.15;
    if (s.body.injury?.part === p) atrophy += 0.35;
    pts[p] = g * PT_PER_DEV;
    loss[p] = atrophy;
  }
  return { pts, loss };
}

/** 1週間の部位別の発達量の見込み（得たポイントを全部その部位に使った場合。ランダム要素なし） */
export function projectGrowth(s: GameState, plan: Action[] = s.plan): Record<Part, number> {
  const w = projectWeek(s, plan);
  const out = {} as Record<Part, number>;
  for (const p of PARTS) out[p] = (w.pts[p] / PT_PER_DEV) * potential(s.body.dev[p]) - w.loss[p];
  return out;
}

/** 成長タイプと才能による、その週の発達の倍率（準備期間の平均はおよそ才能の値） */
export function growthRate(p: PlayerInfo, week: number): number {
  const t = (clamp(week, 1, WEEKS) - 1) / (WEEKS - 1); // 0〜1
  const curve = p.growth === 'early' ? 1.28 - 0.55 * t : p.growth === 'late' ? 0.72 + 0.55 * t : 1;
  return curve * (p.talent ?? 1);
}

export const GROWTH_LABEL: Record<GrowthType, [string, string]> = {
  early: ['早熟型', '前半によく伸び、後半は伸びが鈍る'],
  normal: ['普通型', '準備期間を通して同じように伸びる'],
  late: ['晩成型', '前半は伸びが遅く、後半に大きく伸びる'],
};

/** 体格・身長・部門・能力・成長タイプをランダムに決める（顔と名前は選手が選ぶ） */
export function rollPlayer(seed: number): Omit<PlayerInfo, 'name' | 'face' | 'skinTone'> {
  let t = seed | 0;
  const r = () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const frame = pick(['ecto', 'meso', 'meso', 'endo'] as const);
  const heightCm = Math.round(165 + r() * 20);
  const category: Category = r() < 0.65 ? 'bodybuilding' : 'classic';
  const growth = pick(['early', 'normal', 'normal', 'late'] as const);
  const strong = pick(PARTS);
  const talent = Math.round((0.9 + r() * 0.22) * 100) / 100;
  const base = frame === 'ecto' ? 43 : frame === 'endo' ? 46 : 45;
  const shape: Record<Part, number> = { chest: 2, back: 0, shoulders: -1, arms: 2, legs: -3, abs: -2 };
  const dev = Object.fromEntries(PARTS.map((p) => [p, Math.round((base + shape[p] + (r() - 0.5) * 6 + (p === strong ? 1.5 : 0)) * 10) / 10])) as Record<Part, number>;
  const bf = Math.round(((frame === 'endo' ? 14 : frame === 'ecto' ? 11.5 : 13) + (r() - 0.5) * 3) * 10) / 10;
  const posing = Math.round(22 + r() * 18);
  const imbalance = Math.round((1.5 + r() * 3.5) * 10) / 10;
  return { heightCm, frame, category, growth, strong, talent, start: { dev, bf, posing, imbalance } };
}

// ---- 新しいゲーム ----
export function newGame(info: PlayerInfo, seed = Date.now()): GameState {
  const base = info.frame === 'ecto' ? 43 : info.frame === 'endo' ? 46 : 45;
  const dev: Record<Part, number> = info.start ? { ...info.start.dev } : {
    chest: base + 2, back: base, shoulders: base - 1, arms: base + 2, legs: base - 3, abs: base - 2,
  };
  const lean = leanMass(dev, info.heightCm, info.frame);
  const bf0 = info.start?.bf ?? (info.frame === 'endo' ? 15 : info.frame === 'ecto' ? 11.5 : 13);
  const fat = (lean * bf0) / (100 - bf0);
  const s: GameState = {
    v: 1, player: info, week: 1, money: START_MONEY - CONTEST.entryFee,
    body: {
      dev, imbalance: info.start?.imbalance ?? 3.5, fat, fullness: 0.9, condition: 80, fatigue: 15,
      partFatigue: Object.fromEntries(PARTS.map((p) => [p, 10])) as Record<Part, number>,
      injury: null, posing: info.start?.posing ?? 30, adapt: 0,
    },
    diet: { cal: 'maintain', macro: 'highProtein' }, // 前半は筋肉を増やす
    plan: [], // 最初の週は空。週を終えると同じ予定が翌週に残る
    inv: {},
    trunksOwned: ['practice:black'],
    trunksEquipped: 'practice:black',
    tan: { level: 4, uneven: 10, skin: 60, orange: 0, fade: 0.6, usedThisWeek: [] },
    gymWeeks: 0, proteinWeeks: 0,
    history: [], trainLog: [],
    prep: { color: false, gloss: false, carbUp: false },
    phase: 'season', result: null, rng: seed | 0, lastReport: null,
  };
  const st = bodyStats(s);
  s.history.push({ week: 0, weight: st.weight, bf: st.bf, muscle: muscleIndex(dev), fatigue: s.body.fatigue, condition: s.body.condition });
  return s;
}

/** 1回の練習でケガをする確率（週を終えた後の疲労で判定する） */
export function injuryRisk(ex: Exercise, vol: Volume, fatigue: number, partFatigue: number, cal: CaloriePlan): number {
  return ex.risk * VOLUME[vol].risk * (1 + fatigue / 45 + partFatigue / 70) * (cal === 'cutHard' ? 1.2 : 1);
}

// ---- 週を進める ----
export function advanceWeek(s0: GameState): GameState {
  const s: GameState = structuredClone(s0);
  if (s.phase !== 'season') return s;
  const lines: string[] = [];
  const before = bodyStats(s);
  const plan = s.plan;
  const nutri = nutrition(s);
  const b = s.body;

  // 所持金（食費が払えない場合は節約食になり、回復と成長が落ちる）
  let moneyDelta = WEEKLY_INCOME + plan.filter((a) => a.kind === 'work').length * EXTRA_SHIFT_PAY;
  let lowFood = false;
  const available = s.money + moneyDelta;
  if (available >= nutri.food) moneyDelta -= nutri.food;
  else { lowFood = true; moneyDelta -= Math.max(0, available); lines.push('食費が足りず、節約した食事になった（回復と成長が低下）。'); }

  // 筋肉：練習で筋肉ポイントがたまる（筋肉を大きくするのは選手が選ぶ）。減量などで落ちる分はそのまま減る
  const wk = projectWeek(s, plan);
  const devDelta = {} as Record<Part, number>;
  const ptsGain = {} as Record<Part, number>;
  const oldDev = { ...b.dev };
  const pts = { ...ptsOf(s) };
  for (const p of PARTS) {
    let g = wk.pts[p] * (0.85 + nextRand(s) * 0.3);
    if (lowFood) g *= 0.7;
    ptsGain[p] = Math.round(g);
    pts[p] += ptsGain[p];
    const l = wk.loss[p] * (lowFood ? 1.2 : 1);
    b.dev[p] = clamp(b.dev[p] - l, 5, 100);
    devDelta[p] = b.dev[p] - oldDev[p];
  }
  s.pts = pts;
  const leanDelta = leanMass(b.dev, s.player.heightCm, s.player.frame) - leanMass(oldDev, s.player.heightCm, s.player.frame);

  // エネルギー収支 → 脂肪
  let weekBalance = nutri.balance * 7;
  if (lowFood) weekBalance -= 2500;
  const fatDelta = (weekBalance - Math.max(0, leanDelta) * 1800) / 7700;
  b.fat = Math.max(2.2, b.fat + fatDelta);
  // 代謝適応
  if (CALORIE_PLANS[s.diet.cal].offset < 0) b.adapt = Math.min(150, b.adapt + 10);
  else b.adapt = Math.max(0, b.adapt - 35);

  // 左右差
  const uni = plan.filter((a) => a.kind === 'train' && exerciseById(a.ex).unilateral).length;
  const sign = Math.sign(b.imbalance) || 1;
  b.imbalance = clamp(b.imbalance * 0.985 - sign * 0.38 * uni + (nextRand(s) - 0.35) * 0.4, -12, 12);
  if (uni > 0) lines.push(`片側種目×${uni}で左右差が整った。`);

  // 疲労
  let add = 0;
  const st = stimulusByPart(plan);
  for (const a of plan) {
    if (a.kind === 'train') add += VOLUME[a.vol].sets * 0.85 * exerciseById(a.ex).fatigue;
    if (a.kind === 'cardio') add += 6;
    if (a.kind === 'work') add += 5;
    if (a.kind === 'posing') add += 2;
  }
  const rests = plan.filter((a) => a.kind === 'rest').length;
  // 疲労は「今週の負荷から決まる水準」へ半分ずつ近づく
  const calLoad: Record<CaloriePlan, number> = { bulk: -4, maintain: -2, cutMild: 0, cut: 4, cutHard: 9 };
  let target = add * 1.15 - rests * 12 + calLoad[s.diet.cal] - (s.diet.macro === 'highCarb' ? 4 : 0) + (lowFood ? 8 : 0) + (b.injury ? 3 : 0);
  target = clamp(target, 0, 100);
  b.fatigue = clamp(b.fatigue * 0.5 + target * 0.5, 0, 100);
  for (const p of PARTS) {
    let primarySets = 0;
    for (const a of plan) if (a.kind === 'train' && exerciseById(a.ex).part === p) primarySets += VOLUME[a.vol].sets;
    const secondary = Math.max(0, st[p] - primarySets);
    b.partFatigue[p] = clamp(b.partFatigue[p] * 0.4 + primarySets * 2.8 + secondary * 1.0 - rests * 4, 0, 100);
    if (primarySets) s.trainLog.push({ week: s.week, part: p, sets: primarySets });
  }

  // ケガ
  let injuryMsg: string | null = null;
  if (b.injury) {
    b.injury.weeks -= 1;
    if (b.injury.weeks <= 0) { lines.push(`${PART_LABEL[b.injury.part]}のケガが治った。`); b.injury = null; }
  }
  if (!b.injury) {
    for (const a of plan) {
      if (a.kind !== 'train') continue;
      const ex = exerciseById(a.ex);
      const p = injuryRisk(ex, a.vol, b.fatigue, b.partFatigue[ex.part], s.diet.cal);
      if (nextRand(s) < p) {
        const weeks = 1 + Math.floor(nextRand(s) * 3);
        b.injury = { part: ex.part, weeks };
        injuryMsg = `${ex.name}中に${PART_LABEL[ex.part]}を痛めた（${weeks}週間は${PART_LABEL[ex.part]}を鍛えられない）。`;
        lines.push(injuryMsg);
        break;
      }
    }
  }

  // 筋肉の張り（グリコーゲン）
  const fullTarget = { highCarb: 1.0, balanced: 0.88, highProtein: 0.74 }[s.diet.macro]
    + ({ bulk: 0.05, maintain: 0, cutMild: -0.02, cut: -0.06, cutHard: -0.13 } as Record<CaloriePlan, number>)[s.diet.cal];
  b.fullness = clamp(b.fullness * 0.4 + fullTarget * 0.6, 0.4, 1.15);

  // ポージング
  const posingN = plan.filter((a) => a.kind === 'posing').length;
  if (posingN > 0) for (let i = 0; i < posingN; i++) b.posing = clamp(b.posing + 7.5 * (1 - b.posing / 115), 0, 100);
  else b.posing = clamp(b.posing - 1.2, 0, 100);

  // コンディション
  const after0 = bodyStats(s);
  let condTarget = 92 - b.fatigue * 0.45 - (b.injury ? 18 : 0) + rests * 2
    - ({ bulk: 0, maintain: 0, cutMild: 1, cut: 3, cutHard: 8 } as Record<CaloriePlan, number>)[s.diet.cal]
    - (after0.bf < 4.5 ? 8 : 0) - (lowFood ? 8 : 0);
  condTarget = clamp(condTarget, 0, 100);
  b.condition = clamp(b.condition * 0.5 + condTarget * 0.5, 0, 100);

  // 日焼け・肌
  const t = s.tan;
  t.level = t.level * t.fade;
  if (t.level < 3) { t.level = Math.max(2, t.level); t.uneven = Math.max(5, t.uneven * 0.5); t.orange *= 0.5; }
  t.skin = clamp(t.skin + (CALORIE_PLANS[s.diet.cal].offset < -300 ? -4 : 2), 0, 100);
  t.usedThisWeek = [];

  // 期限付きの購入品
  if (s.gymWeeks > 0) { s.gymWeeks -= 1; if (s.gymWeeks === 0) lines.push('会員制ジムのパスが切れた。'); }
  if (s.proteinWeeks > 0) s.proteinWeeks -= 1;

  s.money += moneyDelta;
  const after = bodyStats(s);
  const psum = (Object.values(ptsGain) as number[]).reduce((x, y) => x + y, 0);
  const msum = (Object.values(devDelta) as number[]).reduce((x, y) => x + y, 0);
  if (msum < -0.3) lines.push(`減量で筋肉が少し落ちた（合計 ${msum.toFixed(1)}）。`);
  lines.unshift(`筋肉ポイント 合計 +${psum}pt／体重 ${(after.weight - before.weight >= 0 ? '+' : '')}${(after.weight - before.weight).toFixed(1)}kg／体脂肪率 ${after.bf.toFixed(1)}%`);
  if (b.fatigue > 70) lines.push('疲労が非常に高い。休養を増やさないと成長が止まり、ケガのリスクも上がる。');
  for (const p of PARTS) if (b.partFatigue[p] > 75) lines.push(`${PART_LABEL[p]}の疲労が抜けていない（成長効率が低下）。`);
  if (b.fullness < 0.72) lines.push('筋肉の張りが落ちている（炭水化物不足）。');

  s.lastReport = {
    week: s.week, lines, weightBefore: before.weight, weightAfter: after.weight, bfBefore: before.bf, bfAfter: after.bf,
    devDelta, ptsGain, moneyDelta, injury: injuryMsg,
  };
  s.history.push({ week: s.week, weight: after.weight, bf: after.bf, muscle: muscleIndex(b.dev), fatigue: b.fatigue, condition: b.condition });
  // 計画は翌週も引き継ぐ（使えなくなった行動は外す）
  s.week += 1;
  if (s.week > WEEKS) { s.phase = 'contestDay'; s.plan = []; }
  else {
    const keep: Action[] = [];
    for (const a of plan) {
      const tmp = { ...s, plan: keep };
      if (canAddAction(tmp, a).ok) keep.push(a);
    }
    s.plan = keep;
  }
  return s;
}

// ---- 入賞と引退 ----
/** 入賞は3位まで（賞金が出る順位） */
export const PRIZE_PLACES = 3;
/** 何シーズン続けて入賞できないと引退か */
export const MISS_LIMIT = 3;
/** 直近で続けて入賞できなかった回数（今回の結果を含む） */
export function missStreak(s: GameState): number {
  const places = [...(s.records ?? []).map((r) => r.place), ...(s.result ? [s.result.playerPlace] : [])];
  let n = 0;
  for (let i = places.length - 1; i >= 0 && places[i] > PRIZE_PLACES; i--) n++;
  return n;
}
/** 3シーズン続けて入賞できなかったら引退（ゲーム終了） */
export function isGameOver(s: GameState): boolean {
  return s.phase === 'done' && !!s.result && missStreak(s) >= MISS_LIMIT;
}

// ---- 次のシーズン ----
/** 大会の後、同じ選手で次の大会に向けて第1週からやり直す。筋肉・ポーズ・お金・持ち物・衣装は引き継ぐ */
export function nextSeason(s0: GameState): GameState {
  const s: GameState = structuredClone(s0);
  if (s.phase !== 'done' || !s.result || isGameOver(s)) return s;
  const season = s.season ?? 1;
  s.records = [...(s.records ?? []), { season, place: s.result.playerPlace, prize: s.result.prize, category: s.result.category }];
  s.season = season + 1;
  s.week = 1;
  s.phase = 'season';
  s.result = null;
  s.lastReport = null;
  s.plan = [];
  s.prep = { color: false, gloss: false, carbUp: false };
  s.trainLog = [];
  s.diet = { cal: 'maintain', macro: 'highProtein' }; // 前半はまた筋肉を増やす
  const b = s.body;
  // 大会と大会の間のオフ（増量期）で筋肉が育つ。伸びしろが減るほど伸びは小さくなる
  const off = {} as Record<Part, number>;
  for (const p of PARTS) {
    const pot = Math.pow(Math.max(0, 1 - b.dev[p] / 105), 1.2);
    off[p] = 2.5 * pot * (s.player.talent ?? 1) * (s.player.strong === p ? 1.2 : 1);
    b.dev[p] = clamp(b.dev[p] + off[p], 5, 100);
  }
  s.offGain = off;
  // 体脂肪は少し戻る
  const lean = leanMass(b.dev, s.player.heightCm, s.player.frame);
  b.fat += lean * 0.035;
  b.fatigue = 15;
  b.partFatigue = Object.fromEntries(PARTS.map((p) => [p, 10])) as Record<Part, number>;
  b.injury = null;
  b.condition = 80;
  b.fullness = 0.9;
  b.adapt = 0;
  b.posing = clamp(b.posing - 4, 0, 100);
  s.tan = { level: 4, uneven: 10, skin: 60, orange: 0, fade: 0.6, usedThisWeek: [] };
  s.money -= CONTEST.entryFee;
  const st = bodyStats(s);
  s.history = [{ week: 0, weight: st.weight, bf: st.bf, muscle: muscleIndex(b.dev), fatigue: b.fatigue, condition: b.condition }];
  return s;
}

// ---- ショップ・アイテム ----
export function buyItem(s: GameState, id: string): { ok: boolean; msg: string } {
  const it = ITEMS.find((i) => i.id === id);
  if (!it) return { ok: false, msg: '商品が見つかりません' };
  if (s.money < it.price) return { ok: false, msg: '所持金が足りません' };
  if (s.phase === 'done') return { ok: false, msg: '大会は終了しています' };
  s.money -= it.price;
  if (it.kind === 'gym') { s.gymWeeks += 4; return { ok: true, msg: `${it.name}を購入（残り${s.gymWeeks}週）` }; }
  if (it.id === 'protein') { s.proteinWeeks += 4; return { ok: true, msg: `${it.name}を購入（残り${s.proteinWeeks}週）` }; }
  s.inv[id] = (s.inv[id] ?? 0) + 1;
  return { ok: true, msg: `${it.name}を購入しました` };
}

export function buyTrunks(s: GameState, key: string, price: number): { ok: boolean; msg: string } {
  if (s.trunksOwned.includes(key)) return { ok: false, msg: '購入済みです' };
  if (s.money < price) return { ok: false, msg: '所持金が足りません' };
  s.money -= price;
  s.trunksOwned.push(key);
  return { ok: true, msg: '購入しました' };
}

/** 消耗品を使う */
export function useItem(s: GameState, id: string): { ok: boolean; msg: string } {
  const it = ITEMS.find((i) => i.id === id);
  if (!it) return { ok: false, msg: '不明なアイテム' };
  if ((s.inv[id] ?? 0) <= 0) return { ok: false, msg: '持っていません' };
  if (it.kind === 'color' || it.kind === 'gloss') return { ok: false, msg: '大会前日の準備画面で使います' };
  if (s.phase !== 'season') return { ok: false, msg: '準備期間は終了しました' };
  if (s.tan.usedThisWeek.includes(id)) return { ok: false, msg: '今週はすでに使いました' };
  const t = s.tan, b = s.body;
  if (it.kind === 'tanner') {
    const add = it.tanAdd! * (1 - t.level / 140);
    const scrubbed = t.usedThisWeek.includes('scrub');
    const appliedUneven = (1 - it.evenness!) * 100 * (1 - t.skin / 200) * (scrubbed ? 0.65 : 1);
    const newLevel = t.level + add;
    t.uneven = clamp((t.uneven * t.level + appliedUneven * add) / newLevel, 0, 100);
    t.orange = clamp((t.orange * t.level + it.orange! * add) / newLevel, 0, 1);
    t.fade = clamp((t.fade * t.level + it.fade! * add) / newLevel, 0.3, 0.9);
    t.level = newLevel;
  } else if (id === 'scrub') t.skin = clamp(t.skin + 15, 0, 100);
  else if (id === 'lotion') t.skin = clamp(t.skin + 10, 0, 100);
  else if (id === 'massage') {
    b.fatigue = clamp(b.fatigue - 15, 0, 100);
    for (const p of PARTS) b.partFatigue[p] = clamp(b.partFatigue[p] - 15, 0, 100);
  } else if (id === 'posingLesson') {
    b.posing = clamp(b.posing + 7, 0, 100);
    b.fatigue = clamp(b.fatigue + 3, 0, 100);
  }
  t.usedThisWeek.push(id);
  s.inv[id] -= 1;
  return { ok: true, msg: `${it.name}を使用しました` };
}

// ---- 大会当日の仕上がり ----
export function stageFinish(s: GameState) {
  const t = s.tan;
  let level = t.level, uneven = t.uneven, orange = t.orange;
  if (s.prep.color) {
    const c = ITEMS.find((i) => i.id === 'compColor')!;
    const add = c.tanAdd! * (1 - level / 170);
    const colorUneven = (1 - c.evenness!) * 100 * clamp(1.7 - t.skin / 100 - Math.min(level, 40) / 60, 0.35, 1.7);
    uneven = (uneven * level + colorUneven * add) / (level + add);
    orange = (orange * level + c.orange! * add) / (level + add);
    level += add;
  }
  const shine = s.prep.gloss ? 0.78 : 0.3;
  let fullness = s.body.fullness;
  if (s.prep.carbUp) fullness = clamp(fullness + (s.body.fatigue < 60 ? 0.15 : 0.08), 0, 1.15);
  return { level: clamp(level, 0, 100), uneven: clamp(uneven, 0, 100), orange, shine, fullness };
}

export function categoryOf(s: GameState) {
  return CATEGORIES[s.player.category];
}
