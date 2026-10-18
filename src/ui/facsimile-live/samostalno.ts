/**
 * FAKSIMIL Z35 BEZ STOLA Z34. Ruta faksimila vodi u Z35 i kad presuda nije Z34: stol Z8 (presuda
 * bez automatskih blokatora, ili povratak kad Z34 nije stigao) i kartica "Faksimil" u pregledu.
 * Lijeni modul kao i sam faksimil; ljuska rezultata ga uvozi tek na klik.
 *
 * Podaci su ISTI ulaz kao Z34 (nalazi stola, stavke plana, pregled, zapisani broj stranica) i
 * izvode se istim funkcijama iz `result-live-model.ts`, pa faksimil ne vidi nista sto presuda ne
 * nosi. Plan i "Napravit ću sam" ovdje zive samo dok je faksimil otvoren: Z8 nema stanje plana
 * koje bi Z35 dijelio, a odabir koji pise u planu je odabir koji ide u popravak (`repair-safe`).
 */
import type { ResultsCockpitAction } from '../results/results-cockpit';
import type { DeskItem } from '../results/desk-model';
import type { VisualFindingModel } from '../results/visual-result-model';
import {
  izgledSada, pocetniOdabir, trakaStranica, ulogaNalaza, zahvatiPlana,
  type LivePreview, type LiveStavka,
} from '../result-live/result-live-model';
import { otvoriFaksimil, type FaksimilHandle } from './facsimile-live';

interface SamostalnoOpcije {
  readonly items: readonly DeskItem<VisualFindingModel>[];
  readonly planItems: readonly LiveStavka[];
  readonly repairAvailable: boolean;
  readonly authoritative: boolean;
  readonly score: number | null;
  readonly ceiling: number | null;
  readonly preview: unknown;
  readonly storedPages: unknown;
  readonly naslov: string | null;
  /** Nalaz koji je bio otvoren na stolu Z8. */
  readonly pocetni: number;
  readonly esc: (v: string) => string;
  readonly onAction?: (action: ResultsCockpitAction, opener?: HTMLElement) => void;
  /** Zatvaranje vraca odabrani nalaz, da ga stol Z8 pokaze. */
  readonly naZatvori: (odabrani: number) => void;
}

export function otvoriSamostalno(doc: Document, o: SamostalnoOpcije): FaksimilHandle {
  const preview = (typeof o.preview === 'object' && o.preview !== null ? o.preview : null) as LivePreview | null;
  const nalazi = o.items.map((it) => it.finding);
  const zahvati = zahvatiPlana(o.planItems, o.repairAvailable);
  let odabir: ReadonlySet<string> = pocetniOdabir(zahvati);
  return otvoriFaksimil(doc, {
    nalazi,
    uloge: nalazi.map((f) => ulogaNalaza(f, zahvati)),
    preview,
    traka: trakaStranica(preview, o.storedPages, o.items),
    sada: izgledSada(preview),
    stavke: o.planItems,
    zahvati,
    repairAvailable: o.repairAvailable,
    autoritativno: o.authoritative,
    score: o.score,
    ceiling: o.ceiling,
    naslov: o.naslov,
    pocetni: o.pocetni,
    rucno: new Set<string>(),
    esc: o.esc,
    odabir: () => odabir,
    postaviOdabir: (novi) => { odabir = novi; },
    naPlan: () => o.onAction?.({ kind: 'repair-safe', ruleIds: [...odabir] }),
    naZatvori: o.naZatvori,
  });
}
