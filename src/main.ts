import './style.css';
import { startApp } from './ui/app';
import { getViewer } from './body/viewer';

if (import.meta.env.DEV && location.search.includes('debug')) {
  void import('./debug').then((m) => m.startDebug());
} else {
  startApp();
}
if (import.meta.env.DEV) (window as unknown as { __viewer: unknown }).__viewer = getViewer();
