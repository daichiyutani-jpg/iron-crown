// トレーナー（神崎 真琴）の会話。状態から「表情」と「せりふ」を選ぶだけで、ゲームの数値は変えない。
import { PARTS } from '../body/anatomy';
import { PART_LABEL, WEEKS } from './data';
import { bodyStats, type GameState } from './rules';

export const COACH_NAME = '神崎 真琴';
export const COACH_ROLE = 'トレーナー・元フィジーク選手';

/** 表情（絵は public/art/coach/<表情>.webp） */
export type Mood = 'serious' | 'encourage' | 'surprised' | 'frustrated' | 'achievement' | 'nervous' | 'joy';
export const MOODS: Mood[] = ['serious', 'encourage', 'surprised', 'frustrated', 'achievement', 'nervous', 'joy'];

export interface CoachLine { mood: Mood; text: string }

/** 新しい選手を作った直後 */
export function introLines(s: GameState): CoachLine[] {
  return [
    { mood: 'serious', text: `今日からあなたを担当する${COACH_NAME}。大会まで${WEEKS}週、体は嘘をつかない。` },
    { mood: 'encourage', text: `${s.player.name}、まずは食事と練習の計画から。毎週の結果は私が一緒に見る。` },
  ];
}

/** 週の結果を見た時 */
export function weekLine(s: GameState): CoachLine {
  const r = s.lastReport;
  if (!r) return introLines(s)[1];
  const left = WEEKS - r.week;
  const gain = PARTS.reduce((a, p) => a + Math.max(0, r.devDelta[p]), 0);
  const best = [...PARTS].sort((a, b) => r.devDelta[b] - r.devDelta[a])[0];
  const dBf = r.bfAfter - r.bfBefore;
  if (r.injury) return { mood: 'surprised', text: `ケガ…！？ ${r.injury}。無理に追い込まないで、治るまで別の部位を鍛えよう。` };
  if (s.body.fatigue >= 75) return { mood: 'frustrated', text: '疲れが抜けていない。休むのも練習のうち。来週は量を落とそう。' };
  if (left <= 0) return { mood: 'nervous', text: 'いよいよ大会当日。やれることはやった。最後の準備を確かめよう。' };
  if (left <= 2) return { mood: 'nervous', text: `大会まであと${left}週。ここからは絞りと色の仕上げが勝負。` };
  const pick = (t: string[]) => t[r.week % t.length];
  if (gain >= 1.2) return { mood: 'achievement', text: pick([
    `いい伸びだ。特に${PART_LABEL[best]}が育ってきた。この調子。`,
    `${PART_LABEL[best]}の張りが先週と違う。計画が噛み合ってきたね。`,
    `数字にちゃんと出ている。${PART_LABEL[best]}が一番伸びた週だ。`,
  ]) };
  if (left <= 5 && dBf > 0.05) return { mood: 'serious', text: `残り${left}週で体脂肪が増えている。食事を見直そう。` };
  if (gain < 0.15) return { mood: 'serious', text: '今週はほとんど伸びていない。刺激か食事か、どこかが足りない。' };
  return { mood: 'encourage', text: pick([
    `少しずつ前に進んでいる。${PART_LABEL[best]}の反応がいい。積み重ねよう。`,
    `派手さはないけど、確実に前進している。焦らず続けよう。`,
    `${PART_LABEL[best]}は順調。弱い部位にも少しずつ手を回していこう。`,
  ]) };
}

/** 出場確認の時 */
export function contestLine(s: GameState): CoachLine {
  return { mood: 'nervous', text: `体脂肪率 ${bodyStats(s).bf.toFixed(1)}%。…私まで緊張してきた。胸を張って行こう。` };
}

/** 大会の結果 */
export function resultLine(s: GameState): CoachLine {
  const r = s.result;
  if (!r) return contestLine(s);
  if (r.playerPlace === 1) return { mood: 'joy', text: 'やった…！ 優勝だ！ 12週間、本当によく頑張った！' };
  if (r.playerPlace <= 3) return { mood: 'achievement', text: `${r.playerPlace}位、入賞！ 初めての舞台でここまで来られたのは本物だ。` };
  return { mood: 'frustrated', text: `${r.playerPlace}位…悔しいね。でも差ははっきりした。次は必ず勝とう。` };
}
