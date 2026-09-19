/**
 * KOREKTORSKI STOL: spoj nalaza i mjesta u dokumentu. Bez DOM-a, pa se mjeri bez preglednika.
 *
 * SPOJ NIJE TRIVIJALAN: zastavice gradi `collectAllPreviewFlags` iz cijelog rezultata (ukljucujuci
 * registre bez vlastitog nalaza), a nalaze `buildFindingViewModels` iz `issues`. Presjek je manji
 * od oba skupa; vazno je da se veza ne izmislja.
 *
 * IZMJERENO PRIJE GRADNJE (19 golden fixtura, 233 nalaza): sidro 6%, podrucje 16%, cijeli dokument
 * 45%, nepoznato 33%. Dakle `flagIndex` je `null` za VECINU, i to je ishod, ne kvar.
 */
import type { FindingScope } from '../finding-view-model';

/** Minimalni oblik nalaza koji stol treba; sire modele prima strukturno. */
export interface DeskFinding {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly scope: FindingScope;
}

/** Minimalni oblik zastavice; poravnat s `PreviewFlag` iz `src/preview/preview-anchors.ts`. */
export interface DeskFlag {
  readonly paragraphIndex: number;
  readonly footnoteId?: number;
}

export interface DeskItem<F extends DeskFinding = DeskFinding> {
  /**
   * Nalaz U ONOM TIPU U KOJEM JE USAO. Bez parametra tipa bi spoj "zaboravio" sva polja mimo
   * cetiri koja stol treba, pa bi ga svaki prikaz morao vracati kastom. Kast bi ovdje bio
   * tvrdnja bez pokrica: kartica nalaza cita i `explanation`, `capabilities` i
   * `status`, kojih u `DeskFinding` nema.
   */
  readonly finding: F;
  /**
   * Indeks u polju zastavica koje renderer iscrtava, ili `null` kad nalaz nema mjesto u
   * dokumentu. `null` je najcesci slucaj i prikaz ga mora podnijeti bez izmisljanja okvira.
   */
  readonly flagIndex: number | null;
}

/** Kljuc mjesta. Fusnota je zaseban koordinatni prostor, pa nikad ne smije pasti na odlomak. */
function kljuc(paragraphIndex: number, footnoteId?: number): string {
  return footnoteId != null ? `f${footnoteId}` : `p${paragraphIndex}`;
}

/**
 * Spoji nalaze sa zastavicama. Kad vise zastavica gadja isto mjesto, uzima se PRVA: renderer ih
 * iscrtava redom, pa je prva ona koju korisnik vidi na vrhu tog odlomka.
 */
export function deskItems<F extends DeskFinding>(
  findings: readonly F[],
  flags: readonly DeskFlag[],
): DeskItem<F>[] {
  const poMjestu = new Map<string, number>();
  flags.forEach((f, i) => {
    const k = kljuc(f.paragraphIndex, f.footnoteId);
    if (!poMjestu.has(k)) poMjestu.set(k, i);
  });
  return findings.map((finding) => {
    if (finding.scope.kind !== 'anchor') return { finding, flagIndex: null };
    const k = kljuc(finding.scope.paragraphIndex, finding.scope.footnoteId);
    const i = poMjestu.get(k);
    return { finding, flagIndex: i === undefined ? null : i };
  });
}

/** Obrnut smjer: koji je nalaz na toj zastavici. `null` kad zastavica nema svoj nalaz. */
export function findingForFlag<F extends DeskFinding>(
  items: readonly DeskItem<F>[],
  flagIndex: number,
): F | null {
  const hit = items.find((it) => it.flagIndex === flagIndex);
  return hit ? hit.finding : null;
}

/**
 * Kako `region` i `document` opseg izgledaju korisniku kad se ne moze oznaciti mjesto.
 * Traka umjesto okvira: dokument ostaje neoznacen, a iznad njega stoji recenica koja kaze zasto.
 * Vlasnik je 2026-09-08 potvrdio taj izbor ("ne izmisljati okvir na prvoj stranici").
 */
export function trakaZaOpseg(scope: FindingScope): string | null {
  if (scope.kind === 'anchor') return null;
  if (scope.kind === 'document') return 'Vrijedi za cijeli rad, ne za jedno mjesto.';
  if (scope.kind === 'region') return `Vrijedi za ${scope.label}; točan odlomak nije poznat.`;
  return scope.reason;
}
