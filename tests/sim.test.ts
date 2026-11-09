import { describe, expect, it } from 'vitest';
import { advanceWeek, bodyStats, buyItem, buyTrunks, canAddAction, growthRate, newGame, rollPlayer, useItem, type Action, type GameState, type PlayerInfo } from '../src/game/rules';
import { heroStage } from '../src/ui/art';
import { runContest } from '../src/game/scoring';
import { WEEKS, type Category } from '../src/game/data';
import { dietAdvice } from '../src/game/guide';

function setPlan(s: GameState, plan: Action[]) {
  s.plan = [];
  for (const a of plan) if (canAddAction(s, a).ok) s.plan.push(a);
}

function playGood(cat: Category, seed: number, info?: PlayerInfo, onWeek?: (s: GameState) => void) {
  let s = newGame(info ?? { name: 'テスト', heightCm: 175, frame: 'meso', category: cat, skinTone: 1 }, seed);
  buyItem(s, 'gymPass');
  for (let w = 1; w <= WEEKS; w++) {
    // 食事はトレーナーのおすすめ（前半は増量・後半は体脂肪の線に合わせて絞る）
    const d = dietAdvice(s);
    s.diet = { cal: d.cal, macro: d.macro };
    const late = w - (WEEKS - 12); // 大会の12週前を1とする
    if (s.gymWeeks === 0 && s.money > 20000) buyItem(s, 'gymPass');
    setPlan(s, [
      { kind: 'train', ex: 'bench', vol: 'normal' },
      { kind: 'train', ex: s.gymWeeks ? 'latPull' : 'pullup', vol: 'normal' },
      { kind: 'train', ex: s.gymWeeks ? 'legPress' : 'bss', vol: 'normal' },
      late >= 7 ? { kind: 'cardio' } : { kind: 'train', ex: 'lateral', vol: 'normal' },
      late >= 5 ? { kind: 'posing' } : { kind: 'train', ex: 'dbCurl', vol: 'normal' },
      late >= 4 ? { kind: 'cardio' } : { kind: 'train', ex: 'plank', vol: 'normal' },
    ]);
    if (late >= 8 && s.money > 30000) { buyItem(s, 'posingLesson'); useItem(s, 'posingLesson'); }
    if (late >= 9) {
      if (s.money > 10000) { buyItem(s, 'scrub'); useItem(s, 'scrub'); }
      if (s.money > 10000) { buyItem(s, 'tanPro'); useItem(s, 'tanPro'); }
    }
    s = advanceWeek(s);
    onWeek?.(s);
  }
  if (cat === 'classic') { buyTrunks(s, 'classicMatte:black', 6000); s.trunksEquipped = 'classicMatte:black'; }
  if (s.money >= 12000) { buyItem(s, 'compColor'); s.prep.color = true; }
  if (s.money >= 2500) { buyItem(s, 'gloss'); s.prep.gloss = true; }
  s.prep.carbUp = true;
  return { s, r: runContest(s) };
}

function playLazy(cat: Category, seed: number) {
  let s = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: cat, skinTone: 1 }, seed);
  s.diet = { cal: 'bulk', macro: 'balanced' };
  for (let w = 1; w <= WEEKS; w++) s = advanceWeek(s);
  return { s, r: runContest(s) };
}

describe('シーズン通しのシミュレーション', () => {
  it('計画的に準備すると上位に入れる', () => {
    const places: number[] = [];
    for (const cat of ['bodybuilding', 'classic'] as Category[]) for (let seed = 1; seed <= 6; seed++) {
      const { s, r } = playGood(cat, seed);
      const st = bodyStats(s);
      places.push(r.playerPlace);
      if (seed === 1) console.log(r.ranking.map((c) => c.name + ' ' + Object.entries(c.scores).map(([k, v]) => k + ':' + v.toFixed(0)).join(' ')).join(' / '));
      if (seed === 1) console.log(cat, 'place', r.playerPlace, 'bf', st.bf.toFixed(1), 'w', st.weight.toFixed(1), 'money', s.money, JSON.stringify(Object.fromEntries(Object.entries(s.body.dev).map(([k, v]) => [k, +v.toFixed(1)]))), 'posing', s.body.posing.toFixed(0), 'cond', s.body.condition.toFixed(0), r.ranking.map((c) => `${c.name}:${c.total.toFixed(1)}`).join(' '));
    }
    const avg = places.reduce((a, b) => a + b, 0) / places.length;
    expect(avg).toBeLessThanOrEqual(2.5);
  });
  it('準備不足だと下位になる', () => {
    for (const cat of ['bodybuilding', 'classic'] as Category[]) {
      const { s, r } = playLazy(cat, 3);
      console.log('lazy', cat, r.playerPlace, bodyStats(s).bf.toFixed(1));
      expect(r.playerPlace).toBeGreaterThanOrEqual(4);
    }
  });
  it('体重・体脂肪の変化は急激すぎない', () => {
    let s = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 9);
    s.diet = { cal: 'cutHard', macro: 'balanced' };
    for (let w = 1; w <= 4; w++) {
      const b = bodyStats(s);
      s = advanceWeek(s);
      const a = bodyStats(s);
      expect(Math.abs(a.weight - b.weight)).toBeLessThan(1.6);
      expect(Math.abs(a.bf - b.bf)).toBeLessThan(1.6);
    }
  });
});

describe('ショップ・所持金', () => {
  it('所持金不足では買えず、残高と所有が正しく更新される', () => {
    const s = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    const m0 = s.money;
    expect(buyItem(s, 'tanPro').ok).toBe(true);
    expect(s.money).toBe(m0 - 8000);
    expect(s.inv.tanPro).toBe(1);
    s.money = 100;
    expect(buyItem(s, 'tanPro').ok).toBe(false);
    expect(s.money).toBe(100);
    expect(buyTrunks(s, 'satinStd:royal', 9000).ok).toBe(false);
    s.money = 20000;
    expect(buyTrunks(s, 'satinStd:royal', 9000).ok).toBe(true);
    expect(s.trunksOwned).toContain('satinStd:royal');
    expect(buyTrunks(s, 'satinStd:royal', 9000).ok).toBe(false);
    expect(s.money).toBe(11000);
  });
  it('セルフタンナーで色が濃くなり、同じ週に二度は使えない', () => {
    const s = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    s.inv.tanBasic = 2;
    const l0 = s.tan.level;
    expect(useItem(s, 'tanBasic').ok).toBe(true);
    expect(s.tan.level).toBeGreaterThan(l0 + 10);
    expect(useItem(s, 'tanBasic').ok).toBe(false);
  });
});

describe('ランダムな選手', () => {
  it('能力は決まった範囲に入り、同じ種なら同じ結果', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rollPlayer(seed);
      expect(r.heightCm).toBeGreaterThanOrEqual(165);
      expect(r.heightCm).toBeLessThanOrEqual(185);
      expect(r.talent!).toBeGreaterThanOrEqual(0.9);
      expect(r.talent!).toBeLessThanOrEqual(1.12);
      for (const v of Object.values(r.start!.dev)) { expect(v).toBeGreaterThan(36); expect(v).toBeLessThan(54); }
    }
    expect(rollPlayer(42)).toEqual(rollPlayer(42));
  });
  it('早熟は前半、晩成は後半に伸び、準備期間の平均はほぼ同じ', () => {
    const avg = (g: 'early' | 'late') => Array.from({ length: WEEKS }, (_, i) => growthRate({ name: '', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1, growth: g }, i + 1)).reduce((a, b) => a + b) / WEEKS;
    const at = (g: 'early' | 'late', w: number) => growthRate({ name: '', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1, growth: g }, w);
    expect(at('early', 1)).toBeGreaterThan(at('late', 1));
    expect(at('late', WEEKS)).toBeGreaterThan(at('early', WEEKS));
    expect(Math.abs(avg('early') - avg('late'))).toBeLessThan(0.02);
  });
  it('計画的に準備すれば、どの選手でもおおむね上位に入れる', () => {
    const places: number[] = [];
    for (let seed = 1; seed <= 16; seed++) {
      const r = rollPlayer(seed * 977);
      const { r: res } = playGood(r.category, seed, { ...r, name: 't', skinTone: 1, face: 'a' });
      places.push(res.playerPlace);
    }
    expect(places.reduce((a, b) => a + b, 0) / places.length).toBeLessThanOrEqual(3);
  });
  it('育てると見た目の段階が1から5へ上がり、放置では上がらない', () => {
    for (const seed of [1, 2, 3]) {
      const stages: number[] = [];
      playGood('bodybuilding', seed, undefined, (s) => stages.push(heroStage(s)));
      expect(stages[stages.length - 1]).toBe(5);
      expect(new Set(stages).size).toBeGreaterThanOrEqual(4);
    }
    const lazy = playLazy('bodybuilding', 3).s;
    expect(heroStage(lazy)).toBeLessThanOrEqual(2);
  });
});
