/**
 * BOUNDARY korpus (faza 5): za svaki brojcani prag gradimo below / exact / within-tolerance /
 * above varijante i dokazujemo da se prag ponasa kako profil i tolerancije engine-a propisuju.
 * Vrijednosti su izvedene iz STVARNIH profilnih pragova (probe-thresholds), ne nagadjane.
 *
 * Pragovi (fpzg-politologija-zavrsni, osim margina): velicina 12 pt (tol 0.1), prored 1,5
 * (tol 0.12), rijeci 5000-6000. Margine se boduju samo na doktorskom profilu (2,5 cm, tol 0,36).
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { baselineSpec, cloneSpec } from '../builder/baseline';
import type { ErrorCase } from '../error-case';

const ZAVRSNI = 'fpzg-politologija-zavrsni';
const DOKTORSKI = 'fpzg-doktorski-politologija';
const isBodyPara = (p: ParaSpec): boolean => !p.styleId && !p.raw && !p.empty && typeof p.text === 'string' && p.text.length > 120;

function varyBody(fn: (p: ParaSpec) => void): DocSpec {
  const spec = cloneSpec(baselineSpec());
  for (const p of spec.paragraphs) if (isBodyPara(p)) fn(p);
  return spec;
}
function withMargins(cm: number): DocSpec {
  const spec = cloneSpec(baselineSpec());
  spec.marginsCm = { top: cm, right: cm, bottom: cm, left: cm };
  return spec;
}
function withWordScale(keepFraction: number, duplicate = 0): DocSpec {
  const spec = cloneSpec(baselineSpec());
  const body = spec.paragraphs.filter(isBodyPara);
  const keep = Math.max(1, Math.round(body.length * keepFraction));
  let seen = 0;
  const out: ParaSpec[] = [];
  for (const p of spec.paragraphs) {
    if (isBodyPara(p)) { seen++; if (seen > keep) continue; out.push(p); for (let d = 0; d < duplicate; d++) out.push({ ...p }); }
    else out.push(p);
  }
  spec.paragraphs = out;
  return spec;
}

type B = ErrorCase & { relation: 'below' | 'exact' | 'within-tol' | 'above' };

const bcase = (
  id: string, relation: B['relation'], profileId: string, checkId: string, title: string,
  outcome: 'pass' | 'not-pass', build: () => DocSpec, kind: 'status' | 'earned' = 'status',
): B => ({
  id, title: `${title} [${relation}]`, category: 'boundary', oracle: 'boundary', profileId, detectableNow: true,
  relation, build, expect: { checkId, title, kind, outcome },
});

export const BOUNDARY_CASES: B[] = [
  // --- velicina osnovnog teksta (12 pt, tol 0.1) ---
  bcase('boundary.size.below', 'below', ZAVRSNI, 'format.size.body', 'Veličina osnovnog teksta', 'not-pass', () => varyBody((p) => { p.sizePt = 11; })),
  bcase('boundary.size.exact', 'exact', ZAVRSNI, 'format.size.body', 'Veličina osnovnog teksta', 'pass', () => varyBody((p) => { p.sizePt = 12; })),
  bcase('boundary.size.above', 'above', ZAVRSNI, 'format.size.body', 'Veličina osnovnog teksta', 'not-pass', () => varyBody((p) => { p.sizePt = 13; })),

  // --- prored (1,5, tol 0.12); spacingLine je u 240-tinama (240=1.0, 336=1.4, 360=1.5, 480=2.0) ---
  bcase('boundary.spacing.below', 'below', ZAVRSNI, 'format.spacing.body', 'Prored osnovnog teksta', 'not-pass', () => varyBody((p) => { delete p.spacing15; p.spacingLine = 240; })),
  bcase('boundary.spacing.within-tol', 'within-tol', ZAVRSNI, 'format.spacing.body', 'Prored osnovnog teksta', 'pass', () => varyBody((p) => { delete p.spacing15; p.spacingLine = 336; })),
  bcase('boundary.spacing.exact', 'exact', ZAVRSNI, 'format.spacing.body', 'Prored osnovnog teksta', 'pass', () => varyBody((p) => { delete p.spacing15; p.spacingLine = 360; })),
  bcase('boundary.spacing.above', 'above', ZAVRSNI, 'format.spacing.body', 'Prored osnovnog teksta', 'not-pass', () => varyBody((p) => { delete p.spacing15; p.spacingLine = 480; })),

  // --- margine (doktorski profil boduje; 2,5 cm, tol 0,36 cm/strani) ---
  bcase('boundary.margins.below', 'below', DOKTORSKI, 'page.margins', 'Margine dokumenta', 'not-pass', () => withMargins(2.0)),
  bcase('boundary.margins.exact', 'exact', DOKTORSKI, 'page.margins', 'Margine dokumenta', 'pass', () => withMargins(2.5)),
  bcase('boundary.margins.within-tol', 'within-tol', DOKTORSKI, 'page.margins', 'Margine dokumenta', 'pass', () => withMargins(2.8)),
  bcase('boundary.margins.above', 'above', DOKTORSKI, 'page.margins', 'Margine dokumenta', 'not-pass', () => withMargins(4.0)),

  // --- opseg rijeci (min 5000, max 6000) ---
  bcase('boundary.words.below', 'below', ZAVRSNI, 'scope.words', 'Profilni opseg riječi', 'not-pass', () => withWordScale(0.03)),
  bcase('boundary.words.in-range', 'exact', ZAVRSNI, 'scope.words', 'Profilni opseg riječi', 'pass', () => baselineSpec()),
  bcase('boundary.words.above', 'above', ZAVRSNI, 'scope.words', 'Profilni opseg riječi', 'not-pass', () => withWordScale(1, 1)),
];
