import { describe, expect, test } from 'vitest';
import { PARTS } from '../src/game/body';
import { contestLine, introLines, MOODS, resultLine, weekLine } from '../src/game/coach';
import { newGame, type WeekReport } from '../src/game/rules';
import { coachArt } from '../src/ui/art';

const game = () => newGame({ name: 'テスト', heightCm: 175, frame: 'meso', category: 'bodybuilding', skinTone: 1 }, 1);
const report = (week: number, gain: number, injury: string | null = null): WeekReport => ({
  week, lines: [], weightBefore: 75, weightAfter: 75, bfBefore: 13, bfAfter: 13,
  devDelta: Object.fromEntries(PARTS.map((p) => [p, gain / PARTS.length])) as WeekReport['devDelta'], moneyDelta: 0, injury,
});

describe('トレーナーの会話', () => {
  test('始めの会話は2つで、名前が入る', () => {
    const l = introLines(game());
    expect(l).toHaveLength(2);
    expect(l[1].text).toContain('テスト');
  });
  test('週の結果で表情が変わる', () => {
    const s = game();
    s.lastReport = report(3, 1.5); expect(weekLine(s).mood).toBe('achievement');
    s.lastReport = report(3, 0.05); expect(weekLine(s).mood).toBe('serious');
    s.lastReport = report(3, 0.9); expect(weekLine(s).mood).toBe('encourage');
    s.lastReport = report(3, 0.2, '肩を痛めた'); expect(weekLine(s).mood).toBe('surprised');
    s.lastReport = report(11, 0.2); expect(weekLine(s).mood).toBe('nervous');
    s.lastReport = report(3, 0.2); s.body.fatigue = 90; expect(weekLine(s).mood).toBe('frustrated');
  });
  test('大会の前は緊張、結果で喜び・達成・悔しさ', () => {
    const s = game();
    expect(contestLine(s).mood).toBe('nervous');
    const res = (place: number) => ({ category: 'bodybuilding', ranking: [], playerPlace: place, prize: 0, good: [], improve: [], notes: [], compareWith: '' }) as never;
    s.result = res(1); expect(resultLine(s).mood).toBe('joy');
    s.result = res(3); expect(resultLine(s).mood).toBe('achievement');
    s.result = res(5); expect(resultLine(s).mood).toBe('frustrated');
  });
  test('7つの表情と3方向の資料の絵がそろっている', () => {
    for (const m of [...MOODS, 'sheet-front', 'sheet-back', 'sheet-side']) expect(coachArt(m)).toMatch(new RegExp(`art/coach/${m}.webp$`));
  });
});
