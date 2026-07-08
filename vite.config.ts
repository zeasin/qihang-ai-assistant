import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 15173,
    strictPort: true,
    proxy: {
      '/v3': { target: 'http://localhost:6790', changeOrigin: true },
      '/api': { target: 'http://localhost:6790', changeOrigin: true }
    }
  },
});
