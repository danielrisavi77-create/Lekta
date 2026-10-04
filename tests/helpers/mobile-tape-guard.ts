/**
 * Gard za ukrasnu traku lista na mobitelu (mobilni audit 2026-09-28, PR 2): na uskom ekranu (720 px) traka ne smije
 * stajati na sredini lista, gdje pada na natpise koraka. Mora biti uz desni rub i ne sira od 100 px.
 */
export function mobileTapeProblems(css: string): string[] {
  const src = css.replace(/\r/g, '');
  const m = /@media\s*\(max-width:\s*720px\)\s*\{\s*\.analyzer-wrap::before\s*\{([^}]*)\}\s*\}/.exec(src);
  if (!m) return ['traka nema pravilo za uski ekran'];
  const pravilo = m[1];
  const problemi: string[] = [];
  if (!/left:\s*auto/.test(pravilo) || !/right:\s*\d+px/.test(pravilo)) problemi.push('traka nije uz desni rub');
  const w = /width:\s*(\d+)px/.exec(pravilo);
  if (!w || Number(w[1]) > 100) problemi.push('traka je sira od 100 px');
  return problemi;
}

/**
 * Gard za zbijeni dokumentov red (`#radDocMeta`) na mobitelu (mobilni audit PR 2): na uskom ekranu gumb nove verzije
 * je vizualno nizak, ali `::after` siri dodir na 44 px (visina + 2 x prosirenje), a red ima razmak ispod da list ne
 * prekrije donji dio mete. Razmak izmedju redaka nije manji od prosirenja, pa prelomljen gumb ne otima dodir retku
 * iznad (Codex R1 na #286).
 */
export function mobileDocMetaProblems(css: string): string[] {
  const src = css.replace(/\r/g, '');
  const blok = /@media \(max-width: 720px\) \{\s*\.rad-doc-meta \{([^}]*)\}([\s\S]*?)\n\}/.exec(src);
  if (!blok) return ['dokumentov red nema pravilo za uski ekran'];
  const problemi: string[] = [];
  const visina = /\.rad-doc-new-version \{[^}]*min-height: (\d+)px/.exec(blok[2]);
  const siri = /\.rad-doc-new-version::after \{[^}]*inset: -(\d+)px 0/.exec(blok[2]);
  const ukupno = (visina ? Number(visina[1]) : 0) + 2 * (siri ? Number(siri[1]) : 0);
  if (ukupno < 44) problemi.push(`dodirna meta nove verzije ${ukupno} px, ispod 44`);
  const razmak = /padding-bottom: (\d+)px/.exec(blok[1]);
  if (!razmak || (siri && Number(razmak[1]) < Number(siri[1]) - 2)) problemi.push('ispod reda nema razmaka za prosirenu metu');
  const redovi = /(?:^|;)\s*gap: (\d+)(?:px)?\b/.exec(blok[1]);
  if (siri && (!redovi || Number(redovi[1]) < Number(siri[1]))) problemi.push('razmak redaka manji od prosirenja: prelomljen gumb otima dodir retku iznad');
  return problemi;
}
