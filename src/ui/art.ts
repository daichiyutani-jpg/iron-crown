// 2D イラスト（会話・育成結果・大会演出用）。体型の変化そのものは 3D が担い、ここは段階ごとの絵を選ぶだけ。
// 置き場と命名は docs/ART_DIRECTION.md §6。
import { PARTS } from '../body/anatomy';
import { bodyStats, type GameState } from '../game/rules';
import { COACH_ART, HERO_ART, RIVAL_ART, VENUE_ART } from './artList';

export type Stage = 'early' | 'mid' | 'contest';
export type ArtUse = 'portrait' | 'training' | 'contest' | 'win' | 'sheet-front' | 'sheet-back' | 'sheet-side';

export const STAGE_LABEL: Record<Stage, string> = { early: '初期', mid: '中期', contest: '大会レベル' };

/**
 * 見た目の段階。12週で発達度の平均は 45→51 前後しか動かないので、絞り（体脂肪率）を主に使う。
 * 大会レベル: 体脂肪率 8% 以下／中期: 11% 以下か発達度の平均 48 以上／それ以外は初期。
 */
export function heroStage(s: GameState): Stage {
  const avg = PARTS.reduce((a, p) => a + s.body.dev[p], 0) / PARTS.length;
  const bf = bodyStats(s).bf;
  if (bf <= 8 && avg >= 44) return 'contest';
  if (bf <= 11 || avg >= 48) return 'mid';
  return 'early';
}

const ORDER: Stage[] = ['early', 'mid', 'contest'];

/** 絵の URL。その段階に無ければ近い段階の絵を使う。どこにも無ければ null */
export function heroArt(stage: Stage, use: ArtUse): string | null {
  const i = ORDER.indexOf(stage);
  const tries = [stage, ORDER[i - 1], ORDER[i + 1], ORDER[i - 2], ORDER[i + 2]].filter(Boolean) as Stage[];
  for (const st of tries) {
    const key = `${st}-${use}`;
    if (HERO_ART.includes(key)) return `${import.meta.env.BASE_URL}art/hero/${key}.webp`;
  }
  return null;
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
