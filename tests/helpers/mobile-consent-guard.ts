/**
 * Gard za traku privole na mobitelu (mobilni audit 2026-09-28, PR 3): do 720 px ukljucivo obje trake (`#consentBanner`
 * na `/rad/` i `.lekta-consent-banner` na alatima) stoje u toku stranice, rezerva ispod sadrzaja vrijedi samo za
 * (width > 720px), bez rupe za frakcijske sirine (Codex R2 na #305), a `syncConsentBannerInset` postavlja inline
 * rezervu samo za fiksnu traku. Cista funkcija nad tekstom izvora, pa se smije mutirati; izravni dokaz u pregledniku je
 * `tests/ux/mobile-consent-inflow.spec.ts`.
 *
 * `consentRevealProblems`: gumb "Postavke privatnosti" vidljivu traku dovodi u vidokrug i fokusira njezinu prvu radnju
 * (Codex R1 na #305). Modul se gradi iz STVARNOG izvora uz zamjene, pa mutacija mijenja sam kod.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

const cisto = (s: string) => s.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

export function mobileConsentProblems(src: { pageApp: string; pageChrome: string; toolPage: string; appTs: string }): string[] {
  const problemi: string[] = [];
  const app = cisto(src.pageApp);
  const chrome = cisto(src.pageChrome);
  const tool = cisto(src.toolPage);
  if (!/@media\(max-width:720px\)\{\.consent-banner\{position:static[;}]/.test(app)) problemi.push('/rad/: traka nije u toku na uskom ekranu');
  if (!/@media\(max-width:720px\)\{\.lekta-consent-banner\{position:static[;}]/.test(tool)) problemi.push('alati: traka nije u toku na uskom ekranu');
  if (/max-width:720px\)\s*\{\s*body:has\([^)]*consent-banner/.test(chrome + tool)) problemi.push('rezerva za traku i na uskom ekranu');
  if (/@media screen\{\s*body:has\([^)]*consent-banner/.test(chrome + tool)) problemi.push('rezerva za traku bez praga sirine');
  if (/min-width:\s*721px\)\s*\{\s*body:has\([^)]*consent-banner/.test(chrome + tool)) problemi.push('rezerva ostavlja rupu izmedju 720 i 721 px');
  if (!/!skriven&&getComputedStyle\(b\)\.position==='fixed'\?`\$\{h\+34\}px`:''/.test(src.appTs)) problemi.push('inline rezerva ne ovisi o fiksnoj traci');
  return problemi;
}

/** Tijela top-level `@media` blokova s uvjetom, redom pojave. */
function mediaBlokovi(css: string): Array<{ uvjet: string; tijelo: string }> {
  const out: Array<{ uvjet: string; tijelo: string }> = [];
  const re = /@media([^{]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let dubina = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && dubina > 0) {
      if (css[i] === '{') dubina += 1;
      else if (css[i] === '}') dubina -= 1;
      i += 1;
    }
    out.push({ uvjet: m[1].trim(), tijelo: css.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

/** Vrijedi li medijski uvjet na zaslonu sirine `w` CSS px. Nepoznat dio uvjeta je greska, ne pretpostavka. */
function vrijedi(uvjet: string, w: number): boolean {
  return uvjet.split(/\s+and\s+/).every((dio) => {
    const d = dio.trim();
    if (d === 'screen' || d === '') return true;
    let m = /^\((max|min)-width:\s*([\d.]+)px\)$/.exec(d);
    if (m) return m[1] === 'max' ? w <= Number(m[2]) : w >= Number(m[2]);
    m = /^\(width\s*(>=|<=|>|<)\s*([\d.]+)px\)$/.exec(d);
    if (m) {
      const n = Number(m[2]);
      return m[1] === '>' ? w > n : m[1] === '>=' ? w >= n : m[1] === '<' ? w < n : w <= n;
    }
    throw new Error(`nepoznat medijski uvjet: ${d}`);
  });
}

/**
 * Prag trake bez rupe i preklopa (Codex R2 na #305). Chromium zaokruzuje sirinu okvira na cijeli px (izmjereno
 * 2026-10-05: iframe od 720,5 px ima 721), pa se frakcijska sirina ne moze postici u pregledniku; ovdje se kaskada
 * medijskih uvjeta stvarnih listova izracunava na 720, 720,5 i 721 px. Na svakoj sirini vrijedi tocno jedno: traka u
 * toku stranice ILI rezerva ispod sadrzaja za fiksnu traku.
 */
export function consentThresholdProblems(src: { pageApp: string; pageChrome: string; toolPage: string }, sirine = [720, 720.5, 721]): string[] {
  const povrsine = [
    { ime: '/rad/', toku: cisto(src.pageApp), traka: '.consent-banner{position:static', rezerva: cisto(src.pageChrome), rez: /body:has\(\.consent-banner[^{]*\{[^}]*padding-bottom/ },
    { ime: 'alati', toku: cisto(src.toolPage), traka: '.lekta-consent-banner{position:static', rezerva: cisto(src.toolPage), rez: /body:has\(\.lekta-consent-banner[^{]*\{[^}]*padding-bottom/ },
  ];
  const problemi: string[] = [];
  for (const p of povrsine) {
    const tokBlokovi = mediaBlokovi(p.toku).filter((b) => b.tijelo.replace(/\s+/g, '').includes(p.traka));
    const rezBlokovi = mediaBlokovi(p.rezerva).filter((b) => p.rez.test(b.tijelo));
    for (const w of sirine) {
      const uToku = tokBlokovi.some((b) => vrijedi(b.uvjet, w));
      const sRezervom = rezBlokovi.some((b) => vrijedi(b.uvjet, w));
      if (uToku === sRezervom) problemi.push(`${p.ime} ${w} px: ${uToku ? 'traka u toku i rezerva' : 'ni traka u toku ni rezerva'}`);
    }
  }
  return problemi;
}

type Reveal ={ mountConsentReveal: (doc?: Document) => void };

/** `src/ui/consent-reveal.ts` iz stvarnog izvora uz zamjene `[staro, novo]`. */
export function consentRevealFromSource(zamjene: Array<[string, string]> = []): Reveal {
  let src = readFileSync(resolve(process.cwd(), 'src/ui/consent-reveal.ts'), 'utf8').replace(/\r/g, '');
  for (const [a, b] of zamjene) {
    if (!src.includes(a)) throw new Error(`mutacija ne pogadja izvor: ${a}`);
    src = src.replace(a, b);
  }
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  return mod.exports as unknown as Reveal;
}

/** Klik na "Postavke privatnosti" uz vidljivu traku: traka je pomaknuta u vidokrug, prva radnja ima fokus. */
export async function consentRevealProblems(mod: Reveal): Promise<string[]> {
  document.body.innerHTML = '<button id="privacySettingsBtn">Postavke privatnosti</button>'
    + '<div id="consentBanner" class="consent-banner"><p>Analitika</p><button id="analyticsDecline">Samo nužno</button><button id="analyticsAccept">Dopusti</button></div>';
  const traka = document.getElementById('consentBanner')!;
  let pomaknuta = false;
  traka.scrollIntoView = () => { pomaknuta = true; };
  mod.mountConsentReveal(document);
  document.getElementById('privacySettingsBtn')!.click();
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const problemi: string[] = [];
  if (!pomaknuta) problemi.push('traka nije dovedena u vidokrug');
  if (document.activeElement?.id !== 'analyticsDecline') problemi.push('prva radnja trake nema fokus');
  return problemi;
}
