// 体の部位・体格と、大会用衣装（トランクス）の型。ゲームの数値と画面で共通に使う。
export type Part = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'abs';
export const PARTS: Part[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'abs'];
export type Frame = 'ecto' | 'meso' | 'endo';

export type TrunksMaterial = 'matte' | 'satin' | 'velvet' | 'metallic';
export type TrunksDesign = 'solid' | 'sideLine' | 'twoTone' | 'rhinestone';
export interface TrunksLook {
  color: string;
  accent: string;
  material: TrunksMaterial;
  design: TrunksDesign;
  cut: 'standard' | 'classic';
}
