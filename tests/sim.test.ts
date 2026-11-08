import { describe, expect, it } from 'vitest';
import { advanceWeek, bodyStats, buyItem, buyTrunks, canAddAction, newGame, useItem, type Action, type GameState } from '../src/game/rules';
import { runContest } from '../src/game/scoring';
import type { Category } from '../src/game/data';

function setPlan(s: GameState, plan: Action[]) {
  s.plan = [];
  for (const a of plan) if (canAddAction(s, a).ok) s.plan.push(a);
}

function playGood(cat: Category, seed: number) {
  let s = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: cat, skinTone: 1 }, seed);
  buyItem(s, 'gymPass');
  for (let w = 1; w <= 12; w++) {
    s.diet = { cal: w <= 10 ? 'cut' : 'cutMild', macro: w <= 10 ? 'highProtein' : 'highCarb' };
    if (s.gymWeeks === 0 && s.money > 20000) buyItem(s, 'gymPass');
    setPlan(s, [
      { kind: 'train', ex: 'bench', vol: 'normal' },
      { kind: 'train', ex: s.gymWeeks ? 'latPull' : 'pullup', vol: 'normal' },
      { kind: 'train', ex: s.gymWeeks ? 'legPress' : 'bss', vol: 'normal' },
      w >= 7 ? { kind: 'cardio' } : { kind: 'train', ex: 'lateral', vol: 'normal' },
      w >= 5 ? { kind: 'posing' } : { kind: 'train', ex: 'dbCurl', vol: 'normal' },
      w >= 4 ? { kind: 'cardio' } : { kind: 'train', ex: 'plank', vol: 'normal' },
    ]);
    if (w >= 8 && s.money > 30000) { buyItem(s, 'posingLesson'); useItem(s, 'posingLesson'); }
    if (w >= 9) {
      if (s.money > 10000) { buyItem(s, 'scrub'); useItem(s, 'scrub'); }
      if (s.money > 10000) { buyItem(s, 'tanPro'); useItem(s, 'tanPro'); }
    }
    s = advanceWeek(s);
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
  for (let w = 1; w <= 12; w++) s = advanceWeek(s);
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
