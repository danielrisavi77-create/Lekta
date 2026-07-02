import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Lekta je klijentska aplikacija; index.html je glavni entry, a verification.html je
// odvojeni interni admin view (verifikacijska konzola, Faza C.3) koji ne dira glavni
// app ni golden put. Sva analiza je lokalna u pregledniku (vidi VISION.md, docs/).
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        verification: resolve(__dirname, 'verification.html'),
        usporedba: resolve(__dirname, 'landing_usporedba.html'),
      },
    },
  },
});
