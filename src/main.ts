import './style.css';
import { startApp } from './ui/app';

if (import.meta.env.DEV && location.search.includes('debug')) {
  void import('./debug').then((m) => m.startDebug());
} else {
  startApp();
}
