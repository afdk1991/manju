import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/**
 * 这里刻意不套 StrictMode：它会在开发期双调用 effect，
 * 导致 hls.js 实例被创建/销毁两次，播放器出现挂载竞态。
 */
const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
