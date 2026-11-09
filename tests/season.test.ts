import { describe, expect, it } from 'vitest';
import { previewCommand, recommend } from '../src/game/guide';
import { advanceWeek, bodyStats, newGame, nextSeason, type GameState } from '../src/game/rules';
import { rivalGrowth, runContest } from '../src/game/scoring';

/** おすすめだけで12週を進めて大会に出る */
function playSeason(s: GameState): GameState {
  for (let w = 1; w <= 12; w++) {
    const behind = bodyStats(s).bf > 14 - w * 0.75;
    s.diet = { cal: w <= 10 ? (behind ? 'cutHard' : 'cut') : 'cutMild', macro: w <= 10 ? 'highProtein' : 'highCarb' };
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
  s.result = runContest(s);
  s.money += s.result.prize;
  s.phase = 'done';
  return s;
}

describe('大会の後も続けて遊べる', () => {
  it('次のシーズンは第1週から。筋肉とお金は引き継ぎ、オフで筋肉が育つ', () => {
    let s = playSeason(newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 5));
    const dev = { ...s.body.dev };
    const money = s.money;
    const t = nextSeason(s);
    expect(t.season).toBe(2);
    expect(t.week).toBe(1);
    expect(t.phase).toBe('season');
    expect(t.result).toBeNull();
    for (const k of Object.keys(dev) as (keyof typeof dev)[]) expect(t.body.dev[k]).toBeGreaterThan(dev[k]);
    expect(t.money).toBe(money - 8000);
    expect(t.records).toHaveLength(1);
    expect(bodyStats(t).bf).toBeGreaterThan(bodyStats(s).bf);
  });

  it('ライバルは毎回少しずつ強くなる（上限あり）', () => {
    expect(rivalGrowth(1)).toBe(0);
    expect(rivalGrowth(2)).toBeGreaterThan(0);
    expect(rivalGrowth(3)).toBeGreaterThan(rivalGrowth(2));
    expect(rivalGrowth(50)).toBeLessThanOrEqual(9);
  });

  it('5シーズン続けても遊べて、戦績が残る', () => {
    let s: GameState = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 9);
    const places: number[] = [];
    for (let n = 1; n <= 5; n++) {
      s = playSeason(s);
      places.push(s.result!.playerPlace);
      if (n < 5) s = nextSeason(s);
    }
    expect(s.records).toHaveLength(4);
    expect(s.season).toBe(5);
    for (const p of places) { expect(p).toBeGreaterThanOrEqual(1); expect(p).toBeLessThanOrEqual(6); }
    console.log('places', places.join(','), 'money', s.money);
  });
});
