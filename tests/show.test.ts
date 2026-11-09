import { describe, expect, test } from 'vitest';
import { newGame } from '../src/game/rules';
import { runContest } from '../src/game/scoring';
import { venueArt } from '../src/ui/art';
import { SHOW_STEPS, showAutoMs, showHtml } from '../src/ui/show';

describe('大会の演出', () => {
  test('全段が描け、6位から1位の順に発表して最後は表彰台', () => {
    const s = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 2);
    s.result = runContest(s);
    const n = s.result.ranking.length;
    // 開幕・紹介・規定ポーズ8つ・比較審査・フリーポーズ・発表6回
    expect(SHOW_STEPS).toBe(12 + n);
    for (let i = 0; i < SHOW_STEPS; i++) expect(showHtml(s, i)).toContain('data-act="show-next"');
    expect(showHtml(s, 2)).toContain('フロント・ダブルバイセップス');
    expect(showHtml(s, 5)).toContain('バック・ダブルバイセップス');
    expect(showHtml(s, 5)).toContain('sheet-back');
    expect(showHtml(s, 9)).toContain('モスト・マスキュラー');
    expect(showHtml(s, 10)).toContain('比較審査');
    expect(showHtml(s, 11)).toContain('フリーポーズ');
    for (let i = 2; i <= 9; i++) { expect(showAutoMs(i)).toBeGreaterThan(0); expect(showHtml(s, i).match(/class="judges"/g)).toHaveLength(1); }
    expect(showAutoMs(12)).toBe(0);
    const last = s.result.ranking.find((c) => c.place === n)!;
    expect(showHtml(s, 12)).toContain(`<b>${n}<small>位</small></b><span>${last.name}`);
    const fin = showHtml(s, SHOW_STEPS - 1);
    expect(fin).toContain('<b>1<small>位</small></b>');
    expect(fin).toContain('結果の詳細へ');
    expect(fin).toContain('art/venue/podium.webp');
  });
  test('クラシック部門の最後はフェイバリット・ポーズ', () => {
    const s = newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'classic', skinTone: 1 }, 3);
    s.result = runContest(s);
    expect(showHtml(s, 9)).toContain('フェイバリット・ポーズ');
  });
  test('会場の背景が3枚そろっている', () => {
    for (const k of ['stage', 'crowd', 'podium']) expect(venueArt(k)).toMatch(new RegExp(`art/venue/${k}.webp$`));
  });
});
