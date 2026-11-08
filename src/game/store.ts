// 状態の保持とローカル保存（端末内のみ。外部へは送らない）
import type { GameState } from './rules';

const KEY = 'ironcrown.save.v1';
let state: GameState | null = load();
const subs = new Set<() => void>();

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function getState(): GameState | null {
  return state;
}
export function hasSave(): boolean {
  return load() !== null;
}
export function setState(s: GameState | null) {
  state = s;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  subs.forEach((f) => f());
}
/** 状態を変更して保存する */
export function mutate(fn: (s: GameState) => void) {
  if (!state) return;
  const s = structuredClone(state);
  fn(s);
  setState(s);
}
export function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
