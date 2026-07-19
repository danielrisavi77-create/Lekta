/**
 * LEGAL-CITATION korpus (atomic + valid): najveca slijepa tocka faze 1 (9 pravnih provjera
 * imalo je samo staticki scan, nula slucajeva). Svaki atomski slucaj kvari tocno jednu pravnu
 * provjeru jednom izmjenom fusnota PROLAZNE pravne baze (legal-baseline.ts), a valid controls
 * dokazuju da valjani (ali skliski) oblici ne daju lazni nalaz.
 */
import type { DocSpec } from '../../helpers/docx-builder';
import { cloneSpec } from '../builder/baseline';
import { legalBaselineSpec, LEGAL_PROFILE_ID } from '../builder/legal-baseline';
import type { ErrorCase } from '../error-case';

const PID = LEGAL_PROFILE_ID;

/** Klon baze s izmijenjenim fusnotama (fn dobiva kopiju polja fusnota). */
function withFootnotes(fn: (f: string[]) => string[]): DocSpec {
  const spec = cloneSpec(legalBaselineSpec());
  spec.footnotes = fn([...(spec.footnotes ?? [])]);
  return spec;
}

export const LEGAL_ATOMIC_CASES: ErrorCase[] = [
  {
    id: 'atomic.legal.footnotes-present',
    title: 'Pravni rad bez ijedne fusnote',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => { const s = cloneSpec(legalBaselineSpec()); s.footnotes = []; return s; },
    expect: { checkId: 'legal.footnotes-present', title: 'Pravne fusnote', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.footnote.present',
    title: 'Nema automatskih Word fusnota (profil ih očekuje)',
    category: 'formatting', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Isti uklonjeni skup fusnota ruši i opcu formatting-provjeru prisutnosti fusnota (footnote.present),
    // ne samo pravnu (legal.footnotes-present) - dokaz da obje detekcije reagiraju.
    build: () => { const s = cloneSpec(legalBaselineSpec()); s.footnotes = []; return s; },
    expect: { checkId: 'footnote.present', title: 'Automatske fusnote', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.source-classification',
    title: 'Fusnote se ne mogu klasificirati u vrste izvora',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Sve fusnote su gole napomene bez autor-godina-str./akta/predmeta -> type 'other' -> coverage < 0.45.
    build: () => withFootnotes(() => [
      'Napomena uz tekst bez ikakve prepoznatljive strukture izvora.',
      'Dodatno pojašnjenje autora bez navođenja djela.',
      'Opća opaska koja ne upućuje ni na koji izvor.',
    ]),
    expect: { checkId: 'legal.source-classification', title: 'Klasifikacija pravnih izvora', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.first-citation-completeness',
    title: 'Prvo navođenje propisa bez broja službenog glasila',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Zakon ostaje klasificiran kao 'law' (ima "Zakon o" + "Narodne novine"), ali bez "br. N" mu
    // nedostaje broj objave -> nepotpun prvi navod. (Knjiga bez str. NE bi radila: bez str. postaje
    // 'other', a 'other' se ne ocjenjuje na potpunost.)
    build: () => withFootnotes((f) => { f[1] = 'Zakon o radu, Narodne novine.'; return f; }),
    expect: { checkId: 'legal.first-citation-completeness', title: 'Potpunost prvog navođenja', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.opcit',
    title: 'op. cit. upućuje na nepostojeću bilješku',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => withFootnotes((f) => { f[5] = 'Kovač, op. cit. u bilj. 9, str. 40.'; return f; }),
    expect: { checkId: 'legal.opcit', title: 'op. cit. → prvo navođenje', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.ibid',
    title: 'Ibid. bez razrješive prethodne bilješke',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Jedina fusnota je Ibid. -> nema prethodne biljeske -> pada.
    build: () => withFootnotes(() => ['Ibid., str. 5.']),
    expect: { checkId: 'legal.ibid', title: 'Slijed Ibid.', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.act-abbrev',
    title: 'Kratica akta korištena bez uvođenja („dalje u tekstu")',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Uz postojeci zakon dodajemo fusnotu koja rabi kraticu ZOR koja nigdje nije uvedena.
    build: () => withFootnotes((f) => [...f, 'Sve obveze poslodavca prema ZOR-u ostaju na snazi.']),
    expect: { checkId: 'legal.act-abbrev', title: 'Propisi i uvedene kratice', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.case-law',
    title: 'Sudska odluka bez datuma',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    build: () => withFootnotes((f) => { f[4] = 'Vrhovni sud Republike Hrvatske, Rev-123/2019-2.'; return f; }),
    expect: { checkId: 'legal.case-law', title: 'Sudska praksa', kind: 'status', outcome: 'not-pass' },
  },
  {
    id: 'atomic.legal.footnote-bibliography',
    title: 'Izvori iz fusnota bez podudaranja u bibliografiji',
    category: 'citations', oracle: 'atomic-fail', profileId: PID, detectableNow: true,
    // Uklanjamo retke literature (Literatura heading ostaje, jedinice nestaju) -> nema podudaranja.
    build: () => {
      const s = cloneSpec(legalBaselineSpec());
      const litIdx = s.paragraphs.findIndex((p) => p.styleId && /Literatura/.test(p.text));
      s.paragraphs = s.paragraphs.slice(0, litIdx + 1);
      return s;
    },
    expect: { checkId: 'legal.footnote-bibliography', title: 'Fusnote ↔ bibliografija', kind: 'status', outcome: 'not-pass' },
  },
];

export const LEGAL_VALID_CASES: ErrorCase[] = [
  {
    id: 'valid.legal.acronym-introduced',
    title: 'Kratica akta ispravno uvedena („dalje u tekstu")',
    category: 'citations', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Zakon uvodi kraticu ZOR; kasnija uporaba ZOR-a NE smije biti lazni nalaz (kontrast s atomic act-abbrev).
    build: () => withFootnotes((f) => {
      f[1] = 'Zakon o radu (dalje u tekstu: ZOR), Narodne novine, br. 93/14, 127/17, 98/19.';
      return [...f, 'Sve obveze poslodavca prema ZOR-u ostaju na snazi.'];
    }),
    expect: { checkId: 'legal.act-abbrev', title: 'Propisi i uvedene kratice', kind: 'status', outcome: 'pass' },
    notes: 'Uredno uvedena kratica ne smije se prijaviti kao neuvedena.',
  },
  {
    id: 'valid.legal.ibid-consecutive',
    title: 'Dva uzastopna Ibid. nakon razrješivog izvora',
    category: 'citations', oracle: 'valid-control', profileId: PID, detectableNow: true,
    // Lanac Ibid. -> Ibid. je valjan: drugi Ibid. se razrjesava preko prvog (koji ima sidro).
    build: () => withFootnotes((f) => { f.splice(4, 0, 'Ibid., str. 48.'); return f; }),
    expect: { checkId: 'legal.ibid', title: 'Slijed Ibid.', kind: 'status', outcome: 'pass' },
    notes: 'Uzastopni Ibid. lanac je valjan i ne smije pasti.',
  },
];
