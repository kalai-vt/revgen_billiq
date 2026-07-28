import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  // Served under /billiq/* in production (see root vercel.json); local dev keeps serving at "/"
  // so the existing http://localhost:5173 workflow is unaffected.
  base: command === 'build' ? '/billiq/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ag-grid': ['ag-grid-community', 'ag-grid-react'],
          recharts: ['recharts'],
        },
      },
    },
  },
}));
