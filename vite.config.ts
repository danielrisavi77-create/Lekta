import { defineConfig } from 'vite';

// Lekta je single-page klijentska aplikacija; index.html na korijenu je entry.
// Sva analiza je lokalna u pregledniku (vidi VISION.md, docs/).
export default defineConfig({
  build: {
    target: 'es2022',
  },
});
