import { describe, expect, test } from 'vitest';
import { PARTS } from '../src/game/body';
import { newGame } from '../src/game/rules';
import { RIVALS } from '../src/game/data';
import { heroArt, heroStage, rivalArt } from '../src/ui/art';
import { HERO_ART } from '../src/ui/artList';

describe('主人公のイラスト', () => {
  test('始めは段階1〜2、絞ると上がり、増量で筋肉が増えても上がる', () => {
    const s = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    expect(heroStage(s)).toBeLessThanOrEqual(2);
    s.body.fat *= 0.5;
    expect(heroStage(s)).toBeGreaterThanOrEqual(3);
    const b = newGame({ name: 't', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
    for (const p of PARTS) b.body.dev[p] = 54;
    expect(heroStage(b)).toBeGreaterThanOrEqual(3);
  });
  test('絵の名前は 顔-s段階-用途、無い段階は近い段階で代用', () => {
    expect(heroArt('a', 1, 'portrait')).toMatch(/art\/hero\/a-s1-portrait\.webp$/);
    expect(heroArt('a', 5, 'win')).toMatch(/a-s5-win\.webp$/);
    expect(heroArt('a', 1, 'win')).toMatch(/a-s5-win\.webp$/);
    expect(HERO_ART.every((k) => /^[abc]-s[1-5]-(portrait|training|pose|win|sheet-front|sheet-back|sheet-side)$/.test(k))).toBe(true);
  });
});

describe('ライバルのイラスト', () => {
  test('5人とも上半身・大会のポーズ・正面/背面/側面の資料がそろっている', () => {
    for (const r of RIVALS)
      for (const u of ['portrait', 'contest', 'sheet-front', 'sheet-back', 'sheet-side'] as const)
        expect(rivalArt(r.id, u)).toMatch(new RegExp(`art/rivals/${r.id}-${u}\.webp$`));
    expect(rivalArt('r9', 'portrait')).toBeNull();
  });
});
