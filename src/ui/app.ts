// 画面とナビゲーション。状態は store.ts、計算は rules.ts / scoring.ts に集約し、ここは表示と操作だけを担う。
import { PARTS, type BodyParams, type Frame, type Part } from '../body/anatomy';
import { POSES, POSE_ORDER, type PoseId } from '../body/poses';
import { getViewer, type Look } from '../body/viewer';
import {
  CALORIE_PLANS, CATEGORIES, CONTEST, DESIGN_LABEL, EQUIP_LABEL, EXERCISES, GRADE_LABEL, ITEMS, MACRO_PLANS, MATERIAL_LABEL,
  PART_LABEL, RIVALS, SCORE_LABEL, SLOTS, TRUNKS, VOLUME, WEEKS,
  type CaloriePlan, type Category, type MacroPlan, type ScoreKey, type Volume,
} from '../game/data';
import {
  actionLabel, actionStamina, advanceWeek, bodyStats, buyItem, buyTrunks, canAddAction, canUseExercise, categoryOf, newGame,
  nutrition, planStamina, projectGrowth, stageFinish, staminaMax, stimulusByPart, useItem, type Action, type GameState,
} from '../game/rules';
import { runContest, trunksLook, trunksViolation } from '../game/scoring';
import { getState, hasSave, mutate, setState, subscribe } from '../game/store';
import { COACH_NAME, COACH_ROLE, contestLine, introLines, resultLine, weekLine, type CoachLine } from '../game/coach';
import { SHOW_STEPS, showHtml } from './show';
import { coachArt, heroArt, heroStage, rivalArt, STAGE_LABEL, type ArtUse, type RivalUse, type Stage } from './art';

type Route = 'title' | 'create' | 'player' | 'training' | 'diet' | 'shop' | 'fitting' | 'contest' | 'result';
const ui = {
  route: 'title' as Route,
  pose: 'relaxed' as PoseId,
  part: 'chest' as Part,
  vol: {} as Record<string, Volume>,
  shopTab: 'tan' as 'tan' | 'trunks' | 'cond',
  preview: null as string | null,
  colorPick: {} as Record<string, string>,
  modal: null as null | 'report' | 'restart' | 'contest' | 'rival' | 'intro' | 'coach',
  rival: '',
  introStep: 0,
  show: -1, // 大会演出の段（-1 = 出していない）
  create: { name: '', heightCm: 175, frame: 'meso' as Frame, category: 'bodybuilding' as Category, skinTone: 1 },
};

const root = document.getElementById('app')!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const fx = (n: number, d = 1) => n.toFixed(d);
const sgn = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;
const bar = (v: number, max = 100, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></div>`;

// 2D イラストの枠（絵が無い時は何も出さない）
function artFrame(stage: Stage, use: ArtUse, cls: string, overlay = '') {
  const url = heroArt(stage, use);
  if (!url) return overlay ? `<div class="art ${cls} noimg">${overlay}</div>` : '';
  return `<div class="art ${cls}"><img src="${url}" alt="" decoding="async">${overlay}</div>`;
}

// ライバルの顔（小さい丸）と、ライバルを並べた帯
const rivalByName = (n: string) => RIVALS.find((r) => r.name === n);
function rivalFace(id: string, cls = 'rf') {
  const url = rivalArt(id, 'portrait');
  return url ? `<img class="${cls}" src="${url}" alt="" decoding="async">` : '';
}
function rivalStrip() {
  return `<div class="rv-strip">${RIVALS.map((r) => `<button class="rv" data-act="rival" data-v="${r.id}">${rivalArt(r.id, 'portrait') ? `<div class="art rv-art">${rivalFace(r.id, '')}</div>` : ''}<b>${r.name.split(' ')[0]}</b><span>${r.age}歳</span></button>`).join('')}</div>`;
}

// トレーナーのせりふ（顔＋名前＋文）。tap=true ならタップで詳細を開く
function coachBox(l: CoachLine, tap = false) {
  const url = coachArt(l.mood);
  return `<div class="coach mood-${l.mood}"${tap ? ' data-act="coach"' : ''}>${url ? `<div class="art co-face"><img src="${url}" alt="" decoding="async"></div>` : ''}<div class="co-say"><b>${COACH_NAME}</b><p>${esc(l.text)}</p></div></div>`;
}

let toastTimer = 0;
function toast(msg: string, bad = false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = bad ? 'show bad' : 'show';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t!.className = ''), 2200);
}

// ---- 3D 表示の連携 ----
function bodyParams(s: GameState, pose: PoseId): BodyParams {
  const st = bodyStats(s);
  const fin = s.phase === 'season' ? null : stageFinish(s);
  return {
    heightCm: s.player.heightCm, frame: s.player.frame, dev: s.body.dev, bodyFat: st.bf,
    imbalance: s.body.imbalance, fullness: fin ? fin.fullness : s.body.fullness, pose,
  };
}
function lookOf(s: GameState, trunksKey?: string): Look {
  const fin = s.phase === 'season' ? null : stageFinish(s);
  return {
    skinTone: s.player.skinTone,
    tan: fin ? fin.level : s.tan.level,
    uneven: fin ? fin.uneven : s.tan.uneven,
    orange: fin ? fin.orange : s.tan.orange,
    shine: fin ? fin.shine : 0.12,
    trunks: trunksLook(trunksKey ?? s.trunksEquipped),
  };
}
function mountViewer(s: GameState, trunksKey?: string) {
  const host = document.getElementById('viewer');
  if (!host) return;
  const v = getViewer();
  v.attach(host);
  v.setLook(lookOf(s, trunksKey));
  void v.setBody(bodyParams(s, ui.pose));
  // 次に選ばれやすいポーズを先読み
  const i = POSE_ORDER.indexOf(ui.pose);
  v.prefetch(bodyParams(s, POSE_ORDER[(i + 1) % POSE_ORDER.length]));
}
function viewerBlock(extra = '') {
  return `<div class="viewer-wrap">
    <div id="viewer" class="viewer"></div>
    <div class="pose-row">${POSE_ORDER.map((p) => `<button class="chip ${ui.pose === p ? 'on' : ''}" data-act="pose" data-v="${p}">${POSES[p].label}</button>`).join('')}</div>
    <div class="view-btns">
      <button class="icon" data-act="frame" data-v="full" title="全身">全身</button>
      <button class="icon" data-act="frame" data-v="upper" title="上半身">上半身</button>
      <button class="icon" data-act="frame" data-v="lower" title="脚">脚</button>
    </div>
    ${extra}
  </div>`;
}

// ---- 共通の枠 ----
function header(s: GameState) {
  const left = Math.max(0, WEEKS - s.week + 1);
  const wk = s.phase === 'season' ? `第${s.week}週 <small>/ ${WEEKS}</small>` : s.phase === 'contestDay' ? '大会前日' : '大会終了';
  const sub = s.phase === 'season' ? `大会まで残り${left}週` : CATEGORIES[s.player.category].name;
  return `<header class="top">
    <div class="brand">IRON<span>CROWN</span></div>
    <div class="hstat"><b>${wk}</b><span>${sub}</span></div>
    <div class="hstat"><b>${yen(s.money)}</b><span>所持金</span></div>
    <div class="hstat fat"><b>${fx(s.body.fatigue, 0)}</b><span>疲労</span>${bar(s.body.fatigue, 100, s.body.fatigue > 65 ? 'warn' : '')}</div>
  </header>`;
}
const NAV: [Route, string, string][] = [
  ['player', '選手', 'M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-6 16c0-4 2.7-7 6-7s6 3 6 7z'],
  ['training', '練習', 'M3 10h2v4H3zm16 0h2v4h-2zM6 8h2v8H6zm10 0h2v8h-2zM8 11h8v2H8z'],
  ['diet', '食事', 'M7 3v8a2 2 0 0 0 2 2v8h2v-8a2 2 0 0 0 2-2V3h-1.5v6h-1V3h-1v6h-1V3zm9 0c-1.7 0-3 2-3 5v5h2v8h2V3z'],
  ['shop', 'ショップ', 'M6 7h12l-1 13H7zm3 0a3 3 0 0 1 6 0'],
  ['fitting', '日焼け・衣装', 'M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8z'],
  ['contest', '大会', 'M7 4h10v4a5 5 0 0 1-10 0zm5 9v4m-4 3h8M5 5H3v2a3 3 0 0 0 3 3m13-5h2v2a3 3 0 0 1-3 3'],
];
function nav() {
  return `<nav class="bottom">${NAV.map(([r, label, d]) => `<button data-act="go" data-v="${r}" class="${ui.route === r ? 'on' : ''}">
    <svg viewBox="0 0 24 24"><path d="${d}"/></svg><span>${label}</span></button>`).join('')}</nav>`;
}
function advanceButton(s: GameState) {
  if (s.phase === 'season') {
    return `<button class="primary big" data-act="advance">第${s.week}週を終える（週を進める）</button>`;
  }
  if (s.phase === 'contestDay') return `<button class="primary big" data-act="go" data-v="contest">大会の最終準備へ</button>`;
  return `<button class="primary big" data-act="go" data-v="result">大会結果を見る</button>`;
}

// ---- タイトル・選手作成 ----
function titleScreen() {
  const save = hasSave();
  const s = getState();
  const art = heroArt('contest', 'contest');
  return `<div class="title">
    ${art ? `<div class="title-art"><img src="${art}" alt=""></div>` : ''}
    <div class="title-mark">
      <div class="crown">◆</div>
      <h1>IRON<span>CROWN</span></h1>
      <p>ボディビル大会 育成シミュレーション</p>
    </div>
    <div class="title-btns">
      ${save && s ? `<button class="primary big" data-act="continue">続きから<small>${esc(s.player.name)}・${s.phase === 'season' ? `第${s.week}週` : s.phase === 'contestDay' ? '大会前日' : '大会終了'}</small></button>` : ''}
      <button class="${save ? 'ghost' : 'primary'} big" data-act="new">新しい選手で始める</button>
    </div>
    <p class="fine">12週間で体を作り、${esc(CONTEST.name)}で優勝を目指す。<br>セーブデータはこの端末のブラウザ内にだけ保存されます。</p>
  </div>`;
}
const FRAME_INFO: Record<Frame, [string, string]> = {
  ecto: ['細身型（エクトモルフ）', '骨格が細く手足が長い。脂肪が付きにくいが筋肉も付きにくい。クラシック向き。'],
  meso: ['標準型（メソモルフ）', '肩幅が広く、筋肉が付きやすい標準的な体格。'],
  endo: ['骨太型（エンドモルフ）', '骨格が太く筋量を得やすいが、脂肪も付きやすい。ボディビル向き。'],
};
function createScreen() {
  const c = ui.create;
  return `<div class="page create">
    <h2>選手の登録</h2>
    <label class="field">選手名<input id="pname" maxlength="12" value="${esc(c.name)}" placeholder="例：鷹野 蓮"></label>
    <div class="field">身長
      <div class="seg">${[165, 170, 175, 180, 185].map((h) => `<button class="${c.heightCm === h ? 'on' : ''}" data-act="c-height" data-v="${h}">${h}cm</button>`).join('')}</div>
    </div>
    <div class="field">体格タイプ
      ${(['ecto', 'meso', 'endo'] as Frame[]).map((f) => `<button class="card-opt ${c.frame === f ? 'on' : ''}" data-act="c-frame" data-v="${f}"><b>${FRAME_INFO[f][0]}</b><span>${FRAME_INFO[f][1]}</span></button>`).join('')}
    </div>
    <div class="field">出場カテゴリー
      ${(['bodybuilding', 'classic'] as Category[]).map((k) => {
        const r = CATEGORIES[k];
        return `<button class="card-opt ${c.category === k ? 'on' : ''}" data-act="c-cat" data-v="${k}"><b>${r.name}</b><span>${r.desc}${r.weightCap ? `（${c.heightCm}cm の上限 ${r.weightCap(c.heightCm)}kg）` : ''}／衣装：${r.cut === 'classic' ? 'クラシックカット' : '標準カット'}</span></button>`;
      }).join('')}
    </div>
    <div class="field">肌の色（地の色）
      <div class="seg skin">${['#e8bfa0', '#cf9a76', '#9c6a4a'].map((col, i) => `<button class="${c.skinTone === i ? 'on' : ''}" data-act="c-skin" data-v="${i}"><i style="background:${col}"></i>${['明るめ', '標準', '濃いめ'][i]}</button>`).join('')}</div>
    </div>
    <button class="primary big" data-act="start">この選手で始める</button>
    <button class="ghost" data-act="go-title">戻る</button>
  </div>`;
}

// ---- 選手情報 ----
function sparkline(s: GameState, key: 'weight' | 'bf', color: string) {
  const pts = s.history.map((h) => h[key]);
  if (pts.length < 2) return '<div class="spark-empty">週を進めると推移が表示されます</div>';
  const min = Math.min(...pts), max = Math.max(...pts);
  const W = 300, H = 70, pad = 6;
  const xy = pts.map((v, i) => [pad + (i / (WEEKS)) * (W - pad * 2), H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2)]);
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>${xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${color}"/>`).join('')}</svg>
  <div class="spark-lab"><span>${fx(pts[0])}</span><span>${fx(pts[pts.length - 1])}${key === 'bf' ? '%' : 'kg'}</span></div>`;
}
function playerScreen(s: GameState) {
  const st = bodyStats(s);
  const b = s.body;
  const cat = categoryOf(s);
  const cap = cat.weightCap?.(s.player.heightCm);
  const frameName = FRAME_INFO[s.player.frame][0];
  return `${viewerBlock()}
  <div class="page">
    <div class="pcard">
      ${artFrame(heroStage(s), 'portrait', 'pc-art')}
      <div class="pc-info">
        <div class="name-row"><h2>${esc(s.player.name)}</h2><span class="tag">${cat.name}</span></div>
        <p class="meta">${s.player.heightCm}cm・${frameName}</p>
        <p class="stage">育成段階 <b>${STAGE_LABEL[heroStage(s)]}</b></p>
      </div>
    </div>
    ${coachBox(weekLine(s), true)}
    <details class="sheets"><summary>体の資料（正面・背面・側面）</summary>
      <div>${(['sheet-front', 'sheet-back', 'sheet-side'] as ArtUse[]).map((u) => { const url = heroArt(heroStage(s), u); return url ? `<img src="${url}" alt="" loading="lazy">` : ''; }).join('')}</div>
    </details>
    <h3>ライバル <small>タップで詳しく</small></h3>
    ${rivalStrip()}
    <div class="stats4">
      <div><span>体重</span><b>${fx(st.weight)}<small>kg</small></b>${cap ? `<em class="${st.weight > cap ? 'bad' : ''}">上限 ${cap}kg</em>` : ''}</div>
      <div><span>体脂肪率</span><b>${fx(st.bf)}<small>%</small></b></div>
      <div><span>除脂肪量</span><b>${fx(st.lean)}<small>kg</small></b></div>
      <div><span>コンディション</span><b>${fx(b.condition, 0)}</b></div>
    </div>
    ${b.injury ? `<div class="alert">負傷中：${PART_LABEL[b.injury.part]}（あと${b.injury.weeks}週）</div>` : ''}
    <h3>部位別の発達</h3>
    <div class="parts">${PARTS.map((p) => `<div class="prow"><span>${PART_LABEL[p]}</span>${bar(b.dev[p])}<b>${fx(b.dev[p])}</b></div>`).join('')}</div>
    <div class="kv"><span>左右差</span><b>${fx(Math.abs(b.imbalance))}%（${b.imbalance >= 0 ? '左' : '右'}側が大きい）</b></div>
    <div class="kv"><span>筋肉の張り</span><b>${fx(b.fullness * 100, 0)}%</b></div>
    <div class="kv"><span>ポージング完成度</span><b>${fx(b.posing, 0)}</b></div>
    <div class="kv"><span>肌の色の濃さ／色ムラ</span><b>${fx(s.tan.level, 0)}／${fx(s.tan.uneven, 0)}</b></div>
    <h3>体重の推移</h3>${sparkline(s, 'weight', '#d8d8dc')}
    <h3>体脂肪率の推移</h3>${sparkline(s, 'bf', '#c9a54a')}
    ${s.lastReport ? `<h3>先週の結果</h3><ul class="report">${s.lastReport.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    ${advanceButton(s)}
  </div>`;
}

// ---- トレーニング ----
function trainingScreen(s: GameState) {
  const used = planStamina(s.plan);
  const max = staminaMax(s);
  const proj = projectGrowth(s);
  const stim = stimulusByPart(s.plan);
  const exs = EXERCISES.filter((e) => e.part === ui.part);
  return `<div class="page">
    <h2>トレーニング計画 <small>第${s.week}週</small></h2>
    <div class="budget">
      <div><span>行動枠</span><b>${s.plan.length}/${SLOTS}</b></div>
      <div class="grow"><span>体力 ${used}/${max}</span>${bar(used, max, used > max * 0.9 ? 'warn' : 'gold')}</div>
    </div>
    <ol class="plan">${s.plan.map((a, i) => `<li><span>${esc(actionLabel(a))}</span><em>体力${actionStamina(a)}</em><button class="x" data-act="rm" data-v="${i}" aria-label="削除">×</button></li>`).join('')}
      ${Array.from({ length: SLOTS - s.plan.length }, () => '<li class="empty">（空き）</li>').join('')}</ol>
    <div class="other-actions">
      ${([['posing', 'ポージング練習', '完成度↑ 体力10'], ['cardio', '有酸素運動', '消費+320kcal 体力12'], ['rest', '完全休養', '疲労回復↑ 体力0'], ['work', '追加シフト', '+¥12,000 体力16']] as const)
        .map(([k, l, d]) => `<button class="mini" data-act="add-other" data-v="${k}"><b>${l}</b><span>${d}</span></button>`).join('')}
    </div>
    <h3>今週の計画での見込み（部位別）</h3>
    <div class="proj">${PARTS.map((p) => `<div class="${proj[p] < 0 ? 'neg' : ''}"><span>${PART_LABEL[p]}</span><b>${sgn(proj[p], 2)}</b><em>${fx(stim[p], 0)}セット相当</em><i class="pf" style="--v:${s.body.partFatigue[p]}%"></i></div>`).join('')}</div>
    <p class="hint">刺激は週10〜18セットが目安。同じ部位をやりすぎると疲労で効率が落ち、ケガのリスクも上がります。減量中は刺激を保つと筋肉が落ちにくくなります。各部位の下線は部位の疲労。</p>
    <h3>種目を追加</h3>
    <div class="tabs">${PARTS.map((p) => `<button class="${ui.part === p ? 'on' : ''}" data-act="part" data-v="${p}">${PART_LABEL[p]}${s.body.injury?.part === p ? '⚠' : ''}</button>`).join('')}</div>
    <div class="exlist">${exs.map((e) => {
      const vol = ui.vol[e.id] ?? 'normal';
      const a: Action = { kind: 'train', ex: e.id, vol };
      const can = canAddAction(s, a);
      const use = canUseExercise(s, e);
      const g = projectGrowth(s, [...s.plan, a])[e.part] - proj[e.part];
      const riskLv = e.risk >= 0.018 ? '高' : e.risk >= 0.01 ? '中' : '低';
      const fatLv = e.fatigue >= 1.3 ? '大' : e.fatigue >= 0.85 ? '中' : '小';
      return `<div class="ex ${use.ok ? '' : 'dis'}">
        <div class="ex-h"><b>${e.name}</b>${e.unilateral ? '<span class="tag">片側種目</span>' : ''}</div>
        <p>${e.note}</p>
        <div class="ex-tags"><span>設備：${e.equip.length ? e.equip.map((q) => EQUIP_LABEL[q]).join('・') : 'なし'}</span><span>疲労：${fatLv}</span><span>ケガ：${riskLv}</span><span>体力：${actionStamina(a)}</span>${Object.keys(e.secondary).length ? `<span>補助：${Object.keys(e.secondary).map((k) => PART_LABEL[k as Part]).join('・')}</span>` : ''}</div>
        <div class="ex-f">
          <div class="seg sm">${(Object.keys(VOLUME) as Volume[]).map((v) => `<button class="${vol === v ? 'on' : ''}" data-act="vol" data-ex="${e.id}" data-v="${v}">${VOLUME[v].label.replace(/（(\d+)セット）/, '$1')}</button>`).join('')}</div>
          <span class="gain">${PART_LABEL[e.part]} ${sgn(g, 2)}</span>
          <button class="primary sm" data-act="add-ex" data-v="${e.id}" ${can.ok ? '' : 'disabled'}>${can.ok ? '追加' : esc(use.ok ? can.reason! : use.reason!)}</button>
        </div>
      </div>`;
    }).join('')}</div>
    ${advanceButton(s)}
  </div>`;
}

// ---- 食事・コンディション ----
function dietScreen(s: GameState) {
  const n = nutrition(s);
  const st = bodyStats(s);
  const b = s.body;
  const wk = n.weeklyFatChange;
  return `<div class="page">
    <h2>食事・コンディション</h2>
    <h3>摂取カロリーの方針</h3>
    <div class="opts">${(Object.keys(CALORIE_PLANS) as CaloriePlan[]).map((k) => {
      const c = CALORIE_PLANS[k];
      return `<button class="card-opt ${s.diet.cal === k ? 'on' : ''}" data-act="cal" data-v="${k}"><b>${c.label}<em>${c.offset > 0 ? '+' : ''}${c.offset}kcal/日</em></b><span>${c.note}</span></button>`;
    }).join('')}</div>
    <h3>栄養バランス</h3>
    <div class="opts">${(Object.keys(MACRO_PLANS) as MacroPlan[]).map((k) => {
      const m = MACRO_PLANS[k];
      return `<button class="card-opt ${s.diet.macro === k ? 'on' : ''}" data-act="macro" data-v="${k}"><b>${m.label}</b><span>${m.note}</span></button>`;
    }).join('')}</div>
    <div class="nut">
      <div><span>摂取</span><b>${n.kcal.toLocaleString()}<small>kcal/日</small></b></div>
      <div><span>タンパク質</span><b>${n.protein}<small>g</small></b></div>
      <div><span>炭水化物</span><b>${n.carbs}<small>g</small></b></div>
      <div><span>脂質</span><b>${n.fat}<small>g</small></b></div>
    </div>
    <div class="kv"><span>推定消費（練習・有酸素を含む）</span><b>${Math.round(n.expend).toLocaleString()} kcal/日</b></div>
    <div class="kv"><span>エネルギー収支</span><b class="${n.balance < -800 ? 'bad' : ''}">${sgn(n.balance, 0)} kcal/日</b></div>
    <div class="kv"><span>脂肪の変化の見込み</span><b>${sgn(wk, 2)} kg/週</b></div>
    <div class="kv"><span>代謝の適応（減量の停滞）</span><b>−${fx(b.adapt, 0)} kcal/日</b></div>
    <div class="kv"><span>食費</span><b>${yen(n.food)}/週</b></div>
    <p class="hint">体重 ${fx(st.weight)}kg・体脂肪率 ${fx(st.bf)}%。減量が強すぎると筋肉と体調が落ち、炭水化物が少ないと筋肉の張り（大会での見た目）が落ちます。長く減量を続けると代謝が下がって脂肪が落ちにくくなります。</p>
    <h3>コンディション</h3>
    <div class="kv"><span>全身の疲労</span><b>${fx(b.fatigue, 0)}</b></div>${bar(b.fatigue, 100, b.fatigue > 65 ? 'warn' : '')}
    <div class="kv"><span>コンディション</span><b>${fx(b.condition, 0)}</b></div>${bar(b.condition, 100, 'gold')}
    <div class="kv"><span>筋肉の張り</span><b>${fx(b.fullness * 100, 0)}%</b></div>${bar(b.fullness, 1.15, 'gold')}
    <div class="kv"><span>体力の上限（今週）</span><b>${staminaMax(s)}</b></div>
    <h3>部位の疲労</h3>
    <div class="parts">${PARTS.map((p) => `<div class="prow"><span>${PART_LABEL[p]}</span>${bar(b.partFatigue[p], 100, b.partFatigue[p] > 70 ? 'warn' : '')}<b>${fx(b.partFatigue[p], 0)}</b></div>`).join('')}</div>
    ${b.injury ? `<div class="alert">負傷中：${PART_LABEL[b.injury.part]}（あと${b.injury.weeks}週。この部位の種目は選べません）</div>` : ''}
    ${(['massage', 'posingLesson'] as const).map((id) => itemUseRow(s, id)).join('')}
    ${advanceButton(s)}
  </div>`;
}
function itemUseRow(s: GameState, id: string) {
  const it = ITEMS.find((i) => i.id === id)!;
  const have = s.inv[id] ?? 0;
  const used = s.tan.usedThisWeek.includes(id);
  return `<div class="use-row"><div><b>${it.name}</b><span>${it.effect}</span></div>
    ${have > 0 ? `<button class="primary sm" data-act="use" data-v="${id}" ${used || s.phase !== 'season' ? 'disabled' : ''}>${used ? '今週使用済み' : `使う（${have}）`}</button>` : `<button class="ghost sm" data-act="go-shop" data-v="${it.kind === 'conditioning' ? 'cond' : 'tan'}">${yen(it.price)}で購入へ</button>`}</div>`;
}

// ---- ショップ ----
function shopScreen(s: GameState) {
  const tab = ui.shopTab;
  const itemCard = (id: string) => {
    const it = ITEMS.find((i) => i.id === id)!;
    const have = it.kind === 'gym' ? s.gymWeeks : it.id === 'protein' ? s.proteinWeeks : s.inv[id] ?? 0;
    const haveLabel = it.kind === 'gym' || it.id === 'protein' ? (have ? `残り${have}週` : '未購入') : `所持 ${have}`;
    return `<div class="item"><div class="item-h"><b>${it.name}</b><span class="price">${yen(it.price)}</span></div>
      <p>${it.desc}</p><p class="eff">${it.effect}</p>
      <div class="item-f"><span class="own">${haveLabel}</span><button class="primary sm" data-act="buy" data-v="${id}" ${s.money < it.price || s.phase === 'done' ? 'disabled' : ''}>${s.money < it.price ? '所持金不足' : '購入'}</button></div></div>`;
  };
  let body = '';
  if (tab === 'tan') body = ['tanBasic', 'tanPro', 'compColor', 'gloss', 'scrub', 'lotion'].map(itemCard).join('');
  else if (tab === 'cond') body = ['gymPass', 'protein', 'massage', 'posingLesson'].map(itemCard).join('');
  else body = TRUNKS.filter((t) => t.price > 0).map((t) => {
    const cid = ui.colorPick[t.id] ?? t.colors[0].id;
    const key = `${t.id}:${cid}`;
    const owned = s.trunksOwned.includes(key);
    const viol = trunksViolation(key, s.player.category);
    return `<div class="item trunks"><div class="item-h"><b>${t.name}</b><span class="price">${yen(t.price)}</span></div>
      <div class="ex-tags"><span>${GRADE_LABEL[t.grade]}</span><span>${MATERIAL_LABEL[t.material]}</span><span>${DESIGN_LABEL[t.design]}</span><span>${t.cut === 'classic' ? 'クラシックカット' : '標準カット'}</span></div>
      <p>${t.desc}</p>
      <div class="swatches">${t.colors.map((c) => `<button class="sw ${c.id === cid ? 'on' : ''}" data-act="swatch" data-m="${t.id}" data-v="${c.id}" title="${c.name}"><i style="background:${c.color}"></i><i style="background:${c.accent}"></i></button>`).join('')}<span>${t.colors.find((c) => c.id === cid)!.name}</span></div>
      <p class="${viol ? 'bad' : 'ok'}">${viol ? `⚠ ${CATEGORIES[s.player.category].short}部門の規定外：${viol}` : `✓ ${CATEGORIES[s.player.category].short}部門の規定に適合`}</p>
      <div class="item-f"><button class="ghost sm" data-act="try" data-v="${key}">3Dで試着</button>
      ${owned ? '<span class="own">購入済み</span>' : `<button class="primary sm" data-act="buy-trunks" data-v="${key}" ${s.money < t.price ? 'disabled' : ''}>${s.money < t.price ? '所持金不足' : '購入'}</button>`}</div></div>`;
  }).join('');
  return `<div class="page">
    <h2>ショップ <small>所持金 ${yen(s.money)}</small></h2>
    <div class="tabs">${([['tan', '日焼け用品'], ['trunks', '大会用衣装'], ['cond', 'コンディション']] as const).map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="shop-tab" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="items">${body}</div>
  </div>`;
}

// ---- 日焼け・衣装（試着） ----
function fittingScreen(s: GameState) {
  const key = ui.preview ?? s.trunksEquipped;
  const prevModel = ui.preview ? TRUNKS.find((t) => t.id === ui.preview!.split(':')[0])! : null;
  const prevOwned = ui.preview ? s.trunksOwned.includes(ui.preview) : true;
  const fin = stageFinish({ ...s, prep: { color: (s.inv.compColor ?? 0) > 0, gloss: (s.inv.gloss ?? 0) > 0, carbUp: false } });
  const banner = ui.preview ? `<div class="preview-bar">試着中：${prevModel!.name}（${prevModel!.colors.find((c) => c.id === ui.preview!.split(':')[1])!.name}）
     ${prevOwned ? `<button class="primary sm" data-act="equip" data-v="${ui.preview}">装備する</button>` : `<button class="primary sm" data-act="buy-trunks" data-v="${ui.preview}" ${s.money < prevModel!.price ? 'disabled' : ''}>${yen(prevModel!.price)}で購入</button>`}
     <button class="ghost sm" data-act="end-try">試着をやめる</button></div>` : '';
  return `${viewerBlock(banner)}
  <div class="page">
    <h2>日焼け・衣装</h2>
    <h3>肌の状態</h3>
    <div class="kv"><span>色の濃さ</span><b>${fx(s.tan.level, 0)} / 100</b></div>${bar(s.tan.level, 100, 'gold')}
    <div class="kv"><span>色ムラ</span><b>${fx(s.tan.uneven, 0)}</b></div>${bar(s.tan.uneven, 100, s.tan.uneven > 35 ? 'warn' : '')}
    <div class="kv"><span>肌のコンディション</span><b>${fx(s.tan.skin, 0)}</b></div>${bar(s.tan.skin, 100)}
    <div class="kv"><span>来週までに残る色</span><b>約${fx(s.tan.fade * 100, 0)}%</b></div>
    <p class="hint">大会のステージでは、照明に負けない濃い色（目安85）と均一さが求められます。セルフタンニングで2〜3週前から下地を作り、前日に大会用カラーを重ねると仕上がりが安定します。スクラブを先に使うとムラが減ります。現在の持ち物で大会に出た場合の予想：色の濃さ ${fx(fin.level, 0)}・色ムラ ${fx(fin.uneven, 0)}。</p>
    ${['scrub', 'tanBasic', 'tanPro', 'lotion'].map((id) => itemUseRow(s, id)).join('')}
    <h3>所有している衣装</h3>
    <div class="owned">${s.trunksOwned.map((k) => {
      const [mid, cid] = k.split(':');
      const m = TRUNKS.find((t) => t.id === mid)!;
      const c = m.colors.find((x) => x.id === cid)!;
      const v = trunksViolation(k, s.player.category);
      return `<button class="own-t ${k === s.trunksEquipped ? 'on' : ''}" data-act="equip" data-v="${k}"><i style="background:${c.color};border-color:${c.accent}"></i><b>${m.name}</b><span>${c.name}・${MATERIAL_LABEL[m.material]}</span>${v ? '<em class="bad">規定外</em>' : '<em class="ok">適合</em>'}${k === s.trunksEquipped ? '<strong>装備中</strong>' : ''}</button>`;
    }).join('')}</div>
    <button class="ghost" data-act="go-shop" data-v="trunks">衣装を見る（ショップ）</button>
  </div>`;
  void key;
}

// ---- 大会準備 ----
interface Check { label: string; value: string; level: 'ok' | 'warn' | 'bad'; hint?: string }
function checks(s: GameState): Check[] {
  const st = bodyStats(s);
  const b = s.body;
  const fin = stageFinish(s);
  const cat = categoryOf(s);
  const out: Check[] = [];
  const devs = PARTS.map((p) => b.dev[p]);
  const mean = devs.reduce((a, c) => a + c, 0) / 6;
  const weak = PARTS.filter((p) => b.dev[p] < mean - 4);
  out.push({ label: '部位の発達', value: `平均 ${fx(mean)}`, level: weak.length ? 'warn' : 'ok', hint: weak.length ? `${weak.map((p) => PART_LABEL[p]).join('・')}が他より弱い。優先して鍛える。` : undefined });
  out.push({ label: '体脂肪率', value: `${fx(st.bf)}%`, level: st.bf <= 6 ? 'ok' : st.bf <= 8.5 ? 'warn' : 'bad', hint: st.bf > 6 ? '大会の目安は5〜6%前後。減量方針と有酸素運動を見直す。' : st.bf < 3.8 ? '絞りすぎ。張りが失われやすい。' : undefined });
  const cap = cat.weightCap?.(s.player.heightCm);
  out.push({ label: '体重', value: `${fx(st.weight)}kg${cap ? `（上限${cap}kg）` : ''}`, level: cap && st.weight > cap ? 'bad' : 'ok', hint: cap && st.weight > cap ? '体重上限を超えると大幅減点。' : undefined });
  out.push({ label: '左右差', value: `${fx(Math.abs(b.imbalance))}%`, level: Math.abs(b.imbalance) <= 2 ? 'ok' : Math.abs(b.imbalance) <= 4 ? 'warn' : 'bad', hint: Math.abs(b.imbalance) > 2 ? '片側種目（ダンベル・ケーブル・ブルガリアンスクワット）で整える。' : undefined });
  out.push({ label: '疲労', value: fx(b.fatigue, 0), level: b.fatigue <= 35 ? 'ok' : b.fatigue <= 60 ? 'warn' : 'bad', hint: b.fatigue > 35 ? '直前は休養を増やし、疲労を抜く。' : undefined });
  out.push({ label: 'コンディション', value: fx(b.condition, 0), level: b.condition >= 78 ? 'ok' : b.condition >= 60 ? 'warn' : 'bad' });
  out.push({ label: '筋肉の張り', value: `${fx(fin.fullness * 100, 0)}%`, level: fin.fullness >= 0.85 ? 'ok' : fin.fullness >= 0.72 ? 'warn' : 'bad', hint: fin.fullness < 0.85 ? '最終週は炭水化物を増やす（高炭水化物型／カーボアップ）。' : undefined });
  out.push({ label: '日焼けの仕上がり', value: `濃さ ${fx(fin.level, 0)}・ムラ ${fx(fin.uneven, 0)}`, level: fin.level >= 70 && fin.uneven <= 30 ? 'ok' : fin.level >= 45 ? 'warn' : 'bad', hint: fin.level < 70 ? '大会用カラーとセルフタンニングで色を濃くする。' : fin.uneven > 30 ? 'スクラブと高品質な製品で色ムラを減らす。' : undefined });
  const v = trunksViolation(s.trunksEquipped, s.player.category);
  out.push({ label: '衣装の適合', value: v ? '規定外' : '適合', level: v ? 'bad' : 'ok', hint: v ? `${v}。規定に合う衣装を購入・装備する。` : undefined });
  out.push({ label: 'ポージング', value: fx(b.posing, 0), level: b.posing >= 70 ? 'ok' : b.posing >= 50 ? 'warn' : 'bad', hint: b.posing < 70 ? 'ポージング練習やレッスンで完成度を上げる。' : undefined });
  return out;
}
function contestScreen(s: GameState) {
  const cs = checks(s);
  const cat = categoryOf(s);
  const isDay = s.phase === 'contestDay';
  const prepRow = (k: 'color' | 'gloss' | 'carbUp', label: string, desc: string, item?: string) => {
    const have = item ? (s.inv[item] ?? 0) > 0 : true;
    return `<div class="use-row"><div><b>${label}</b><span>${desc}</span></div>
      ${have ? `<button class="${s.prep[k] ? 'primary' : 'ghost'} sm" data-act="prep" data-v="${k}">${s.prep[k] ? '実施する ✓' : '実施しない'}</button>` : `<button class="ghost sm" data-act="go-shop" data-v="tan">未所持（購入へ）</button>`}</div>`;
  };
  return `<div class="page">
    <h2>${isDay ? '大会前日の最終準備' : '大会準備チェック'}</h2>
    <div class="contest-card"><b>${CONTEST.name}</b><span>${cat.name}／出場 6名／優勝賞金 ${yen(CONTEST.prize[0])}</span>
      <span>${s.phase === 'season' ? `本番まで残り${WEEKS - s.week + 1}週（第${WEEKS}週を終えると大会前日）` : isDay ? '明日が本番' : '大会終了'}</span></div>
    <h3>仕上がりチェック</h3>
    <div class="checks">${cs.map((c) => `<div class="chk lv-${c.level}"><i></i><span>${c.label}</span><b>${c.value}</b>${c.hint ? `<p>${c.hint}</p>` : ''}</div>`).join('')}</div>
    <p class="hint">警告があっても出場はできます。準備不足の程度に応じて採点に影響します。</p>
    <h3>採点の比重（${cat.short}部門）</h3>
    <div class="weights">${(Object.keys(cat.weights) as ScoreKey[]).map((k) => `<div><span>${SCORE_LABEL[k]}</span>${bar(cat.weights[k], 0.3, 'gold')}<b>${Math.round(cat.weights[k] * 100)}%</b></div>`).join('')}</div>
    ${isDay ? `<h3>当日の仕上げ</h3>
      ${prepRow('color', '大会用ボディカラーを塗る', '色の濃さを大きく上げる（下地と肌の状態でムラが変わる）', 'compColor')}
      ${prepRow('gloss', 'ポージング・グロスを塗る', '照明下で筋肉の陰影を見せるツヤ', 'gloss')}
      ${prepRow('carbUp', 'カーボアップ', '炭水化物を増やして筋肉の張りを戻す（疲労が高いと効果が小さい）')}
      <h3>衣装</h3>
      <div class="owned">${s.trunksOwned.map((k) => {
        const [mid, cid] = k.split(':');
        const m = TRUNKS.find((t) => t.id === mid)!;
        const c = m.colors.find((x) => x.id === cid)!;
        const v = trunksViolation(k, s.player.category);
        return `<button class="own-t ${k === s.trunksEquipped ? 'on' : ''}" data-act="equip" data-v="${k}"><i style="background:${c.color};border-color:${c.accent}"></i><b>${m.name}</b><span>${c.name}</span>${v ? '<em class="bad">規定外</em>' : '<em class="ok">適合</em>'}${k === s.trunksEquipped ? '<strong>装備中</strong>' : ''}</button>`;
      }).join('')}</div>
      <button class="primary big gold" data-act="compete">大会に出場する</button>` : s.phase === 'season' ? advanceButton(s) : advanceButton(s)}
  </div>`;
}

// ---- 結果 ----
// 主人公が優勝できなかった時、優勝したライバルの大会の絵を出す
function winnerCard(r: NonNullable<GameState['result']>) {
  const w = r.ranking.find((c) => c.place === 1);
  const rv = w && !w.isPlayer ? rivalByName(w.name) : undefined;
  const url = rv ? rivalArt(rv.id, 'contest') : null;
  if (!rv || !url) return '';
  return `<div class="winner"><div class="art"><img src="${url}" alt="" decoding="async"></div><div><span>優勝</span><b>${esc(rv.name)}</b><p>${esc(rv.style)}</p></div></div>`;
}
function resultScreen(s: GameState) {
  const r = s.result!;
  const me = r.ranking.find((c) => c.isPlayer)!;
  const other = r.ranking.find((c) => c.name === r.compareWith)!;
  const keys = Object.keys(SCORE_LABEL) as ScoreKey[];
  return `${viewerBlock()}
  <div class="page">
    ${artFrame(heroStage(s), r.playerPlace === 1 ? 'win' : 'contest', 'result-art', r.playerPlace === 1 ? '<div class="burst win">優勝!!</div>' : '')}
    <div class="place"><span>${CATEGORIES[r.category].name}</span><b>${r.playerPlace}<small>位</small></b><em>${r.playerPlace === 1 ? '優勝 ─ IRON CROWN 獲得' : `${r.ranking.length}名中`}</em>${r.prize ? `<strong>賞金 ${yen(r.prize)}</strong>` : ''}</div>
    ${coachBox(resultLine(s))}
    <button class="ghost replay" data-act="show-replay">▶ 大会の様子をもう一度見る</button>
    ${winnerCard(r)}
    <h3>順位</h3>
    <ol class="rank">${r.ranking.map((c) => `<li class="${c.isPlayer ? 'me' : ''}"><i>${c.place}</i><span>${c.isPlayer ? '' : rivalFace(rivalByName(c.name)?.id ?? '')}${esc(c.name)}</span><em>${fx(c.weight)}kg・${fx(c.bodyFat)}%</em><b>${fx(c.total, 1)}</b></li>`).join('')}</ol>
    <h3>評価内訳（あなた vs ${esc(r.compareWith)}）</h3>
    <div class="cmp">${keys.map((k) => {
      const d = me.scores[k] - other.scores[k];
      return `<div><span>${SCORE_LABEL[k]}</span><b>${fx(me.scores[k], 0)}</b><em class="${d >= 0 ? 'ok' : 'bad'}">${sgn(d, 0)}</em><i>${fx(other.scores[k], 0)}</i></div>`;
    }).join('')}</div>
    ${r.notes.length ? `<div class="alert">${r.notes.map(esc).join('<br>')}</div>` : ''}
    <h3>良かった点</h3><ul class="report">${r.good.length ? r.good.map((g) => `<li>${esc(g)}</li>`).join('') : '<li>ライバルを上回った項目はなかった。</li>'}</ul>
    <h3>次回の改善点</h3><ul class="report">${r.improve.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
    <h3>ライバル</h3>
    ${rivalStrip()}
    <button class="primary big" data-act="restart">新しい選手で再挑戦</button>
  </div>`;
}

// ---- モーダル ----
function modal(s: GameState | null) {
  if (!ui.modal) return '';
  if (ui.modal === 'report' && s?.lastReport) {
    const r = s.lastReport;
    const gain = PARTS.reduce((a, p) => a + Math.max(0, r.devDelta[p]), 0);
    const top = [...PARTS].sort((a, b) => r.devDelta[b] - r.devDelta[a]).slice(0, 4).filter((p) => r.devDelta[p] > 0);
    return `<div class="modal"><div class="sheet report-sheet">
      ${artFrame(heroStage(s), 'training', 'rep-art', `<div class="rep-gains">${top.map((p, i) => `<div class="gain" style="--d:${0.15 + i * 0.12}s"><span>${PART_LABEL[p]}</span><b data-count="${r.devDelta[p].toFixed(2)}">+0.00</b></div>`).join('')}</div>${gain > 0.4 ? '<div class="burst">成長!!</div>' : ''}`)}
      <h3>第${r.week}週の結果</h3>
      ${coachBox(weekLine(s))}
      <div class="rep-nums"><div><span>体重</span><b>${fx(r.weightAfter)}kg</b><em>${sgn(r.weightAfter - r.weightBefore)}</em></div>
      <div><span>体脂肪率</span><b>${fx(r.bfAfter)}%</b><em>${sgn(r.bfAfter - r.bfBefore)}</em></div>
      <div><span>収支</span><b>${yen(s.money)}</b><em>${r.moneyDelta >= 0 ? '+' : ''}${r.moneyDelta.toLocaleString()}</em></div></div>
      <div class="rep-parts">${PARTS.map((p) => `<span class="${r.devDelta[p] < 0 ? 'neg' : ''}">${PART_LABEL[p]} ${sgn(r.devDelta[p], 2)}</span>`).join('')}</div>
      <ul class="report">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${s.phase === 'contestDay' ? '<p class="gold-t">12週間の準備が終わった。明日はいよいよ大会。</p>' : ''}
      <button class="primary big" data-act="close-modal">${s.phase === 'contestDay' ? '大会の最終準備へ' : '次の週へ'}</button></div></div>`;
  }
  if (ui.modal === 'restart') {
    return `<div class="modal"><div class="sheet"><h3>新しい選手で始めますか？</h3><p>現在の選手のセーブデータは消えます。</p>
      <button class="primary big" data-act="confirm-restart">新しい選手を作る</button><button class="ghost" data-act="close-modal">やめる</button></div></div>`;
  }
  if (ui.modal === 'contest') {
    return `<div class="modal"><div class="sheet">${s ? artFrame(heroStage(s), 'contest', 'modal-art') : ''}<h3>大会に出場しますか？</h3>${s ? coachBox(contestLine(s)) : ''}<div class="lineup">${RIVALS.map((r) => rivalFace(r.id)).join('')}<span>ほか5名と競う</span></div><p>出場すると準備内容は変更できません。</p>
      <button class="primary big gold" data-act="confirm-compete">出場する</button><button class="ghost" data-act="close-modal">準備に戻る</button></div></div>`;
  }
  if (ui.modal === 'intro' && s) {
    const lines = introLines(s);
    const l = lines[Math.min(ui.introStep, lines.length - 1)];
    const last = ui.introStep >= lines.length - 1;
    const url = coachArt(l.mood);
    return `<div class="modal"><div class="sheet intro-sheet">
      ${url ? `<div class="art intro-art"><img src="${url}" alt="" decoding="async"></div>` : ''}
      <div class="co-say big"><b>${COACH_NAME}<small>${COACH_ROLE}</small></b><p>${esc(l.text)}</p></div>
      <button class="primary big" data-act="${last ? 'close-modal' : 'intro-next'}">${last ? 'はじめる' : '次へ'}</button></div></div>`;
  }
  if (ui.modal === 'coach') {
    const pics = ['sheet-front', 'sheet-back', 'sheet-side'].map((k) => coachArt(k)).filter(Boolean) as string[];
    const faces = (['serious', 'encourage', 'surprised', 'frustrated', 'achievement', 'nervous', 'joy'] as const).map((k) => coachArt(k)).filter(Boolean) as string[];
    return `<div class="modal"><div class="sheet rival-sheet">
      ${coachArt('serious') ? `<div class="art modal-art"><img src="${coachArt('serious')}" alt=""></div>` : ''}
      <h3>${COACH_NAME}</h3><p class="meta">${COACH_ROLE}</p>
      <p>あなたの担当トレーナー。厳しいが、結果はいつも一緒に受け止めてくれる。週の結果や大会でアドバイスをくれる。</p>
      ${faces.length ? `<details class="sheets"><summary>表情</summary><div class="co-faces">${faces.map((u) => `<img src="${u}" alt="" loading="lazy">`).join('')}</div></details>` : ''}
      ${pics.length ? `<details class="sheets"><summary>デザイン資料（正面・背面・側面）</summary><div>${pics.map((u) => `<img src="${u}" alt="" loading="lazy">`).join('')}</div></details>` : ''}
      <button class="ghost" data-act="close-modal">閉じる</button></div></div>`;
  }
  if (ui.modal === 'rival') {
    const r = RIVALS.find((x) => x.id === ui.rival);
    if (!r) return '';
    const pics = (['contest', 'sheet-front', 'sheet-back', 'sheet-side'] as RivalUse[]).map((u) => rivalArt(r.id, u)).filter(Boolean) as string[];
    const top = (Object.keys(r.dev) as (keyof typeof r.dev)[]).sort((a, b) => r.dev[b] - r.dev[a]);
    return `<div class="modal"><div class="sheet rival-sheet">
      ${rivalArt(r.id, 'portrait') ? `<div class="art modal-art">${rivalFace(r.id, '')}</div>` : ''}
      <h3>${esc(r.name)}</h3><p class="meta">${r.age}歳・${r.heightCm}cm・${FRAME_INFO[r.frame][0]}</p>
      <p>${esc(r.style)}</p>
      <div class="kv"><span>得意な部位</span><b>${PART_LABEL[top[0]]}・${PART_LABEL[top[1]]}</b></div>
      <div class="kv"><span>弱い部位</span><b>${PART_LABEL[top[top.length - 1]]}</b></div>
      ${pics.length ? `<details class="sheets"><summary>大会のポーズと体の資料</summary><div class="rv-pics">${pics.map((u) => `<img src="${u}" alt="" loading="lazy">`).join('')}</div></details>` : ''}
      <button class="ghost" data-act="close-modal">閉じる</button></div></div>`;
  }
  return '';
}

// ---- 描画 ----
function render() {
  const s = getState();
  const scroller = document.querySelector('main');
  const scroll = scroller ? scroller.scrollTop : 0;
  if (!s && !['title', 'create'].includes(ui.route)) ui.route = 'title';
  if (s?.phase === 'done' && ['training', 'diet'].includes(ui.route)) ui.route = 'result';
  let html = '';
  if (ui.route === 'title') html = titleScreen() + modal(s); // 新しい選手で始める時の確認
  else if (ui.route === 'create') html = createScreen();
  else if (s) {
    let body = '';
    switch (ui.route) {
      case 'player': body = playerScreen(s); break;
      case 'training': body = trainingScreen(s); break;
      case 'diet': body = dietScreen(s); break;
      case 'shop': body = shopScreen(s); break;
      case 'fitting': body = fittingScreen(s); break;
      case 'contest': body = s.result ? resultScreen(s) : contestScreen(s); break;
      case 'result': body = s.result ? resultScreen(s) : contestScreen(s); break;
    }
    html = `${header(s)}<main class="r-${ui.route === 'contest' && s.result ? 'result' : ui.route}">${body}</main>${nav()}${modal(s)}${ui.show >= 0 && s.result ? showHtml(s, ui.show) : ''}`;
  }
  root.innerHTML = html;
  // 成長の数値を数え上げる
  root.querySelectorAll<HTMLElement>('[data-count]').forEach((el, i) => {
    const to = Number(el.dataset.count);
    const t0 = performance.now() + 250 + i * 120;
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 700));
      el.textContent = `+${(to * (1 - (1 - k) ** 3)).toFixed(2)}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  root.className = ui.route === 'title' || ui.route === 'create' ? 'pre' : 'game';
  const sc = document.querySelector('main');
  if (sc && sameRoute === ui.route) sc.scrollTop = scroll;
  sameRoute = ui.route;
  if (s && document.getElementById('viewer')) mountViewer(s, ui.route === 'fitting' ? ui.preview ?? undefined : undefined);
}
let sameRoute: Route = 'title';

function go(r: Route) {
  if (r !== 'fitting') ui.preview = null;
  ui.route = r;
  render();
  document.querySelector('main')?.scrollTo(0, 0);
}

root.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'pname') ui.create.name = t.value;
});

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const act = el.dataset.act!;
  const v = el.dataset.v ?? '';
  const s = getState();
  switch (act) {
    case 'go': go(v as Route); return;
    case 'go-title': go('title'); return;
    case 'go-shop': ui.shopTab = v as typeof ui.shopTab; go('shop'); return;
    case 'continue': go(s?.phase === 'done' ? 'result' : 'player'); return;
    case 'new': if (hasSave()) { ui.modal = 'restart'; render(); } else go('create'); return;
    case 'c-height': ui.create.heightCm = Number(v); render(); return;
    case 'c-frame': ui.create.frame = v as Frame; render(); return;
    case 'c-cat': ui.create.category = v as Category; render(); return;
    case 'c-skin': ui.create.skinTone = Number(v); render(); return;
    case 'start': {
      const name = ui.create.name.trim() || '鷹野 蓮';
      const g = newGame({ ...ui.create, name });
      if (g.player.category === 'classic') toast('クラシック部門はクラシックカットの衣装が必要です（ショップで購入）');
      ui.pose = 'relaxed';
      setState(g);
      ui.introStep = 0;
      ui.modal = 'intro';
      go('player');
      return;
    }
    case 'restart': ui.modal = 'restart'; render(); return;
    case 'confirm-restart': ui.modal = null; setState(null); ui.create.name = ''; go('create'); return;
    case 'close-modal': {
      const wasReport = ui.modal === 'report';
      ui.modal = null;
      if (wasReport && s?.phase === 'contestDay') go('contest'); else render();
      return;
    }
    case 'pose': ui.pose = v as PoseId; if (s) void getViewer().setBody(bodyParams(s, ui.pose)); document.querySelectorAll('.pose-row .chip').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.v === v)); return;
    case 'frame': getViewer().frame(v as 'full'); return;
    case 'rival': ui.rival = v; ui.modal = 'rival'; render(); return;
    case 'coach': ui.modal = 'coach'; render(); return;
    case 'intro-next': ui.introStep++; render(); return;
  }
  if (!s) return;
  switch (act) {
    case 'advance': {
      if (s.plan.length === 0 && !confirm('今週は何も行動していません。このまま週を進めますか？')) return;
      setState(advanceWeek(s));
      ui.modal = 'report';
      render();
      return;
    }
    case 'rm': mutate((x) => { x.plan.splice(Number(v), 1); }); return;
    case 'part': ui.part = v as Part; render(); return;
    case 'vol': ui.vol[el.dataset.ex!] = v as Volume; render(); return;
    case 'add-ex': {
      const a: Action = { kind: 'train', ex: v, vol: ui.vol[v] ?? 'normal' };
      const c = canAddAction(s, a);
      if (!c.ok) { toast(c.reason!, true); return; }
      mutate((x) => { x.plan.push(a); });
      toast(`${actionLabel(a)} を追加`);
      return;
    }
    case 'add-other': {
      const a = { kind: v } as Action;
      const c = canAddAction(s, a);
      if (!c.ok) { toast(c.reason!, true); return; }
      mutate((x) => { x.plan.push(a); });
      toast(`${actionLabel(a)} を追加`);
      return;
    }
    case 'cal': mutate((x) => { x.diet.cal = v as CaloriePlan; }); return;
    case 'macro': mutate((x) => { x.diet.macro = v as MacroPlan; }); return;
    case 'shop-tab': ui.shopTab = v as typeof ui.shopTab; render(); return;
    case 'buy': {
      let res = { ok: false, msg: '' };
      mutate((x) => { res = buyItem(x, v); });
      toast(res.msg, !res.ok);
      return;
    }
    case 'buy-trunks': {
      const m = TRUNKS.find((t) => t.id === v.split(':')[0])!;
      let res = { ok: false, msg: '' };
      mutate((x) => { res = buyTrunks(x, v, m.price); });
      toast(res.ok ? `${m.name}を購入しました（日焼け・衣装の画面で装備）` : res.msg, !res.ok);
      return;
    }
    case 'swatch': ui.colorPick[el.dataset.m!] = v; render(); return;
    case 'try': ui.preview = v; ui.route = 'fitting'; render(); document.querySelector('main')?.scrollTo(0, 0); return;
    case 'end-try': ui.preview = null; render(); return;
    case 'equip': {
      if (!s.trunksOwned.includes(v)) return;
      if (s.phase === 'done') { toast('大会は終了しています', true); return; }
      const viol = trunksViolation(v, s.player.category);
      mutate((x) => { x.trunksEquipped = v; });
      ui.preview = null;
      render();
      toast(viol ? `装備しました（注意：${viol}）` : '装備しました', !!viol);
      return;
    }
    case 'use': {
      let res = { ok: false, msg: '' };
      mutate((x) => { res = useItem(x, v); });
      toast(res.msg, !res.ok);
      return;
    }
    case 'prep': mutate((x) => { x.prep[v as 'color'] = !x.prep[v as 'color']; }); return;
    case 'compete': ui.modal = 'contest'; render(); return;
    case 'confirm-compete': {
      ui.modal = null;
      mutate((x) => {
        if (x.prep.color) x.inv.compColor -= 1;
        if (x.prep.gloss) x.inv.gloss -= 1;
        x.result = runContest(x);
        x.money += x.result.prize;
        x.phase = 'done';
      });
      ui.pose = 'frontDouble';
      ui.show = 0;
      go('result');
      return;
    }
    case 'show-next': {
      e.stopPropagation();
      ui.show++;
      if (ui.show >= SHOW_STEPS) ui.show = -1;
      render();
      return;
    }
    case 'show-replay': ui.show = 0; render(); return;
    case 'show-skip': {
      ui.show = -1;
      render();
      return;
    }
  }
});

export function startApp() {
  subscribe(() => { if (ui.route !== 'title' && ui.route !== 'create') render(); });
  render();
}
