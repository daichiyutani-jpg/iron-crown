// 大会当日の演出（2D）。結果は runContest で決まった後で、ここは見せ方だけ。
// 流れ：開幕 → 出場者の紹介 → 規定ポーズ7つ → 比較審査 → フリーポーズ → 6位から順に発表 → 優勝（表彰台）。
// 絵は上、文字は下に置いて重ねない。ポーズの評価は採点（runContest）の数値から作り、乱数は使わない。
import type { Part } from '../game/body';
import { CATEGORIES, CONTEST, PART_LABEL, RIVALS } from '../game/data';
import type { GameState } from '../game/rules';
import { rivalInputs, type CompetitorScore } from '../game/scoring';
import { playerArt, rivalArt, venueArt, type ArtUse } from './art';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Pose {
  name: string;
  en: string;
  view: ArtUse; // 使う絵（正面のポーズ・背面・側面）
  parts: Part[]; // このポーズで見せる部位
  fx: number; fy: number; // 寄る位置（%）
  calls: string[]; // 会場の掛け声（良い時）
}
const POSES_BASE: Pose[] = [
  { name: 'フロント・ダブルバイセップス', en: 'FRONT DOUBLE BICEPS', view: 'pose', parts: ['arms', 'shoulders'], fx: 50, fy: 22, calls: ['腕がデカい！', '肩にメロン乗ってる！', 'ナイスポーズ！'] },
  { name: 'フロント・ラットスプレッド', en: 'FRONT LAT SPREAD', view: 'pose', parts: ['back', 'chest'], fx: 50, fy: 38, calls: ['広い！', '逆三角形！', '背中が見える！'] },
  { name: 'サイド・チェスト', en: 'SIDE CHEST', view: 'sheet-side', parts: ['chest', 'arms'], fx: 50, fy: 28, calls: ['胸が分厚い！', '横から見てもデカい！', 'ナイスバルク！'] },
  { name: 'バック・ダブルバイセップス', en: 'BACK DOUBLE BICEPS', view: 'sheet-back', parts: ['back', 'arms'], fx: 50, fy: 30, calls: ['背中に鬼が宿ってる！', '背中が語ってる！', 'キレてる！'] },
  { name: 'バック・ラットスプレッド', en: 'BACK LAT SPREAD', view: 'sheet-back', parts: ['back', 'shoulders'], fx: 50, fy: 34, calls: ['羽が生えてる！', '背中の幅すごい！', '広い広い！'] },
  { name: 'サイド・トライセップス', en: 'SIDE TRICEPS', view: 'sheet-side', parts: ['arms', 'legs'], fx: 45, fy: 36, calls: ['腕が太い！', '脚も仕上がってる！', 'キレてるよ！'] },
  { name: 'アブドミナル＆サイ', en: 'ABDOMINALS & THIGH', view: 'pose', parts: ['abs', 'legs'], fx: 50, fy: 55, calls: ['腹筋板チョコ！', '脚が仕上がってる！', 'バキバキ！'] },
];
const LAST: Record<string, Pose> = {
  bodybuilding: { name: 'モスト・マスキュラー', en: 'MOST MUSCULAR', view: 'pose', parts: ['chest', 'shoulders', 'arms'], fx: 50, fy: 30, calls: ['デカすぎる！', '会場が揺れてる！', 'ナイスバルク！'] },
  classic: { name: 'フェイバリット・ポーズ', en: 'FAVORITE POSE', view: 'pose', parts: ['abs', 'chest', 'legs'], fx: 50, fy: 40, calls: ['美しい！', 'ラインが綺麗！', '彫刻みたい！'] },
};
const posesOf = (cat: string): Pose[] => [...POSES_BASE, LAST[cat] ?? LAST.bodybuilding];

const POSE_N = 8;
/** 段の番号：0 開幕、1 紹介、2〜9 規定ポーズ、10 比較審査、11 フリーポーズ、12〜17 発表（6位→1位） */
const S_POSE = 2;
const S_CMP = S_POSE + POSE_N;
const S_FREE = S_CMP + 1;
const S_REVEAL = S_FREE + 1;
/** 演出の段の数 */
export const SHOW_STEPS = S_REVEAL + 6;
/** 自動で次へ進む段（ミリ秒）。タップすればすぐ次へ */
export function showAutoMs(step: number): number {
  if (step >= S_POSE && step < S_CMP) return 3600;
  return 0;
}

function artOf(s: GameState, c: CompetitorScore, win = false): string | null {
  if (c.isPlayer) return playerArt(s, win ? 'win' : 'pose');
  const r = RIVALS.find((x) => x.name === c.name);
  return r ? rivalArt(r.id, 'contest') : null;
}

// 紹介は順位が分からないように、あなた→ライバルの登録順で並べる
const entryOrder = (rk: CompetitorScore[]) => [...rk].sort((a, b) => order(a) - order(b));
const order = (c: CompetitorScore) => (c.isPlayer ? -1 : RIVALS.findIndex((x) => x.name === c.name));

const flashes = (n = 14) => `<div class="flashes">${Array.from({ length: n }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${55 + ((i * 23) % 40)}%;animation-delay:${((i * 0.37) % 2.4).toFixed(2)}s"></i>`).join('')}</div>`;
const confetti = () => `<div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 29) % 100}%;animation-delay:${((i * 0.21) % 2.8).toFixed(2)}s;--h:${(i * 47) % 60 + 30}"></i>`).join('')}</div>`;
const bg = (key: string, extra = '') => { const u = venueArt(key); return `<div class="show-bg ${extra}">${u ? `<img src="${u}" alt="">` : ''}</div><div class="beams"></div>`; };
const pic = (u: string | null, cls = '') => (u ? `<div class="show-pic ${cls}"><img src="${u}" alt="" decoding="async"></div>` : '');

/** 小さな決まった揺らぎ（同じ段では毎回同じ値） */
const jitter = (a: number, b: number) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };

/** あるポーズでの出来（0〜100）。見せる部位の発達・ポーズの上手さ・仕上がりから */
function poseQuality(dev: Record<Part, number>, posing: number, cond: number, pose: Pose): number {
  const d = pose.parts.reduce((t, p) => t + dev[p], 0) / pose.parts.length;
  return d * 0.5 + posing * 0.25 + cond * 0.25;
}

interface PoseEval { q: number; rank: number; judges: number[]; tier: 0 | 1 | 2 | 3; word: string; call: string }
function evalPose(s: GameState, me: CompetitorScore, pose: Pose, idx: number): PoseEval {
  const q = poseQuality(s.body.dev, me.scores.posing, me.scores.conditioning, pose);
  const r = s.result!;
  const others = rivalInputs(r.category, s.season ?? 1).map((c) => {
    const sc = r.ranking.find((x) => x.name === c.name);
    return poseQuality(c.dev, sc?.scores.posing ?? c.posing, sc?.scores.conditioning ?? c.condition, pose);
  });
  const rank = 1 + others.filter((o) => o > q).length;
  const best = Math.max(...others);
  const base = 7.2 + (q - best) / 3.2;
  const judges = Array.from({ length: 5 }, (_, j) => Math.max(4, Math.min(10, Math.round((base + jitter(idx, j) * 1.2) * 2) / 2)));
  const tier = rank === 1 ? 3 : rank <= 3 ? 2 : rank <= 4 ? 1 : 0;
  const word = ['会場は静か…', 'まずまず', '大きな拍手！', '会場がどよめいた！'][tier];
  const call = tier >= 2 ? pose.calls[idx % pose.calls.length] : tier === 1 ? 'ナイスポーズ！' : 'まだいける！';
  return { q, rank, judges, tier, word, call };
}

/** 主人公の絵。背面・側面は資料画なので、照明の輪の中に置く */
function poseArt(s: GameState, pose: Pose) {
  const u = playerArt(s, pose.view);
  if (!u) return '';
  const sheet = pose.view !== 'pose';
  return `<div class="pose-stage ${sheet ? 'sheet' : ''}" style="--fx:${pose.fx}%;--fy:${pose.fy}%"><img src="${u}" alt="" decoding="async"><i class="glow"></i></div>`;
}

export function showHtml(s: GameState, step: number): string {
  const r = s.result!;
  const byPlace = [...r.ranking].sort((a, b) => a.place - b.place);
  const n = byPlace.length;
  const me = r.ranking.find((c) => c.isPlayer)!;
  const poses = posesOf(r.category);
  let body = '';
  let next = '次へ';
  if (step === 0) {
    const pre = [...r.ranking.map((c) => artOf(s, c)), artOf(s, me, true), playerArt(s, 'sheet-back'), playerArt(s, 'sheet-side'), venueArt('crowd'), venueArt('podium')];
    body = `${bg('stage', 'zoom')}${flashes()}
      <div class="show-title"><span>${esc(CATEGORIES[r.category].name)}</span><b>${esc(`第${s.season ?? 1}回 ${CONTEST.name}`)}</b><em>まもなく開幕</em></div>
      <div class="preload">${pre.filter(Boolean).map((u) => `<img src="${u}" alt="">`).join('')}</div>`;
  } else if (step === 1) {
    body = `${bg('stage', 'dim')}
      <div class="show-head">出場選手 ${n}名</div>
      <div class="lineup6">${entryOrder(r.ranking).map((c, i) => `<div class="${c.isPlayer ? 'me' : ''}" style="--d:${i * 0.18}s">${pic(artOf(s, c))}<b>${esc(c.name)}</b></div>`).join('')}</div>`;
  } else if (step < S_CMP) {
    // 規定ポーズ：名前のコール → 照明 → フラッシュ → 寄り → 掛け声 → 審査員の札
    const i = step - S_POSE;
    const pose = poses[i];
    const ev = evalPose(s, me, pose, i);
    const avg = ev.judges.reduce((a, b) => a + b, 0) / ev.judges.length;
    body = `${bg('crowd', 'dark')}<div class="spot"></div>${flashes(ev.tier >= 2 ? 22 : 10)}<div class="flashburst"></div>
      <div class="pose-call"><span>規定ポーズ ${i + 1}/${POSE_N}</span><b>${esc(pose.name)}</b><em>${pose.en}</em></div>
      ${poseArt(s, pose)}
      <div class="calls t${ev.tier}">${[ev.call, ...(ev.tier >= 2 ? [pose.calls[(i + 1) % pose.calls.length]] : []), ...(ev.tier === 3 ? ['ナイスポーズ！'] : [])].map((c, k) => `<span style="--d:${1.1 + k * 0.45}s;--x:${[8, 58, 30][k]}%;--y:${[0, 18, 34][k]}%">${esc(c)}</span>`).join('')}</div>
      <div class="pose-eval">
        <div class="pe-parts">${pose.parts.map((p) => `<span>${PART_LABEL[p]}</span>`).join('')}<b class="t${ev.tier}">${ev.word}</b></div>
        <div class="judges">${ev.judges.map((v, j) => `<div style="--d:${1.6 + j * 0.12}s"><small>${'ABCDE'[j]}</small><b>${v.toFixed(1)}</b></div>`).join('')}<em style="--d:2.3s">平均 ${avg.toFixed(1)}</em></div>
      </div>`;
  } else if (step === S_CMP) {
    // 比較審査：点の近いライバル2人と並ぶ
    const near = r.ranking.filter((c) => !c.isPlayer).sort((a, b) => Math.abs(a.total - me.total) - Math.abs(b.total - me.total)).slice(0, 2);
    const trio = [near[0], me, near[1]].filter(Boolean) as CompetitorScore[];
    body = `${bg('stage', 'dim')}${flashes(18)}
      <div class="show-head">比較審査</div>
      <div class="cmp-cap">審査員が並べて見比べる。</div>
      <div class="cmp3">${trio.map((c, k) => `<div class="${c.isPlayer ? 'me' : ''}" style="--d:${k * 0.2}s">${pic(artOf(s, c))}<b>${esc(c.name)}</b></div>`).join('')}</div>
      <div class="cmp-swap">${['正面を向いて', 'クォーターターン 右', '背中を向けて', 'もう一度 正面'].map((t, k) => `<span style="--d:${0.6 + k * 0.9}s">${t}</span>`).join('')}</div>`;
  } else if (step === S_FREE) {
    // フリーポーズ：音楽に合わせて自分の見せ方
    const tier = me.scores.posing >= 75 ? 2 : me.scores.posing >= 55 ? 1 : 0;
    const views: ArtUse[] = ['pose', 'sheet-side', 'sheet-back', 'pose'];
    body = `${bg('crowd', 'dark')}<div class="disco"></div>${flashes(24)}
      <div class="pose-call free"><span>フリーポーズ</span><b>音楽に合わせて60秒</b><em>FREE POSING ROUTINE</em></div>
      <div class="free-stage">${views.map((v, k) => { const u = playerArt(s, v); return u ? `<div class="fr ${v === 'pose' ? '' : 'sheet'}" style="--d:${k * 1.1}s"><img src="${u}" alt=""></div>` : ''; }).join('')}</div>
      <div class="notes">${Array.from({ length: 8 }, (_, k) => `<i style="left:${8 + k * 12}%;animation-delay:${(k * 0.35).toFixed(2)}s">♪</i>`).join('')}</div>
      <div class="show-cap"><span>ポーズの点 ${me.scores.posing.toFixed(0)}</span><b>${['ぎこちないが、全力で', '流れるようにポーズをつなぐ', '会場が総立ち！ 拍手が鳴りやまない'][tier]}</b></div>`;
  } else {
    const k = Math.min(step - S_REVEAL, n - 1); // 0 → 最下位
    const cur = byPlace[n - 1 - k];
    const winner = cur.place === 1;
    const shown = byPlace.slice(n - 1 - k);
    body = `${bg(winner ? 'podium' : 'crowd', winner ? '' : 'dim')}${winner ? confetti() : flashes()}
      ${pic(artOf(s, cur, winner && cur.isPlayer), winner ? 'winner' : 'reveal')}
      <div class="show-place ${cur.isPlayer ? 'me' : ''} ${winner ? 'gold' : ''}" key="${step}"><b>${cur.place}<small>位</small></b><span>${esc(cur.name)}${cur.isPlayer ? '（あなた）' : ''}</span><em>${cur.total.toFixed(1)}点</em></div>
      <ol class="show-rank">${shown.map((c) => `<li class="${c.isPlayer ? 'me' : ''} ${c === cur ? 'new' : ''}"><i>${c.place}</i><span>${esc(c.name)}</span><b>${c.total.toFixed(1)}</b></li>`).join('')}</ol>`;
    if (winner) next = '結果の詳細へ';
  }
  const auto = showAutoMs(step);
  return `<div class="show step-${step} ${step === SHOW_STEPS - 1 ? 'last' : ''}" data-act="show-next" ${auto ? `data-auto="${auto}"` : ''}>${body}
    ${auto ? `<div class="autobar" style="--ms:${auto}ms"></div>` : ''}
    <div class="show-ui"><button class="ghost sm" data-act="show-skip">スキップ</button><button class="primary" data-act="show-next">${next}</button></div></div>`;
}

