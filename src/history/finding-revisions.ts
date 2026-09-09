/**
 * Usporedba nalaza dviju revizija ISTOG rada (plan T11).
 *
 * Cista funkcija, bez ovisnosti o DOM-u, pohrani ili analizatoru; ulaz su dvije snimke nalaza, izlaz je
 * podjela na rijeseno, ostalo, novo i neizvjesno. Namjerno stroga:
 *
 *  - Razlicit profil, otisak pravila ili verzija ugovora analize daje `comparable: false` i PRAZNE popise.
 *    Delta ocjene pod promijenjenim pravilima nije ucinak uredjivanja, i sucelje to mora reci umjesto da
 *    prikaze "napredak".
 *  - Nestanak nalaza je rjesenje SAMO kad nova snimka za isti kljuc nosi izricit `pass`. `unmeasurable`
 *    (provjera nije mogla izmjeriti) ili odsutnost kljuca nije rjesenje: ide u `uncertain`.
 *  - Lokalni nalazi (po odlomku, po sekciji) se sparuju po `scopeKey`, koji mora biti STABILNO sidro
 *    (otisak teksta odlomka, id sekcije), NIKAD indeks odlomka: umetnut odlomak pomice sve iza sebe pa bi
 *    sparivanje po polozaju prijavilo lazno rjesenje i lazno nov problem. Kad se isti `ruleId` pojavi vise
 *    puta bez `scopeKey`, ili se `scopeKey` ponavlja u istoj snimci (isti naslov dvaput), parovi su
 *    nejednoznacni i idu u `uncertain`, ne sparuju se naslijepo.
 *
 * Kljuc nalaza je `ruleId@scopeKey`, za globalna pravila `ruleId@document`.
 */

export type RevisionOutcome = 'pass' | 'fail' | 'unmeasurable';

export interface RevisionFinding {
  ruleId: string;
  /** Stabilno sidro opsega (otisak teksta odlomka, id sekcije) ili `null` za globalno pravilo. */
  scopeKey: string | null;
  outcome: RevisionOutcome;
}

export interface RevisionSnapshot {
  id: string;
  documentGroupId: string;
  profileId: string;
  rulesFingerprint: string;
  analysisContractVersion: string;
  findings: RevisionFinding[];
}

export interface RevisionDelta {
  comparable: boolean;
  /** Zasto nije usporedivo; prazno kad je `comparable`. */
  reason: string | null;
  resolved: string[];
  persisting: string[];
  introduced: string[];
  uncertain: string[];
}

export const DOCUMENT_SCOPE = 'document';

export function findingKey(finding: RevisionFinding): string {
  return `${finding.ruleId}@${finding.scopeKey ?? DOCUMENT_SCOPE}`;
}

function notComparable(reason: string): RevisionDelta {
  return { comparable: false, reason, resolved: [], persisting: [], introduced: [], uncertain: [] };
}

/**
 * Indeks snimke po kljucu. Kljuc koji se u ISTOJ snimci pojavi vise puta je nejednoznacan (dva odlomka s
 * istim otiskom, isti naslov dvaput): biljezi se u `ambiguous` i ne ulazi u sparivanje.
 */
function index(snapshot: RevisionSnapshot): { byKey: Map<string, RevisionFinding>; ambiguous: Set<string> } {
  const byKey = new Map<string, RevisionFinding>();
  const seen = new Map<string, number>();
  for (const finding of snapshot.findings) {
    const key = findingKey(finding);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    byKey.set(key, finding);
  }
  const ambiguous = new Set([...seen].filter(([, n]) => n > 1).map(([key]) => key));
  for (const key of ambiguous) byKey.delete(key);
  return { byKey, ambiguous };
}

export function compareFindingRevisions(before: RevisionSnapshot, after: RevisionSnapshot): RevisionDelta {
  if (before.documentGroupId !== after.documentGroupId) return notComparable('snimke nisu isti rad (documentGroupId)');
  if (before.profileId !== after.profileId) return notComparable('profil je promijenjen izmedju revizija');
  if (before.rulesFingerprint !== after.rulesFingerprint) return notComparable('pravila su promijenjena izmedju revizija');
  if (before.analysisContractVersion !== after.analysisContractVersion) return notComparable('ugovor analize je promijenjen izmedju revizija');

  const a = index(before);
  const b = index(after);
  const resolved: string[] = [];
  const persisting: string[] = [];
  const introduced: string[] = [];
  const uncertain = new Set<string>([...a.ambiguous, ...b.ambiguous]);

  for (const [key, was] of a.byKey) {
    if (uncertain.has(key)) continue;
    const now = b.byKey.get(key);
    if (was.outcome !== 'fail') {
      // Prije nije bio problem: nov `fail` je uveden, sve ostalo nije nalaz.
      if (now?.outcome === 'fail') introduced.push(key);
      continue;
    }
    if (!now || now.outcome === 'unmeasurable') {
      uncertain.add(key); // nestao ili neizmjeren: nije dokaz rjesenja
    } else if (now.outcome === 'pass') {
      resolved.push(key);
    } else {
      persisting.push(key);
    }
  }
  for (const [key, now] of b.byKey) {
    if (uncertain.has(key) || a.byKey.has(key)) continue;
    if (now.outcome === 'fail') introduced.push(key);
  }
  return {
    comparable: true,
    reason: null,
    resolved: resolved.sort(),
    persisting: persisting.sort(),
    introduced: introduced.sort(),
    uncertain: [...uncertain].sort(),
  };
}
