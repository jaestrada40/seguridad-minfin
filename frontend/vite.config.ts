import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Ruta secreta bajo la que se sirve toda la app (ofuscación: `/` da 404 y
// solo quien conoce esta ruta puede llegar al login). Se controla con la
// variable de entorno APP_SECRET_PATH (en .env, no se sube a git). Si no se
// define, la app se sirve en `/` como siempre.
//
// En `build` (producción) usamos `base: './'` — rutas de assets relativas —
// para que el bundle sirva bajo CUALQUIER prefijo sin reconstruir: el proxy
// (Caddy) decide la ruta secreta en runtime y hace strip del prefijo. En
// `serve` (dev) sí horneamos APP_SECRET_PATH porque el dev server de Vite lo
// necesita para resolver `/@vite`, HMR, etc.
const rawBase = process.env.APP_SECRET_PATH || '/';
const devBase = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`;

export default defineConfig(({command}) => {
  return {
    base: command === 'build' ? './' : devBase,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://backend:8000',
        '/health': 'http://backend:8000',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
