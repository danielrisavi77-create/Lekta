/**
 * Tipovi predlozaka izjave o izvornosti (data/declarations/declarations.json).
 * Generator-content sloj (kao title-pages/template-schema.ts), NE bodovana pravila: audit
 * polje `declaration.terms` (required-sections-structure.ts) provjerava JE LI sekcija
 * "Izjava o izvornosti" prisutna u PREDANOM radu (strukturni audit) - potpuno druga os od
 * ovoga (kakav OBRAZAC generator nudi), namjerno se ne miješaju.
 */
import type { WorkType } from '../profiles/profile-schema';

/** Sto korisnik vidi (badge). 'generic' = nema zapisa za taj (unitId, level) par. */
export type DeclarationProvenanceStatus = 'official' | 'guidance' | 'generic';

export interface DeclarationProvenance {
  /** 'official' = imamo stvarnu propisanu formulaciju (wording). 'guidance' = znamo da
   *  fakultet propisuje vlastitu formulaciju/obrazac, ali NEMAMO njen tocan tekst - samo
   *  napomenu/izvor da korisnik provjeri prije predaje. */
  status: 'official' | 'guidance';
  /** Id-jevi iz data/sources/source-registry.json. */
  sourceIds?: string[];
  sourceUrl?: string;
  sourceNote?: string;
  /** Doslovan citat IZ IZVORA o obliku izjave, kad postoji. */
  quote?: string | null;
  /** Stranica izvora; nepotvrdjena ostaje null (isto pravilo kao ruleEntries.sourcePage). */
  sourcePage?: number | null;
  verifiedAt?: string | null;
}

export interface DeclarationTemplate {
  /** "<unitId>" ili "<unitId>-<level>". */
  id: string;
  unitId: string;
  /** null = vrijedi za sve vrste rada te jedinice. */
  level: WorkType | null;
  provenance: DeclarationProvenance;
  status: 'draft' | 'verified';
  /** Doslovna sluzbena formulacija; SMIJE postojati SAMO uz provenance.status==='official'.
   *  Validator (tests/declaration-loader.test.ts) to tvrdo iznudjuje - 'guidance' nikad ne
   *  smije nositi izmisljen tekst bez pravog izvora. */
  wording?: string | null;
  requiresJmbag?: boolean;
  requiresOib?: boolean;
  /** Sto generator jos ne podrzava (npr. "trazi pecat/skenirani potpis"). */
  notes?: string;
}
