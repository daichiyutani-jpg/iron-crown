import { describe, expect, it } from 'vitest';
import { _songs } from '../src/ui/bgm';

describe('BGM の曲データ', () => {
  it('5曲あり、どの譜面も16分音符16個で、使う音は和音の範囲', () => {
    expect(Object.keys(_songs).sort()).toEqual(['contest', 'home', 'lose', 'title', 'win']);
    for (const s of Object.values(_songs)) {
      expect(s.bpm).toBeGreaterThan(40);
      expect(s.chords.length).toBeGreaterThan(0);
      for (const d of s.drums) expect(d).toMatch(/^[ksh.]{16}$/);
      expect(s.bass).toMatch(/^[0-4-]{16}$/);
      expect(s.chords.length % s.lead.length).toBe(0);
      for (const l of s.lead) expect(l).toMatch(/^[0-7-]{16}$/);
    }
  });
});
