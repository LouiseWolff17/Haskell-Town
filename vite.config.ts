import { defineConfig } from 'vite';

// GitHub Pages serves the site from /Haskell-Town/. The dev server serves it from /.
// `vite preview` serves the build, so it needs the build's base too.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/Haskell-Town/') : '/',
  build: { target: 'es2022', sourcemap: true },
  // The runner's Web Worker (src/runner/worker.ts) is an ES module worker.
  worker: { format: 'es' },
}));
