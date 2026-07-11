import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { stripDevOnly } from './scripts/strip-dev-only.mjs';
import { resolveDevTools } from './scripts/dev-console.mjs';

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
// Interni dev alati (setup modal, QA konzola, verification.html entry + ~163MB source PDF-ova)
// su SAFE-BY-DEFAULT iskljuceni iz produkcijskog builda; ukljucuju se samo u dev serveru ili uz
// eksplicitni DEV_CONSOLE=1 (scripts/dev-console.mjs, routes-02). Odluka (devTools) se racuna po
// buildu unutar defineConfig nize i prosljeduje pluginovima.

// REZE dev-only regije iz HTML-a (setup modal, QA konzola) kad build NIJE dev: to su interni
// alati koje javni build ne smije ni sadrzavati (audit P0), ne samo skrivati. Par s __DEV_TOOLS__
// define-om koji iz JS bundlea tree-shakea pripadajuci kod (src/ui/app.ts).
function stripDevOnlyHtml(devTools: boolean) {
  return {
    name: 'lekta-strip-dev-only',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler: (html: string) => (devTools ? html : stripDevOnly(html)),
    },
  };
}

// Host-neovisni guard: svaki produkcijski (ne-dev) build koji bi ipak emitirao internu konzolu
// pada odmah, ne samo u netlify lancu (routes-02). Dopunjuje scripts/verify-deploy-dist.mjs.
function assertSafeBuild(devTools: boolean) {
  return {
    name: 'lekta-assert-safe-build',
    apply: 'build' as const,
    closeBundle() {
      if (devTools) return; // QA build (DEV_CONSOLE=1) smije imati konzolu
      const leaked = resolve(__dirname, 'dist', 'verification.html');
      if (existsSync(leaked)) {
        throw new Error(
          '[assert-safe-build] dist/verification.html je u safe buildu (interna konzola bi procurila). ' +
          'Gradi s DEV_CONSOLE=1 samo za lokalni QA.',
        );
      }
    },
  };
}

// Citatni alati po fakultetu (/alati/citati/**, /alati/brojac-kartica.html) NISU Vite ulazi
// nego build-time IZLAZ generatora u dist/ (SEO: ~178 pred-renderanih stranica, ne stavljaju
// se kao ulazi da ne zatrpaju dev graf). Posljedica je da ih `npm run dev` sam po sebi ne
// prikazuje. Ovaj plugin to popravlja: pri startu dev/preview servera pokrene generator,
// servira njegov izlaz iz dist/ i regenerira ga (uz full-reload) kad promijenis verificiran
// spec ili motor. LEKTA_SITE_ORIGIN='' u dev-u daje root-relativne linkove (ostaju na localhostu).
function citationTools() {
  const genOut = () => {
    try {
      execFileSync(process.execPath, ['scripts/generate-citation-tools.mjs'], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, LEKTA_SITE_ORIGIN: process.env.LEKTA_SITE_ORIGIN || '' },
      });
    } catch (e) {
      console.error('[citati-dev] generator nije uspio:', (e && e.message) || e);
    }
  };
  const serveGenerated = (req, res, next) => {
    const url = String(req.url || '').split('?')[0];
    const hit = url.startsWith('/alati/citati/') || url === '/alati/brojac-kartica.html' || url === '/alati/sitemap-alati.xml';
    if (hit) {
      let rel = url.replace(/^\/+/, '');
      if (url.endsWith('/')) rel += 'index.html';
      const file = resolve(__dirname, 'dist', rel);
      if (existsSync(file) && statSync(file).isFile()) {
        res.setHeader('Content-Type', url.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/html; charset=utf-8');
        createReadStream(file).pipe(res);
        return;
      }
    }
    next();
  };
  const WATCH = /(citation-specs[\\/]verified|generate-citation-tools\.mjs|src[\\/]citations[\\/]|src[\\/]tools[\\/]citation\.ts|zagreb-catalog\.json|verified-profiles\.json)/;
  let timer;
  return {
    name: 'lekta-citation-tools',
    apply: 'serve' as const,
    configureServer(server) {
      genOut();
      server.middlewares.use(serveGenerated);
      server.watcher.add([
        resolve(__dirname, 'data/tools/citation-specs/verified'),
        resolve(__dirname, 'scripts/generate-citation-tools.mjs'),
      ]);
      server.watcher.on('all', (_e, file) => {
        if (file && WATCH.test(String(file))) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            genOut();
            server.ws.send({ type: 'full-reload' });
          }, 200);
        }
      });
    },
    configurePreviewServer(server) {
      genOut();
      server.middlewares.use(serveGenerated);
    },
  };
}

export default defineConfig(({ command }) => {
  const devTools = resolveDevTools(command, process.env);
  const input: Record<string, string> = {
    index: resolve(__dirname, 'index.html'),
    usporedba: resolve(__dirname, 'landing_usporedba.html'),
    alati: resolve(__dirname, 'alati.html'),
    citat: resolve(__dirname, 'citat.html'),
    kartice: resolve(__dirname, 'kartice.html'),
    naslovnica: resolve(__dirname, 'naslovnica.html'),
    literatura: resolve(__dirname, 'literatura.html'),
    izjava: resolve(__dirname, 'izjava.html'),
  };
  // Interna verifikacijska konzola ulazi u build SAMO kad su dev alati ukljuceni (QA opt-in).
  if (devTools) input.verification = resolve(__dirname, 'verification.html');
  return {
    plugins: [htmlCharsetUtf8(), citationTools(), stripDevOnlyHtml(devTools), assertSafeBuild(devTools)],
    define: { __DEV_TOOLS__: JSON.stringify(devTools) },
    build: {
      target: 'es2022',
      rollupOptions: { input },
    },
  };
});
