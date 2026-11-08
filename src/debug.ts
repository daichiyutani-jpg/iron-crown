// 開発用：体型の確認ページ（?debug&dev=45&bf=13&pose=relaxed&cam=x,y,z&tgt=x,y,z）
import { getViewer } from './body/viewer';
import type { BodyParams, Frame } from './body/anatomy';
import type { PoseId } from './body/poses';

export function startDebug() {
  const app = document.getElementById('app')!;
  app.innerHTML = `<div id="v" style="position:fixed;inset:0"></div>`;
  const q = new URLSearchParams(location.search);
  const v = getViewer();
  v.attach(document.getElementById('v')!);
  const dv = Number(q.get('dev') ?? 45);
  const p: BodyParams = {
    heightCm: Number(q.get('h') ?? 175), frame: (q.get('frame') ?? 'meso') as Frame,
    dev: { chest: dv, back: dv, shoulders: dv, arms: dv, legs: dv, abs: dv },
    bodyFat: Number(q.get('bf') ?? 13), imbalance: 0, fullness: 1, pose: (q.get('pose') ?? 'relaxed') as PoseId,
  };
  v.setLook({ skinTone: 1, tan: Number(q.get('tan') ?? 10), uneven: 10, orange: 0, shine: Number(q.get('shine') ?? 0.1), trunks: { color: '#141416', accent: '#141416', material: 'matte', design: 'solid', cut: 'standard' } });
  void v.setBody(p);
  const cam = q.get('cam'), tgt = q.get('tgt');
  if (cam && tgt) setTimeout(() => {
    const vv = v as unknown as { camera: { position: { set: (...a: number[]) => void } }; controls: { target: { set: (...a: number[]) => void } } };
    vv.controls.target.set(...tgt.split(',').map(Number));
    vv.camera.position.set(...cam.split(',').map(Number));
  }, 150);
}
