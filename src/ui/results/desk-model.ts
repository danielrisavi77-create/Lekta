/**
 * KOREKTORSKI STOL: spoj nalaza i mjesta u dokumentu.
 *
 * Brif vlasnika (2026-09-08): "Klik na nalaz pomakne dokument. Klik na oznaceno mjesto aktivira
 * nalaz. To daje 'aha' trenutak koji screenshot score dashboarda nikada nece dati."
 *
 * Oba smjera trebaju ISTU vezu: nalaz <-> zastavica koju renderer iscrtava u dokumentu.
 * `renderFacsimile` vraca `flagTargets: Map<indeksZastavice, element>`, a nalaz nosi
 * `scope: { kind: 'anchor', paragraphIndex, footnoteId? }`. Ovaj modul spaja to dvoje i radi
 * ISKLJUCIVO nad podacima, bez DOM-a, pa se moze mjeriti bez preglednika.
 *
 * ZASTO SPOJ NIJE TRIVIJALAN: zastavica i nalaz dolaze razlicitim putevima. Zastavice gradi
 * `collectAllPreviewFlags` iz cijelog rezultata (ukljucujuci registre koji nemaju svoj nalaz, npr.
 * duge recenice), a nalaze `buildFindingViewModels` iz `issues`. Presjek je manji od oba skupa i
 * to je normalno; vazno je da se ne izmislja.
 *
 * IZMJERENO PRIJE GRADNJE (19 golden fixtura, 233 nalaza): samo 6% nalaza ima sidro. Zato stol ne
 * smije biti gradjen kao da svaki nalaz ima mjesto: 45% vrijedi za cijeli rad, 16% za podrucje,
 * 33% se ne zna. `veza` je zato `null` za vecinu, i to je ISHOD, ne kvar.
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

export interface DeskItem {
  readonly finding: DeskFinding;
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
export function deskItems(
  findings: readonly DeskFinding[],
  flags: readonly DeskFlag[],
): DeskItem[] {
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
export function findingForFlag(items: readonly DeskItem[], flagIndex: number): DeskFinding | null {
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
