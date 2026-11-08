import { describe, expect, test } from 'vitest';
import { PARTS } from '../src/body/anatomy';
import { newGame } from '../src/game/rules';
import { heroArt, heroStage } from '../src/ui/art';
import { HERO_ART } from '../src/ui/artList';

describe('主人公のイラスト', () => {
  test('始めは初期、絞ると中期・大会レベル、増量で筋肉が増えても中期', () => {
    const s = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    expect(heroStage(s)).toBe('early');
    s.body.fat *= 0.75;
    expect(heroStage(s)).toBe('mid');
    s.body.fat *= 0.6;
    expect(heroStage(s)).toBe('contest');
    const b = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    for (const p of PARTS) b.body.dev[p] = 50;
    expect(heroStage(b)).toBe('mid');
  });
  test('一覧にある絵は3段階とも用途がそろっている', () => {
    for (const st of ['early', 'mid', 'contest'] as const)
      for (const u of ['portrait', 'training'] as const) expect(heroArt(st, u)).toMatch(new RegExp(`art/hero/${st}-${u}\.webp$`));
    expect(heroArt('early', 'win')).toMatch(/contest-win\.webp$/); // 無い段階は近い段階で代用
    expect(HERO_ART.length).toBeGreaterThanOrEqual(17);
  });
});
