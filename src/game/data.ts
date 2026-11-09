// ゲームデータ（種目・商品・衣装・大会・ライバル）。数値の調整はここと rules.ts / scoring.ts で行う。
import type { Part } from './body';
import type { TrunksDesign, TrunksMaterial } from './body';

export const PART_LABEL: Record<Part, string> = {
  chest: '胸', back: '背中', shoulders: '肩', arms: '腕', legs: '脚', abs: '腹筋',
};

export type Equip = 'barbell' | 'dumbbell' | 'rack' | 'bench' | 'cable' | 'machine' | 'pullup';
export const EQUIP_LABEL: Record<Equip, string> = {
  barbell: 'バーベル', dumbbell: 'ダンベル', rack: 'パワーラック', bench: 'ベンチ', cable: 'ケーブルマシン', machine: 'マシン', pullup: '懸垂バー',
};
/** 公共トレーニング室にある設備。会員制ジムのパスで全設備が使える */
export const PUBLIC_GYM: Equip[] = ['barbell', 'dumbbell', 'rack', 'bench', 'pullup'];

export interface Exercise {
  id: string;
  name: string;
  part: Part;
  secondary: Partial<Record<Part, number>>; // 補助的に効く部位（係数）
  stimulus: number; // 1セットあたりの刺激係数
  fatigue: number; // 疲労係数
  risk: number; // ケガの基本リスク（1回あたり）
  stamina: number; // 体力消費係数
  equip: Equip[];
  unilateral?: boolean; // 片側ずつ行う種目（左右差の改善）
  note: string;
}

export const EXERCISES: Exercise[] = [
  { id: 'bench', name: 'ベンチプレス', part: 'chest', secondary: { shoulders: 0.3, arms: 0.3 }, stimulus: 1.0, fatigue: 1.1, risk: 0.012, stamina: 1.1, equip: ['barbell', 'bench', 'rack'], note: '胸全体の厚みを作る基本種目。肩と三頭筋にも効く。' },
  { id: 'inclineDb', name: 'インクライン・ダンベルプレス', part: 'chest', secondary: { shoulders: 0.35 }, stimulus: 0.95, fatigue: 0.9, risk: 0.008, stamina: 1.0, equip: ['dumbbell', 'bench'], unilateral: true, note: '胸上部。左右を独立して動かすので左右差が整いやすい。' },
  { id: 'cableFly', name: 'ケーブルフライ', part: 'chest', secondary: {}, stimulus: 0.8, fatigue: 0.6, risk: 0.004, stamina: 0.8, equip: ['cable'], unilateral: true, note: '負担が小さく、疲労が溜まっている時でも胸を刺激できる。' },
  { id: 'deadlift', name: 'デッドリフト', part: 'back', secondary: { legs: 0.4 }, stimulus: 1.1, fatigue: 1.5, risk: 0.022, stamina: 1.4, equip: ['barbell'], note: '背中の厚みと全身の筋量。疲労とケガのリスクが大きい。' },
  { id: 'pullup', name: '懸垂（チンニング）', part: 'back', secondary: { arms: 0.3 }, stimulus: 0.95, fatigue: 0.9, risk: 0.007, stamina: 1.0, equip: ['pullup'], note: '広背筋の広がり（逆三角形）を作る。' },
  { id: 'row', name: 'ベントオーバーロウ', part: 'back', secondary: { arms: 0.2 }, stimulus: 1.0, fatigue: 1.1, risk: 0.012, stamina: 1.1, equip: ['barbell'], note: '背中の中央部の厚み。' },
  { id: 'latPull', name: 'ラットプルダウン', part: 'back', secondary: { arms: 0.25 }, stimulus: 0.85, fatigue: 0.7, risk: 0.004, stamina: 0.85, equip: ['cable'], note: '懸垂より負担が軽く、ボリュームを積みやすい。' },
  { id: 'ohp', name: 'オーバーヘッドプレス', part: 'shoulders', secondary: { arms: 0.25 }, stimulus: 1.0, fatigue: 1.0, risk: 0.012, stamina: 1.0, equip: ['barbell', 'rack'], note: '三角筋前部〜中部の基本種目。' },
  { id: 'lateral', name: 'サイドレイズ', part: 'shoulders', secondary: {}, stimulus: 0.85, fatigue: 0.55, risk: 0.003, stamina: 0.7, equip: ['dumbbell'], unilateral: true, note: '肩幅を広げる三角筋中部。負担が小さい。' },
  { id: 'rearFly', name: 'リアデルトフライ', part: 'shoulders', secondary: { back: 0.15 }, stimulus: 0.75, fatigue: 0.5, risk: 0.003, stamina: 0.7, equip: ['cable'], note: '三角筋後部。バックポーズの立体感に効く。' },
  { id: 'curl', name: 'バーベルカール', part: 'arms', secondary: {}, stimulus: 0.9, fatigue: 0.7, risk: 0.006, stamina: 0.8, equip: ['barbell'], note: '上腕二頭筋。ダブルバイセップスの迫力に直結。' },
  { id: 'dbCurl', name: 'ダンベルカール（片腕ずつ）', part: 'arms', secondary: {}, stimulus: 0.85, fatigue: 0.6, risk: 0.004, stamina: 0.75, equip: ['dumbbell'], unilateral: true, note: '左右差を整えながら二頭筋を鍛える。' },
  { id: 'pushdown', name: 'ケーブル・プレスダウン', part: 'arms', secondary: {}, stimulus: 0.85, fatigue: 0.55, risk: 0.003, stamina: 0.7, equip: ['cable'], note: '上腕三頭筋。腕の太さの大半は三頭筋。' },
  { id: 'closeGrip', name: 'ナローベンチプレス', part: 'arms', secondary: { chest: 0.3 }, stimulus: 0.95, fatigue: 0.9, risk: 0.01, stamina: 0.95, equip: ['barbell', 'bench', 'rack'], note: '三頭筋を高重量で鍛える。' },
  { id: 'squat', name: 'バックスクワット', part: 'legs', secondary: { abs: 0.2 }, stimulus: 1.15, fatigue: 1.5, risk: 0.02, stamina: 1.5, equip: ['barbell', 'rack'], note: '脚全体の筋量の要。体力消費が最も大きい。' },
  { id: 'legPress', name: 'レッグプレス', part: 'legs', secondary: {}, stimulus: 1.0, fatigue: 1.0, risk: 0.007, stamina: 1.1, equip: ['machine'], note: '腰への負担が少なく、脚にボリュームを積める。' },
  { id: 'rdl', name: 'ルーマニアン・デッドリフト', part: 'legs', secondary: { back: 0.25 }, stimulus: 0.95, fatigue: 1.2, risk: 0.014, stamina: 1.2, equip: ['barbell'], note: 'ハムストリングと臀部。脚の裏側の厚み。' },
  { id: 'bss', name: 'ブルガリアンスクワット', part: 'legs', secondary: {}, stimulus: 0.95, fatigue: 1.1, risk: 0.008, stamina: 1.2, equip: ['dumbbell', 'bench'], unilateral: true, note: '片脚ずつ行い、脚の左右差を整える。' },
  { id: 'legRaise', name: 'ハンギング・レッグレイズ', part: 'abs', secondary: {}, stimulus: 0.9, fatigue: 0.6, risk: 0.004, stamina: 0.7, equip: ['pullup'], note: '腹直筋下部。' },
  { id: 'cableCrunch', name: 'ケーブルクランチ', part: 'abs', secondary: {}, stimulus: 0.95, fatigue: 0.55, risk: 0.003, stamina: 0.7, equip: ['cable'], note: '負荷をかけて腹直筋の凹凸を作る。' },
  { id: 'plank', name: 'プランク＆アブローラー', part: 'abs', secondary: {}, stimulus: 0.7, fatigue: 0.45, risk: 0.003, stamina: 0.6, equip: [], note: '器具がほぼ不要。体幹の安定。' },
];

export type Volume = 'light' | 'normal' | 'high';
export const VOLUME: Record<Volume, { label: string; sets: number; stamina: number; risk: number }> = {
  light: { label: '軽め（6セット）', sets: 6, stamina: 12, risk: 0.7 },
  normal: { label: '標準（10セット）', sets: 10, stamina: 18, risk: 1.0 },
  high: { label: '高ボリューム（14セット）', sets: 14, stamina: 25, risk: 1.6 },
};

export type CaloriePlan = 'bulk' | 'maintain' | 'cutMild' | 'cut' | 'cutHard';
export const CALORIE_PLANS: Record<CaloriePlan, { label: string; offset: number; note: string; food: number }> = {
  bulk: { label: '増量', offset: 450, note: '筋肉は付きやすいが脂肪も増える', food: 3000 },
  maintain: { label: '維持', offset: 0, note: '体重を保ちながら体を作る', food: 0 },
  cutMild: { label: 'ゆるやかな減量', offset: -350, note: '筋肉を残しやすい減量', food: -800 },
  cut: { label: '標準の減量', offset: -600, note: '大会準備の標準的なペース', food: -1300 },
  cutHard: { label: '強い減量', offset: -900, note: '速く絞れるが筋肉と体調を失いやすい', food: -1800 },
};

export type MacroPlan = 'balanced' | 'highProtein' | 'highCarb';
export const MACRO_PLANS: Record<MacroPlan, { label: string; protein: number; fatMin: number; note: string; food: number }> = {
  balanced: { label: 'バランス型', protein: 2.0, fatMin: 0.8, note: 'タンパク質 2.0g/kg・脂質 0.8g/kg・残りを炭水化物', food: 0 },
  highProtein: { label: '高タンパク型', protein: 2.6, fatMin: 0.7, note: 'タンパク質 2.6g/kg。減量中の筋肉の維持に有利だが、張りは出にくい', food: 2200 },
  highCarb: { label: '高炭水化物型', protein: 1.7, fatMin: 0.6, note: '炭水化物を多めに。回復と筋肉の張りに有利', food: 600 },
};

export type ItemKind = 'tanner' | 'color' | 'gloss' | 'skincare' | 'conditioning' | 'gym';
export interface ShopItem {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  desc: string;
  effect: string;
  // 日焼け用品のパラメータ
  tanAdd?: number; // 色の濃さの上昇
  evenness?: number; // 仕上がりの均一さ 0〜1
  fade?: number; // 1週間で残る割合
  orange?: number; // オレンジがかり 0〜1
}

export const ITEMS: ShopItem[] = [
  { id: 'tanBasic', name: 'ベーシック・セルフタンナー', kind: 'tanner', price: 3000, tanAdd: 16, evenness: 0.45, fade: 0.6, orange: 0.7, desc: 'ドラッグストアで買える一般的なセルフタンニングローション。', effect: '色の濃さ +16／ムラが出やすい／1週間で約6割に落ちる' },
  { id: 'tanPro', name: 'プロ用セルフタンナー', kind: 'tanner', price: 8000, tanAdd: 24, evenness: 0.75, fade: 0.75, orange: 0.25, desc: '競技者向けの高品質なタンニング剤。色が自然で均一。', effect: '色の濃さ +24／均一／色持ちが良い（1週間で約75%が残る）' },
  { id: 'compColor', name: '大会用ボディカラー', kind: 'color', price: 12000, tanAdd: 45, evenness: 0.8, fade: 0, orange: 0.1, desc: 'ステージ照明下で筋肉の陰影を見せる競技用カラー。大会前日に使う。', effect: '大会当日だけ色の濃さ +45。下地（事前のタンニング）と肌の状態で均一さが変わる' },
  { id: 'gloss', name: 'ポージング・グロス', kind: 'gloss', price: 2500, desc: '大会当日に薄く塗るツヤ出し。塗りすぎない量で使う。', effect: '大会当日の肌のツヤ（陰影の見え方）を整える' },
  { id: 'scrub', name: 'ボディスクラブ', kind: 'skincare', price: 1500, desc: '古い角質を落として肌を整える。タンニングの前に使う。', effect: '肌の状態 +15。その週のタンニングのムラを減らす' },
  { id: 'lotion', name: '保湿ローション', kind: 'skincare', price: 1200, desc: '減量中に乾燥しやすい肌を保湿する。', effect: '肌の状態 +10' },
  { id: 'massage', name: 'スポーツマッサージ（1回）', kind: 'conditioning', price: 6000, desc: '専門家によるケア。行動枠を使わずに受けられる。', effect: '全身の疲労 −15／部位の疲労 −15' },
  { id: 'posingLesson', name: 'ポージング個人レッスン（1回）', kind: 'conditioning', price: 8000, desc: '経験者からポーズの細部を習う。', effect: 'ポージングの完成度 +7（疲労 +3）' },
  { id: 'protein', name: 'ホエイプロテイン（4週分）', kind: 'conditioning', price: 5500, desc: '食事でタンパク質を摂りきれない時の補助。', effect: '4週間、高タンパク型の食費が週 −2,000円' },
  { id: 'gymPass', name: '会員制ジム 4週パス', kind: 'gym', price: 12000, desc: 'ケーブル・マシンが使える本格的なジム。', effect: '4週間、ケーブル／マシン種目が解禁' },
];

export interface TrunksColor { id: string; name: string; color: string; accent: string }
export interface TrunksModel {
  id: string;
  name: string;
  grade: 'basic' | 'quality' | 'premium' | 'special';
  price: number;
  material: TrunksMaterial;
  design: TrunksDesign;
  cut: 'standard' | 'classic';
  colors: TrunksColor[];
  desc: string;
}
export const GRADE_LABEL = { basic: 'ベーシック', quality: '高品質', premium: 'プレミアム', special: '特殊' } as const;
export const MATERIAL_LABEL: Record<TrunksMaterial, string> = { matte: 'マット', satin: 'サテン（光沢）', velvet: 'ベルベット', metallic: 'メタリック' };
export const DESIGN_LABEL: Record<TrunksDesign, string> = { solid: '無地', sideLine: 'サイドライン', twoTone: 'サイド切替', rhinestone: 'ラインストーン装飾' };

export const TRUNKS: TrunksModel[] = [
  { id: 'practice', name: '練習用トランクス', grade: 'basic', price: 0, material: 'matte', design: 'solid', cut: 'standard', colors: [{ id: 'black', name: 'ブラック', color: '#141416', accent: '#141416' }], desc: '最初から持っている練習用。' },
  { id: 'basicStd', name: 'ベーシック・ポージングトランクス', grade: 'basic', price: 4000, material: 'matte', design: 'solid', cut: 'standard', colors: [
    { id: 'navy', name: 'ネイビー', color: '#1c2747', accent: '#1c2747' }, { id: 'wine', name: 'ワイン', color: '#5a1622', accent: '#5a1622' }, { id: 'forest', name: 'フォレスト', color: '#1d3b2a', accent: '#1d3b2a' }], desc: '標準カットのシンプルなマット素材。' },
  { id: 'satinStd', name: 'サテン・コンペティション', grade: 'quality', price: 9000, material: 'satin', design: 'solid', cut: 'standard', colors: [
    { id: 'royal', name: 'ロイヤルブルー', color: '#1f3fa6', accent: '#1f3fa6' }, { id: 'crimson', name: 'クリムゾン', color: '#8f1424', accent: '#8f1424' }, { id: 'emerald', name: 'エメラルド', color: '#0e6b4a', accent: '#0e6b4a' }, { id: 'black', name: 'ブラック', color: '#121214', accent: '#121214' }], desc: '照明で品よく光るサテン素材。' },
  { id: 'velvetStd', name: 'ベルベット・プレミアム', grade: 'premium', price: 18000, material: 'velvet', design: 'solid', cut: 'standard', colors: [
    { id: 'sapphire', name: 'サファイア', color: '#1b2f8c', accent: '#1b2f8c' }, { id: 'burgundy', name: 'バーガンディ', color: '#5e0f22', accent: '#5e0f22' }, { id: 'purple', name: 'ロイヤルパープル', color: '#3d1f6b', accent: '#3d1f6b' }], desc: '深い色と柔らかな光沢。手縫い仕上げ。' },
  { id: 'metalStd', name: 'メタリック・プレミアム', grade: 'premium', price: 22000, material: 'metallic', design: 'solid', cut: 'standard', colors: [
    { id: 'gold', name: 'ゴールド', color: '#b38a2e', accent: '#b38a2e' }, { id: 'silver', name: 'シルバー', color: '#a7acb4', accent: '#a7acb4' }, { id: 'bronze', name: 'ブロンズ', color: '#8a5a2b', accent: '#8a5a2b' }], desc: '強いライトを反射する金属調。ボディビル部門向け。' },
  { id: 'lineStd', name: 'サイドライン・スペシャル', grade: 'special', price: 14000, material: 'satin', design: 'sideLine', cut: 'standard', colors: [
    { id: 'blackGold', name: 'ブラック×ゴールド', color: '#111113', accent: '#c9a54a' }, { id: 'navyWhite', name: 'ネイビー×ホワイト', color: '#16224a', accent: '#e9e9ec' }, { id: 'redBlack', name: 'レッド×ブラック', color: '#8c1220', accent: '#0d0d0f' }], desc: '側面に2本のライン。脚を長く見せる。' },
  { id: 'stoneStd', name: 'ラインストーン・スペシャル', grade: 'special', price: 28000, material: 'satin', design: 'rhinestone', cut: 'standard', colors: [
    { id: 'blackCrystal', name: 'ブラック×クリスタル', color: '#0f0f12', accent: '#e8eef8' }, { id: 'blueCrystal', name: 'ブルー×クリスタル', color: '#14308f', accent: '#e8eef8' }, { id: 'redGold', name: 'レッド×ゴールド', color: '#7d0f1d', accent: '#e4c063' }], desc: '側面と上端にストーン装飾。ボディビル部門のみ使用可。' },
  { id: 'classicMatte', name: 'クラシックカット・マット', grade: 'basic', price: 6000, material: 'matte', design: 'solid', cut: 'classic', colors: [
    { id: 'black', name: 'ブラック', color: '#141416', accent: '#141416' }, { id: 'navy', name: 'ネイビー', color: '#1c2747', accent: '#1c2747' }], desc: '脚の付け根を覆う長めのカット。クラシック部門の規定に適合。' },
  { id: 'classicSatin', name: 'クラシックカット・サテン', grade: 'quality', price: 11000, material: 'satin', design: 'solid', cut: 'classic', colors: [
    { id: 'burgundy', name: 'バーガンディ', color: '#6a1124', accent: '#6a1124' }, { id: 'royal', name: 'ロイヤルブルー', color: '#1f3fa6', accent: '#1f3fa6' }, { id: 'forest', name: 'フォレスト', color: '#174a33', accent: '#174a33' }], desc: '長めのカットにサテンの光沢。' },
  { id: 'classicVelvet', name: 'クラシックカット・ベルベット', grade: 'premium', price: 19000, material: 'velvet', design: 'sideLine', cut: 'classic', colors: [
    { id: 'blackGold', name: 'ブラック×ゴールド', color: '#121214', accent: '#c9a54a' }, { id: 'emerald', name: 'エメラルド×ゴールド', color: '#0d5038', accent: '#c9a54a' }], desc: 'ベルベットにサイドライン。クラシック部門の上級モデル。' },
];

export type Category = 'bodybuilding' | 'classic';
export interface CategoryRule {
  id: Category;
  name: string;
  short: string;
  desc: string;
  cut: 'standard' | 'classic';
  bannedMaterials: TrunksMaterial[];
  bannedDesigns: TrunksDesign[];
  weightCap?: (heightCm: number) => number;
  weights: Record<ScoreKey, number>;
  ideal: { mass: number; waist: number };
}
export type ScoreKey = 'muscle' | 'balance' | 'proportion' | 'conditioning' | 'posing' | 'skin' | 'fit';
export const SCORE_LABEL: Record<ScoreKey, string> = {
  muscle: '筋肉の発達', balance: '左右・部位のバランス', proportion: 'プロポーション', conditioning: '絞り・コンディション', posing: 'ポージング', skin: '肌の仕上がり', fit: 'カテゴリー適合',
};

// 本作オリジナルの大会規定（実在団体の規則ではない）
export const CATEGORIES: Record<Category, CategoryRule> = {
  bodybuilding: {
    id: 'bodybuilding', name: '男子ボディビル', short: 'ボディビル',
    desc: '筋肉の量と絞りを最も重視する。体重制限なし。',
    cut: 'standard', bannedMaterials: [], bannedDesigns: [],
    weights: { muscle: 0.28, balance: 0.12, proportion: 0.13, conditioning: 0.22, posing: 0.11, skin: 0.07, fit: 0.07 },
    ideal: { mass: 1, waist: 0.6 },
  },
  classic: {
    id: 'classic', name: 'クラシック・ボディビル', short: 'クラシック',
    desc: '均整と美しいラインを重視する。身長別の体重上限あり。',
    cut: 'classic', bannedMaterials: ['metallic'], bannedDesigns: ['rhinestone'],
    weightCap: (h) => h - 100 + 4,
    weights: { muscle: 0.19, balance: 0.14, proportion: 0.21, conditioning: 0.18, posing: 0.14, skin: 0.07, fit: 0.07 },
    ideal: { mass: 0.75, waist: 1 },
  },
};

export const CONTEST = {
  name: 'IRON CROWN オープン選手権',
  entryFee: 8000,
  prize: [150000, 70000, 30000, 0, 0, 0],
};

export interface Rival {
  id: string;
  name: string;
  age: number;
  heightCm: number;
  frame: 'ecto' | 'meso' | 'endo';
  dev: Record<Part, number>;
  bodyFat: number;
  imbalance: number;
  posing: number;
  condition: number;
  fullness: number;
  tan: number;
  uneven: number;
  style: string;
}

export const RIVALS: Rival[] = [
  { id: 'r1', name: '黒田 剛志', age: 34, heightCm: 172, frame: 'endo', dev: { chest: 64, back: 66, shoulders: 60, arms: 66, legs: 62, abs: 48 }, bodyFat: 6.9, imbalance: 2.5, posing: 62, condition: 76, fullness: 0.95, tan: 78, uneven: 26, style: '圧倒的な筋量。仕上がりは年によって波がある。' },
  { id: 'r2', name: '早瀬 湊', age: 27, heightCm: 178, frame: 'ecto', dev: { chest: 49, back: 55, shoulders: 55, arms: 47, legs: 49, abs: 57 }, bodyFat: 5.7, imbalance: 1.0, posing: 70, condition: 84, fullness: 0.9, tan: 82, uneven: 18, style: '細いウエストと美しいライン。ポージングが上手い。' },
  { id: 'r3', name: '大城 健吾', age: 41, heightCm: 168, frame: 'meso', dev: { chest: 53, back: 51, shoulders: 51, arms: 52, legs: 57, abs: 49 }, bodyFat: 6.0, imbalance: 1.8, posing: 70, condition: 80, fullness: 0.9, tan: 80, uneven: 20, style: 'ベテラン。仕上がりの完成度が高い。' },
  { id: 'r4', name: '桐生 翔', age: 23, heightCm: 180, frame: 'meso', dev: { chest: 50, back: 50, shoulders: 52, arms: 54, legs: 42, abs: 46 }, bodyFat: 7.6, imbalance: 3.8, posing: 54, condition: 70, fullness: 0.85, tan: 70, uneven: 34, style: '伸び盛りの若手。上半身に比べて脚が弱い。' },
  { id: 'r5', name: '真壁 亮', age: 30, heightCm: 175, frame: 'meso', dev: { chest: 46, back: 46, shoulders: 46, arms: 45, legs: 48, abs: 44 }, bodyFat: 8.4, imbalance: 2.2, posing: 60, condition: 75, fullness: 0.85, tan: 74, uneven: 28, style: '初出場。バランスは良いが全体に線が細い。' },
];

export const WEEKS = 12;
export const SLOTS = 6;
export const START_MONEY = 60000;
export const WEEKLY_INCOME = 15000;
export const EXTRA_SHIFT_PAY = 12000;
export const BASE_FOOD_COST = 9000;

/** 主人公の顔（選手登録で選ぶ。絵は public/art/hero/<id>-s<段階>-<用途>.webp） */
export const FACES = [
  { id: 'a', label: '熱血', name: '鷹野 蓮', desc: 'まっすぐな熱血漢。刈り上げの黒髪', skinTone: 1 },
  { id: 'b', label: '元気', name: '日向 大翔', desc: '明るいムードメーカー。白いヘアバンド', skinTone: 0 },
  { id: 'c', label: 'クール', name: '氷室 迅', desc: '寡黙なストイック派。後ろで結んだ長めの黒髪', skinTone: 2 },
] as const;
