/**
 * GARDOVI Z15, DRUGI KRUG: puno podnozje, traka nakon skrola, putujuca kvacica, kratki stepper,
 * lijeno podnozje u proracunu trake.
 *
 * Svaki gard je CISTA FUNKCIJA nad tekstom ili nad metafileom (bez diska), pa ga
 * `tests/gate-mutations.test.ts` smije mutirati u memoriji, a `tests/site-chrome.test.ts` i
 * `tests/route-shell-budget.test.ts` zvati nad stvarnim datotekama. Svaka funkcija vraca POPIS
 * PROBLEMA; prazan popis je cist ulaz, a sentinel (npr. "predlozak nema prizor 05") je problem, ne
 * tihi prolaz.
 */

/** Tekst bez HTML komentara i CR-a; gard ne smije naci tvrdnju u komentaru. */
function bezHtmlKomentara(html: string): string {
  return html.split('\r\n').join('\n').replace(/<!--[\s\S]*?-->/g, '');
}

/** CSS bez komentara. */
export function bezCssKomentara(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Tekst bez oznaka, s razrijesenim entitetima koje predlozak i stranice koriste. */
function tekst(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FooterColumn {
  readonly naziv: string;
  readonly stavke: ReadonlyArray<{ readonly broj: string; readonly natpis: string; readonly href: string | null }>;
}

export interface FooterCopy {
  readonly moto: string;
  readonly granice: readonly string[];
  readonly stupci: readonly FooterColumn[];
}

/** Stupci (`<nav aria-label>` s brojem u `<small>`) iz bloka podnozja. */
function stupciIz(blok: string): FooterColumn[] {
  const stupci: FooterColumn[] = [];
  for (const nav of blok.matchAll(/<nav\b[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/nav>/g)) {
    const stavke = [...nav[2].matchAll(/<a\b([^>]*)>\s*<small[^>]*>(\d{2})<\/small>([\s\S]*?)<\/a>/g)].map((m) => ({
      broj: m[2],
      natpis: tekst(m[3]),
      href: /\bhref="([^"]*)"/.exec(m[1])?.[1] ?? null,
    }));
    stupci.push({ naziv: nav[1], stavke });
  }
  return stupci;
}

/**
 * COPY PUNOG PODNOZJA IZ PREDLOSKA (`design/templates/chrome/Chrome.dc.html`, prizor 05).
 * Izvor istine za tekst je PREDLOZAK, ne prepisan popis u testu: kad dizajn promijeni natpis,
 * gard trazi da se promijeni i stranica.
 */
export function footerCopyFromTemplate(predlozak: string): FooterCopy | null {
  const s = bezHtmlKomentara(predlozak);
  const od = s.indexOf('05 · Puno podnožje');
  if (od < 0) return null;
  const pocetak = s.indexOf('<footer', od);
  const kraj = s.indexOf('</footer>', pocetak);
  if (pocetak < 0 || kraj < 0) return null;
  const blok = s.slice(pocetak, kraj);
  const moto = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(blok)?.[1];
  const granice = [...blok.matchAll(/<li\b[^>]*>\s*<span[^>]*>[✓✕]<\/span>([\s\S]*?)<\/li>/g)].map((m) => tekst(m[1]));
  if (moto === undefined) return null;
  return { moto: tekst(moto), granice, stupci: stupciIz(blok).map((c) => ({ ...c, stavke: c.stavke.map((x) => ({ ...x, href: null })) })) };
}

/** Blok punog podnozja stranice (`data-site-footer="full"`), ili `null`. */
export function fullFooterBlock(html: string): string | null {
  const s = html.split('\r\n').join('\n');
  const od = s.indexOf('<footer class="site-footer site-footer--full" data-site-footer="full">');
  if (od < 0) return null;
  const kraj = s.indexOf('</footer>', od);
  return kraj < 0 ? null : s.slice(od, kraj + '</footer>'.length);
}

/** Copy punog podnozja STRANICE, istim citacem kao predlozak. */
export function footerCopyFromPage(footer: string): FooterCopy | null {
  const blok = bezHtmlKomentara(footer);
  const moto = /<p class="site-footer__moto">([\s\S]*?)<\/p>/.exec(blok)?.[1];
  if (moto === undefined) return null;
  const granice = [...blok.matchAll(/<li class="site-footer__granica[^"]*"><span aria-hidden="true">[✓✕]<\/span>([\s\S]*?)<\/li>/g)].map((m) => tekst(m[1]));
  return { moto: tekst(moto), granice, stupci: stupciIz(blok) };
}

/**
 * GARD: puno podnozje ima CETIRI stupca (brend + Proizvod, Pribor, Pravno), numeraciju 01 do 19
 * bez rupa, copy doslovno iz predloska i sva tri retka "Stanja stola", skrivena dok ih kod ne upise.
 */
export function fullFooterProblems(footer: string | null, predlozak: FooterCopy | null): string[] {
  if (predlozak === null) return ['predlozak nema prizor 05 (puno podnozje); gard ne bi mjerio nista'];
  if (footer === null) return ['stranica ne nosi puno podnozje (data-site-footer="full")'];
  const problemi: string[] = [];
  const stranica = footerCopyFromPage(footer);
  if (stranica === null) return ['podnozje nema moto (site-footer__moto)'];
  if (!/<div class="site-footer__brend">/.test(footer)) problemi.push('nema stupca brenda (site-footer__brend)');
  const stupaca = stranica.stupci.length + (/<div class="site-footer__brend">/.test(footer) ? 1 : 0);
  if (stupaca !== 4) problemi.push(`kolofon ima ${stupaca} stupaca, ocekivano 4`);
  if (stranica.moto !== predlozak.moto) problemi.push(`moto "${stranica.moto}" nije doslovan ("${predlozak.moto}")`);
  if (JSON.stringify(stranica.granice) !== JSON.stringify(predlozak.granice)) problemi.push(`granice ${JSON.stringify(stranica.granice)} nisu doslovne`);
  const oblik = (c: readonly FooterColumn[]): string => JSON.stringify(c.map((x) => [x.naziv, x.stavke.map((s) => [s.broj, s.natpis])]));
  if (oblik(stranica.stupci) !== oblik(predlozak.stupci)) problemi.push(`stupci ${oblik(stranica.stupci)} nisu doslovni`);
  const brojevi = stranica.stupci.flatMap((c) => c.stavke.map((s) => Number(s.broj)));
  const ocekivani = Array.from({ length: 19 }, (_, i) => i + 1);
  if (JSON.stringify(brojevi) !== JSON.stringify(ocekivani)) problemi.push(`numeracija ${brojevi.join(',')} nije 01 do 19`);
  if (!/<div class="site-footer__stanje" data-site-footer-stanje hidden>/.test(footer)) problemi.push('"Stanje stola" nije skriveno do upisa (bez JS-a bi tvrdilo prazno)');
  for (const kljuc of ['rad', 'pravila', 'izvori']) {
    if (!new RegExp(`<dd data-site-footer-stat="${kljuc}"></dd>`).test(footer)) problemi.push(`"Stanje stola" nema prazan redak ${kljuc}`);
  }
  return problemi;
}

/**
 * GARD: svaka poveznica punog podnozja vodi na STRANICU KOJA POSTOJI (javni direktorij, odredista
 * trake, generirane pravne stranice) ili na `mailto:` kontakt iz produkcijske konfiguracije.
 */
export function footerLinkProblems(footer: string | null, poznate: ReadonlySet<string>, kontakt: string): string[] {
  if (footer === null) return ['nema punog podnozja'];
  const stupci = footerCopyFromPage(footer)?.stupci ?? [];
  const hrefovi = stupci.flatMap((c) => c.stavke.map((s) => ({ natpis: s.natpis, href: s.href })));
  if (hrefovi.length === 0) return ['podnozje nema nijednu poveznicu; gard bi prolazio vakuumski'];
  const problemi: string[] = [];
  for (const { natpis, href } of hrefovi) {
    if (href === null) { problemi.push(`${natpis}: nema href`); continue; }
    if (href.startsWith('mailto:')) {
      if (href !== `mailto:${kontakt}`) problemi.push(`${natpis}: ${href} nije kontakt iz konfiguracije (${kontakt})`);
      continue;
    }
    if (!poznate.has(href)) problemi.push(`${natpis}: ${href} ne vodi na poznatu stranicu`);
  }
  return problemi;
}

/**
 * GARD: "Stanje stola" CITA PECEN `site-stats.json` I POVIJEST KROZ SIGURAN OMOTAC. Modul mora
 * uvesti tri imena iz `site-stats.json`, citati povijest kroz `safeStorageGet(STORAGE_KEYS.history`,
 * ne smije dirati `localStorage` izravno i ne smije nositi nijednu pecenu vrijednost kao literal.
 */
export function deskStateSourceProblems(izvor: string, peceno: { profiles: number; rulesVersion: string | null; sourcesCheckedAt: string | null }): string[] {
  const kod = bezCssKomentara(izvor).replace(/^\s*\/\/.*$/gm, '');
  const problemi: string[] = [];
  const uvoz = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/\.\.\/data\/coverage\/site-stats\.json'/.exec(kod);
  if (!uvoz) problemi.push('modul ne uvozi data/coverage/site-stats.json');
  for (const ime of ['profiles', 'rulesVersion', 'sourcesCheckedAt']) {
    if (uvoz && !new RegExp(`\\b${ime}\\b`).test(uvoz[1])) problemi.push(`uvoz iz site-stats.json ne nosi ${ime}`);
  }
  if (!/safeStorageGet\(STORAGE_KEYS\.history\b/.test(kod)) problemi.push('povijest se ne cita kroz safeStorageGet(STORAGE_KEYS.history');
  if (/\blocalStorage\b/.test(kod)) problemi.push('modul dira localStorage izravno');
  const literali = [String(peceno.profiles), peceno.rulesVersion, peceno.sourcesCheckedAt].filter((v): v is string => typeof v === 'string' && v !== '');
  for (const v of literali) {
    if (new RegExp(`(?<![\\w.])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(kod)) problemi.push(`pecena vrijednost ${v} je prepisana u kod`);
  }
  return problemi;
}

/** Broj deklaracija zamucenja pozadine u listu (s prefiksom i bez njega), bez komentara. */
export function backdropFilterCount(css: string): number {
  return (bezCssKomentara(css).match(/(?:^|[;{\s])(?:-webkit-)?backdrop-filter\s*:/g) ?? []).length;
}

/**
 * GARD (Z31 "Nema backdrop-filter na javnim stranicama"), RATCHET: traka ga nema NIKAKO, a ostali
 * javni listovi smiju nositi najvise zatecen broj (imenovan u `dopusteno`). Novi list sa zamucenjem
 * ili rast broja pada; pad broja trazi da se ratchet spusti, pa napredak ne moze tiho iscuriti natrag.
 */
export function backdropFilterProblems(
  listovi: ReadonlyArray<{ readonly ime: string; readonly css: string }>,
  dopusteno: Readonly<Record<string, number>>,
): string[] {
  if (listovi.length === 0) return ['nema nijednog lista; gard bi prolazio vakuumski'];
  if (!listovi.some((l) => l.ime === 'src/shared/site-chrome.css')) return ['medju listovima nema site-chrome.css; gard traku ne vidi'];
  const problemi: string[] = [];
  for (const { ime, css } of listovi) {
    const n = backdropFilterCount(css);
    const smije = ime === 'src/shared/site-chrome.css' ? 0 : (dopusteno[ime] ?? 0);
    if (n > smije) problemi.push(`${ime}: ${n} backdrop-filter, dopusteno ${smije}`);
    if (n < smije) problemi.push(`${ime}: ${n} backdrop-filter, ratchet jos kaze ${smije}; spusti ga`);
  }
  return problemi;
}

/** Tijelo pravila za tocan selektor (prvo pojavljivanje izvan @-blokova ne razlikuje se ovdje). */
function pravilo(css: string, selektor: string): string | null {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(bezCssKomentara(css))?.[1] ?? null;
}

/**
 * GARD: kvacica putuje kroz `transform` (Z31), ne kroz `left`: prijelaz u listu je na `transform`,
 * .45s, krivulja `--ease-spring`; nema `view-transition-name` (F23); kod pomak pise kao
 * `translateX(`, nikad kroz `style.left`.
 */
export function markerMotionProblems(css: string, ts: string): string[] {
  const tijelo = pravilo(css, '.site-chrome__marker');
  if (tijelo === null) return ['list nema pravila .site-chrome__marker'];
  const problemi: string[] = [];
  const prijelaz = /transition:\s*([^;]+);/.exec(tijelo)?.[1] ?? '';
  if (!/^transform\s+\.45s\s+var\(--ease-spring\)$/.test(prijelaz.trim())) problemi.push(`prijelaz kvacice je "${prijelaz.trim()}", ocekivano "transform .45s var(--ease-spring)"`);
  if (/\bleft\b/.test(prijelaz)) problemi.push('kvacica animira left');
  if (/view-transition-name/.test(tijelo)) problemi.push('kvacica nosi view-transition-name (F23: prijelazi izmedju dokumenata su ugaseni)');
  const kod = ts.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  if (/\.style\.left\b|style\.setProperty\(\s*'left'/.test(kod)) problemi.push('kod pomice kvacicu kroz style.left');
  if (!/translateX\(\$\{/.test(kod)) problemi.push('kod ne pise pomak kao translateX(...)');
  return problemi;
}

/**
 * GARD: tanko stanje trake nakon skrola nosi padding 8px, PUNU pozadinu tokena `--desk` (ne
 * prozirnu mjesavinu), crvenu nit i logo od 24px.
 */
export function scrolledBarProblems(css: string): string[] {
  const tijelo = pravilo(css, 'header.site-chrome--scrolled');
  if (tijelo === null) return ['list nema pravila header.site-chrome--scrolled'];
  const problemi: string[] = [];
  if (!/padding-block:\s*8px/.test(tijelo)) problemi.push('tanko stanje nema padding 8px');
  if (!/background:\s*var\(--desk\)\s*(;|$)/m.test(tijelo)) problemi.push('tanko stanje nema punu pozadinu var(--desk)');
  if (!/\.site-chrome--scrolled \.site-chrome__thread \{ opacity: \.7; \}/.test(bezCssKomentara(css))) problemi.push('tanko stanje nema crvenu nit');
  if (!/\.site-chrome--scrolled \.ks-mark \{ width: 24px; height: 24px;/.test(bezCssKomentara(css))) problemi.push('logo u tankom stanju nije 24px');
  return problemi;
}

/** Tijelo `@container site-chrome-mid (max-width: Npx) { ... }` bloka; `null` kad ga nema. */
function kontejnerBlok(css: string, px: number): string | null {
  const s = bezCssKomentara(css);
  const od = s.indexOf(`@container site-chrome-mid (max-width: ${px}px) {`);
  if (od < 0) return null;
  let dubina = 0;
  for (let i = s.indexOf('{', od); i < s.length; i++) {
    if (s[i] === '{') dubina++;
    else if (s[i] === '}') { dubina--; if (dubina === 0) return s.slice(od, i + 1); }
  }
  return null;
}

/**
 * GARD (stavka 4): na `/rad/` sredina je SPREMNIK, a stepper gubi natpise (samo brojevi) u tankom
 * stanju ispod IZMJERENE sirine sredine (599px), u debelom tek kad sam stepper ne stane (376px).
 * Natpis se skriva `clip-path`-om (ostaje citacu ekrana), nikad `display: none`.
 */
export function shortStepperProblems(css: string): string[] {
  const s = bezCssKomentara(css);
  const problemi: string[] = [];
  if (!/\.site-chrome\[data-site-chrome="workspace"\] \.site-chrome__mid \{[^}]*container: site-chrome-mid \/ inline-size;/.test(s)) {
    problemi.push('sredina radne povrsine nije spremnik site-chrome-mid');
  }
  const tanko = kontejnerBlok(css, 599);
  const debelo = kontejnerBlok(css, 376);
  if (tanko === null) problemi.push('nema kratkog steppera za tanko stanje (599px)');
  else {
    if (!/\.site-chrome--scrolled \.site-chrome__step-label \{/.test(tanko)) problemi.push('kratki stepper za 599px nije vezan uz tanko stanje');
    if (!/clip-path: inset\(50%\)/.test(tanko) || /display:\s*none/.test(tanko)) problemi.push('natpis koraka (599px) se ne skriva clip-pathom');
  }
  if (debelo === null) problemi.push('nema kratkog steppera za usku sredinu (376px)');
  else if (!/clip-path: inset\(50%\)/.test(debelo) || /display:\s*none/.test(debelo)) problemi.push('natpis koraka (376px) se ne skriva clip-pathom');
  if (!/max-width: min\(360px, 100%\)/.test(pravilo(css, '.site-chrome__doc') ?? '')) problemi.push('pilula dokumenta moze izaci iz sredine (nema max-width: min(360px, 100%))');
  return problemi;
}

/** Minimalni oblik esbuild metafilea koji gard cita; pravi metafile ga zadovoljava. */
export interface ChromeMetafile {
  readonly outputs: Readonly<Record<string, {
    readonly entryPoint?: string;
    readonly inputs: Readonly<Record<string, unknown>>;
    readonly imports: ReadonlyArray<{ readonly path: string; readonly kind: string }>;
  }>>;
}

export interface ChromeGraph {
  /** Izlazi koje stranica skine UVIJEK: ulaz trake i sve sto on staticki uvozi. */
  readonly staticOutputs: readonly string[];
  /** Izlazi dosegnuti SAMO dinamickim uvozom. */
  readonly lazyOutputs: readonly string[];
  readonly staticInputs: readonly string[];
  readonly lazyInputs: readonly string[];
}

const norm = (p: string): string => p.replaceAll('\\', '/');

/** Razdvaja graf trake na staticki (uvijek skinut) i lijeni dio, iz esbuild metafilea sa splittingom. */
export function chromeGraph(meta: ChromeMetafile, ulaz: string): ChromeGraph {
  const izlazi = Object.entries(meta.outputs).filter(([p]) => p.endsWith('.js'));
  const ulazniIzlaz = izlazi.find(([, o]) => o.entryPoint !== undefined && norm(o.entryPoint) === norm(ulaz))?.[0];
  if (ulazniIzlaz === undefined) return { staticOutputs: [], lazyOutputs: [], staticInputs: [], lazyInputs: [] };
  const staticki = new Set<string>();
  const red = [ulazniIzlaz];
  while (red.length) {
    const p = red.pop()!;
    if (staticki.has(p)) continue;
    staticki.add(p);
    for (const imp of meta.outputs[p]?.imports ?? []) if (imp.kind === 'import-statement') red.push(imp.path);
  }
  const lijeni = izlazi.map(([p]) => p).filter((p) => !staticki.has(p));
  const ulazi = (popis: readonly string[]): string[] => [...new Set(popis.flatMap((p) => Object.keys(meta.outputs[p]?.inputs ?? {}).map(norm)))];
  return { staticOutputs: [...staticki], lazyOutputs: lijeni, staticInputs: ulazi([...staticki]), lazyInputs: ulazi(lijeni) };
}

/**
 * GARD: puno podnozje je LIJENO. Njegov modul ne smije biti u statickom grafu trake (inace ga skida
 * svaka stranica), a mora postojati kao lijeni izlaz (inace podnozje nema ponasanja).
 */
export function lazyFooterProblems(graf: ChromeGraph): string[] {
  if (graf.staticOutputs.length === 0) return ['metafile nema izlaz ulaza trake; graf je prazan'];
  const modul = 'src/shared/site-footer-full.ts';
  const problemi: string[] = [];
  if (graf.staticInputs.includes(modul)) problemi.push(`${modul} je u statickom grafu trake`);
  if (!graf.lazyInputs.includes(modul)) problemi.push(`${modul} nije lijeni izlaz`);
  return problemi;
}
