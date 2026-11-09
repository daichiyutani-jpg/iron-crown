/**
 * ページ送り：画面をスクロールさせず、枠に入る分だけ並べて「‹ 前へ 1/3 次へ ›」でめくる。
 * 枠（container）の直接の子要素を1つの「まとまり」として、実際の高さを測ってページに分ける。
 * - class="pg-split" の子は、その中の要素を1つずつのまとまりとして扱う（長い一覧を途中で分ける）。
 * - class="pg-pin" の子はページ送りの外（下）に置き、どのページでも見えるようにする（週を進めるボタンなど）。
 * - 枠より高いまとまりは、枠の高さで切る（大きな絵など）。
 * 画面の大きさが変わったら数え直す。左右になぞってもめくれる。
 */
const remembered = new Map<string, number>();

/** 画面を移った時は、どの画面も1ページ目から */
export function forgetPages() { remembered.clear(); }

const NO_SWIPE = '.rv-strip, .pose-row, .tabs, input, textarea, select, .chips';

/**
 * container の中身をページ送りにする。
 * onlyIfOverflow=true の時は、はみ出す時だけページ送りにする（モーダルなど、中身に合わせて高さが変わる枠）。
 */
export function paginate(container: HTMLElement, key: string, onlyIfOverflow = false) {
  if (onlyIfOverflow && container.scrollHeight <= container.clientHeight + 1) return;
  const kids = Array.from(container.children) as HTMLElement[];
  const body = document.createElement('div');
  body.className = 'pBody';
  const pins: HTMLElement[] = [];
  for (const k of kids) {
    if (k.classList.contains('pg-pin')) pins.push(k);
    else body.appendChild(k);
  }
  const nav = document.createElement('div');
  nav.className = 'pNav';
  nav.innerHTML = '<button class="pgPrev" aria-label="前のページ">‹ 前へ</button><span class="pgLabel">1 / 1</span><button class="pgNext" aria-label="次のページ">次へ ›</button>';
  container.classList.add('paged');
  container.append(body, nav, ...pins);
  for (const p of pins) p.classList.add('pinned');

  const prev = nav.querySelector<HTMLButtonElement>('.pgPrev')!;
  const next = nav.querySelector<HTMLButtonElement>('.pgNext')!;
  const label = nav.querySelector<HTMLElement>('.pgLabel')!;
  const items: HTMLElement[] = [];
  for (const k of Array.from(body.children) as HTMLElement[]) {
    if (k.classList.contains('pg-split') && k.children.length) items.push(...(Array.from(k.children) as HTMLElement[]));
    else items.push(k);
  }
  const splits = Array.from(body.querySelectorAll<HTMLElement>(':scope > .pg-split'));
  let starts: number[] = [0];
  let page = remembered.get(key) ?? 0;
  let lastW = 0, lastH = 0;

  const show = () => {
    const end = starts[page + 1] ?? items.length;
    items.forEach((it, i) => it.classList.toggle('pgOff', i < starts[page] || i >= end));
    // 中身がすべて隠れた一覧は、枠ごと隠す
    for (const sp of splits) sp.classList.toggle('pgOff', Array.from(sp.children).every((c) => c.classList.contains('pgOff')));
    label.textContent = `${page + 1} / ${starts.length}`;
    prev.disabled = page <= 0;
    next.disabled = page >= starts.length - 1;
    nav.classList.toggle('single', starts.length <= 1);
    remembered.set(key, page);
  };
  const layout = () => {
    lastW = body.clientWidth; lastH = body.clientHeight;
    if (!lastW || !lastH || !items.length) { starts = [0]; page = 0; return show(); }
    items.forEach((it) => { it.classList.remove('pgOff'); it.style.maxHeight = ''; });
    splits.forEach((sp) => sp.classList.remove('pgOff'));
    const H = lastH + 0.5;
    const top0 = body.getBoundingClientRect().top;
    // 枠より高いまとまりは枠の高さで切る
    for (const it of items) if (it.getBoundingClientRect().height > H) { it.style.maxHeight = `${Math.floor(H - 4)}px`; it.style.overflow = 'hidden'; }
    const rects = items.map((it) => { const r = it.getBoundingClientRect(); return { top: r.top - top0, bottom: r.bottom - top0 }; });
    starts = [0];
    let pageTop = rects[0].top;
    for (let i = 1; i < items.length; i++) {
      if (rects[i].bottom - pageTop > H) {
        let s = i;
        // 見出しだけがページの最後に残らないよう、見出しごと次のページへ送る
        while (s - 1 > starts[starts.length - 1] && /^H[34]$/.test(items[s - 1].tagName)) s--;
        starts.push(s);
        pageTop = rects[s].top;
        i = s;
      }
    }
    page = Math.min(page, starts.length - 1);
    show();
  };
  const go = (p: number) => {
    if (p < 0 || p >= starts.length || p === page) return;
    page = p;
    show();
  };
  prev.onclick = (e) => { e.stopPropagation(); go(page - 1); };
  next.onclick = (e) => { e.stopPropagation(); go(page + 1); };

  const ro = new ResizeObserver(() => {
    if (!body.isConnected) { ro.disconnect(); return; }
    if (body.clientWidth !== lastW || Math.abs(body.clientHeight - lastH) > 1) layout();
  });
  ro.observe(body);
  // 開閉する要素（details）や読み込み後の絵で高さが変わったら数え直す
  body.addEventListener('toggle', () => layout(), true);
  body.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', () => layout(), { once: true }); });

  // 左右になぞってめくる（めくった時はボタンを押したことにしない）
  let sx = 0, sy = 0, swiped = false, ok = false;
  body.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; swiped = false; ok = !(e.target as Element).closest(NO_SWIPE); });
  body.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (ok && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - sy) * 1.5) { swiped = true; go(page + (dx < 0 ? 1 : -1)); }
  });
  body.addEventListener('click', (e) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);

  layout();
}
