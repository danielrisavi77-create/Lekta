import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
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

// Staging site ima vlastiti javni origin. Početne MPA stranice nose SEO meta-podatke
// iz izvornog HTML-a, pa ih build mora uskladiti s generatorima koji već čitaju
// LEKTA_SITE_ORIGIN. U produkciji je zamjena no-op.
function siteOriginHtml(siteOrigin: string) {
  const productionOrigin = 'https://lektahr.netlify.app';
  return {
    name: 'lekta-site-origin-html',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler: (html: string) => html.replaceAll(productionOrigin, siteOrigin),
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || asset.source == null) continue;
        const source = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source);
        const replaced = source.replaceAll(productionOrigin, siteOrigin);
        if (replaced !== source) asset.source = replaced;
      }
    },
    writeBundle() {
      // Vite kopira public/ nakon bundlanja, pa sitemap i robots.txt ne prolaze kroz
      // generateBundle. Obradi ih ovdje da staging nema javne URL-ove produkcije.
      for (const name of ['sitemap.xml', 'robots.txt']) {
        const file = resolve(__dirname, 'dist', name);
        if (!existsSync(file)) continue;
        const source = readFileSync(file, 'utf8');
        const replaced = source.replaceAll(productionOrigin, siteOrigin);
        if (replaced !== source) writeFileSync(file, replaced, 'utf8');
      }
    },
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

// performance-01b (audit): fieldValidation.publicSources (PID + sha256 provenijencija javnih PDF
// uzoraka; ~174 KB raw, ~1300 sha256 hashova visoke entropije) je AUTORSKA provenijencija koju ZIVI
// runtime NIKAD ne cita (grep src/ = samo komentari i tipovi; renderValidationSummary cita sample/
// scope/productDecision/confirmed/observedDeviations, NE publicSources). Strip ga iz PRODUKCIJSKOG
// bundlea (NE iz izvora data/profiles/verified-profiles.json): manji glavni chunk bez gubitka funkcije.
//   apply:'build' -> vitest NE primjenjuje plugin pa dobiva PUN JSON (title-page test cita raw JSON i
//   dalje radi). enforce:'pre' -> transform vidi sirovi JSON prije vite:json. Gate na !devTools: QA/
//   verifikacijski build (DEV_CONSOLE=1) zadrzava punu provenijenciju za internu konzolu.
function stripRuntimeDeadProvenance(devTools: boolean) {
  return {
    name: 'lekta-strip-provenance',
    apply: 'build' as const,
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (devTools) return null;
      if (!id.split('?')[0].replace(/\\/g, '/').endsWith('/verified-profiles.json')) return null;
      const data = JSON.parse(code) as Array<{ fieldValidation?: { publicSources?: unknown } }>;
      for (const p of data) {
        if (p.fieldValidation && 'publicSources' in p.fieldValidation) delete p.fieldValidation.publicSources;
      }
      return { code: JSON.stringify(data), map: null };
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

// AUD-54 (audit performance): automatski bundle-size guard. Dosad nista nije cuvalo (a) da
// verified-profiles-heavy ostane LAZY (zaseban chunk, ne uvucen u glavni entry) ni (b) da glavni
// index chunk ne naraste tiho preko budzeta. Vite prag 500 kB je samo UPOZORENJE (ne pada build),
// pa je regresija (npr. staticki import teskih profila) prolazila neopazeno. Ovaj plugin PADA
// produkcijski build kad se invarijanta prekrsi, pa je `npm run check` hvata. QA/DEV_CONSOLE build
// ima drukciji graf pa se guard tamo preskace.
function bundleSizeGuard(devTools: boolean) {
  const INDEX_ENTRY_BUDGET = 700 * 1024; // glavni entry je ~502 KB danas; heavy uvucen bi ga probio
  return {
    name: 'lekta-bundle-size-guard',
    apply: 'build' as const,
    generateBundle(_opts: unknown, bundle: Record<string, { type: string }>) {
      if (devTools) return;
      const chunks = Object.values(bundle).filter(
        (o): o is { type: 'chunk'; fileName: string; name: string; isEntry: boolean; code: string } =>
          (o as { type: string }).type === 'chunk',
      );
      const heavy = chunks.find((c) => /verified-profiles-heavy/.test(c.fileName));
      if (!heavy) {
        throw new Error(
          '[bundle-guard] verified-profiles-heavy chunk ne postoji: teski profili su vjerojatno ' +
          'uvuceni u drugi chunk (lazy split se izgubio). Vrati dinamicki import teskih profila.',
        );
      }
      const indexEntry = chunks.find((c) => c.isEntry && c.name === 'index');
      if (indexEntry) {
        const bytes = Buffer.byteLength(indexEntry.code);
        if (bytes > INDEX_ENTRY_BUDGET) {
          throw new Error(
            `[bundle-guard] glavni index chunk je ${Math.round(bytes / 1024)} KB, preko budzeta ` +
            `${Math.round(INDEX_ENTRY_BUDGET / 1024)} KB. Vjerojatno je nesto tesko uslo u entry ` +
            '(heavy profili ili nova velika ovisnost); code-splitaj ili svjesno podigni budzet.',
          );
        }
      }
    },
  };
}

// Preload fontova iznad folda: font-display:swap + kasno otkrivanje (tek nakon parsiranja CSS-a)
// daju vidljiv FOUT bljesak na serifnim naslovima. Preload ih pokrece vec pri parsiranju HTML-a,
// paralelno s JS-om; ukupni transfer se NE povecava (iste datoteke se ionako skidaju). Imena su
// hashirana pri buildu pa linkove moze ubaciti samo build (transformIndexHtml + sken bundlea).
// crossorigin je OBAVEZAN i za same-origin (font fetch je uvijek CORS anonymous; bez atributa
// preglednik preload ne bi uparivao s @font-face zahtjevom pa bi datoteku skinuo DVAPUT).
function fontPreload() {
  const WANTED = [
    /newsreader-latin-opsz-normal/, /newsreader-latin-opsz-italic/,
    /caveat-latin-600/, /inter-tight-latin-wght/, /ibm-plex-mono-latin-600/,
  ];
  return {
    name: 'lekta-font-preload',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, unknown> }) {
        if (!ctx.bundle) return html;
        const links = Object.keys(ctx.bundle)
          .filter((f) => f.endsWith('.woff2') && WANTED.some((r) => r.test(f)))
          .sort()
          .map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${f}">`)
          .join('');
        return links ? html.replace('</title>', '</title>' + links) : html;
      },
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

// Dvije nezgode pri bundlanju hunspell-asm (WASM Hunspell za hrvatski pravopis) za preglednik:
//   (1) emscripten runtime uvoz. dist/esm/loadModule.js radi `import * as runtime from './lib/node/hunspell'`
//       pa getModuleLoader POZIVA `runtimeModule(...)` kao funkciju. Emscripten glue je UMD/CJS
//       (`module.exports = Module`), pa `import * as` daje nepozivljiv namespace -> "t is not a function".
//       (Node probe radi jer Node uzima CJS `main`; Vite bundla ESM `module`.) Prebaci na DEFAULT import
//       (default CJS = sam Module factory, pozivljiv) i na browser varijantu (Node varijanta referira
//       __filename; wasm je inline/SINGLE_FILE pa locateFile ne treba). Vite `browser` polje ovu
//       pod-putanju ionako ne remapira.
//   (2) nanoid. hunspell-asm i emscripten-wasm-loader uvoze nanoid kao `import * as nanoid` pa ga zovu
//       `nanoid(45)`. Namespace objekt nije pozivljiv, a resolucija je dvoznacna (nested nanoid@2 CJS vs
//       hoistani nanoid@3 ESM bez default exporta). nanoid ovdje sluzi ISKLJUCIVO za jedinstveno ime
//       privremene datoteke u WASM in-memory FS-u, pa ga u potpunosti INLINEAMO trivijalnim generatorom.
// Isti fix u dev i build (bez `apply`); par s optimizeDeps.exclude da esbuild pre-bundle ne zaobide ovo.
export function fixHunspellNanoid() {
  const INLINE = "const nanoid=(n=21)=>{let s='';const a='useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';for(let i=0;i<n;i++)s+=a[Math.random()*64|0];return s};";
  return {
    name: 'lekta-fix-hunspell-nanoid',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!/\/(hunspell-asm|emscripten-wasm-loader)\//.test(id.replace(/\\/g, '/'))) return null;
      // Jeftini bail: veliki emscripten glue (~740 KB) nema nijedan marker; ne skeniraj ga uzalud.
      if (!code.includes('nanoid') && !code.includes('lib/node/hunspell')) return null;
      let out = code;
      // namespace import runtime -> default import + browser varijanta (pozivljivi Module factory)
      out = out.replace(/import \* as (\w+) from (['"])\.\/lib\/node\/hunspell\2/, 'import $1 from $2./lib/browser/hunspell$2');
      // preostale reference na node varijantu (belt-and-suspenders) -> browser
      if (out.includes('./lib/node/hunspell')) out = out.replace(/\.\/lib\/node\/hunspell/g, './lib/browser/hunspell');
      if (/import (?:\* as )?nanoid from ['"]nanoid['"];?/.test(out)) out = out.replace(/import (?:\* as )?nanoid from ['"]nanoid['"];?/, INLINE);
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig(({ command }) => {
  const devTools = resolveDevTools(command, process.env);
  const siteOrigin = (process.env.LEKTA_SITE_ORIGIN || 'https://lektahr.netlify.app').replace(/\/+$/, '');
  const input: Record<string, string> = {
    index: resolve(__dirname, 'index.html'),
    usporedba: resolve(__dirname, 'landing_usporedba.html'),
    benchmark: resolve(__dirname, 'landing_benchmark.html'),
    citatiLiteratura: resolve(__dirname, 'citati-i-literatura.html'),
    alati: resolve(__dirname, 'alati.html'),
    citat: resolve(__dirname, 'citat.html'),
    kartice: resolve(__dirname, 'kartice.html'),
    naslovnica: resolve(__dirname, 'naslovnica.html'),
    literatura: resolve(__dirname, 'literatura.html'),
    izjava: resolve(__dirname, 'izjava.html'),
    admin: resolve(__dirname, 'admin.html'),
  };
  // Interna verifikacijska konzola ulazi u build SAMO kad su dev alati ukljuceni (QA opt-in).
  // admin.html (Lekta Control Center) NIJE u ovoj grani: za razliku od verification.html (razvojni
  // QA alat protiv lokalnih izvornih PDF-ova), Control Center mora citati zivu produkcijsku
  // Supabase bazu da bi uopce imao smisla, pa ide bezuvjetno uz ostalih 10 stranica. Prava
  // sigurnosna granica je posve poslužiteljska (JWT + admin_users, admin-stats/index.ts) - skrivanje
  // iza devTools flaga ovdje ne bi bilo prava sigurnost, samo nezgoda. noindex meta u admin.html
  // sprjecava indeksiranje/sitemap unatoc tome sto je stranica u buildu.
  if (devTools) input.verification = resolve(__dirname, 'verification.html');
  return {
    plugins: [htmlCharsetUtf8(), siteOriginHtml(siteOrigin), citationTools(), fixHunspellNanoid(), stripRuntimeDeadProvenance(devTools), stripDevOnlyHtml(devTools), fontPreload(), assertSafeBuild(devTools)],
    define: { __DEV_TOOLS__: JSON.stringify(devTools) },
    // hunspell-asm se ne pre-bundla u dev-u da fixHunspellNanoid transform (Vite plugin) stigne do
    // njega; inace bi ga esbuild optimizer pre-bundlao mimo plugina i nanoid poziv bi pao u dev-u.
    optimizeDeps: { exclude: ['hunspell-asm'] },
    // Dev watcher po defaultu gleda sve osim node_modules/.git. U repou zive git worktreei
    // (.claude/worktrees/*/) s vlastitim izgradenim dist/ stablima (tisuce citatnih HTML-ova);
    // watchanje svega toga iscrpi file handleove na Windowsu i rusi `npm run dev` (EMFILE).
    // Iskljuci .claude i vlastiti dist iz watchera; serviranje dist/ (citationTools) ne ovisi
    // o watcheru, a njegov targetirani watcher.add za citation-spec ostaje nepromijenjen.
    server: { watch: { ignored: ['**/.claude/**', '**/dist/**'] } },
    // NAPOMENA (audit performance-05, ODBIJENO nakon mjerenja): `json.stringify:true` bi veliki JSON
    // emitirao kao `JSON.parse('...')` (brzi V8 parse), ALI Vite ASCII-escapea sav ne-ASCII u \uXXXX.
    // Ovaj korpus je gusto hrvatski (c, c, z, s, d): mjereno 20.402 \u escapea, glavni chunk naraste
    // 2,48 -> 4,32 MB raw i 369 -> 473 KB gzip (+28% na zici). Parse-dobitak ne pokriva veci download na
    // mobitelu. Pravi lijek je performance-01/02 (maknuti podatke iz runtime grafa), ne stringify.
    build: {
      target: 'es2022',
      rollupOptions: { input },
    },
  };
});
