/**
 * Gardovi faksimila Z35 (ALIGNMENT Z35, Z37). Mutacije: `tests/gate-mutations-faksimil.test.ts`.
 *
 *  - `fxTipProblems`: objasnjenja slojeva su DOSLOVNO iz predloska (`FX_TIP`, Z35 tocka 1 kaze
 *    "prepiši ih doslovno"). Gard cita naslove i opise iz predloska, ne iz prepisanog popisa, pa
 *    preformuliran opis u kodu obara gard;
 *  - `tockeLomaProblems`: CSS faksimila koristi SAMO tocke loma iz Z37 (600, 760, 900, 1024, 1180,
 *    1440) i tocno one koje model rasporeda koristi (`raspored` u `facsimile-live-model.ts`), da se
 *    CSS i ponasanje (lampa, nit, sticky) ne raziđu;
 *  - `rutaFaksimilaProblems`: odluka vlasnika 2026-10-18 (F51 a, "Broj 2"): stari faksimil Z9 crta
 *    se SAMO iza prekidaca `?resultRenderer=legacy`. Gard obara svaki ulaz u Z9 mimo toga: kartica
 *    "Faksimil" u pregledu (`app.ts`) mora ici kroz rutu i predati Z9 samo kao povratni poziv rute,
 *    ruta (`results-cockpit.ts`) smije zvati Z9 samo pod provjerom legacy, `app.ts` predaje pregled
 *    i rezultatu bez nalaza (inace kartica nema Z35), a renderer Z9 (`render-facsimile`) smiju
 *    uvoziti samo pregled iz `app.ts` (iza kartice) i usporedba popravka (`repair-diff.ts`), i to samo
 *    dok backlog nosi F stavku koja kaze zasto. Bez gara bi stari prikaz tiho vratio bilo koji
 *    pozivatelj, jer `app.ts` nema jedinicni test montaze.
 */

const Z9 = "setPreviewMode('faksimil')";
/** Usporedba prije/poslije popravka: zasebna znacajka nad rendererom Z9, iznimka uz F stavku. */
const USPOREDBA = 'src/ui/repair-diff.ts';
/** Smiju uvoziti renderer Z9: on sam, pregled iza kartice (gard a i b) i usporedba uz F stavku. */
const SMIJU_Z9 = new Set(['src/preview/render-facsimile.ts', 'src/ui/app.ts', USPOREDBA]);

const bezKomentara = (kod: string): string => kod
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');

/** Kraj poziva koji pocinje na `otvorena` (indeks zagrade); -1 kad zagrade nisu zatvorene. */
function krajPoziva(kod: string, otvorena: number): number {
  let dubina = 0;
  for (let i = otvorena; i < kod.length; i += 1) {
    if (kod[i] === '(') dubina += 1;
    else if (kod[i] === ')') { dubina -= 1; if (dubina === 0) return i; }
  }
  return -1;
}

function karticaProblems(app: string): string[] {
  const pocetak = app.indexOf("ctl('#previewModeFaksimil').onclick=");
  if (pocetak < 0) return ['kartica Faksimil nema rukovatelja'];
  const rukovatelj = app.slice(pocetak, app.indexOf(';', pocetak));
  const ruta = rukovatelj.indexOf('otvoriRutuFaksimila(');
  const problemi: string[] = [];
  let unutra = 0;
  if (ruta < 0) problemi.push('kartica Faksimil ne ide kroz rutu Z35');
  else {
    const otvorena = ruta + 'otvoriRutuFaksimila'.length;
    const argumenti = rukovatelj.slice(otvorena, krajPoziva(rukovatelj, otvorena) + 1);
    unutra = argumenti.split(Z9).length - 1;
    if (!argumenti.includes(`()=>${Z9}`)) problemi.push('ruta ne dobiva Z9 kao povratni poziv za legacy');
  }
  const uRukovatelju = rukovatelj.split(Z9).length - 1;
  if (uRukovatelju > unutra) problemi.push('kartica crta Z9 mimo rute');
  const mimo = app.split(Z9).length - 1 - uRukovatelju;
  if (mimo > 0) problemi.push(`Z9 ima ${mimo} ulaz mimo rute`);
  if (!/const _desk=\{items:/.test(app)) problemi.push('app.ts ne predaje pregled ruti Z35 kad rezultat nema nalaza');
  return problemi;
}

function rutaProblems(kokpit: string): string[] {
  const pocetak = kokpit.indexOf('export function otvoriRutuFaksimila(');
  if (pocetak < 0) return ['ruta faksimila ne postoji'];
  const tijelo = kokpit.slice(pocetak, kokpit.indexOf('\n}\n', pocetak));
  const potpis = tijelo.slice(0, tijelo.indexOf('{'));
  const staro = potpis.match(/,\s*(\w+):\s*\(\)\s*=>\s*void,\s*\w+:\s*\(poruka/)?.[1];
  if (!staro) return ['ruta nema povratni poziv za Z9'];
  const pozivi = tijelo.slice(potpis.length).split('\n').filter((r) => r.includes(`${staro}(`));
  const problemi: string[] = [];
  if (!pozivi.length) problemi.push('ruta ne crta Z9 ni iza legacy');
  for (const r of pozivi) {
    if (!/resultRendererFor\([^)]*\)\s*===\s*'legacy'/.test(r)) problemi.push(`ruta crta Z9 izvan legacy prekidaca: ${r.trim()}`);
  }
  return problemi;
}

export function rutaFaksimilaProblems(izvori: Readonly<Record<string, string>>, backlog: string): string[] {
  const kod = (ime: string): string => (izvori[ime] ?? '').replace(/\r/g, '');
  const problemi = [...karticaProblems(kod('src/ui/app.ts')), ...rutaProblems(kod('src/ui/results/results-cockpit.ts'))];
  const uvozeZ9 = Object.keys(izvori)
    .filter((ime) => /(?:from\s+|import\s*\(\s*)['"][^'"]*\/render-facsimile(?:\.ts)?['"]/.test(bezKomentara(kod(ime))));
  for (const ime of uvozeZ9) if (!SMIJU_Z9.has(ime)) problemi.push(`${ime}: ulaz u Z9 (render-facsimile) mimo legacy prekidaca`);
  // Pregled u `app.ts` crta Z9 na jednom mjestu (nacin "faksimil", do kojeg vodi samo ruta); drugi uvoz bi bio drugi ulaz.
  const uApp = bezKomentara(kod('src/ui/app.ts')).match(/(?:from\s+|import\s*\(\s*)['"][^'"]*\/render-facsimile(?:\.ts)?['"]/g)?.length ?? 0;
  if (uApp > 1) problemi.push(`src/ui/app.ts: ${uApp} uvoza renderera Z9`);
  // Iznimka je vlastiti redak (tema u drugom stupcu), ne usputno spominjanje usporedbe u drugoj stavci.
  const iznimka = /^\| F\d+ \| Usporedba prije\/poslije popravka \(`repair-diff\.ts`\)[^\n]*Z9/m.test(backlog.replace(/\r/g, ''));
  if (uvozeZ9.includes(USPOREDBA) && !iznimka) problemi.push(`${USPOREDBA}: Z9 bez F stavke u backlogu`);
  return problemi;
}

const bezKomentaraCss = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Naslovi i opisi iz `FX_TIP` predloska, redom kljuceva. */
export function fxTipIzPredloska(predlozak: string): Array<{ kljuc: string; t: string; d: string }> {
  const html = predlozak.replace(/\r/g, '');
  const blok = html.match(/const FX_TIP = \{([\s\S]*?)\n\};/);
  if (!blok) return [];
  return [...blok[1].matchAll(/(\w+): \{[^}]*?t: '([^']+)', d: '([^']+)' \}/g)].map((m) => ({ kljuc: m[1], t: m[2], d: m[3] }));
}

export function fxTipProblems(modul: string, predlozak: string): string[] {
  const kod = modul.replace(/\r/g, '');
  const tipovi = fxTipIzPredloska(predlozak);
  if (!tipovi.length) return ['predlozak nema FX_TIP'];
  const problemi: string[] = [];
  for (const { kljuc, t, d } of tipovi) {
    if (!kod.includes(`t: '${t}'`)) problemi.push(`${kljuc}: naslov "${t}" nije doslovno u kodu`);
    if (!kod.includes(`d: '${d}'`)) problemi.push(`${kljuc}: opis nije doslovno u kodu`);
  }
  return problemi;
}

/** Tocke loma iz Z37; nove se ne izmisljaju. */
export const TOCKE_LOMA_Z37: readonly number[] = [600, 760, 900, 1024, 1180, 1440];

export function tockeLomaProblems(cssSirov: string, modelove: readonly number[]): string[] {
  const css = bezKomentaraCss(cssSirov);
  const problemi: string[] = [];
  const nadjene = [...css.matchAll(/\((?:min|max)-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
  for (const n of nadjene) if (!TOCKE_LOMA_Z37.includes(n)) problemi.push(`tocka loma ${n}px nije u Z37`);
  for (const n of modelove) {
    if (!css.includes(`(min-width: ${n}px)`)) problemi.push(`CSS nema tocku loma modela ${n}px`);
  }
  return problemi;
}
