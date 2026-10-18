/**
 * Gardovi faksimila Z35 (ALIGNMENT Z35, Z37). Mutacije: `tests/gate-mutations-faksimil.test.ts`.
 *
 *  - `fxTipProblems`: objasnjenja slojeva su DOSLOVNO iz predloska (`FX_TIP`, Z35 tocka 1 kaze
 *    "prepiši ih doslovno"). Gard cita naslove i opise iz predloska, ne iz prepisanog popisa, pa
 *    preformuliran opis u kodu obara gard;
 *  - `tockeLomaProblems`: CSS faksimila koristi SAMO tocke loma iz Z37 (600, 760, 900, 1024, 1180,
 *    1440) i tocno one koje model rasporeda koristi (`raspored` u `facsimile-live-model.ts`), da se
 *    CSS i ponasanje (lampa, nit, sticky) ne raziđu;
 *  - `rutaFaksimilaProblems`: kartica "Faksimil" u pregledu (`app.ts`) prvo pita rutu Z35
 *    (`otvoriRutuFaksimila`), a stari Z9 crta samo kad ruta odbije (legacy, bez stola). Drugi ulaz
 *    u Z9 mimo rute bi vratio stari prikaz na rutu faksimila bez ijednog crvenog testa, jer `app.ts`
 *    nema jedinicni test montaze.
 */

export function rutaFaksimilaProblems(appSirov: string): string[] {
  const kod = appSirov.replace(/\r/g, '');
  const Z9 = "setPreviewMode('faksimil')";
  const pocetak = kod.indexOf("ctl('#previewModeFaksimil').onclick=");
  if (pocetak < 0) return ['kartica Faksimil nema rukovatelja'];
  const rukovatelj = kod.slice(pocetak, kod.indexOf(';', pocetak));
  const ruta = rukovatelj.indexOf('otvoriRutuFaksimila(');
  const z9 = rukovatelj.indexOf(Z9);
  const problemi: string[] = [];
  if (ruta < 0) problemi.push('kartica Faksimil ne ide kroz rutu Z35');
  else if (z9 >= 0 && z9 < ruta) problemi.push('Z9 se crta prije rute Z35');
  const mimo = kod.split(Z9).length - 1 - (z9 >= 0 ? 1 : 0);
  if (mimo > 0) problemi.push(`Z9 ima ${mimo} ulaz mimo rute`);
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
