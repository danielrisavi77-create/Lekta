import { TOC_FIELD_PARA } from '../../helpers/docx-builder';
/**
 * PROFILNO-UVJETOVANI atomski korpus (faza 4, "profilni enabler"): provjere koje se u engineu
 * NE emitiraju za referentni fpzg-politologija-zavrsni profil (baseline.ts), nego samo kad profil
 * nosi odgovarajuce pravilo. Umjesto prosirivanja buildera ili baze, ove slucajeve VEZEMO na
 * stvarne verificirane profile iz registra koji to pravilo vec imaju:
 *
 *   - `pravo-socijalni-rad-zavrsni`  headingRules.levels (1 bold, 2-5 italic), numberRequired,
 *     trailingDot, keywordMin/Max 3-5, requireBilingualAbstracts + abstractCheckScored -> pokriva
 *     5 provjera: oblikovanje/numeriranje/poravnanje naslova + kljucne rijeci + sazetci.
 *   - `fpzg-politologija-diplomski`  minReferences=15 -> minimalan broj izvora.
 *   - `arh-diplomski`                paperSizes ["A3","A0"] -> projektni format stranice.
 *
 * Svaki slucaj ima `cleanBuild` (dokument koji ciljanu provjeru PROLAZI pod tim profilom) i `build`
 * (ista baza s jednom mutacijom koja bas tu provjeru rusi). Time vrijedi ista atomska uzrocnost kao
 * za baseline slucajeve, samo je "prolazna baza" per-profil. Ne dira se engine (CLAUDE.md): profili,
 * pravila i pragovi su autorski podaci; korpus ih samo vozi kroz kontrolirane ulaze.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { line, heading, body, PAGE_FIELD, cloneSpec, baselineSpec } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PRAVO_SOCIAL = 'pravo-socijalni-rad-zavrsni';
const FPZG_DIPLOMSKI = 'fpzg-politologija-diplomski';
const ARH = 'arh-diplomski';

/** Naslov s Word stilom Heading1 (razina 1); pravo-social profil za razinu 1 trazi bold. */
const H = (text: string, over: Partial<ParaSpec> = {}): ParaSpec => ({ text, font: 'Times New Roman', sizePt: 12, styleId: 'Heading1', spacing15: true, ...over });

/**
 * PROLAZNA baza za `pravo-socijalni-rad-zavrsni`: dvojezicni sazetak i kljucne rijeci (3-5),
 * te tri numerirana naslova razine 1 (bold, s tockom, poravnata slijeva) koji zadovoljavaju
 * headingRules. Probing potvrduje: oblikovanje 6/6, numeriranje 4/4, poravnanje 3/3, kljucne
 * rijeci 3/3, sazetci 4/4 (svih pet 'pass').
 */
function pravoSocialSpec(): DocSpec {
  return {
    paragraphs: [
      line('Sveučilište u Zagrebu', { jc: 'center' }),
      line('Pravni fakultet, Studijski centar socijalnog rada', { jc: 'center' }),
      line('Analiza socijalnih usluga u zajednici', { jc: 'center', sizePt: 16, bold: true }),
      line('Završni rad', { jc: 'center' }),
      heading('Sažetak'),
      line('Sažetak rada u jednom odlomku sažima ključne spoznaje istraživanja o socijalnim uslugama.', { jc: 'both' }),
      line('Ključne riječi: socijalni rad, usluge, analiza, metoda'),
      heading('Abstract'),
      line('This thesis summarises the key findings on social services provision in the community.', { jc: 'both' }),
      line('Keywords: social work, services, analysis, method'),
      heading('Sadržaj'),
      TOC_FIELD_PARA,
      PAGE_FIELD,
      line('1. Uvod\t1'),
      line('2. Razrada\t3'),
      line('3. Zaključak\t9'),
      line('Literatura\t10'),
      H('1. Uvod', { bold: true }),
      ...body(360),
      H('2. Razrada', { bold: true }),
      ...body(900),
      H('3. Zaključak', { bold: true }),
      ...body(300),
      heading('Literatura'),
      line('Horvat, I. (2019). Socijalne usluge u zajednici. Rijeka: Izdavač.'),
      line('Kovač, A. (2020). Temelji socijalnog rada. Zagreb: Naklada.'),
    ],
    marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
  };
}

/** Klon pravo-social baze s jednom mutacijom (za atomske build varijante). */
function mutPravo(fn: (paras: ParaSpec[], spec: DocSpec) => void): DocSpec {
  const s = cloneSpec(pravoSocialSpec());
  fn(s.paragraphs, s);
  return s;
}

/** Bibliografski zapis broj i (prepoznatljiv autor-godina-izdavac oblik). */
function refLine(i: number): ParaSpec {
  const letter = String.fromCharCode(65 + (i % 26));
  const yy = String(10 + (i % 80)).padStart(2, '0');
  return line(`${letter}utorić, X${i}. (20${yy}). Naslov znanstvenog djela broj ${i}. Zagreb: Naklada.`);
}

/** fpzg baza s tocno n bibliografskih jedinica pod Literaturom (za reference.min-count). */
function minRefSpec(n: number): DocSpec {
  const s = cloneSpec(baselineSpec());
  const litIdx = s.paragraphs.findIndex((p) => p.styleId && /Literatura/.test(p.text));
  const refs: ParaSpec[] = [];
  for (let i = 0; i < n; i++) refs.push(refLine(i));
  s.paragraphs = [...s.paragraphs.slice(0, litIdx + 1), ...refs];
  return s;
}

/** fpzg baza s eksplicitnim formatom stranice (za page.size.project pod arh profilom). */
function projectPageSpec(pageCm: { w: number; h: number }): DocSpec {
  const s = cloneSpec(baselineSpec());
  s.pageCm = { ...pageCm };
  return s;
}

export const PROFILE_ATOMIC_CASES: ErrorCase[] = [
  // --- pravo-socijalni-rad-zavrsni: headingRules + kljucne rijeci + sazetci -------------------
  {
    id: 'atomic.structure.heading.format',
    title: 'Naslov razine 1 nije podebljan (profil traži bold)',
    category: 'structure', oracle: 'atomic-fail', profileId: PRAVO_SOCIAL, detectableNow: true,
    cleanBuild: () => pravoSocialSpec(),
    build: () => mutPravo((ps) => { const h = ps.find((p) => p.styleId === 'Heading1' && /^1\. Uvod/.test(p.text)); if (h) h.bold = false; }),
    expect: { checkId: 'structure.heading.format', title: 'Oblikovanje naslova po razinama', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.heading.numbering',
    title: 'Naslov bez oznake razine (profil traži numeriranje)',
    category: 'structure', oracle: 'atomic-fail', profileId: PRAVO_SOCIAL, detectableNow: true,
    cleanBuild: () => pravoSocialSpec(),
    build: () => mutPravo((ps) => { const h = ps.find((p) => p.styleId === 'Heading1' && /^2\. Razrada/.test(p.text)); if (h) h.text = 'Razrada'; }),
    expect: { checkId: 'structure.heading.numbering', title: 'Numeriranje naslova', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.heading.align',
    title: 'Naslov centriran umjesto poravnat slijeva',
    category: 'structure', oracle: 'atomic-fail', profileId: PRAVO_SOCIAL, detectableNow: true,
    cleanBuild: () => pravoSocialSpec(),
    build: () => mutPravo((ps) => { const h = ps.find((p) => p.styleId === 'Heading1' && /^3\. Zaključak/.test(p.text)); if (h) h.jc = 'center'; }),
    expect: { checkId: 'structure.heading.align', title: 'Poravnanje naslova slijeva', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.keywords',
    title: 'Nedostaju hrvatske ključne riječi (profil ih boduje)',
    category: 'structure', oracle: 'atomic-fail', profileId: PRAVO_SOCIAL, detectableNow: true,
    cleanBuild: () => pravoSocialSpec(),
    build: () => mutPravo((ps, s) => { s.paragraphs = ps.filter((p) => !/^Ključne riječi/.test(p.text)); }),
    expect: { checkId: 'structure.keywords', title: 'Ključne riječi u samom radu', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.structure.abstract',
    title: 'Nedostaje hrvatski sažetak (profil boduje dvojezične sažetke)',
    category: 'structure', oracle: 'atomic-fail', profileId: PRAVO_SOCIAL, detectableNow: true,
    cleanBuild: () => pravoSocialSpec(),
    build: () => mutPravo((ps) => { const i = ps.findIndex((p) => p.styleId && /Sažetak/.test(p.text)); if (i >= 0) ps.splice(i, 2); }),
    expect: { checkId: 'structure.abstract', title: 'Sažeci u samom radu', kind: 'status', outcome: 'not-pass' },
  },

  // --- fpzg-politologija-diplomski: minReferences=15 -----------------------------------------
  {
    id: 'atomic.reference.min-count',
    title: 'Premalo izvora za profilni minimum (ispod 15)',
    category: 'citations', oracle: 'atomic-fail', profileId: FPZG_DIPLOMSKI, detectableNow: true,
    cleanBuild: () => minRefSpec(16),
    build: () => minRefSpec(5),
    expect: { checkId: 'reference.min-count', title: 'Minimalan broj izvora profila', kind: 'status', outcome: 'not-pass' },
  },

  // --- arh-diplomski: paperSizes ["A3","A0"] (projektni radovi) -------------------------------
  {
    id: 'atomic.page.size.project',
    title: 'Projektni rad u A4 umjesto profilnog A3/A0',
    category: 'formatting', oracle: 'atomic-fail', profileId: ARH, detectableNow: true,
    cleanBuild: () => projectPageSpec({ w: 29.7, h: 42.0 }),
    build: () => projectPageSpec({ w: 21.0, h: 29.7 }),
    expect: { checkId: 'page.size.project', title: 'Format stranice (A3/A0)', kind: 'status', outcome: 'not-pass' },
  },
];
