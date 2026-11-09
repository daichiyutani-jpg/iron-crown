// 大会当日の演出（2D）。結果は runContest で決まった後で、ここは見せ方だけ。
// 流れ：開幕 → 出場者の紹介 → 審査 → 6位から順に発表 → 優勝（表彰台）。絵は上、順位は下に置いて重ねない。
import { CATEGORIES, CONTEST, RIVALS } from '../game/data';
import type { GameState } from '../game/rules';
import type { CompetitorScore } from '../game/scoring';
import { playerArt, rivalArt, venueArt } from './art';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 演出の段の数（開幕・紹介・審査・発表6回） */
export const SHOW_STEPS = 9;

function artOf(s: GameState, c: CompetitorScore, win = false): string | null {
  if (c.isPlayer) return playerArt(s, win ? 'win' : 'pose');
  const r = RIVALS.find((x) => x.name === c.name);
  return r ? rivalArt(r.id, 'contest') : null;
}

// 紹介は順位が分からないように、あなた→ライバルの登録順で並べる
const entryOrder = (rk: CompetitorScore[]) => [...rk].sort((a, b) => order(a) - order(b));
const order = (c: CompetitorScore) => (c.isPlayer ? -1 : RIVALS.findIndex((x) => x.name === c.name));

const flashes = () => `<div class="flashes">${Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 37) % 100}%;top:${55 + ((i * 23) % 40)}%;animation-delay:${((i * 0.37) % 2.4).toFixed(2)}s"></i>`).join('')}</div>`;
const confetti = () => `<div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 29) % 100}%;animation-delay:${((i * 0.21) % 2.8).toFixed(2)}s;--h:${(i * 47) % 60 + 30}"></i>`).join('')}</div>`;
const bg = (key: string, extra = '') => { const u = venueArt(key); return `<div class="show-bg ${extra}">${u ? `<img src="${u}" alt="">` : ''}</div><div class="beams"></div>`; };
const pic = (u: string | null, cls = '') => (u ? `<div class="show-pic ${cls}"><img src="${u}" alt="" decoding="async"></div>` : '');

export function showHtml(s: GameState, step: number): string {
  const r = s.result!;
  const byPlace = [...r.ranking].sort((a, b) => a.place - b.place);
  const n = byPlace.length;
  let body = '';
  let next = '次へ';
  if (step === 0) {
    body = `${bg('stage', 'zoom')}${flashes()}
      <div class="show-title"><span>${esc(CATEGORIES[r.category].name)}</span><b>${esc(CONTEST.name)}</b><em>まもなく開幕</em></div>
      <div class="preload">${[...r.ranking.map((c) => artOf(s, c)), artOf(s, r.ranking.find((c) => c.isPlayer)!, true), venueArt('crowd'), venueArt('podium')].filter(Boolean).map((u) => `<img src="${u}" alt="">`).join('')}</div>`;
  } else if (step === 1) {
    body = `${bg('stage', 'dim')}
      <div class="show-head">出場選手 ${n}名</div>
      <div class="lineup6">${entryOrder(r.ranking).map((c, i) => `<div class="${c.isPlayer ? 'me' : ''}" style="--d:${i * 0.18}s">${pic(artOf(s, c))}<b>${esc(c.name)}</b></div>`).join('')}</div>`;
  } else if (step === 2) {
    const me = r.ranking.find((c) => c.isPlayer)!;
    body = `${bg('crowd', 'dim')}${flashes()}
      ${pic(artOf(s, me), 'hero-pose')}
      <div class="show-cap"><span>審査中</span><b>${esc(me.name)}</b><em>ステージの照明の下、すべてを出し切る──</em></div>`;
  } else {
    const k = Math.min(step - 3, n - 1); // 0 → 最下位
    const cur = byPlace[n - 1 - k];
    const winner = cur.place === 1;
    const shown = byPlace.slice(n - 1 - k);
    body = `${bg(winner ? 'podium' : 'crowd', winner ? '' : 'dim')}${winner ? confetti() : flashes()}
      ${pic(artOf(s, cur, winner && cur.isPlayer), winner ? 'winner' : 'reveal')}
      <div class="show-place ${cur.isPlayer ? 'me' : ''} ${winner ? 'gold' : ''}" key="${step}"><b>${cur.place}<small>位</small></b><span>${esc(cur.name)}${cur.isPlayer ? '（あなた）' : ''}</span><em>${cur.total.toFixed(1)}点</em></div>
      <ol class="show-rank">${shown.map((c) => `<li class="${c.isPlayer ? 'me' : ''} ${c === cur ? 'new' : ''}"><i>${c.place}</i><span>${esc(c.name)}</span><b>${c.total.toFixed(1)}</b></li>`).join('')}</ol>`;
    if (winner) next = '結果の詳細へ';
  }
  return `<div class="show step-${step}" data-act="show-next">${body}
    <div class="show-ui"><button class="ghost sm" data-act="show-skip">スキップ</button><button class="primary" data-act="show-next">${next}</button></div></div>`;
}
