// 解剖学ベースの人体定義。
// 体は「骨格（ボーン）」と、各ボーンに付く「形状プリミティブ（骨格の芯・筋肉・脂肪）」で構成する。
// プリミティブは SDF（符号付き距離関数）として滑らかに結合され、mesher.ts で表面メッシュになる。
// 座標系: メートル / y=上 / z=体の前方 / x=体の左（x>0 が選手の左半身）。基準身長 175cm。
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { POSES, type PoseId, type PoseDef } from './poses';

export type Part = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'abs';
export const PARTS: Part[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'abs'];
export type Frame = 'ecto' | 'meso' | 'endo';

export interface BodyParams {
  heightCm: number;
  frame: Frame;
  dev: Record<Part, number>; // 0〜100 部位別の発達度
  bodyFat: number; // 体脂肪率 %
  imbalance: number; // 左右差 %（＋は左が大きい）
  fullness: number; // 筋グリコーゲンによる張り 0〜1.2
  pose: PoseId;
}

// ---- 骨格 ----
export const BONES = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'clavL', 'upperArmL', 'forearmL', 'handL',
  'clavR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
export type BoneName = (typeof BONES)[number];
const B = (n: BoneName) => BONES.indexOf(n);

const PARENT: Record<BoneName, BoneName | null> = {
  pelvis: null, spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', upperArmL: 'clavL', forearmL: 'upperArmL', handL: 'forearmL',
  clavR: 'chest', upperArmR: 'clavR', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
  thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
};

type V3 = [number, number, number];
// 左半身の関節位置（右は x を反転）
const HEAD_L: Partial<Record<BoneName, V3>> = {
  pelvis: [0, 0.98, 0], spine: [0, 1.08, -0.01], chest: [0, 1.25, -0.015],
  neck: [0, 1.47, -0.03], head: [0, 1.57, -0.01],
  clavL: [0.02, 1.44, 0.0], upperArmL: [0.195, 1.415, -0.025], forearmL: [0.232, 1.125, -0.035], handL: [0.25, 0.868, -0.012],
  thighL: [0.09, 0.935, 0.0], shinL: [0.1, 0.515, 0.0], footL: [0.098, 0.088, -0.03],
};
function restHead(b: BoneName): V3 {
  if (b.endsWith('R')) {
    const l = HEAD_L[(b.slice(0, -1) + 'L') as BoneName]!;
    return [-l[0], l[1], l[2]];
  }
  return HEAD_L[b]!;
}

// ---- プリミティブ ----
export const enum Kind { Ellipsoid = 0, Capsule = 1, Subtract = 2 }
type Group = Part | 'core' | 'fat' | 'face';
interface PrimDef {
  kind: Kind;
  bone: BoneName;
  group: Group;
  partScale?: number; // 部位発達の効き具合
  // 楕円体: 中心 c, 半径 r(x=幅, y=長さ, z=厚み), 軸
  c: V3; r: V3; axes?: [V3, V3, V3];
  // カプセル: a→b, 半径 ra→rb
  a?: V3; b?: V3; ra?: number; rb?: number;
  flex?: string; // ポーズで力を入れた時に膨らむ筋肉のキー
  k?: number; // 結合の滑らかさ（未指定はグループ既定）
  kMul?: number; // 筋肉の結合の滑らかさ倍率
  latWiden?: boolean;
}

const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function defs(): PrimDef[] {
  const P: PrimDef[] = [];
  const ell = (bone: BoneName, group: Group, c: V3, r: V3, o: Partial<PrimDef> = {}) => P.push({ kind: Kind.Ellipsoid, bone, group, c, r, ...o });
  const cap = (bone: BoneName, group: Group, a: V3, b: V3, ra: number, rb: number, o: Partial<PrimDef> = {}) =>
    P.push({ kind: Kind.Capsule, bone, group, a, b, ra, rb, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [ra, ra, ra], ...o });
  // 筋肉: 起始 a・停止 b を結ぶ楕円体。w=幅の半径, t=厚みの半径, n=厚み方向
  const mus = (bone: BoneName, group: Group, a: V3, b: V3, w: number, t: number, n: V3, o: Partial<PrimDef> = {}) => {
    const ax = norm(sub(b, a));
    let nn = norm(n);
    nn = norm(sub(nn, [ax[0] * dot(nn, ax), ax[1] * dot(nn, ax), ax[2] * dot(nn, ax)]));
    const wx = cross(ax, nn);
    const half = Math.hypot(...sub(b, a)) / 2;
    P.push({ kind: Kind.Ellipsoid, bone, group, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [w, half, t], axes: [wx, ax, nn], ...o });
  };

  // ---- 体幹の芯 ----
  ell('chest', 'core', [0, 1.31, -0.01], [0.14, 0.168, 0.102]);
  ell('chest', 'core', [0, 1.425, -0.03], [0.165, 0.068, 0.072]);
  ell('spine', 'core', [0, 1.13, -0.002], [0.118, 0.12, 0.088]);
  ell('pelvis', 'core', [0, 0.955, -0.008], [0.142, 0.1, 0.094]);
  cap('neck', 'core', [0, 1.46, -0.03], [0, 1.6, -0.008], 0.053, 0.047);
  // 頭部
  ell('head', 'core', [0, 1.676, -0.008], [0.071, 0.088, 0.088], { k: 0.02 });
  ell('head', 'face', [0, 1.632, 0.03], [0.058, 0.062, 0.058], { k: 0.022 });
  ell('head', 'face', [0, 1.598, 0.028], [0.05, 0.03, 0.05], { k: 0.02 });
  ell('head', 'face', [0, 1.586, 0.066], [0.021, 0.017, 0.014], { k: 0.012 });
  ell('head', 'face', [0, 1.648, 0.087], [0.0095, 0.02, 0.013], { k: 0.008 });
  ell('head', 'face', [0, 1.687, 0.071], [0.05, 0.0095, 0.014], { k: 0.012 });
  P.push({ kind: Kind.Subtract, bone: 'head', group: 'face', c: [0.029, 1.668, 0.087], r: [0.015, 0.008, 0.009], k: 0.008 });
  P.push({ kind: Kind.Subtract, bone: 'head', group: 'face', c: [-0.029, 1.668, 0.087], r: [0.015, 0.008, 0.009], k: 0.008 });
  P.push({ kind: Kind.Subtract, bone: 'head', group: 'face', c: [0, 1.614, 0.088], r: [0.017, 0.0025, 0.008], k: 0.006 });

  // ---- 片側（左）を定義して右へ反転 ----
  const startSide = P.length;
  // 顔の左右
  ell('head', 'face', [0.071, 1.655, -0.004], [0.008, 0.026, 0.016], { k: 0.008 });
  mus('neck', 'core', [0.048, 1.635, -0.012], [0.016, 1.475, 0.045], 0.015, 0.015, [0, 0, 1], { group: 'back', partScale: 0.3, k: 0.012 });

  // 胸（大胸筋：上部・中部・下部）
  mus('chest', 'chest', [0.014, 1.358, 0.094], [0.162, 1.378, 0.035], 0.042, 0.026, [0, 0.25, 1], { flex: 'chest' });
  mus('chest', 'chest', [0.014, 1.302, 0.103], [0.168, 1.362, 0.03], 0.053, 0.032, [0, 0, 1], { flex: 'chest' });
  mus('chest', 'chest', [0.022, 1.246, 0.098], [0.164, 1.345, 0.026], 0.038, 0.028, [0, -0.35, 1], { flex: 'chest' });
  // 前鋸筋
  for (let i = 0; i < 3; i++) mus('chest', 'abs', [0.108, 1.272 - i * 0.034, 0.072 - i * 0.004], [0.126, 1.262 - i * 0.032, 0.04], 0.009, 0.0065, [1, 0, 0.6], { partScale: 0.6, kMul: 1.3 });

  // 肩（三角筋：前部・中部・後部）
  mus('upperArmL', 'shoulders', [0.165, 1.44, 0.03], [0.213, 1.3, 0.02], 0.03, 0.027, [0.3, 0, 1]);
  mus('upperArmL', 'shoulders', [0.188, 1.455, -0.022], [0.233, 1.302, -0.026], 0.04, 0.031, [1, 0.1, 0]);
  mus('upperArmL', 'shoulders', [0.163, 1.43, -0.075], [0.218, 1.31, -0.066], 0.03, 0.025, [0.3, 0, -1]);

  // 背中
  mus('chest', 'back', [0.03, 1.515, -0.05], [0.16, 1.445, -0.04], 0.032, 0.02, [0, 1, -0.4], { flex: 'traps', kMul: 2.6 }); // 僧帽筋上部
  mus('chest', 'back', [0.008, 1.42, -0.088], [0.13, 1.4, -0.085], 0.034, 0.017, [0, 0, -1]); // 中部
  mus('chest', 'back', [0.075, 1.37, -0.104], [0.008, 1.19, -0.098], 0.03, 0.014, [0, 0, -1]); // 下部
  mus('chest', 'back', [0.058, 1.372, -0.108], [0.14, 1.292, -0.088], 0.04, 0.013, [0, 0, -1], { flex: 'back', kMul: 1.5 }); // 棘下筋
  mus('chest', 'back', [0.1, 1.262, -0.098], [0.168, 1.322, -0.052], 0.02, 0.02, [0.3, 0, -1], { flex: 'back' }); // 大円筋
  mus('chest', 'back', [0.135, 1.322, -0.06], [0.055, 1.12, -0.09], 0.058, 0.021, [0.6, 0, -1], { flex: 'lats', latWiden: true, kMul: 1.7 }); // 広背筋
  mus('chest', 'back', [0.122, 1.29, -0.04], [0.094, 1.12, -0.052], 0.04, 0.017, [1, 0, -0.6], { flex: 'lats', latWiden: true, kMul: 1.9 });
  mus('spine', 'back', [0.03, 1.27, -0.085], [0.034, 0.99, -0.07], 0.02, 0.021, [0, 0, -1]); // 脊柱起立筋

  // 腹筋（腹直筋 6 分割＋下部、外腹斜筋）
  const absY = [1.218, 1.157, 1.096];
  for (const y of absY) mus('spine', 'abs', [0.031, y + 0.026, 0.082], [0.031, y - 0.026, 0.084], 0.028, 0.0115, [0, 0, 1], { flex: 'abs', kMul: 1.15 });
  mus('spine', 'abs', [0.03, 1.064, 0.083], [0.027, 0.975, 0.073], 0.027, 0.011, [0, 0, 1], { flex: 'abs', kMul: 1.3 });
  mus('spine', 'abs', [0.1, 1.17, 0.04], [0.098, 1.0, 0.048], 0.032, 0.016, [1, 0, 0.6], { partScale: 0.6, k: 0.016 });

  // 腕
  cap('upperArmL', 'core', [0.195, 1.4, -0.025], [0.232, 1.13, -0.035], 0.041, 0.031);
  mus('upperArmL', 'arms', [0.204, 1.33, 0.004], [0.234, 1.158, 0.01], 0.027, 0.03, [0, 0, 1], { flex: 'biceps' }); // 上腕二頭筋
  mus('upperArmL', 'arms', [0.224, 1.22, 0.0], [0.24, 1.142, -0.006], 0.024, 0.019, [1, 0, 0.3]); // 上腕筋
  mus('upperArmL', 'arms', [0.188, 1.37, -0.06], [0.224, 1.163, -0.064], 0.029, 0.031, [-0.3, 0, -1], { flex: 'triceps' }); // 三頭筋長頭
  mus('upperArmL', 'arms', [0.214, 1.35, -0.045], [0.24, 1.2, -0.05], 0.024, 0.024, [1, 0, -0.6], { flex: 'triceps' }); // 外側頭
  ell('forearmL', 'core', [0.232, 1.125, -0.04], [0.032, 0.03, 0.03]);
  cap('forearmL', 'core', [0.232, 1.12, -0.035], [0.252, 0.878, -0.013], 0.034, 0.021);
  mus('forearmL', 'arms', [0.243, 1.11, 0.0], [0.25, 0.93, -0.002], 0.024, 0.024, [0.5, 0, 1], { partScale: 0.6 });
  mus('forearmL', 'arms', [0.248, 1.1, -0.05], [0.256, 0.93, -0.031], 0.021, 0.021, [0.5, 0, -1], { partScale: 0.6 });
  ell('handL', 'core', [0.257, 0.812, -0.004], [0.021, 0.054, 0.041], { k: 0.015 });
  mus('handL', 'core', [0.254, 0.852, 0.03], [0.256, 0.79, 0.045], 0.011, 0.011, [1, 0, 0], { k: 0.012 });

  // 臀部・脚
  mus('pelvis', 'legs', [0.028, 0.985, -0.09], [0.128, 0.858, -0.062], 0.058, 0.044, [0, 0, -1], { partScale: 0.8 }); // 大臀筋
  ell('pelvis', 'legs', [0.12, 0.97, -0.035], [0.044, 0.04, 0.04], { partScale: 0.5 });
  cap('thighL', 'core', [0.09, 0.93, 0.0], [0.1, 0.535, 0.005], 0.068, 0.044);
  mus('thighL', 'legs', [0.094, 0.87, 0.054], [0.1, 0.572, 0.05], 0.034, 0.034, [0, 0, 1], { flex: 'quads' }); // 大腿直筋
  mus('thighL', 'legs', [0.134, 0.862, 0.004], [0.13, 0.572, 0.02], 0.04, 0.039, [1, 0, 0.2], { flex: 'quads' }); // 外側広筋
  mus('thighL', 'legs', [0.066, 0.7, 0.028], [0.08, 0.552, 0.045], 0.031, 0.031, [-0.6, 0, 1], { flex: 'quads' }); // 内側広筋
  mus('thighL', 'legs', [0.032, 0.86, 0.004], [0.074, 0.652, 0.0], 0.029, 0.029, [-1, 0, 0]); // 内転筋
  mus('thighL', 'legs', [0.128, 0.92, 0.042], [0.07, 0.585, 0.012], 0.011, 0.009, [0, 0, 1], { partScale: 0.5 }); // 縫工筋
  mus('thighL', 'legs', [0.11, 0.862, -0.064], [0.12, 0.582, -0.05], 0.034, 0.034, [0.3, 0, -1], { flex: 'hams' }); // 大腿二頭筋
  mus('thighL', 'legs', [0.07, 0.862, -0.064], [0.08, 0.582, -0.05], 0.031, 0.031, [-0.3, 0, -1], { flex: 'hams' }); // 半腱様筋
  ell('shinL', 'core', [0.1, 0.505, 0.022], [0.04, 0.045, 0.04]);
  ell('shinL', 'core', [0.1, 0.512, 0.053], [0.021, 0.027, 0.012], { k: 0.015 });
  cap('shinL', 'core', [0.1, 0.5, 0.0], [0.095, 0.1, -0.03], 0.039, 0.027);
  mus('shinL', 'legs', [0.085, 0.462, -0.045], [0.09, 0.272, -0.05], 0.025, 0.031, [-0.3, 0, -1], { flex: 'calves' }); // 腓腹筋内側
  mus('shinL', 'legs', [0.118, 0.462, -0.04], [0.11, 0.302, -0.045], 0.022, 0.027, [0.4, 0, -1], { flex: 'calves' }); // 外側
  mus('shinL', 'legs', [0.1, 0.36, -0.03], [0.095, 0.15, -0.04], 0.031, 0.024, [0, 0, -1], { partScale: 0.7 }); // ヒラメ筋
  mus('shinL', 'legs', [0.117, 0.47, 0.034], [0.105, 0.2, 0.03], 0.014, 0.014, [0.5, 0, 1], { partScale: 0.5 }); // 前脛骨筋
  ell('footL', 'core', [0.098, 0.09, -0.028], [0.031, 0.03, 0.03]);
  ell('footL', 'core', [0.098, 0.045, -0.048], [0.029, 0.035, 0.034]);
  ell('footL', 'core', [0.1, 0.033, 0.04], [0.039, 0.028, 0.09]);

  // 脂肪の付きやすい場所（体脂肪率で大きさが変わる）
  ell('chest', 'fat', [0.08, 1.262, 0.07], [0.06, 0.04, 0.03]);
  ell('spine', 'fat', [0.12, 1.0, -0.012], [0.045, 0.045, 0.07]);
  ell('pelvis', 'fat', [0.115, 0.85, -0.02], [0.05, 0.08, 0.06]);
  const endSide = P.length;

  // 反転コピー
  for (let i = startSide; i < endSide; i++) {
    const d = P[i];
    const m = (v: V3): V3 => [-v[0], v[1], v[2]];
    const bone = (d.bone.endsWith('L') ? d.bone.slice(0, -1) + 'R' : d.bone) as BoneName;
    P.push({
      ...d, bone,
      c: m(d.c), a: d.a && m(d.a), b: d.b && m(d.b),
      axes: d.axes && [m(d.axes[0]).map((x) => -x) as V3, m(d.axes[1]), m(d.axes[2])],
    });
  }
  // 中央の脂肪
  ell('spine', 'fat', [0, 1.07, 0.04], [0.1, 0.085, 0.055]);
  ell('spine', 'fat', [0, 1.05, -0.06], [0.1, 0.06, 0.03]);
  return P;
}
const DEFS = defs();

// ---- 姿勢付きプリミティブ（メッシャーへ渡す平坦な形式） ----
export interface PosedPrim {
  kind: Kind;
  c: number[]; // 中心 or カプセルa
  b: number[]; // カプセルb
  r: number[]; // 楕円体半径 / [ra, rb]
  rt: number[]; // ワールド→ローカル 3x3（行優先）
  k: number;
  bone: number;
  ext: number; // 外接半径
}

export interface BuiltBody {
  prims: PosedPrim[];
  boneMats: number[][]; // 各ボーンの姿勢行列 (4x4, 列優先 = three.js elements)
  restHeads: number[][];
  fat: number; // 皮下脂肪の厚み（m）
}

export function frameFactors(frame: Frame) {
  switch (frame) {
    case 'ecto': return { shoulder: 1.0, hip: 0.95, bone: 0.92, limb: 1.02 };
    case 'endo': return { shoulder: 1.02, hip: 1.07, bone: 1.08, limb: 0.98 };
    default: return { shoulder: 1.05, hip: 0.97, bone: 1.0, limb: 1.0 };
  }
}

const devThick = (d: number) => 0.52 + 0.95 * (d / 100);
const devWidth = (d: number) => 0.84 + 0.32 * (d / 100);

export function buildBody(p: BodyParams): BuiltBody {
  const s = p.heightCm / 175;
  const ff = frameFactors(p.frame);
  const bf = p.bodyFat;
  const g = Math.min(1, Math.max(0, (bf - 8) / 17));
  const kMus = 0.0042 + bf * 0.00036;
  const fat = (0.0012 + Math.max(0, bf - 4) * 0.0007) * s;
  const pose: PoseDef = POSES[p.pose];
  const full = 0.88 + 0.12 * Math.min(1.2, p.fullness);
  const meanDev = (p.dev.chest + p.dev.back + p.dev.shoulders + p.dev.arms + p.dev.legs + p.dev.abs) / 6;

  // 体格による x 方向の拡大（肩幅と骨盤幅）
  const widthAt = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - 1.0) / 0.42));
    return ff.hip + (ff.shoulder - ff.hip) * t;
  };
  const shoulderX = ff.shoulder * (1 + (p.dev.shoulders - 40) * 0.0006 + (p.dev.back - 40) * 0.0004);

  // ---- ボーン姿勢（FK） ----
  const heads: V3[] = BONES.map((b) => {
    const h = restHead(b);
    let x = h[0];
    if (b.startsWith('clav') || b.startsWith('upperArm') || b.startsWith('forearm') || b.startsWith('hand')) x *= shoulderX;
    else if (b.startsWith('thigh') || b.startsWith('shin') || b.startsWith('foot')) x *= ff.hip;
    return [x * s, h[1] * s, h[2] * s];
  });
  const mats: Matrix4[] = [];
  const yawQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (pose.yaw * Math.PI) / 180);
  // 四肢: 目標の向きから世界回転を求める（肘・膝のヒンジ方向を合わせる）
  const limbWorld = new Map<number, Quaternion>();
  const solveLimb = (upper: BoneName, lower: BoneName, end: BoneName, dirs: [number[], number[]] | undefined, bendLocal: Vector3) => {
    if (!dirs) return;
    const iu = B(upper), il = B(lower), ie = B(end);
    const restU = new Vector3(...heads[il]).sub(new Vector3(...heads[iu])).normalize();
    const restL = new Vector3(...heads[ie]).sub(new Vector3(...heads[il])).normalize();
    const tu = new Vector3(...dirs[0]).normalize();
    const tl = new Vector3(...dirs[1]).normalize();
    const q1 = new Quaternion().setFromUnitVectors(restU, tu);
    const f = bendLocal.clone().applyQuaternion(q1);
    const bend = tl.clone().sub(tu.clone().multiplyScalar(tl.dot(tu)));
    let qu = q1;
    if (bend.lengthSq() > 1e-4) {
      bend.normalize();
      const fp = f.clone().sub(tu.clone().multiplyScalar(f.dot(tu))).normalize();
      const ang = Math.atan2(new Vector3().crossVectors(fp, bend).dot(tu), fp.dot(bend));
      qu = new Quaternion().setFromAxisAngle(tu, ang).multiply(q1);
    }
    const curL = restL.clone().applyQuaternion(qu);
    const ql = new Quaternion().setFromUnitVectors(curL, tl).multiply(qu);
    limbWorld.set(iu, yawQ.clone().multiply(qu));
    limbWorld.set(il, yawQ.clone().multiply(ql));
  };
  const L = pose.limbs;
  solveLimb('upperArmL', 'forearmL', 'handL', L.armL, new Vector3(0, 0, 1));
  solveLimb('upperArmR', 'forearmR', 'handR', L.armR, new Vector3(0, 0, 1));
  solveLimb('thighL', 'shinL', 'footL', L.legL, new Vector3(0, 0, -1));
  solveLimb('thighR', 'shinR', 'footR', L.legR, new Vector3(0, 0, -1));
  const q = new Quaternion();
  const pq = new Quaternion();
  BONES.forEach((b, i) => {
    const rot = pose.bones[b];
    const m = new Matrix4();
    const parent = PARENT[b];
    const lw = limbWorld.get(i);
    if (lw && parent) {
      // 親の世界回転の逆を掛けてローカル回転に
      pq.setFromRotationMatrix(new Matrix4().extractRotation(mats[B(parent)]));
      q.copy(pq).invert().multiply(lw);
      m.makeRotationFromQuaternion(q);
    } else if (rot) {
      q.setFromEuler(new Euler((rot[0] * Math.PI) / 180, (rot[1] * Math.PI) / 180, (rot[2] * Math.PI) / 180, 'ZYX'));
      m.makeRotationFromQuaternion(q);
    }
    const h = heads[i];
    if (parent === null) {
      const root = new Matrix4().makeRotationFromQuaternion(yawQ);
      root.multiply(new Matrix4().makeTranslation(h[0], h[1], h[2]));
      mats[i] = root.multiply(m);
    } else {
      const pi = B(parent);
      const ph = heads[pi];
      const t = new Matrix4().makeTranslation(h[0] - ph[0], h[1] - ph[1], h[2] - ph[2]);
      mats[i] = mats[pi].clone().multiply(t).multiply(m);
    }
  });

  const tmp = new Vector3();
  const rotM = new Matrix4();
  const out: PosedPrim[] = [];
  for (const d of DEFS) {
    const bi = B(d.bone);
    const side = d.c[0] > 0.004 ? 1 : d.c[0] < -0.004 ? -1 : 0;
    const balance = side === 0 ? 1 : 1 + side * p.imbalance * 0.006;
    let thick = 1, width = 1, len = 1;
    let k = 0.028 * s;
    let latShift = 0;
    if (d.group === 'core') {
      const bt = ff.bone * (1 + (meanDev - 40) * 0.0012);
      thick = bt; width = bt;
      k = (d.k ?? 0.028) * s;
    } else if (d.group === 'face') {
      k = (d.k ?? 0.009) * s;
    } else if (d.group === 'fat') {
      const f = 0.35 + 0.8 * g;
      thick = width = len = f;
      k = 0.045 * s;
    } else {
      const dv = p.dev[d.group];
      const ps = d.partScale ?? 1;
      const t = 1 + (devThick(dv) - 1) * ps;
      const w = 1 + (devWidth(dv) - 1) * ps;
      const flex = d.flex ? pose.flex[d.flex] ?? 1 : 1;
      thick = t * full * balance * flex;
      width = w * balance * (1 + (flex - 1) * 0.4);
      len = 1;
      k = (d.k ?? kMus * (d.kMul ?? 1)) * s;
      if (d.latWiden) latShift = (0.002 + 0.02 * (dv / 100)) * (pose.flex.latsOut ?? 1);
    }
    // 位置の体格補正（ボーンローカルへ）
    const fixPt = (v: V3): Vector3 => {
      let x = v[0];
      if (bi <= B('chest')) x *= widthAt(v[1]);
      if (latShift && Math.abs(x) > 0.08) x += Math.sign(x) * latShift * Math.min(1, (Math.abs(x) - 0.08) / 0.04);
      const h = heads[bi];
      return new Vector3(x * s - h[0], v[1] * s - h[1], v[2] * s - h[2]).applyMatrix4(mats[bi]);
    };
    const rad = (r: V3): number[] => [r[0] * width * s, r[1] * len * s, r[2] * thick * s];
    if (d.kind === Kind.Capsule) {
      const a = fixPt(d.a!), b2 = fixPt(d.b!);
      const ra = d.ra! * s * thick, rb = d.rb! * s * thick;
      out.push({ kind: d.kind, c: a.toArray(), b: b2.toArray(), r: [ra, rb], rt: [], k, bone: bi, ext: Math.max(ra, rb) });
    } else {
      const c = fixPt(d.c);
      const axes = d.axes ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      rotM.extractRotation(mats[bi]);
      const ws = axes.map((a) => tmp.set(a[0], a[1], a[2]).applyMatrix4(rotM).normalize().toArray());
      const r = rad(d.r);
      if (d.latWiden) r[0] *= 1 + latShift * 4;
      out.push({ kind: d.kind, c: c.toArray(), b: [], r, rt: [...ws[0], ...ws[1], ...ws[2]], k, bone: bi, ext: Math.max(...r) });
    }
  }
  return {
    prims: out,
    boneMats: mats.map((m) => Array.from(m.elements)),
    restHeads: heads.map((h) => [...h]),
    fat,
  };
}

export function shapeKey(p: BodyParams): string {
  const d = p.dev;
  return [p.heightCm, p.frame, p.pose, d.chest, d.back, d.shoulders, d.arms, d.legs, d.abs]
    .map((v) => (typeof v === 'number' ? v.toFixed(0) : v))
    .concat([p.bodyFat.toFixed(1), p.imbalance.toFixed(1), p.fullness.toFixed(2)])
    .join('|');
}
