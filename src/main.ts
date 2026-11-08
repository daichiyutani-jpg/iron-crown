import './style.css';
import { startApp } from './ui/app';
import { getViewer } from './body/viewer';

startApp();
if (import.meta.env.DEV) (window as unknown as { __viewer: unknown }).__viewer = getViewer();
