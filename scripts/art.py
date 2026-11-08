"""主人公などの 2D イラストの取り込み。

  python scripts/art.py fetch design/results.json   # {"<key>": ["<URL>", ...]} → design/candidates/<key>_a.jpg ...
  python scripts/art.py sheet                       # 候補を並べた確認用シート design/candidates/_sheet_<段階>.jpg
  python scripts/art.py import                      # design/picks.json {"<key>": "<候補ファイル名>"} → public/art/hero|rivals/<key>.webp と src/ui/artList.ts
"""
import json
import string
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / 'design' / 'candidates'
OUT = ROOT / 'public' / 'art' / 'hero'
OUT_R = ROOT / 'public' / 'art' / 'rivals'
OUT_C = ROOT / 'public' / 'art' / 'coach'
sys.stdout.reconfigure(encoding='utf-8')


def fetch(path):
    res = json.loads(Path(path).read_text(encoding='utf-8'))
    CAND.mkdir(parents=True, exist_ok=True)
    for key, urls in res.items():
        have = sorted(CAND.glob(f'{key}_*.jpg'))
        n = len(have)
        for u in urls:
            dst = CAND / f'{key}_{string.ascii_lowercase[n]}.jpg'
            subprocess.run(['curl', '-sSfL', '-o', str(dst), u], check=True)
            n += 1
        print(key, n)


def sheet():
    keys = sorted({p.stem.rsplit('_', 1)[0] for p in CAND.glob('*_?.jpg')})
    for stage in sorted({k.split('-')[0] for k in keys}):
        ks = [k for k in keys if k.startswith(stage + '-')]
        rows = []
        for k in ks:
            ims = [Image.open(p).convert('RGB') for p in sorted(CAND.glob(f'{k}_?.jpg'))]
            ims = [im.resize((256, int(256 * im.height / im.width))) for im in ims]
            h = max(im.height for im in ims) + 22
            row = Image.new('RGB', (256 * len(ims) + 8 * len(ims), h), '#222')
            d = ImageDraw.Draw(row)
            for i, im in enumerate(ims):
                row.paste(im, (i * 264, 22))
                d.text((i * 264 + 4, 4), f'{k} {string.ascii_lowercase[i]}', fill='#fff')
            rows.append(row)
        W = max(r.width for r in rows)
        sh = Image.new('RGB', (W, sum(r.height + 6 for r in rows)), '#000')
        y = 0
        for r in rows:
            sh.paste(r, (0, y)); y += r.height + 6
        sh.save(CAND / f'_sheet_{stage}.jpg', quality=85)
        print('sheet', stage, len(ks))


def do_import():
    """picks.json の r1〜r5 で始まるキーはライバル（public/art/rivals/）、c- はトレーナー（public/art/coach/、c- を外した名前）、それ以外は主人公（public/art/hero/）"""
    picks = json.loads((ROOT / 'design' / 'picks.json').read_text(encoding='utf-8'))
    for d in (OUT, OUT_R, OUT_C): d.mkdir(parents=True, exist_ok=True)
    for key, fn in picks.items():
        im = Image.open(CAND / fn).convert('RGB')
        if im.width > 832:
            im = im.resize((832, round(832 * im.height / im.width)), Image.LANCZOS)
        if key.startswith('c-'): dst, key = OUT_C, key[2:]
        else: dst = OUT_R if key[0] == 'r' and key[1].isdigit() else OUT
        im.save(dst / f'{key}.webp', quality=82, method=6)
    lst = lambda d: ''.join(f"  '{p.stem}',\n" for p in sorted(d.glob('*.webp')))
    (ROOT / 'src' / 'ui' / 'artList.ts').write_text(
        '// scripts/art.py import が書き換える（public/art/hero/・rivals/・coach/ にある絵の一覧）\n'
        'export const HERO_ART: string[] = [\n' + lst(OUT) + '];\n'
        'export const RIVAL_ART: string[] = [\n' + lst(OUT_R) + '];\n'
        'export const COACH_ART: string[] = [\n' + lst(OUT_C) + '];\n', encoding='utf-8')
    print('imported', len(picks))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'fetch': fetch(sys.argv[2])
    elif cmd == 'sheet': sheet()
    elif cmd == 'import': do_import()
