// 2D イラスト。主人公は顔3種×成長5段階、ライバル・トレーナー・会場の絵もここで選ぶ。
// 置き場と命名は docs/ART_DIRECTION.md §6。
import { PARTS } from '../game/body';
import { bodyStats, type Face, type GameState } from '../game/rules';
import { COACH_ART, HERO_ART, RIVAL_ART, VENUE_ART } from './artList';

export type Stage = 1 | 2 | 3 | 4 | 5;
export type ArtUse = 'portrait' | 'training' | 'pose' | 'win' | 'sheet-front' | 'sheet-back' | 'sheet-side';
export type { Face };

export const STAGE_LABEL: Record<Stage, string> = { 1: '初心者', 2: '鍛え始め', 3: '中級', 4: '仕上げ前', 5: '大会レベル' };
export const STAGES: Stage[] = [1, 2, 3, 4, 5];

/** 仕上がりの点数: 筋肉の発達（平均）と絞り（体脂肪率）。始めはおよそ4〜5、よく仕上げると14〜15 */
export function shapeScore(s: GameState): number {
  const avg = PARTS.reduce((a, p) => a + s.body.dev[p], 0) / PARTS.length;
  const bf = bodyStats(s).bf;
  return (avg - 42) * 1.1 + (14 - bf) * 1.15;
}

/** 見た目の段階（1〜5）。筋肉が増えるか絞れるほど上がる */
export function heroStage(s: GameState): Stage {
  const v = shapeScore(s);
  return v >= 13.5 ? 5 : v >= 11 ? 4 : v >= 8.5 ? 3 : v >= 6 ? 2 : 1;
}

/** 絵の URL。その段階に無ければ近い段階の絵を使う。どこにも無ければ null */
export function heroArt(face: Face, stage: Stage, use: ArtUse): string | null {
  const order = [...STAGES].sort((x, y) => Math.abs(x - stage) - Math.abs(y - stage) || y - x);
  for (const st of order) {
    const key = `${face}-s${st}-${use}`;
    if (HERO_ART.includes(key)) return `${import.meta.env.BASE_URL}art/hero/${key}.webp`;
  }
  return face === 'a' ? null : heroArt('a', stage, use);
}

/** 選手の今の段階の絵 */
export function playerArt(s: GameState, use: ArtUse, stage = heroStage(s)): string | null {
  return heroArt(s.player.face ?? 'a', stage, use);
}

export type RivalUse = 'portrait' | 'contest' | 'sheet-front' | 'sheet-back' | 'sheet-side';

/** ライバルの絵の URL（public/art/rivals/<id>-<用途>.webp）。無ければ null */
export function rivalArt(id: string, use: RivalUse): string | null {
  const key = `${id}-${use}`;
  return RIVAL_ART.includes(key) ? `${import.meta.env.BASE_URL}art/rivals/${key}.webp` : null;
}

/** トレーナーの絵（public/art/coach/<表情 or sheet-…>.webp）。無ければ null */
export function coachArt(key: string): string | null {
  return COACH_ART.includes(key) ? `${import.meta.env.BASE_URL}art/coach/${key}.webp` : null;
}

/** 大会会場の背景（public/art/venue/<stage|crowd|podium>.webp）。無ければ null */
export function venueArt(key: string): string | null {
  return VENUE_ART.includes(key) ? `${import.meta.env.BASE_URL}art/venue/${key}.webp` : null;
}
