/**
 * SNIMKA REVIZIJE IZ REZULTATA ANALIZE (plan T12), bez sadrzaja rada.
 *
 * `compareFindingRevisions` (T11) usporedjuje dvije snimke istog rada i istog ugovora pravila. Ovaj modul gradi takvu
 * snimku iz rezultata analize i odlucuje smiju li se dvije verzije POVEZATI kao isti rad:
 *  - snimka nosi samo `ruleId`, opseg i ishod po provjeri, plus identitet profila, otisak pravila i verziju ugovora
 *    analize; nijedan odlomak, naslov ni ime datoteke ne ulazi u nju;
 *  - identitet rada se procjenjuje POSTOJECIM otiskom (`src/fingerprint/fingerprint.ts`: naslov, autor, naslovi
 *    sekcija). Naslov datoteke NIJE dokaz identiteta. Jak pogodak povezuje sam, slab trazi potvrdu korisnika, a
 *    razlicit rad se ne povezuje automatski.
 *
 * Provjere su danas GLOBALNE (jedna po dokumentu), pa je `scopeKey` uvijek `null`, dakle kljuc `ruleId@document`.
 * Lokalna sidra (odlomci) ulaze tek kad analiza pocne emitirati nalaze po odlomku sa stabilnim otiskom; do tada ih
 * ovdje nema, umjesto da se sparuju po indeksu odlomka, sto plan izricito zabranjuje.
 */
import { computeFingerprint, fingerprintMatch, sequenceSimilarity, type DocumentFingerprint } from '../fingerprint/fingerprint';
import { stableCheckId } from '../scoring/check-id-registry';
import type { RevisionFinding, RevisionSnapshot } from './finding-revisions';

export { sanitizeStoredRevision, type StoredRevision } from '../session/revision-storage';
import type { StoredRevision } from '../session/revision-storage';

interface ResultLike {
  version?: unknown;
  generatedAt?: unknown;
  checks?: unknown;
  documentStructure?: { title?: unknown; author?: unknown; headings?: unknown } | null;
  details?: { profileDefinitionId?: unknown; profileFingerprint?: unknown } | null;
}

interface CheckLike { id?: unknown; title?: unknown; status?: unknown; earned?: unknown; max?: unknown }

function outcomeOf(check: CheckLike): RevisionFinding['outcome'] {
  if (check.status === 'unmeasurable') return 'unmeasurable';
  const max = typeof check.max === 'number' ? check.max : 0;
  const earned = typeof check.earned === 'number' ? check.earned : 0;
  if (max <= 0) return check.status === 'fail' ? 'fail' : 'pass';
  return earned < max ? 'fail' : 'pass';
}

function checkId(check: CheckLike): string | null {
  if (typeof check.id === 'string' && check.id) return check.id;
  return typeof check.title === 'string' ? stableCheckId(check.title) : null;
}

export function documentFingerprintFromResult(result: ResultLike): DocumentFingerprint {
  const ds = result.documentStructure ?? {};
  const headings = Array.isArray(ds.headings)
    ? (ds.headings as Array<{ level?: unknown; text?: unknown }>).map((h) => ({ level: Number(h.level) || 0, text: String(h.text ?? '') }))
    : [];
  const fp = computeFingerprint({ title: typeof ds.title === 'string' ? ds.title : null, author: typeof ds.author === 'string' ? ds.author : null, headings });
  // `computeFingerprint` bez naslova uzima PRVI naslov 1. razine kao naslov. Za slotove je to prihvatljivo, za
  // identitet verzija nije: gotovo svaki rad pocinje s "Uvod", pa bi dva razlicita rada bila "isti" po naslovu.
  // Bez pravog naslova identitet stoji samo na autoru i skupu poglavlja (slab pogodak trazi potvrdu).
  if (typeof ds.title !== 'string' || !ds.title.trim()) fp.titleNorm = '';
  return fp;
}

export function checkTitlesFromResult(result: ResultLike): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of (Array.isArray(result.checks) ? result.checks : []) as CheckLike[]) {
    const id = checkId(c);
    if (id && typeof c.title === 'string' && !(id in out)) out[id] = c.title;
  }
  return out;
}

/** Snimka za `compareFindingRevisions`; `documentGroupId` daje pozivatelj (isti za povezane verzije). */
export function revisionSnapshotFromResult(result: ResultLike, documentGroupId: string): RevisionSnapshot {
  const findings: RevisionFinding[] = [];
  for (const c of (Array.isArray(result.checks) ? result.checks : []) as CheckLike[]) {
    const id = checkId(c);
    if (!id) continue;
    findings.push({ ruleId: id, scopeKey: null, outcome: outcomeOf(c) });
  }
  return {
    id: typeof result.generatedAt === 'string' ? result.generatedAt : String(Date.now()),
    documentGroupId,
    profileId: typeof result.details?.profileDefinitionId === 'string' ? result.details.profileDefinitionId : '',
    rulesFingerprint: typeof result.details?.profileFingerprint === 'string' ? result.details.profileFingerprint : '',
    analysisContractVersion: typeof result.version === 'string' ? result.version : '',
    findings,
  };
}

export function storedRevisionFromResult(result: ResultLike, documentGroupId: string, now = Date.now()): StoredRevision {
  return {
    schemaVersion: 1,
    createdAt: now,
    fingerprint: documentFingerprintFromResult(result),
    snapshot: revisionSnapshotFromResult(result, documentGroupId),
    checkTitles: checkTitlesFromResult(result),
  };
}

/**
 * Smiju li se dvije verzije povezati kao isti rad.
 *  - `same`      jak pogodak (isti naslov, ili slicni naslovi sekcija uz istog autora): povezuje se bez pitanja;
 *  - `weak`      dio dokaza postoji (autor ili dio sekcija): trazi se POTVRDA korisnika;
 *  - `different` nista ne upucuje na isti rad: ne povezuje se automatski.
 */
export type LinkVerdict = 'same' | 'weak' | 'different';

export function linkVerdict(previous: DocumentFingerprint, next: DocumentFingerprint): LinkVerdict {
  if (fingerprintMatch(previous, next)) return 'same';
  const sim = sequenceSimilarity(previous.headings, next.headings);
  // Bez naslova i autora (LibreOffice i Google Docs izvoz cesto nemaju docProps), GOTOVO IDENTICAN skup od barem tri
  // poglavlja je dovoljan dokaz istog rada: verzija nakon popravka oblikovanja ima ista poglavlja. Prag je namjerno
  // visok (0,9), jer "Uvod, Rasprava, Zakljucak" dijele svi radovi, pa tri genericka naslova nisu dovoljna.
  if (sim >= 0.9 && Math.min(previous.headings.length, next.headings.length) >= 3) return 'same';
  const sameAuthor = previous.authorNorm.length > 0 && previous.authorNorm === next.authorNorm;
  if (sim >= 0.3 || sameAuthor) return 'weak';
  return 'different';
}

/** Novi identitet skupine verzija; UUID kad postoji, inace vremenska oznaka s nasumicnim repom. */
export function newDocumentGroupId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
