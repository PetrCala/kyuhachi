import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The shared types are consumed as TypeScript source, same as the app
      // does with its tsconfig paths; Vite transpiles them on the fly.
      '@kyuhachi/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
});
