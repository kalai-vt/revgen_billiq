import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Kept separate from vite.config.ts so the production Vite config (typed against
// `vite`'s `UserConfig`) never has to know about Vitest's `test` field. Resolution
// (plugins/aliases) is mirrored from vite.config.ts so imports behave identically
// under test as they do under `vite dev`/`vite build`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
