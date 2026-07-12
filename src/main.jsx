import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// JS 能跑到这里就说明加载成功，撤掉 index.html 里的 boot-fallback
document.getElementById('boot-fallback')?.remove();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
