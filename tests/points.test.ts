import { describe, expect, it } from 'vitest';
import { PARTS } from '../src/game/body';
import { advanceWeek, newGame, ptsOf, raiseCost, raisePart, rankOf } from '../src/game/rules';

const fresh = () => newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 5);

describe('筋肉ポイントとランク', () => {
  it('ランクは G〜SS。SS は 99 以上', () => {
    expect(rankOf(10)).toBe('G'); expect(rankOf(30)).toBe('F'); expect(rankOf(45)).toBe('E');
    expect(rankOf(55)).toBe('D'); expect(rankOf(65)).toBe('C'); expect(rankOf(75)).toBe('B');
    expect(rankOf(85)).toBe('A'); expect(rankOf(90)).toBe('S'); expect(rankOf(98.9)).toBe('S'); expect(rankOf(99)).toBe('SS'); expect(rankOf(100)).toBe('SS');
  });
  it('練習した部位にポイントがたまり、筋肉は勝手には増えない', () => {
    let s = fresh();
    s.diet = { cal: 'maintain', macro: 'highProtein' };
    s.plan = [{ kind: 'train', ex: 'bench', vol: 'normal' }, { kind: 'train', ex: 'squat', vol: 'normal' }];
    const dev = { ...s.body.dev };
    s = advanceWeek(s);
    const pts = ptsOf(s);
    expect(pts.chest).toBeGreaterThan(10);
    expect(pts.legs).toBeGreaterThan(10);
    expect(pts.chest).toBeGreaterThan(pts.abs);
    for (const p of PARTS) expect(s.body.dev[p]).toBeLessThanOrEqual(dev[p] + 1e-9);
    expect(s.lastReport!.ptsGain!.chest).toBe(pts.chest);
  });
  it('ポイントを使うと好きな部位が +1。値が高いほど必要なポイントが増える', () => {
    const s = fresh();
    expect(raiseCost(80)).toBeGreaterThan(raiseCost(50));
    const c = raiseCost(s.body.dev.legs);
    s.pts = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: c * 3 + 1, abs: 0 };
    const before = s.body.dev.legs;
    expect(raisePart(s, 'chest')).toBe(0); // 胸のポイントは無い
    expect(raisePart(s, 'legs')).toBe(1);
    expect(s.body.dev.legs).toBeCloseTo(before + 1, 6);
    expect(raisePart(s, 'legs', 999)).toBeGreaterThanOrEqual(1);
    expect(ptsOf(s).legs).toBeLessThan(raiseCost(s.body.dev.legs));
  });
});
