// SDF の格子評価 → Surface Nets による表面メッシュ化。
// 各プリミティブは自分の外接箱の中だけを評価し、多項式 smooth-min で結合する。
import { Kind, type BuiltBody, type PosedPrim } from './anatomy';

export interface BodyMesh {
  positions: Float32Array;
  normals: Float32Array;
  rest: Float32Array; // 基準姿勢での位置（色ムラ・トランクス領域・髪の判定用）
  ao: Float32Array; // 簡易アンビエントオクルージョン
  index: Uint32Array;
}

function primDist(p: PosedPrim, x: number, y: number, z: number): number {
  if (p.kind === Kind.Capsule) {
    const ax = p.c[0], ay = p.c[1], az = p.c[2];
    const bx = p.b[0] - ax, by = p.b[1] - ay, bz = p.b[2] - az;
    const px = x - ax, py = y - ay, pz = z - az;
    let t = (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.r[0] + (p.r[1] - p.r[0]) * t);
  }
  const m = p.rt;
  const qx = x - p.c[0], qy = y - p.c[1], qz = z - p.c[2];
  const lx = (m[0] * qx + m[1] * qy + m[2] * qz) / p.r[0];
  const ly = (m[3] * qx + m[4] * qy + m[5] * qz) / p.r[1];
  const lz = (m[6] * qx + m[7] * qy + m[8] * qz) / p.r[2];
  const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const k1 = Math.sqrt((lx * lx) / (p.r[0] * p.r[0]) + (ly * ly) / (p.r[1] * p.r[1]) + (lz * lz) / (p.r[2] * p.r[2]));
  return k1 === 0 ? -Math.min(p.r[0], p.r[1], p.r[2]) : (k0 * (k0 - 1)) / k1;
}

export function meshBody(body: BuiltBody, h: number): BodyMesh {
  const { prims, fat } = body;
  // 範囲
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const pad = fat + 0.03;
  const boxes = prims.map((p) => {
    const e = p.ext + pad + p.k;
    let x0, y0, z0, x1, y1, z1;
    if (p.kind === Kind.Capsule) {
      x0 = Math.min(p.c[0], p.b[0]) - e; x1 = Math.max(p.c[0], p.b[0]) + e;
      y0 = Math.min(p.c[1], p.b[1]) - e; y1 = Math.max(p.c[1], p.b[1]) + e;
      z0 = Math.min(p.c[2], p.b[2]) - e; z1 = Math.max(p.c[2], p.b[2]) + e;
    } else {
      x0 = p.c[0] - e; x1 = p.c[0] + e; y0 = p.c[1] - e; y1 = p.c[1] + e; z0 = p.c[2] - e; z1 = p.c[2] + e;
    }
    if (p.kind !== Kind.Subtract) {
      minX = Math.min(minX, x0); minY = Math.min(minY, y0); minZ = Math.min(minZ, z0);
      maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); maxZ = Math.max(maxZ, z1);
    }
    return [x0, y0, z0, x1, y1, z1];
  });
  minX -= h * 2; minY -= h * 2; minZ -= h * 2;
  const nx = Math.ceil((maxX - minX) / h) + 3;
  const ny = Math.ceil((maxY - minY) / h) + 3;
  const nz = Math.ceil((maxZ - minZ) / h) + 3;
  const N = nx * ny * nz;
  const field = new Float32Array(N).fill(1);
  const dom = new Uint16Array(N);
  const sxy = nx * ny;

  // 評価（和集合 → 減算の順）
  const order = prims.map((_, i) => i).sort((a, b) => (prims[a].kind === Kind.Subtract ? 1 : 0) - (prims[b].kind === Kind.Subtract ? 1 : 0));
  for (const pi of order) {
    const p = prims[pi];
    const bx = boxes[pi];
    const i0 = Math.max(0, Math.floor((bx[0] - minX) / h)), i1 = Math.min(nx - 1, Math.ceil((bx[3] - minX) / h));
    const j0 = Math.max(0, Math.floor((bx[1] - minY) / h)), j1 = Math.min(ny - 1, Math.ceil((bx[4] - minY) / h));
    const k0 = Math.max(0, Math.floor((bx[2] - minZ) / h)), k1 = Math.min(nz - 1, Math.ceil((bx[5] - minZ) / h));
    const kk = p.k;
    const sub = p.kind === Kind.Subtract;
    for (let k = k0; k <= k1; k++) {
      const z = minZ + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = minY + j * h;
        let idx = i0 + j * nx + k * sxy;
        for (let i = i0; i <= i1; i++, idx++) {
          const x = minX + i * h;
          const d = primDist(p, x, y, z);
          const a = field[idx];
          if (sub) {
            // smooth-max(a, -d)
            const nd = -d;
            const hh = Math.max(kk - Math.abs(a - nd), 0) / kk;
            field[idx] = Math.max(a, nd) + hh * hh * kk * 0.25;
          } else {
            if (d < a) dom[idx] = pi;
            const hh = Math.max(kk - Math.abs(a - d), 0) / kk;
            field[idx] = Math.min(a, d) - hh * hh * kk * 0.25;
          }
        }
      }
    }
  }
  // 皮下脂肪の層：等値面を外側へずらす
  for (let i = 0; i < N; i++) field[i] -= fat;

  // ---- Surface Nets ----
  const cellVert = new Int32Array(N).fill(-1);
  const pos: number[] = [];
  const vdom: number[] = [];
  const corner = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const base = i + j * nx + k * sxy;
        let mask = 0;
        for (let c = 0; c < 8; c++) { v[c] = field[base + corner[c]]; if (v[c] < 0) mask |= 1 << c; }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [e0, e1] of edges) {
          const a = v[e0], b = v[e1];
          if ((a < 0) === (b < 0)) continue;
          const t = a / (a - b);
          const o0 = cOff[e0], o1 = cOff[e1];
          sx += o0[0] + (o1[0] - o0[0]) * t; sy += o0[1] + (o1[1] - o0[1]) * t; sz += o0[2] + (o1[2] - o0[2]) * t;
          cnt++;
        }
        cellVert[base] = pos.length / 3;
        pos.push(minX + (i + sx / cnt) * h, minY + (j + sy / cnt) * h, minZ + (k + sz / cnt) * h);
        // 最も内側の格子点の支配プリミティブ
        let best = 0, bv = Infinity;
        for (let c = 0; c < 8; c++) if (v[c] < bv) { bv = v[c]; best = c; }
        vdom.push(dom[base + corner[best]]);
      }
  const idx: number[] = [];
  // 各格子辺の符号変化ごとに四角形
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const base = i + j * nx + k * sxy;
        const a = field[base] < 0;
        // x 方向の辺: 周囲セル (j-1..j, k-1..k)
        if (i < nx - 1 && a !== field[base + 1] < 0) {
          const c0 = cellVert[base - nx - sxy], c1 = cellVert[base - sxy], c2 = cellVert[base], c3 = cellVert[base - nx];
          quad(c0, c1, c2, c3, a);
        }
        if (j < ny - 1 && a !== field[base + nx] < 0) {
          const c0 = cellVert[base - 1 - sxy], c1 = cellVert[base - 1], c2 = cellVert[base], c3 = cellVert[base - sxy];
          quad(c0, c1, c2, c3, a);
        }
        if (k < nz - 1 && a !== field[base + sxy] < 0) {
          const c0 = cellVert[base - 1 - nx], c1 = cellVert[base - nx], c2 = cellVert[base], c3 = cellVert[base - 1];
          quad(c0, c1, c2, c3, a);
        }
      }
  function quad(a: number, b: number, c: number, d: number, flip: boolean) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  }

  // ---- 法線（場の勾配）・AO・基準姿勢位置 ----
  const sample = (x: number, y: number, z: number) => {
    const fx = (x - minX) / h, fy = (y - minY) / h, fz = (z - minZ) / h;
    let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    i = Math.min(Math.max(i, 0), nx - 2); j = Math.min(Math.max(j, 0), ny - 2); k = Math.min(Math.max(k, 0), nz - 2);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const b0 = i + j * nx + k * sxy;
    const c000 = field[b0], c100 = field[b0 + 1], c010 = field[b0 + nx], c110 = field[b0 + nx + 1];
    const c001 = field[b0 + sxy], c101 = field[b0 + sxy + 1], c011 = field[b0 + sxy + nx], c111 = field[b0 + sxy + nx + 1];
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
  const nv = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(nv * 3);
  const ao = new Float32Array(nv);
  const rest = new Float32Array(nv * 3);
  const e = h * 0.75;
  const mats = body.boneMats, heads = body.restHeads;
  for (let i = 0; i < nv; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let gx = sample(x + e, y, z) - sample(x - e, y, z);
    let gy = sample(x, y + e, z) - sample(x, y - e, z);
    let gz = sample(x, y, z + e) - sample(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    normals[i * 3] = gx; normals[i * 3 + 1] = gy; normals[i * 3 + 2] = gz;
    // SDF AO: 法線方向に数点サンプル
    let occ = 0, w = 1;
    for (let s = 1; s <= 5; s++) {
      const dd = s * 0.009;
      const f = sample(x + gx * dd, y + gy * dd, z + gz * dd);
      occ += w * Math.max(0, dd - f);
      w *= 0.62;
    }
    ao[i] = Math.max(0.35, 1 - occ * 16);
    // 基準姿勢へ戻す: rest = R^T (p - t) + head
    const bone = prims[vdom[i]].bone;
    const m = mats[bone], hd = heads[bone];
    const qx = x - m[12], qy = y - m[13], qz = z - m[14];
    rest[i * 3] = m[0] * qx + m[1] * qy + m[2] * qz + hd[0];
    rest[i * 3 + 1] = m[4] * qx + m[5] * qy + m[6] * qz + hd[1];
    rest[i * 3 + 2] = m[8] * qx + m[9] * qy + m[10] * qz + hd[2];
  }
  return { positions, normals, rest, ao, index: new Uint32Array(idx) };
}
