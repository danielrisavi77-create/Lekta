/**
 * VALID CONTROL korpus (faza 4, prompt T): valjani dokumenti koji koriste NETIPICNU ali
 * ISPRAVNU reprezentaciju - moraju ostati bez laznog nalaza (false positive). Jednako vazno
 * kao atomske greske: dokazuje da engine ne kaznjava valjane, ali neuobicajene oblike.
 *
 * Svaki slucaj ocekuje da ciljana provjera OSTANE 'pass' (outcome: 'pass').
 */
import type { ParaSpec, DocSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec, line, BASELINE_PROFILE_ID } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const PID = BASELINE_PROFILE_ID;
const isBodyPara = (p: ParaSpec): boolean => !p.styleId && !p.raw && !p.empty && typeof p.text === 'string' && p.text.length > 120;

function mutate(fn: (paras: ParaSpec[], spec: DocSpec) => void): DocSpec {
  const spec = cloneSpec(baselineSpec());
  fn(spec.paragraphs, spec);
  return spec;
}

export const VALID_CONTROL_CASES: ErrorCase[] = [
  {
    id: 'valid.format.font.docdefaults',
    title: 'Font naslijeđen iz docDefaults (bez run fonta)',
    category: 'formatting',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // Nijedan run nema eksplicitni font -> dominantni font dolazi iz styles docDefaults (TNR).
    build: () => mutate((ps) => ps.forEach((p) => { delete p.font; })),
    expect: { checkId: 'format.font.dominant', title: 'Dominantni font', kind: 'status', outcome: 'pass' },
    notes: 'Inheritance: TNR iz docDefaults ne smije lazno pasti kao pogresan font.',
  },
  {
    id: 'valid.format.size.docdefaults',
    title: 'Veličina naslijeđena iz docDefaults (bez run sz)',
    category: 'formatting',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => ps.forEach((p) => { delete p.sizePt; })),
    expect: { checkId: 'format.size.body', title: 'Veličina osnovnog teksta', kind: 'status', outcome: 'pass' },
    notes: 'Inheritance: 12 pt iz docDefaults (sz 24) ne smije lazno pasti.',
  },
  {
    id: 'valid.citation.nbsp',
    title: 'Citatnica s neprekidnim razmakom (Kovač\\u00A02020)',
    category: 'citations',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // Neprekidni razmak izmedju prezimena i godine ne smije prekinuti vezu citat -> literatura.
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => /Kovač/.test(p.text) && p.jc === 'both');
      if (i >= 0) ps[i] = line('Kako navodi jedan autor (Kovač, 2020), medijska pismenost mladih kontinuirano raste.', { jc: 'both' });
    }),
    expect: { checkId: 'citation.author-year.missing-reference', title: 'Citirano → literatura', kind: 'status', outcome: 'pass' },
    notes: 'Kovač je u literaturi; nbsp ne smije stvoriti lazni "citat bez zapisa".',
  },
  {
    id: 'valid.citation.legit-year-range',
    title: 'Legitimna godina u zagradi koja nije citat',
    category: 'citations',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    // "(2018.–2020.)" bez autora nije citatnica i ne smije postati "citirano bez zapisa".
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text));
      ps.splice(i + 1, 0, line('Istraživanje je provedeno u razdoblju (2018.–2020.) na više uzoraka i u više navrata.', { jc: 'both' }));
    }),
    expect: { checkId: 'citation.author-year.missing-reference', title: 'Citirano → literatura', kind: 'status', outcome: 'pass' },
    notes: 'Gola godina u zagradi bez autora nije citat.',
  },
  {
    id: 'valid.element.link-clean',
    title: 'Ispravno oblikovana poveznica u tekstu',
    category: 'elements',
    oracle: 'valid-control',
    profileId: PID,
    detectableNow: true,
    build: () => mutate((ps) => {
      const i = ps.findIndex((p) => p.styleId && /2\. Razrada/.test(p.text));
      ps.splice(i + 1, 0, line('Više informacija dostupno je na https://www.primjer.hr/stranica koja se redovito ažurira.', { jc: 'both' }));
    }),
    expect: { checkId: 'element.link-form', title: 'Oblik poveznica', kind: 'status', outcome: 'pass' },
    notes: 'Uredna https poveznica ne smije se prijaviti kao neispravan oblik.',
  },
];
