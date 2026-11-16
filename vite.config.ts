import { defineConfig } from 'vite';

// The site is served from the root of its custom domain (haskelltown.lwolff.com).
// Set BASE_PATH (e.g. /Haskell-Town/) to build for a sub-path instead.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: true },
  // The runner's Web Worker (src/runner/worker.ts) is an ES module worker.
  worker: { format: 'es' },
});
