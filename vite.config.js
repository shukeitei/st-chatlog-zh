import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 必须和 GitHub Pages 的仓库路径一致，否则线上加载资源 404
export default defineConfig({
  base: '/st-chatlog-zh/',
  plugins: [react()],
});
