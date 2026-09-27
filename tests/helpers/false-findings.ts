/**
 * T26: matrica nalaza na poznato ispravnim dokumentima.
 *
 * Dokument koji je generator izradio kao uskladjen s profilom smije imati bodovani nalaz samo ako
 * je odstupanje STVARNO u DOCX paketu (generator ga nije uspio izraziti). Svaki takav nalaz je
 * ovdje naveden s razlogom i dokazom iz paketa. Nalaz koji nije na popisu je lazni nalaz analize;
 * nalaz s popisa koji vise ne nastaje je zastarjeli unos (ratchet se mora stegnuti).
 */

export type FindingKey = `${string}|${string}`;

export interface AllowedFinding {
  doc: string;
  checkId: string;
  /** Sto je stvarno u DOCX-u i zasto analiza tu ima pravo. */
  reason: string;
}

/** Fixturi bez profileId-a nemaju pravila prema kojima bi bili "uskladjeni"; ne ulaze u matricu. */
export const WITHOUT_PROFILE = [
  'adu--seminar--diplomski--uskladjen',
  'ffzg--graduate--diplomski--uskladjen',
  'ffzg--graduate--diplomski--word',
] as const;

const LO_BOTTOM =
  'LibreOffice izvoz upisuje w:bottom="1976" (3,49 cm) uz w:footer="1417"; generator je trazio 2,5 cm, ali paket stvarno nosi 3,49 cm i Word je prikazuje';

export const ALLOWED_FINDINGS: readonly AllowedFinding[] = [
  { doc: 'apuri--final--prijediplomski--uskladjen', checkId: 'page.margins', reason: LO_BOTTOM },
  { doc: 'arh--doctoral--poslijediplomski--uskladjen', checkId: 'page.margins', reason: `${LO_BOTTOM} (sve 4 sekcije)` },
  { doc: 'effectus--seminar--diplomski--uskladjen', checkId: 'page.margins', reason: LO_BOTTOM },
  { doc: 'fzsri--final--prijediplomski--uskladjen', checkId: 'page.margins', reason: 'LibreOffice izvoz upisuje w:bottom="1993" (3,51 cm) uz w:footer="1417"; paket stvarno nosi 3,51 cm' },
  { doc: 'effectus--seminar--diplomski--word', checkId: 'format.spacing.body', reason: 'Word varijanta: stil Normal ima w:line="360" (1,5), izravni prored 276 ostao je na jednom odlomku; profil trazi 1,15' },
  { doc: 'effectus--seminar--diplomski--word', checkId: 'structure.sections.profile', reason: 'Word varijanta nema odlomak "Sadržaj" (uskladjena LibreOffice varijanta ga ima)' },
  { doc: 'fsb--article--diplomski--uskladjen', checkId: 'page.numbers.present', reason: 'word/footer1.xml je prazan odlomak bez PAGE polja' },
];

/** Nalazi koje nitko nije dopustio i dopusteni nalazi koji vise ne nastaju. Prazan popis je jedini zeleni ishod. */
export function falseFindingProblems(observed: ReadonlySet<FindingKey>, allowed: readonly AllowedFinding[] = ALLOWED_FINDINGS): string[] {
  const allowedKeys = new Set<FindingKey>(allowed.map((a) => `${a.doc}|${a.checkId}` as FindingKey));
  const problems: string[] = [];
  for (const key of [...observed].sort()) if (!allowedKeys.has(key)) problems.push(`lazni nalaz: ${key}`);
  for (const key of [...allowedKeys].sort()) if (!observed.has(key)) problems.push(`zastarjeli unos: ${key}`);
  return problems;
}
