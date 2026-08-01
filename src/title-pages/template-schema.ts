/**
 * Tipovi predlozaka naslovnice po fakultetu (data/title-pages/templates.json).
 * Ovo je generator-content sloj (kao citation-configs), NE bodovana pravila:
 * audit polja profila (titlePageRequirements/Sequence/Typography) ostaju odvojena.
 * Semantika sloja i hijerarhija autoriteta: data/title-pages/README.md.
 */
import type { TitleRole } from '../tools/title-page';
import type { WorkType } from '../profiles/profile-schema';

/** Porijeklo pojedinog elementa predloska. */
export type ElementProvenance = 'official-template' | 'official-rules' | 'thesis-consensus';

/** Porijeklo predloska kako ga vidi korisnik (badge); 'generic' = nema predloska. */
export type TemplateProvenanceStatus = 'official' | 'derived' | 'generic';

export interface TemplateProvenance {
  /** official = bar jedan sluzbeni izvor; derived = samo konsenzus javnih radova. */
  status: 'official' | 'derived';
  /** Id-jevi iz data/sources/source-registry.json (za official). */
  sourceIds?: string[];
  sourceUrl?: string;
  sourceNote?: string;
  /** Doslovni citat pravila o naslovnici (hrvatski), kad postoji. */
  quote?: string | null;
  /** Stranica izvora; nepotvrdena ostaje null (kao ruleEntries.sourcePage). */
  sourcePage?: number | null;
  /** PID-ovi javnih radova koji koroboriraju predlozak (npr. "fpzg:2890"). */
  evidencePids?: string[];
  verifiedAt?: string | null;
}

export interface TemplateElement {
  /** Postojeci TitleRole vokabular; nove uloge se ne uvode dok generator nema polje. */
  role: TitleRole;
  /** true SAMO uz elementProvenance official-*; konsenzus teza ne propisuje obveznost. */
  required: boolean;
  elementProvenance?: ElementProvenance;
  /** Vertikalna zona; raste monotono, mapira se na razmak skupina u docx-writeru. */
  group: number;
  /** Prefiks retka, npr. "Mentor:". */
  label?: string;
  /** Tekst propisan predloskom, npr. "SVEUCILISTE U ZAGREBU" (auto-popuna). */
  fixedText?: string;
  /** true SAMO uz fixedText: retak se NIKAD ne prepisuje korisnikovim unosom, cak ni kao
   *  prvi/jedini element svoje uloge (npr. nepromjenjiva institucijska fraza ispred stvarnog
   *  naziva studija u drugom elementu iste uloge). Bez ovoga prvi element uloge prima
   *  korisnikov unos (vidi buildTitlePage). */
  locked?: boolean;
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  /** Prezentacijski (w:caps u docx, text-transform u pregledu); tekst se NE transformira. */
  uppercase?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Udio uzoraka koji se slazu (samo thesis-consensus), 0..1. */
  confidence?: number;
}

export interface TitlePageTemplate {
  /** "fpzg" ili "fpzg-doctoral" (unitId[-razina]). */
  id: string;
  /** Ustrojbena jedinica iz kataloga (globalno jedinstven id). */
  unitId: string;
  /** null = vrijedi za sve razine jedinice; inace WorkType kljuc. */
  level: WorkType | null;
  /** Citljivo ime, npr. "FPZG diplomski rad". */
  name: string;
  provenance: TemplateProvenance;
  /** draft dok ga covjek ne promovira u verified. */
  status: 'draft' | 'verified';
  marginsCm?: { top: number; right: number; bottom: number; left: number };
  /** Zadani font predloska; elementi ga mogu pregaziti. */
  defaultFont?: string;
  /** Redoslijed elemenata = redoslijed na stranici, odozgo prema dolje. */
  elements: TemplateElement[];
  /** Meta derivacije iz evidence uzoraka (samo derivirani unosi). */
  derivation?: { samples: number; conflicts: string[] };
  notes?: string;
  /** Izričito verificirana oznaka da ustanova traži logo; ne zaključuje se iz bilješki. */
  logoRequired?: boolean;
  /** Ostavlja prostor za budući verificirani medijski asset; v1 ga namjerno ne umeće. */
  logoAvailable?: boolean;
  /** Profil može označiti da je predložak zamijenjen novijom verzijom. */
  outdated?: boolean;
  supersededBy?: string;
}

/** Redigirani dokaz iz prve stranice jednog javnog rada (evidence/<unitId>.json). */
export interface TitlePageEvidenceLine {
  role: TitleRole | 'unknown';
  /** GDPR: ne-null samo za university/faculty/study/worktype/placeyear. */
  redactedText: string | null;
  font: string;
  sizePt: number;
  bold: boolean;
  uppercase: boolean;
  align: 'left' | 'center' | 'right';
  /** y0 / visina stranice (0..1), za redoslijed i zone. */
  yRel: number;
}

export interface TitlePageEvidenceSample {
  pid: string;
  repository: string;
  /** Razina iz fieldValidation.publicSources (vec potvrdena pri harvestu PID-a). */
  level: string;
  /** 0, ili 1 kad je prva stranica repozitorijski cover. */
  pageIndex: number;
  /** true = bez text layera; tipografija nepouzdana, koristi se samo redoslijed. */
  ocrFallback: boolean;
  pageSizePt: { w: number; h: number };
  lines: TitlePageEvidenceLine[];
}

export interface TitlePageEvidenceFile {
  unitId: string;
  generatedAt: string;
  samples: TitlePageEvidenceSample[];
}
