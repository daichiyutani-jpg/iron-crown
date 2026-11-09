import { describe, expect, it } from 'vitest';
import { COMMANDS, dietAdvice, fatigueAfter, planInjury, predictPlace, previewCommand, recommend } from '../src/game/guide';
import { advanceWeek, bodyStats, newGame, type GameState } from '../src/game/rules';
import { runContest } from '../src/game/scoring';
import { WEEKS } from '../src/game/data';

const fresh = (seed = 1) => newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, seed);

describe('練習のコマンドカード', () => {
  it('どのカードにも見込みが出る', () => {
    const s = fresh();
    s.plan = [];
    for (const id of COMMANDS) {
      const pv = previewCommand(s, id);
      expect(pv.action).not.toBeNull();
      expect(pv.ok).toBe(true);
      if (['chest', 'back', 'shoulders', 'arms', 'legs', 'abs'].includes(id)) {
        expect(pv.main[0].good).toBe(true);
        expect(pv.fatigue).toBeGreaterThan(0);
      }
    }
    s.plan = [{ kind: 'train', ex: 'squat', vol: 'high' }, { kind: 'train', ex: 'deadlift', vol: 'high' }];
    expect(previewCommand(s, 'rest').fatigue).toBeLessThan(0);
  });

  it('見込みの疲労は実際に週を進めた結果と同じ', () => {
    const s = fresh(3);
    const f = fatigueAfter(s).fatigue;
    expect(advanceWeek(s).body.fatigue).toBeCloseTo(f, 6);
  });

  it('ケガの確率は練習を増やすほど上がる', () => {
    const s = fresh();
    const a = planInjury(s);
    s.plan = s.plan.filter((x) => x.kind !== 'rest');
    s.plan.push({ kind: 'train', ex: 'deadlift', vol: 'high' });
    expect(planInjury(s)).toBeGreaterThan(a);
  });

  it('疲れている時は休養をすすめる', () => {
    const s = fresh();
    s.body.fatigue = 90;
    s.plan = [{ kind: 'train', ex: 'squat', vol: 'normal' }];
    expect(recommend(s)?.id).toBe('rest');
  });

  it('おすすめだけを選んでも大会で戦える', () => {
    const places: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      let s: GameState = fresh(seed);
      for (let w = 1; w <= WEEKS; w++) {
        const d = dietAdvice(s);
        s.diet = { cal: d.cal, macro: d.macro };
        s.plan = [];
        for (let i = 0; i < 6; i++) {
          const r = recommend(s);
          if (!r) break;
          const pv = previewCommand(s, r.id);
          if (!pv.ok || !pv.action) break;
          s.plan.push(pv.action);
        }
        s = advanceWeek(s);
      }
      s.prep.carbUp = true;
      places.push(runContest(s).playerPlace);
      expect(bodyStats(s).bf).toBeLessThan(7);
    }
    const avg = places.reduce((a, b) => a + b, 0) / places.length;
    expect(avg).toBeLessThanOrEqual(4);
  });

  it('予想順位は1〜6位', () => {
    const p = predictPlace(fresh());
    expect(p.of).toBe(6);
    expect(p.place).toBeGreaterThanOrEqual(1);
    expect(p.place).toBeLessThanOrEqual(6);
  });
});
