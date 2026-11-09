// three.js による選手の 3D 表示。メッシュ生成はワーカー、肌色・トランクスはメインスレッドで即時反映。
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DataTexture, DirectionalLight, DoubleSide, Group, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshToonMaterial, NearestFilter, NoToneMapping, PCFShadowMap, PerspectiveCamera, PMREMGenerator, Quaternion, Scene, ShaderMaterial,
  SpotLight, SRGBColorSpace, Vector3, WebGLRenderer, CircleGeometry, BackSide, Fog,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { shapeKey, type BodyParams } from './anatomy';
import type { BodyMesh } from './mesher';

export type TrunksMaterial = 'matte' | 'satin' | 'velvet' | 'metallic';
export type TrunksDesign = 'solid' | 'sideLine' | 'twoTone' | 'rhinestone';
export interface TrunksLook {
  color: string;
  accent: string;
  material: TrunksMaterial;
  design: TrunksDesign;
  cut: 'standard' | 'classic';
}
export interface Look {
  skinTone: number; // 0 明るめ / 1 標準 / 2 濃いめ
  tan: number; // 0〜100 色の濃さ
  uneven: number; // 0〜100 色ムラ
  orange: number; // 0〜1 安価な製品のオレンジがかり
  shine: number; // 0〜1 ツヤ（ポージングオイル）
  trunks: TrunksLook;
}

const SKIN_BASE = [new Color('#e8bfa0'), new Color('#cf9a76'), new Color('#9c6a4a')];
const TAN_DEEP = new Color('#4a2716');
const TAN_ORANGE = new Color('#a8551f');

function hash3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r * 2 - 1;
}

/** 基準姿勢の位置（175cm 換算）がトランクスに覆われるか */
export function inTrunks(x: number, y: number, z: number, cut: 'standard' | 'classic'): boolean {
  const ax = Math.abs(x);
  if (ax > 0.2 || y < 0.76 || y > 1.03) return false;
  const back = Math.min(1, Math.max(0, (0.03 - z) / 0.08));
  if (cut === 'classic') {
    const top = 0.978 + 0.012 * back;
    const bottom = 0.79 + 0.012 * Math.min(1, ax / 0.15);
    return y < top && y > bottom;
  }
  const top = 0.952 + 0.022 * back;
  const side = Math.min(1, Math.max(0, (ax - 0.025) / 0.12));
  const bottomFront = 0.848 + 0.07 * side;
  const bottomBack = 0.842 + 0.045 * side;
  const bottom = bottomFront + (bottomBack - bottomFront) * back;
  return y < top && y > bottom;
}

function trunksTexture(t: TrunksLook): { map: CanvasTexture; emissive: CanvasTexture | null } {
  const W = 1024, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = t.color; g.fillRect(0, 0, W, H);
  // 布目
  g.globalAlpha = t.material === 'velvet' ? 0.08 : 0.04;
  for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000'; g.fillRect(Math.random() * W, Math.random() * H, 2, 1); }
  g.globalAlpha = 1;
  // u: 0=背中央, 0.25=右側面, 0.5=前中央, 0.75=左側面
  const sides = [0.25, 0.75];
  let em: CanvasTexture | null = null;
  if (t.design === 'sideLine') {
    g.fillStyle = t.accent;
    for (const s of sides) { g.fillRect(s * W - 14, 0, 9, H); g.fillRect(s * W + 6, 0, 9, H); }
  } else if (t.design === 'twoTone') {
    g.fillStyle = t.accent;
    for (const s of sides) g.fillRect(s * W - 40, 0, 80, H);
  } else if (t.design === 'rhinestone') {
    const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
    const eg = ec.getContext('2d')!; eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
    for (const s of sides) {
      for (let y = 6; y < H; y += 13) for (let k = -2; k <= 2; k++) {
        const x = s * W + k * 12 + ((y / 13) % 2) * 6;
        g.fillStyle = t.accent; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
        eg.fillStyle = '#ffffff'; eg.beginPath(); eg.arc(x, y, 2.4, 0, Math.PI * 2); eg.fill();
      }
    }
    // 上端のライン
    for (let x = 0; x < W; x += 11) {
      g.fillStyle = t.accent; g.beginPath(); g.arc(x, 8, 3, 0, Math.PI * 2); g.fill();
      eg.fillStyle = '#bbbbbb'; eg.beginPath(); eg.arc(x, 8, 2, 0, Math.PI * 2); eg.fill();
    }
    em = new CanvasTexture(ec); em.colorSpace = SRGBColorSpace;
  }
  const map = new CanvasTexture(cv);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return { map, emissive: em };
}

// アニメ調の輪郭線（裏面を法線方向へ少し押し出して黒く塗る。画面上の太さがほぼ一定になるよう距離で補正）
function makeOutlineMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    uniforms: { uWidth: { value: 0.0016 }, uColor: { value: new Color('#120a08') } },
    vertexShader: `uniform float uWidth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uWidth * clamp(-mv.z, 0.6, 6.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}

// ---- アニメ調（セル）シェーディング ----
// 明暗を段に分ける階調。暗部は真っ黒にせず、肌の影色として残す
function toonGradient(steps: number[]) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255; });
  const t = new DataTexture(d, steps.length, 1);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
const SKIN_GRADIENT = toonGradient([0.5, 0.78, 1.0]);
const HAIR_GRADIENT = toonGradient([0.45, 1.0]);
/** 主光源の向き（視点座標）。毎フレーム更新して、ハイライトの位置を光に合わせる */
const KEY_DIR = { value: new Vector3(0.2, 0.6, 0.8) };

/** セルの上に、くっきりしたハイライト・縁の光（リムライト）・筋肉の溝の線を足す */
function toonExtras(o: { rim: string; rimAmt: number; spec: number; crease: boolean }) {
  const rc = new Color(o.rim).toArray().map((v) => v.toFixed(3)).join(',');
  return `
{
  vec3 tN = normalize(normal);
  vec3 tV = normalize(vViewPosition);
  float fres = 1.0 - clamp(dot(tN, tV), 0.0, 1.0);
  float rim = smoothstep(0.6, 0.66, fres);
  outgoingLight += vec3(${rc}) * rim * ${o.rimAmt.toFixed(2)};
  vec3 tH = normalize(uKeyDir + tV);
  float sp = smoothstep(0.988 - uShine * 0.02, 0.991 - uShine * 0.02, dot(tN, tH));
  outgoingLight += vec3(1.0, 0.96, 0.88) * sp * (${o.spec.toFixed(2)} + uShine * 0.45);
  ${o.crease ? `float crease = smoothstep(0.66, 0.5, vAo);
  outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.42, 0.3, 0.28), crease * 0.85);` : ''}
}`;
}
function injectToon(sh: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }, extras: string, shine: { value: number }) {
  sh.uniforms.uKeyDir = KEY_DIR;
  sh.uniforms.uShine = shine;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uKeyDir;
uniform float uShine;`)
    .replace('#include <opaque_fragment>', `${extras}
#include <opaque_fragment>`);
}

// 頭髪・眉・目・唇はピクセル単位で塗る（頂点色だと格子の段が見える）
function addFaceShader(m: MeshToonMaterial, shine: { value: number }) {
  m.onBeforeCompile = (sh) => {
    injectToon(sh, toonExtras({ rim: '#ffe2b8', rimAmt: 0.42, spec: 0.1, crease: true }), shine);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aRest;
attribute float aAo;
varying vec3 vRest;
varying float vAo;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = aRest; vAo = aAo;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest;
varying float vAo;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vRest.y > 1.55) {
  vec3 p = vRest; float ax = abs(p.x);
  float shade = 0.25 + 0.75 * vAo;
  // 生え際: 前は高く、耳の上で下がり、後ろは襟足まで
  float line = p.z > 0.0 ? mix(1.664, 1.699, smoothstep(0.0, 0.07, p.z)) : mix(1.664, 1.6, smoothstep(0.0, -0.06, p.z));
  float hair = smoothstep(line - 0.003, line + 0.004, p.y);
  float ear = smoothstep(0.066, 0.074, ax) * smoothstep(0.035, 0.02, abs(p.z + 0.006)) * smoothstep(1.672, 1.664, p.y);
  hair *= 1.0 - ear;
  float wisp = 0.85 + 0.15 * sin(p.x * 900.0 + p.z * 700.0) * sin(p.y * 1100.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.009, 0.006, 0.004) * shade * wisp, hair * 0.96);
  float brow = exp(-pow((p.y - 1.6745 - 0.04 * (ax - 0.03) * (ax - 0.03) * 40.0) / 0.0042, 2.0))
    * smoothstep(0.072, 0.082, p.z) * smoothstep(0.009, 0.016, ax) * smoothstep(0.054, 0.045, ax);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.008, 0.006) * shade, brow * 0.8);
  // アニメ調の目: 白目・黒目・上まぶたの太い線・光の点
  float front = smoothstep(0.062, 0.074, p.z);
  vec2 e = vec2((ax - 0.031) / 0.0135, (p.y - 1.6555 - 0.06 * (ax - 0.031)) / 0.0058);
  float white = smoothstep(1.05, 0.9, length(e)) * front;
  float iris = smoothstep(0.7, 0.6, length(vec2(e.x * 1.25, e.y * 0.9))) * front;
  float lid = smoothstep(0.16, 0.0, abs(e.y - 0.78 + 0.25 * e.x * e.x)) * step(abs(e.x), 1.15) * front;
  float glint = smoothstep(0.22, 0.12, length(vec2(e.x * 1.25 + 0.15, e.y - 0.25))) * front;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.88), white * 0.95);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.035, 0.025), iris);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.012, 0.01), lid);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glint);
  float lip = exp(-pow((p.y - 1.598) / 0.0035, 2.0) - pow(ax / 0.017, 2.0)) * smoothstep(0.082, 0.09, p.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.06, 0.045) * shade, lip * 0.45);
}`);
  };
}

const TRUNKS_GLSL = `
uniform float uCut;
varying vec3 vRest;
bool inTrunks(vec3 p) {
  float ax = abs(p.x);
  if (ax > 0.2 || p.y < 0.76 || p.y > 1.03) return false;
  float back = clamp((0.03 - p.z) / 0.08, 0.0, 1.0);
  if (uCut > 0.5) {
    float top = 0.978 + 0.012 * back;
    float bottom = 0.79 + 0.012 * min(1.0, ax / 0.15);
    return p.y < top && p.y > bottom;
  }
  float top = 0.952 + 0.022 * back;
  float side = clamp((ax - 0.025) / 0.12, 0.0, 1.0);
  float bf = 0.848 + 0.07 * side;
  float bb = 0.842 + 0.045 * side;
  float bottom = mix(bf, bb, back);
  return p.y < top && p.y > bottom;
}
`;

function makeTrunksMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6 });
  const cut = { value: 0 };
  m.userData.cut = cut;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = cut;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aRest;
varying vec3 vRest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = aRest;`);
    const uv = 'vec2 tuv = vec2(atan(vRest.x, vRest.z) / 6.2831853 + 0.5, (vRest.y - 0.78) / 0.22);';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${TRUNKS_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (!inTrunks(vRest)) discard;
${uv}`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
 diffuseColor *= texture2D(map, tuv);
#endif`)
      .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
 totalEmissiveRadiance *= texture2D(emissiveMap, tuv).rgb;
#endif`);
  };
  return m;
}

// 床の光の輪（中心がほんのり明るい金色、外周に細い輪）
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 6, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,214,140,0.42)');
  gr.addColorStop(0.55, 'rgba(232,180,90,0.16)');
  gr.addColorStop(0.78, 'rgba(232,194,90,0.10)');
  gr.addColorStop(0.81, 'rgba(240,200,100,0.55)');
  gr.addColorStop(0.84, 'rgba(232,194,90,0.0)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// 背景の幕: 上下は暗い紺、選手の後ろの帯がほんのり明るい
function backdropMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP;
void main() {
  float h = clamp((vP.y + 4.0) / 8.0, 0.0, 1.0);
  float behind = smoothstep(-1.0, -5.5, vP.z);
  vec3 c = mix(vec3(0.02, 0.03, 0.07), vec3(0.06, 0.09, 0.2), smoothstep(0.38, 0.62, h));
  c += vec3(0.08, 0.1, 0.22) * behind * (1.0 - smoothstep(0.0, 0.25, abs(h - 0.6)));
  c = mix(c, vec3(0.01, 0.015, 0.035), smoothstep(0.78, 1.0, h));
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}

// 上から差す光の帯（下へ行くほど薄く、縁ほど薄い）
function beamMaterial(col: string) {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { uCol: { value: new Color(col) } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
void main() { vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV;
void main() {
  float along = smoothstep(-3.0, 3.0, vY);
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
  gl_FragColor = vec4(uCol * 0.08 * along * edge, 1.0);
}`,
  });
}

/**
 * アニメ調の髪（イラストと同じ、側面を短くして上を立ち上げた、とがった黒髪）。
 * 頭皮の部分を法線方向へ押し出した「帽子」と、上と前に立つ毛束（円すい）でつくる。
 * ポーズで頭が回っても付いてくるよう、頭の頂点から「基準姿勢→今の姿勢」の回転と移動を求めて毛束に当てる。
 */
function buildHair(mesh: BodyMesh, scale: number): BufferGeometry {
  const P = mesh.positions, R = mesh.rest, N = mesh.normals;
  const n = P.length / 3;
  const inHair = (x: number, y: number, z: number) => {
    const line = z > 0 ? 1.664 + (1.699 - 1.664) * Math.min(1, z / 0.07) : 1.664 + (1.6 - 1.664) * Math.min(1, -z / 0.06);
    const ear = Math.abs(x) > 0.066 && Math.abs(z + 0.006) < 0.03 && y < 1.672;
    return y > line + 0.001 && !ear;
  };
  // 帽子: 上ほど厚く（ボリューム）、横と後ろは薄く（刈り上げ）
  const thick = (y: number) => (0.0025 + 0.016 * Math.min(1, Math.max(0, (y - 1.685) / 0.05))) * scale;
  const ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = R[i * 3] / scale, y = R[i * 3 + 1] / scale, z = R[i * 3 + 2] / scale;
    ok[i] = y > 1.58 && inHair(x, y, z) ? 1 : 0;
  }
  const remap = new Int32Array(n).fill(-1);
  const cp: number[] = [], cn: number[] = [], ci: number[] = [];
  const idx = mesh.index;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if (!ok[a] || !ok[b] || !ok[c]) continue;
    for (const v of [a, b, c]) {
      if (remap[v] < 0) {
        remap[v] = cp.length / 3;
        const t = thick(R[v * 3 + 1] / scale);
        cp.push(P[v * 3] + N[v * 3] * t, P[v * 3 + 1] + N[v * 3 + 1] * t, P[v * 3 + 2] + N[v * 3 + 2] * t);
        cn.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      }
      ci.push(remap[v]);
    }
  }
  const cap = new BufferGeometry();
  cap.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3));
  cap.setAttribute('normal', new BufferAttribute(new Float32Array(cn), 3));
  cap.setIndex(ci);

  // 頭の向き: 頭の頂点の重心と、頭頂・額の点から座標軸をつくり、基準姿勢と今の姿勢で比べる
  const head: number[] = [];
  for (let i = 0; i < n; i++) if (R[i * 3 + 1] / scale > 1.6) head.push(i);
  const cr = new Vector3(), cpp = new Vector3();
  for (const i of head) {
    cr.x += R[i * 3]; cr.y += R[i * 3 + 1]; cr.z += R[i * 3 + 2];
    cpp.x += P[i * 3]; cpp.y += P[i * 3 + 1]; cpp.z += P[i * 3 + 2];
  }
  cr.divideScalar(head.length || 1); cpp.divideScalar(head.length || 1);
  const nearest = (tx: number, ty: number, tz: number) => {
    let best = head[0], bd = Infinity;
    for (const i of head) {
      const d = (R[i * 3] / scale - tx) ** 2 + (R[i * 3 + 1] / scale - ty) ** 2 + (R[i * 3 + 2] / scale - tz) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const top = nearest(0, 1.77, -0.012), fr = nearest(0, 1.664, 0.1);
  const frame = (arr: Float32Array, c: Vector3) => {
    const v = new Vector3(arr[top * 3], arr[top * 3 + 1], arr[top * 3 + 2]).sub(c).normalize();
    const u = new Vector3(arr[fr * 3], arr[fr * 3 + 1], arr[fr * 3 + 2]).sub(c);
    u.sub(v.clone().multiplyScalar(u.dot(v))).normalize();
    const w = new Vector3().crossVectors(v, u);
    return new Matrix4().makeBasis(w, v, u);
  };
  const rot = frame(P, cpp).multiply(frame(R, cr).transpose());
  const tmp = new Vector3();
  const toWorld = (x: number, y: number, z: number) => tmp.set(x * scale, y * scale, z * scale).sub(cr).applyMatrix4(rot).add(cpp);

  // 毛束: 前と上は上へ立ち上げ、後ろは後ろ上へ流す
  const C = [0, 1.664, -0.012], RAD = [0.079, 0.096, 0.099];
  const tufts: [number, number, number, number][] = [
    // [方位(度・0=正面), 仰角(度), 長さ, 太さ]
    [0, 34, 0.068, 0.022], [-26, 32, 0.062, 0.021], [26, 32, 0.062, 0.021], [-50, 28, 0.048, 0.019], [50, 28, 0.048, 0.019],
    [-13, 54, 0.068, 0.023], [13, 54, 0.068, 0.023], [-40, 50, 0.056, 0.021], [40, 50, 0.056, 0.021],
    [0, 72, 0.064, 0.025], [-65, 62, 0.046, 0.02], [65, 62, 0.046, 0.02],
    [180, 62, 0.048, 0.023], [-140, 56, 0.044, 0.021], [140, 56, 0.044, 0.021], [-100, 60, 0.042, 0.02], [100, 60, 0.042, 0.02],
  ];
  const up = new Vector3(0, 1, 0);
  const parts: BufferGeometry[] = [cap.toNonIndexed()];
  for (const [az, el, len, rad] of tufts) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    const dir = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const base = new Vector3(C[0] + dir.x * RAD[0] * 0.9, C[1] + dir.y * RAD[1] * 0.9, C[2] + dir.z * RAD[2] * 0.9);
    const grow = dir.clone().lerp(up, Math.abs(az) < 60 ? 0.55 : 0.25).normalize();
    if (Math.abs(az) > 90) grow.lerp(new Vector3(0, -0.2, -1), 0.35).normalize();
    const cone = new ConeGeometry(rad, len, 6, 1, false);
    cone.translate(0, len / 2, 0);
    cone.applyQuaternion(new Quaternion().setFromUnitVectors(up, grow));
    cone.translate(base.x, base.y, base.z);
    const pa = cone.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const w = toWorld(pa.getX(i), pa.getY(i), pa.getZ(i));
      pa.setXYZ(i, w.x, w.y, w.z);
    }
    cone.deleteAttribute('uv');
    cone.computeVertexNormals();
    parts.push(cone.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

class BodyViewer {
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.05, 50);
  private controls: OrbitControls | null = null;
  private host: HTMLElement | null = null;
  private overlay: HTMLDivElement;
  private group = new Group();
  private skin: Mesh | null = null;
  private outline: Mesh | null = null;
  private outlineMat = makeOutlineMaterial();
  private trunks: Mesh | null = null;
  private shine = { value: 0 };
  private skinMat = (() => { const m = new MeshToonMaterial({ vertexColors: true, gradientMap: SKIN_GRADIENT }); addFaceShader(m, this.shine); return m; })();
  private hairMat = (() => {
    const m = new MeshToonMaterial({ color: '#1b130e', gradientMap: HAIR_GRADIENT });
    m.onBeforeCompile = (sh) => injectToon(sh, toonExtras({ rim: '#8a7a6a', rimAmt: 0.3, spec: 0.12, crease: false }), { value: 0 });
    return m;
  })();
  private hair: Mesh | null = null;
  private hairOutline: Mesh | null = null;
  private keyLight: SpotLight | null = null;
  private trunksMat = makeTrunksMaterial();
  private worker: Worker;
  private reqId = 0;
  private cache = new Map<string, { mesh: BodyMesh; scale: number }>();
  private current: { mesh: BodyMesh; scale: number } | null = null;
  private look: Look | null = null;
  private trunksKey = '';
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private pending = new Map<number, (v: { mesh: BodyMesh; scale: number }) => void>();
  private wantKey = '';
  private h = 0.011;

  constructor() {
    this.worker = new Worker(new URL('./bodyWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const cb = this.pending.get(ev.data.id);
      if (cb) { this.pending.delete(ev.data.id); cb(ev.data); }
    };
    this.overlay = document.createElement('div');
    this.overlay.className = 'viewer-loading';
    this.overlay.textContent = '体を生成中…';
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.h = mobile ? 0.0115 : 0.0095;
  }

  private init() {
    const r = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = NoToneMapping; // セル調は色をそのまま出す
    r.outputColorSpace = SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap;
    this.renderer = r;
    const pm = new PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    this.scene.background = new Color('#070b18');
    this.scene.fog = new Fog('#070b18', 8, 16);

    // ステージ（アニメの大会会場風: 紺の背景・床の光の輪・上からの光の帯）
    const floor = new Mesh(new CircleGeometry(3.2, 64), new MeshToonMaterial({ color: '#141d3c', gradientMap: HAIR_GRADIENT }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const glow = new Mesh(new CircleGeometry(1.15, 64), new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.003;
    this.scene.add(glow);
    const back = new Mesh(new CylinderGeometry(6, 6, 8, 48, 1, true), backdropMaterial());
    back.position.y = 3.5;
    this.scene.add(back);
    for (const [x, z, tilt, col] of [[-1.5, -1.2, 0.3, '#fff0c8'], [1.5, -1.2, -0.3, '#cfe0ff'], [0, -2.2, 0, '#fff6e0']] as const) {
      const beam = new Mesh(new ConeGeometry(0.75, 6, 32, 1, true), beamMaterial(col));
      beam.position.set(x, 3.0, z);
      beam.rotation.z = tilt;
      this.scene.add(beam);
    }

    // 照明: セル調は光が多いと段がばらつくので、上からのキーと弱い補助光だけ（縁の光はシェーダーで描く）
    this.scene.add(new HemisphereLight('#c8d2ff', '#2a1a14', 1.1));
    const key = new SpotLight('#fff3e2', 60, 0, Math.PI / 6, 0.4, 1.5);
    key.position.set(0.9, 4.8, 3.4);
    key.target.position.set(0, 1.0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.012;
    key.shadow.camera.near = 2; key.shadow.camera.far = 9;
    this.scene.add(key, key.target);
    this.keyLight = key;
    const fill = new DirectionalLight('#d9e2ff', 0.35);
    fill.position.set(-3, 2, 4);
    this.scene.add(fill);

    this.scene.add(this.group);
    this.camera.position.set(0, 1.05, 4.5);
    const c = new OrbitControls(this.camera, r.domElement);
    c.target.set(0, 0.95, 0);
    c.enablePan = false;
    c.enableDamping = true;
    c.minDistance = 1.4;
    c.maxDistance = 7;
    c.minPolarAngle = Math.PI * 0.2;
    c.maxPolarAngle = Math.PI * 0.56;
    c.update();
    this.controls = c;
  }

  attach(el: HTMLElement) {
    if (!this.renderer) this.init();
    const r = this.renderer!;
    this.host = el;
    el.appendChild(r.domElement);
    el.appendChild(this.overlay);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.host || !this.host.isConnected) { cancelAnimationFrame(this.raf); return; }
      this.controls!.update();
      if (this.keyLight) {
        this.camera.updateMatrixWorld();
        KEY_DIR.value.copy(this.keyLight.position).sub(this.keyLight.target.position).normalize().transformDirection(this.camera.matrixWorldInverse);
      }
      r.render(this.scene, this.camera);
    };
    loop();
  }

  private resize() {
    if (!this.host || !this.renderer) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 全身・上半身・脚などに視点を合わせる */
  frame(mode: 'full' | 'upper' | 'lower' = 'full') {
    if (!this.controls) return;
    const t = mode === 'upper' ? 1.3 : mode === 'lower' ? 0.55 : 0.95;
    const dist = mode === 'full' ? 4.5 : 2.6;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.set(0, t, 0);
    this.camera.position.copy(new Vector3(0, t, 0).add(dir.multiplyScalar(dist)));
    this.camera.position.y = t + 0.12;
  }

  resetView() {
    if (!this.controls) return;
    this.controls.target.set(0, 0.95, 0);
    this.camera.position.set(0, 1.05, 4.5);
  }

  private request(params: BodyParams): Promise<{ mesh: BodyMesh; scale: number }> {
    const key = shapeKey(params);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const id = ++this.reqId;
    return new Promise((res) => {
      this.pending.set(id, (v) => {
        this.cache.set(key, v);
        if (this.cache.size > 10) this.cache.delete(this.cache.keys().next().value!);
        res(v);
      });
      this.worker.postMessage({ id, params, h: this.h });
    });
  }

  /** 体型を反映（形状が変わる時だけ再生成） */
  async setBody(params: BodyParams): Promise<void> {
    const key = shapeKey(params);
    this.wantKey = key;
    if (!this.cache.has(key)) this.overlay.style.display = 'flex';
    const data = await this.request(params);
    if (this.wantKey !== key) return;
    this.overlay.style.display = 'none';
    if (this.current === data && this.skin) return;
    this.current = data;
    this.rebuild();
  }

  /** 先読み（ポーズ切替を速くする） */
  prefetch(params: BodyParams) { void this.request(params); }

  setLook(look: Look) {
    const cutChanged = !this.look || this.look.trunks.cut !== look.trunks.cut;
    this.look = look;
    void cutChanged;
    this.paintSkin();
    this.applyTrunksMaterial();
  }

  private rebuild() {
    if (!this.current || !this.look) return;
    const { mesh, scale } = this.current;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(mesh.positions.length), 3));
    const restN = new Float32Array(mesh.rest.length);
    for (let i = 0; i < restN.length; i++) restN[i] = mesh.rest[i] / scale;
    geo.setAttribute('aRest', new BufferAttribute(restN, 3));
    geo.setAttribute('aAo', new BufferAttribute(mesh.ao, 1));
    geo.setIndex(new BufferAttribute(mesh.index, 1));
    // トランクス: 周辺の三角形を抜き出して少し浮かせ、境界はシェーダーでピクセル単位に切り抜く
    const n = mesh.positions.length / 3;
    const near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const ry = mesh.rest[i * 3 + 1] / scale, rx = Math.abs(mesh.rest[i * 3] / scale);
      near[i] = ry > 0.74 && ry < 1.05 && rx < 0.21 ? 1 : 0;
    }
    const remap = new Int32Array(n).fill(-1);
    const tp: number[] = [], tn: number[] = [], tr: number[] = [], ti: number[] = [];
    const idx = mesh.index;
    const off = 0.0026 * scale;
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f], b = idx[f + 1], c = idx[f + 2];
      if (!near[a] && !near[b] && !near[c]) continue;
      for (const v of [a, b, c]) {
        if (remap[v] < 0) {
          remap[v] = tp.length / 3;
          tp.push(mesh.positions[v * 3] + mesh.normals[v * 3] * off, mesh.positions[v * 3 + 1] + mesh.normals[v * 3 + 1] * off, mesh.positions[v * 3 + 2] + mesh.normals[v * 3 + 2] * off);
          tn.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
          tr.push(mesh.rest[v * 3] / scale, mesh.rest[v * 3 + 1] / scale, mesh.rest[v * 3 + 2] / scale);
        }
        ti.push(remap[v]);
      }
    }
    const tg = new BufferGeometry();
    tg.setAttribute('position', new BufferAttribute(new Float32Array(tp), 3));
    tg.setAttribute('normal', new BufferAttribute(new Float32Array(tn), 3));
    tg.setAttribute('aRest', new BufferAttribute(new Float32Array(tr), 3));
    tg.setIndex(ti);

    if (this.skin) { this.skin.geometry.dispose(); this.group.remove(this.skin); }
    if (this.outline) this.group.remove(this.outline);
    if (this.trunks) { this.trunks.geometry.dispose(); this.group.remove(this.trunks); }
    this.skin = new Mesh(geo, this.skinMat);
    this.skin.castShadow = true;
    this.skin.receiveShadow = true;
    this.trunks = new Mesh(tg, this.trunksMat);
    this.trunks.castShadow = true;
    this.trunks.receiveShadow = true;
    this.outline = new Mesh(geo, this.outlineMat);
    this.group.add(this.skin, this.trunks, this.outline);
    if (this.hair) { this.hair.geometry.dispose(); this.group.remove(this.hair, this.hairOutline!); }
    const hg = buildHair(mesh, scale);
    this.hair = new Mesh(hg, this.hairMat);
    this.hair.castShadow = true;
    this.hairOutline = new Mesh(hg, this.outlineMat);
    this.group.add(this.hair, this.hairOutline);
    geo.computeBoundingBox();
    this.group.position.y = -geo.boundingBox!.min.y;
    this.paintSkin();
    this.applyTrunksMaterial(true);
  }

  private paintSkin() {
    if (!this.skin || !this.current || !this.look) return;
    const { mesh, scale } = this.current;
    const L = this.look;
    const col = this.skin.geometry.getAttribute('color') as BufferAttribute;
    const arr = col.array as Float32Array;
    const base = SKIN_BASE[Math.max(0, Math.min(2, L.skinTone))].clone();
    const deep = TAN_DEEP.clone().lerp(TAN_ORANGE, L.orange * 0.6);
    const amt = (1 - Math.pow(1 - Math.min(1, L.tan / 100), 1.7)) * 0.94;
    const unev = L.uneven / 100;
    const c = new Color();
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const x = mesh.rest[i * 3] / scale, y = mesh.rest[i * 3 + 1] / scale, z = mesh.rest[i * 3 + 2] / scale;
      // 色ムラ: 低周波の斑＋関節や手足先の濃淡
      const nz = vnoise(x * 9, y * 9, z * 9) * 0.65 + vnoise(x * 23 + 5, y * 23, z * 23) * 0.35;
      const extremity = (y < 0.12 || (Math.abs(x) > 0.24 && y < 0.95)) ? 1 : 0;
      let a = amt * (1 + unev * (nz * 0.55 + extremity * 0.35));
      a = Math.max(0, Math.min(0.97, a));
      c.copy(base).lerp(deep, a);
      const ao = mesh.ao[i];
      c.multiplyScalar(0.62 + 0.38 * ao); // 溝はセル側で線として描くので、色の陰りは弱める
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    col.needsUpdate = true;
    this.shine.value = L.shine;
  }

  private applyTrunksMaterial(force = false) {
    if (!this.look) return;
    const t = this.look.trunks;
    const key = JSON.stringify(t);
    if (!force && key === this.trunksKey) return;
    this.trunksKey = key;
    const m = this.trunksMat;
    m.userData.cut.value = t.cut === 'classic' ? 1 : 0;
    m.map?.dispose(); m.emissiveMap?.dispose();
    const tex = trunksTexture(t);
    m.map = tex.map;
    m.emissiveMap = tex.emissive;
    m.emissive = new Color(tex.emissive ? '#ffffff' : '#000000');
    m.emissiveIntensity = tex.emissive ? 0.35 : 0;
    m.metalness = t.material === 'metallic' ? 0.85 : t.design === 'rhinestone' ? 0.25 : 0;
    m.roughness = t.material === 'matte' ? 0.86 : t.material === 'velvet' ? 0.78 : t.material === 'satin' ? 0.3 : 0.26;
    m.clearcoat = t.material === 'satin' ? 0.45 : 0;
    m.sheen = t.material === 'velvet' ? 1 : t.material === 'satin' ? 0.3 : 0;
    m.sheenColor = new Color(t.color).lerp(new Color('#ffffff'), 0.45);
    m.sheenRoughness = 0.45;
    m.needsUpdate = true;
  }
}

let _viewer: BodyViewer | null = null;
export function getViewer(): BodyViewer {
  if (!_viewer) _viewer = new BodyViewer();
  return _viewer;
}
export type { BodyViewer };
