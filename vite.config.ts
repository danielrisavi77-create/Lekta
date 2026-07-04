import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite dev i preview posluzuju HTML kao 'text/html' bez charseta i oslanjaju se na
// <meta charset="utf-8"> u dokumentu. Ovaj mali plugin eksplicitno dodaje
// 'charset=utf-8' u HTTP zaglavlje da hrvatski dijakritici (c, c, s, z, d) budu
// ispravni i kad bi neki posrednik ili predmemorija zanemarili meta tag.
function htmlCharsetUtf8() {
  const patch = (server) => {
    server.middlewares.use((_req, res, next) => {
      const orig = res.setHeader.bind(res);
      res.setHeader = (name, value) => {
        if (String(name).toLowerCase() === 'content-type' && value === 'text/html') {
          value = 'text/html; charset=utf-8';
        }
        return orig(name, value);
      };
      next();
    });
  };
  return {
    name: 'lekta-html-charset-utf8',
    apply: 'serve',
    configureServer: patch,
    configurePreviewServer: patch,
  };
}

// Lekta je klijentska aplikacija; index.html je glavni entry, a verification.html je
// odvojeni interni admin view (verifikacijska konzola, Faza C.3) koji ne dira glavni
// app ni golden put. Sva analiza je lokalna u pregledniku (vidi VISION.md, docs/).
// DEPLOY=1: javni produkcijski build. Izostavlja verification.html (internu konzolu) iz
// grafa, pa ispada i njen import.meta.glob svih source PDF-ova (~163MB). Time javni bundle
// pada na ~3MB i interni alat nije izlozen. Default (bez DEPLOY) ukljucuje sve entryje pa
// `npm run check` i lokalni QA ostaju nepromijenjeni.
const isDeploy = process.env.DEPLOY === '1';
const input: Record<string, string> = {
  index: resolve(__dirname, 'index.html'),
  usporedba: resolve(__dirname, 'landing_usporedba.html'),
  citat: resolve(__dirname, 'citat.html'),
  kartice: resolve(__dirname, 'kartice.html'),
  naslovnica: resolve(__dirname, 'naslovnica.html'),
  literatura: resolve(__dirname, 'literatura.html'),
  izjava: resolve(__dirname, 'izjava.html'),
};
if (!isDeploy) input.verification = resolve(__dirname, 'verification.html');

export default defineConfig({
  plugins: [htmlCharsetUtf8()],
  build: {
    target: 'es2022',
    rollupOptions: { input },
  },
});
