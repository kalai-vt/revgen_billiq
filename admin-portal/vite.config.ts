import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  // Served under /admin/* in production (see root vercel.json); local dev keeps serving at "/"
  // so the existing http://localhost:5174 workflow is unaffected.
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
      // shared/components/ui/*.tsx lives outside this project's root, so its bare package
      // imports (react, @base-ui/react/*, etc.) can't be found by walking up from their own
      // directory on a clean checkout (no node_modules above admin-portal/) — only this
      // project's own node_modules has them installed. Pin them explicitly rather than
      // relying on a node_modules hoisted at the repo root (this repo intentionally has no
      // npm/pnpm workspace tooling).
      { find: /^@base-ui\/react\/(.*)$/, replacement: path.resolve(__dirname, 'node_modules/@base-ui/react/$1') },
      { find: 'react/jsx-runtime', replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime') },
      { find: 'react-dom', replacement: path.resolve(__dirname, 'node_modules/react-dom') },
      { find: 'react', replacement: path.resolve(__dirname, 'node_modules/react') },
      { find: 'class-variance-authority', replacement: path.resolve(__dirname, 'node_modules/class-variance-authority') },
      { find: 'lucide-react', replacement: path.resolve(__dirname, 'node_modules/lucide-react') },
      { find: 'next-themes', replacement: path.resolve(__dirname, 'node_modules/next-themes') },
      { find: 'sonner', replacement: path.resolve(__dirname, 'node_modules/sonner') },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    // shared/ lives one level above this project root — Vite's dev server otherwise refuses
    // to serve files outside the project root.
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
}));
