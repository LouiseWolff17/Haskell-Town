import { defineConfig } from 'vite';

// GitHub Pages serves the site from /Haskell-Town/. Locally it's served from /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/Haskell-Town/') : '/',
  build: { target: 'es2022', sourcemap: true },
}));
