import { describe, expect, test } from 'vitest';
import { newGame } from '../src/game/rules';
import { runContest } from '../src/game/scoring';
import { venueArt } from '../src/ui/art';
import { SHOW_STEPS, showHtml } from '../src/ui/show';

describe('大会の演出', () => {
  test('全段が描け、6位から1位の順に発表して最後は表彰台', () => {
    const s = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 2);
    s.result = runContest(s);
    const n = s.result.ranking.length;
    expect(SHOW_STEPS).toBe(3 + n);
    for (let i = 0; i < SHOW_STEPS; i++) expect(showHtml(s, i)).toContain('data-act="show-next"');
    const last = s.result.ranking.find((c) => c.place === n)!;
    expect(showHtml(s, 3)).toContain(`<b>${n}<small>位</small></b><span>${last.name}`);
    const fin = showHtml(s, SHOW_STEPS - 1);
    expect(fin).toContain('<b>1<small>位</small></b>');
    expect(fin).toContain('結果の詳細へ');
    expect(fin).toContain('art/venue/podium.webp');
  });
  test('会場の背景が3枚そろっている', () => {
    for (const k of ['stage', 'crowd', 'podium']) expect(venueArt(k)).toMatch(new RegExp(`art/venue/${k}.webp$`));
  });
});
