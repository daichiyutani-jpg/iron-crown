// ポーズ定義。
// 腕・脚は「上腕/前腕（大腿/下腿）の向き」をモデル座標（x=選手の左, y=上, z=前）で指定し、
// 肘・膝のヒンジ方向を含めた回転は anatomy.ts で自動計算する。体幹などはオイラー角（度, ZYX）。
export type PoseId = 'relaxed' | 'frontDouble' | 'frontLat' | 'sideChest' | 'backDouble' | 'absThigh';

type Rot = [number, number, number];
export type V3 = [number, number, number];
export type Limb = [V3, V3];
export interface PoseDef {
  id: PoseId;
  label: string;
  yaw: number;
  bones: Record<string, Rot>;
  limbs: { armL?: Limb; armR?: Limb; legL?: Limb; legR?: Limb };
  flex: Record<string, number>;
}

const mx = (v: V3): V3 => [-v[0], v[1], v[2]];
const mirrorLimb = (l: Limb): Limb => [mx(l[0]), mx(l[1])];
function sym(left: Record<string, Rot>, right: Record<string, Rot> = {}): Record<string, Rot> {
  const out: Record<string, Rot> = {};
  for (const [k, v] of Object.entries(left)) {
    if (k.endsWith('L')) out[k.slice(0, -1) + 'R'] = [v[0], -v[1], -v[2]];
    out[k] = v;
  }
  return { ...out, ...right };
}
function limbs(armL?: Limb, legL?: Limb, armR?: Limb, legR?: Limb) {
  return {
    armL, legL,
    armR: armR ?? (armL && mirrorLimb(armL)),
    legR: legR ?? (legL && mirrorLimb(legL)),
  };
}

export const POSES: Record<PoseId, PoseDef> = {
  relaxed: {
    id: 'relaxed', label: 'リラックス', yaw: 0,
    bones: sym({}),
    limbs: limbs([[0.2, -1, -0.03], [0.12, -1, 0.14]], [[0.04, -1, 0], [0.0, -1, -0.02]]),
    flex: {},
  },
  frontDouble: {
    id: 'frontDouble', label: 'フロント・ダブルバイセップス', yaw: 0,
    bones: sym({ clavL: [0, 0, 7], handL: [-25, 0, 0] }),
    limbs: limbs([[1, 0.1, 0.16], [-0.14, 1, 0.1]], [[0.1, -1, 0.02], [0.02, -1, 0]]),
    flex: { biceps: 1.24, quads: 1.06, lats: 1.05, abs: 1.05, triceps: 1.03 },
  },
  frontLat: {
    id: 'frontLat', label: 'フロント・ラットスプレッド', yaw: 0,
    bones: sym({ clavL: [0, 0, 4] }),
    limbs: limbs([[0.55, -0.75, -0.3], [-0.62, -0.5, 0.38]], [[0.1, -1, 0.02], [0.02, -1, 0]]),
    flex: { lats: 1.22, latsOut: 1.5, quads: 1.06, chest: 1.04 },
  },
  sideChest: {
    id: 'sideChest', label: 'サイドチェスト', yaw: -74,
    bones: sym({ chest: [0, -9, 0], neck: [0, 30, 0], footL: [32, 0, 0] }),
    limbs: limbs(
      [[0.1, -0.75, 0.65], [-1, 0.15, 0.1]],
      [[0.03, -0.95, 0.28], [0.0, -1, -0.06]],
      [[0.15, -0.9, 0.4], [0.6, 0.4, 0.5]],
      [[-0.04, -1, 0], [-0.01, -1, -0.02]],
    ),
    flex: { chest: 1.12, biceps: 1.16, quads: 1.08, calves: 1.08 },
  },
  backDouble: {
    id: 'backDouble', label: 'バック・ダブルバイセップス', yaw: 180,
    bones: sym({ clavL: [0, 0, 7], handL: [-25, 0, 0] }, { footR: [35, 0, 0] }),
    limbs: limbs(
      [[1, 0.16, -0.08], [-0.12, 1, 0.02]],
      [[0.08, -1, 0], [0.02, -1, 0]],
      undefined,
      [[-0.08, -1, -0.14], [-0.03, -1, -0.32]],
    ),
    flex: { biceps: 1.22, back: 1.12, lats: 1.1, traps: 1.1, hams: 1.06, calves: 1.14 },
  },
  absThigh: {
    id: 'absThigh', label: 'アブドミナル＆サイ', yaw: 0,
    bones: sym({ spine: [7, 0, 0], chest: [6, 0, 0], neck: [-8, 0, 0] }),
    limbs: limbs(
      [[0.45, 0.85, -0.2], [-0.8, 0.0, -0.12]],
      [[0.09, -0.97, 0.2], [0.03, -1, 0.04]],
      undefined,
      [[-0.06, -1, 0], [-0.01, -1, 0]],
    ),
    flex: { abs: 1.2, quads: 1.12 },
  },
};

export const POSE_ORDER: PoseId[] = ['relaxed', 'frontDouble', 'frontLat', 'sideChest', 'backDouble', 'absThigh'];
