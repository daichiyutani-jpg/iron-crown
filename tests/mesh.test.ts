import { it, expect } from 'vitest';
import { buildBody, type BodyParams } from '../src/body/anatomy';
import { meshBody } from '../src/body/mesher';

const base: BodyParams = { heightCm: 175, frame: 'meso', dev: { chest: 45, back: 45, shoulders: 45, arms: 45, legs: 45, abs: 45 }, bodyFat: 13, imbalance: 0, fullness: 1, pose: 'relaxed' };

it('メッシュが生成され、法線が外向き', () => {
  for (const h of [0.0095, 0.0115]) {
    const t0 = performance.now();
    const m = meshBody(buildBody(base), h);
    const ms = performance.now() - t0;
    console.log('h', h, 'verts', m.positions.length / 3, 'tris', m.index.length / 3, 'ms', ms.toFixed(0));
    expect(m.index.length).toBeGreaterThan(10000);
    // 面の向きと勾配法線の一致率
    let agree = 0;
    const P = m.positions, N = m.normals, I = m.index;
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * N[a] + ny * N[a + 1] + nz * N[a + 2] > 0) agree++;
    }
    expect(agree / (I.length / 3)).toBeGreaterThan(0.95);
  }
});

it('体脂肪率と筋肉で形が変わる', () => {
  const lean = meshBody(buildBody({ ...base, bodyFat: 5, dev: { chest: 80, back: 80, shoulders: 80, arms: 80, legs: 80, abs: 80 } }), 0.012);
  const soft = meshBody(buildBody({ ...base, bodyFat: 22, dev: { chest: 20, back: 20, shoulders: 20, arms: 20, legs: 20, abs: 20 } }), 0.012);
  const width = (m: ReturnType<typeof meshBody>) => { let mx = 0; for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i + 1] - 1.1) < 0.02) mx = Math.max(mx, m.positions[i + 2]); return mx; };
  console.log('waist front z lean', width(lean).toFixed(3), 'soft', width(soft).toFixed(3));
  expect(width(soft)).toBeGreaterThan(width(lean));
});
