import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Kept separate from vite.config.ts so the production Vite config (typed against `vite`'s
// `UserConfig`) never has to know about Vitest's `test` field. Resolution (plugins/aliases) is
// mirrored from vite.config.ts so imports behave identically under test as they do under
// `vite dev`/`vite build` — including the extra bare-specifier aliases, which exist because
// shared/components/ui/*.tsx lives outside this project root and can't otherwise resolve
// `react`, `@base-ui/react/*`, etc. from this project's own node_modules (see vite.config.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
