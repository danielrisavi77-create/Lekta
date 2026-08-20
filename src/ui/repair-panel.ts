// src/ui/repair-panel.ts
//
// Prosirenje ekrana 5 "Puna lista popravaka" (UX_PRINCIPLES.md). Prikazuje se
// SAMO ako postoji barem jedna autoFixable stavka (scored && autoFixable &&
// verified, REPAIR_ENGINE.md sekcija 3). Checkboxovi su PREDODABRANI (opt-out).

import type { FixerId } from '../repair/apply-fixers';
import type { HeadingCandidate, HeadingStructureWarning } from '../analysis/heading-structure';
import type { HeadingNumberingPlan } from '../analysis/heading-numbering';
import type { BibliographyEnrichmentCandidate, BibliographyEnrichmentInput } from '../citations/bibliography-enrichment';
import { enrichWithCrossref } from '../citations/bibliography-enrichment';
import { renderRepairLedgerModal, type AdvancedFormDescriptor } from './repair-price-slider';
import type { Check } from '../scoring/checks';
import { repairCeiling } from './result-readiness';
import { detectPassRegressions } from '../analysis/repair-regression';

export interface TitlePageFormField {
  key: string;
  label: string;
  required?: boolean;
  value: string;
}

export interface TitlePageFormDefinition {
  fields: TitlePageFormField[];
  warnings: string[];
  buildParams: (values: Record<string, string>) => Record<string, unknown>;
}

export interface ElementCaptionFormDefinition {
  candidates: Array<{
    id: string;
    kind: string;
    ordinal: number;
    confidence: string;
    description: string;
    source: string;
    position: 'above' | 'below';
    replaceManualCaption: boolean;
    evidence: string[];
    selected: boolean;
  }>;
  lists: Array<{ kind: string; title: string; selected: boolean; placement: 'after-toc' | 'before-intro' }>;
  references: Array<{ paragraphIndex: number; start: number; end: number; elementId: string; rawText: string; selected: boolean }>;
  buildParams: (form: ElementCaptionFormDefinition) => Record<string, unknown>;
}

export interface BibliographyFormDefinition {
  entries: Array<{
    id: string;
    rawText: string;
    confidence: 'high' | 'medium' | 'low';
    selected: boolean;
    remove?: boolean;
    replacementText?: string;
    evidence: string[];
  }>;
  summary: string;
  enrichmentInputs?: BibliographyEnrichmentInput[];
  applyEnrichment?: (candidate: BibliographyEnrichmentCandidate) => void;
  suffixes?: Array<{ entryId: string; suffix: string; selected: boolean }>;
  buildParams: (form: BibliographyFormDefinition) => Record<string, unknown>;
}

export interface CitationBibliographySyncFormDefinition {
  citations: Array<{
    id: string;
    rawText: string;
    replacementText: string;
    status: string;
    confidence: 'high' | 'medium' | 'low';
    candidates: string[];
    selectedCandidate?: string;
    reason: string;
    selected: boolean;
  }>;
  missingEntries: Array<{ id: string; citationId: string; text: string; selected: boolean }>;
  duplicates: Array<{ entryId: string; rawText: string; selected: boolean }>;
  summary: string;
  buildParams: (form: CitationBibliographySyncFormDefinition) => Record<string, unknown>;
}

export interface LegalFootnoteRepairFormDefinition {
  candidates: Array<{
    footnoteId: number;
    rawText: string;
    type: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    operations: Array<{ id: string; kind: string; before: string; after: string; replacementText: string; reason: string; confidence: string; selected: boolean; start?: number; end?: number; paragraphIndex?: number; markerPosition?: 'before-punctuation' | 'after-punctuation' }>;
  }>;
  markers: Array<{ id: string; paragraphIndex: number; footnoteId: number; rawText: string; confidence: string; selected: boolean }>;
  links: Array<{ footnoteId: number; bibliographyEntryId: string; selected: boolean }>;
  warnings: string[];
  summary: string;
  buildParams: (form: LegalFootnoteRepairFormDefinition) => Record<string, unknown>;
}

export interface FinalDocumentInspectorFormDefinition {
  findings: Array<{
    id: string;
    category: string;
    summary: string;
    count: number;
    severity: string;
    supported: boolean;
    destructive: boolean;
    warning?: string;
    selected: boolean;
    action: string;
    evidence: Array<{ part: string; location: string; fingerprint: string; display?: string; revisionId?: string; commentId?: string; field?: string; selected: boolean; revisionAction?: 'accept' | 'reject' }>;
  }>;
  summary: string;
  buildParams: (form: FinalDocumentInspectorFormDefinition) => Record<string, unknown>;
}

export interface TableFigureRescueFormDefinition {
  tables: Array<{ id: string; bodyChildIndex: number; anchorFingerprint: string; summary: string; wide: boolean; selected: boolean; actions: Record<string, boolean>; typography?: Record<string, unknown>; source?: { paragraphIndex: number; anchorFingerprint: string; text: string; selected: boolean }; landscape?: { beforeFingerprint: string; afterFingerprint: string; selected: boolean }; evidence: string[]; }>
  figures: Array<{ id: string; paragraphIndex: number; drawingIndex: number; anchorFingerprint: string; maxWidthEmu?: number; summary: string; lowResolution: boolean; selected: boolean; actions: Record<string, boolean>; altText: string; evidence: string[]; }>;
  summary: string;
  buildParams: (form: TableFigureRescueFormDefinition) => Record<string, unknown>;
}

export interface SectionSurgeryFormDefinition {
  sections: Array<{
    id: string;
    ordinal: number;
    summary: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    warnings: string[];
    operations: Array<{ id: string; kind: string; label: string; selected: boolean; disabled?: boolean; operation: Record<string, unknown> }>;
  }>;
  summary: string;
  buildParams: (form: SectionSurgeryFormDefinition) => Record<string, unknown>;
}

export interface FieldIntegrityFormDefinition {
  fields: Array<{ id: string; part: string; kind: string; instruction: string; status: string; confidence: string; anchorFingerprint: string; selected: boolean; evidence: string[] }>;
  manualTocCandidates: Array<{ startParagraphIndex: number; endParagraphIndex: number; rawText: string; anchorFingerprint: string; selected: boolean }>;
  bookmarks: Array<{ name: string; part: string; status: string; targetFingerprint?: string; selected: boolean }>;
  summary: string;
  buildParams: (form: FieldIntegrityFormDefinition) => Record<string, unknown>;
}

export interface CroatianTypographyFormDefinition {
  categories: Array<{ category: string; count: number; selected: boolean }>;
  occurrences: Array<{ id: string; category: string; before: string; after: string; confidence: string; evidence: string[]; selected: boolean; operation: Record<string, unknown> }>;
  summary: string;
  buildParams: (form: CroatianTypographyFormDefinition) => Record<string, unknown>;
}

export interface ConsistencyFormDefinition {
  groups: Array<{
    id: string;
    zone: string;
    label: string;
    confidence: string;
    evidence: string[];
    variants: Array<{ text: string; count: number; occurrences: Array<{ part: string; paragraphIndex?: number; start?: number; end?: number; anchorFingerprint: string; metadataField?: string }> }>;
    selectedCanonical?: string;
    selected: boolean;
    zoneConsent: boolean;
  }>;
  summary: string;
  buildParams: (form: ConsistencyFormDefinition) => Record<string, unknown>;
}

export interface RequiredSectionsFormDefinition {
  candidates: Array<{
    id: string;
    kind: string;
    label: string;
    confidence: string;
    headingLevel: number;
    styleId?: string;
    numbered: boolean;
    contentPolicy: string;
    verifiedStatement?: string;
    placeholderText: string;
    commentText: string;
    selected: boolean;
    contentMode: 'none' | 'placeholder' | 'comment' | 'statement';
    insertionAnchor?: { paragraphIndex: number; anchorFingerprint: string; position: 'before' | 'after' };
    evidence: string[];
    warnings: string[];
  }>;
  summary: string;
  buildParams: (form: RequiredSectionsFormDefinition) => Record<string, unknown>;
}

export interface LinkDoiFormDefinition {
  occurrences: Array<{
    id: string;
    rawText: string;
    displayedText: string;
    target?: string;
    kind: string;
    status: string;
    confidence: string;
    evidence: string[];
    selectedActions: string[];
    operations: Array<{ action: string; replacementText?: string; targetUrl?: string; before: string; selected: boolean }>;
    paragraphIndex?: number;
    start: number;
    end: number;
    anchorFingerprint: string;
  }>;
  summary: string;
  buildParams: (form: LinkDoiFormDefinition) => Record<string, unknown>;
}

export interface CrossFileSubmissionFormDefinition {
  issues: Array<{
    id: string;
    field: string;
    status: string;
    severity: string;
    reason: string;
    suggestedCanonical?: string;
    values: Array<{ value: string; source: string; fileName?: string; location?: string; fingerprint: string }>;
    selectedCanonical?: string;
    selected: boolean;
  }>;
  summary: string;
  fileNames: string[];
  buildParams: (form: CrossFileSubmissionFormDefinition) => Record<string, unknown>;
}

export interface RepairableItem {
  ruleId: string;
  fixerId: FixerId;
  label: string; // npr. "Desna margina", citljivo, ne interni checkId
  params: Record<string, unknown>;
  /** Je li dimenzija prekrsena u analizi. Prekrsene su predodabrane (opt-out);
   * neprekrsene (Feature B "uskladi sve") su opt-in i default NEodabrane. */
  violated?: boolean;
  /** Trazi izricitu potvrdu lokacije prije primjene (K6: umetanje sekcije prije Uvoda je
   * semanticka odluka o mjestu prijeloma). Kad je bar jedna odabrana stavka ovakva, prvi
   * klik na "Preuzmi" prikaze potvrdni korak umjesto da odmah popravi. */
  requiresConfirmation?: boolean;
  /** Tekst potvrde (sto ce se tocno napraviti i gdje); prikazuje se u potvrdnom koraku. */
  confirmationText?: string;
  /** Pravilo je institucijska PREPORUKA (advisory), ne bodovan propis: gumb se nudi kao
   * neobavezno "Preporučeno", u zasebnoj skupini, uvijek opt-in (violated je uvijek false). */
  recommended?: boolean;
  /**
   * ODAKLE ova stavka crpi autoritet. Prikazuje se kao dokazni cip uz redak, da korisnik ne mora
   * pogadjati trazi li to njegov fakultet ili je opca preporuka alata:
   *
   *   'faculty-rule'           - verificirano pravilo fakulteta (bodovano),
   *   'faculty-recommendation' - fakultet preporucuje, ali ne ulazi u ocjenu (advisory),
   *   'lekta-recommendation'   - univerzalna higijena, nijedan profil je ne propisuje.
   *
   * Razlika je dosad postojala u podacima (`status`, `recommended`) ali ne i na ekranu, pa je
   * "Preporučeno" bio jedini trag i nije razlikovao fakultetsku preporuku od nase.
   *
   */
  authority?: 'faculty-rule' | 'faculty-recommendation' | 'lekta-recommendation';
  /**
   * DOKAZ uz tvrdnju: stranica sluzbene upute i datum zadnje provjere.
   *
   * Bez ovoga "Pravilo fakulteta" je tvrdnja koju korisnik ne moze provjeriti. Polja dolaze iz
   * pecene `data/profiles/repair-map.json` (generator ih od 2026-08-19 nosi; pokrivenost je
   * 1830/1847 za stranicu i 1733/1847 za datum), pa se cip gradi bez ijednog dodatnog dohvata.
   *
   * Ustanova se NE nosi ovdje: sucelje je zna iz odabranog profila, a nosenje `sourceId` znacilo
   * bi i cijeli SOURCE_REGISTRY u bundleu.
   */
  provenance?: { sourcePage?: string | null; lastVerified?: string | null };
  /** Naslov(i) checka/issuea (analyzeDocx) ciju povredu ova stavka popravlja. Sluzi ISKLJUCIVO
   * korelaciji "koji nalaz na kartici rezultata otvara bas ovu stavku u panelu" (RESULT-03), ne
   * ulazi u zahtjev prema serveru. Prazno/izostavljeno znaci da stavka nije vezana ni za jedan
   * pojedinacni nalaz (npr. tocFieldItem, koji se nudi neovisno o tome je li nesto "prekrseno"). */
  matchKeys?: string[];
  /** Kandidati za pojedinačni odabir u stablu naslova. */
  headingCandidates?: HeadingCandidate[];
  headingWarnings?: HeadingStructureWarning[];
  headingNumberingPlan?: HeadingNumberingPlan | null;
  titlePageForm?: TitlePageFormDefinition;
  elementCaptionForm?: ElementCaptionFormDefinition;
  bibliographyForm?: BibliographyFormDefinition;
  citationBibliographySyncForm?: CitationBibliographySyncFormDefinition;
  legalFootnoteRepairForm?: LegalFootnoteRepairFormDefinition;
  finalDocumentInspectorForm?: FinalDocumentInspectorFormDefinition;
  tableFigureRescueForm?: TableFigureRescueFormDefinition;
  sectionSurgeryForm?: SectionSurgeryFormDefinition;
  fieldIntegrityForm?: FieldIntegrityFormDefinition;
  croatianTypographyForm?: CroatianTypographyFormDefinition;
  consistencyForm?: ConsistencyFormDefinition;
  requiredSectionsForm?: RequiredSectionsFormDefinition;
  linkDoiForm?: LinkDoiFormDefinition;
  crossFileSubmissionForm?: CrossFileSubmissionFormDefinition;
}

/** Fixeri koji podrzavaju v2 dubinsko ciscenje izravnog formatiranja u tekstu. */
/**
 * Fixeri koji znaju ocistiti IZRAVNO oblikovanje (ne samo stilove). Izvezeno da testovi mogu
 * zrcaliti stvarni korisnicki tok: deep preklopnik je u sucelju UKLJUCEN po zadanom, pa
 * `buildDefaultRepairRequests` sam po sebi NE reproducira ono sto korisnik dobije klikom na
 * Popravi (izmjereno u tests/closed-loop-profiles.test.ts: bez deep zastavice font, velicina,
 * prored i poravnanje ostaju neprimijenjeni jer izravno oblikovanje nadjacava stil).
 */
export const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'footnote-spacing-fixer',
] as FixerId[]);

/** Bodovna slika (ukupni score + po kategorijama) za usporedbu prije/poslije popravka. */
export interface RepairScoreSnapshot {
  score: number | null;
  categories: Record<string, { earned: number; max: number }>;
  /** Provjere iz analize (za repairCeiling - "koliko je automatski popravak realno u stanju
   *  jamciti"). Opcionalno: bez njega se strop jednostavno ne prikazuje (stariji pozivatelji). */
  checks?: Check[];
}

export interface RepairPanelContext {
  items: RepairableItem[];
  /** Lijeno cita originalni dokument tek na klik (ne drzi kopiju bajtova po
   * svakom re-renderu checkliste). */
  getDocxBytes: () => Promise<Uint8Array>;
  originalFileName: string;
  mountEl: HTMLElement;
  /** Bodovna slika PRIJE popravka (iz analize koja je otvorila panel). Uz reanalyze
   *  omogucuje prikaz "spremnost prije -> poslije" i verdikt o regresiji. */
  beforeScore?: RepairScoreSnapshot;
  /**
   * Ponovna analiza POPRAVLJENIH bajtova istim profilom/postavkama. Vraca null ako profil nije
   * bodovan; smije baciti (npr. korupcija), sto hvatamo. Radi u Web Workeru (ne blokira nit).
   *
   * Od 2026-08-16 se izvodi PRIJE isporuke i njezin verdikt odlucuje sto sucelje nudi kao glavno
   * preuzimanje (regresija -> izvornik). Prijasnji ugovor je bio obrnut ("nikad ne smije sprijeciti
   * preuzimanje") pa je regresirani dokument bio preuzet prije nego bi upozorenje stiglo.
   *
   * I dalje NIKAD ne ZAROBLJAVA dokument: kad analiza padne ili je nema, popravljeni se isporucuje
   * uz izricitu napomenu da provjera nije izvedena.
   */
  reanalyze?: (repairedBytes: Uint8Array) => Promise<RepairScoreSnapshot | null>;
  /** Opcionalni sandboxani LibreOffice worker. XML popravak radi i bez njega. */
  fieldRenderEndpoint?: string;
  getAccessToken?: () => Promise<string>;
}

/** Polja koje "obicna" stavka smije nositi (ono sto ledger prezentacija razumije: cist
 *  checkbox, bez prikljucene podforme). SVAKO drugo istinito polje (napredna forma poput
 *  title page/bibliografije, buduce prosirenje) vraca stavku u POSTOJECI inline prikaz.
 *  Namjerno default-deny (allowlist), ne default-allow: nova forma dodana sutra automatski
 *  OSTANE izvan ledgera dok je netko svjesno ne doda ovdje, umjesto da tiho slomi prikaz. */
const SIMPLE_ITEM_KEYS = new Set<string>([
  'ruleId',
  'fixerId',
  'label',
  'params',
  'violated',
  'requiresConfirmation',
  'confirmationText',
  'recommended',
  'matchKeys',
]);

/** Izvezeno da app.ts (isti uzi kriterij za renderServerRepairPanel) ne duplicira allowlistu. */
export function isSimpleItem(item: RepairableItem): boolean {
  return Object.entries(item).every(([key, value]) => {
    if (SIMPLE_ITEM_KEYS.has(key)) return true;
    if (value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

/**
 * Ledger redak za stavku s naprednom formom: GDJE (Tier A poseban modal, Tier B inline <details>)
 * i KAKO (render callback koji poziva postojeci render*Controls). Tier A = neograniceno, sadrzajno
 * vodjeno (literatura, citati, fusnote, natpisi...) - moglo bi biti desetci-stotinjak redaka pa
 * dobiva vlastiti fokusirani prozor. Tier B = ograniceno strukturom dokumenta (par sekcija/kategorija
 * nalaza) - ostaje na dohvat ruke kao <details> u ledgeru. Izvezeno da ga app.ts dijeli za
 * renderServerRepairPanel (isti raspored, ne duplicirati odluku po tier-u na dva mjesta).
 */
export function advancedFormFor(item: RepairableItem): AdvancedFormDescriptor | null {
  if (item.headingCandidates?.length || item.headingNumberingPlan?.mappings?.length) {
    const count = item.headingCandidates?.length || item.headingNumberingPlan?.mappings?.length || 0;
    return { tier: 'A', label: 'Naslovi', count, render: (c) => renderHeadingCandidateControls(c, item) };
  }
  if (item.titlePageForm) {
    return { tier: 'B', label: 'Naslovnica', count: item.titlePageForm.fields.length, render: (c) => renderTitlePageControls(c, item) };
  }
  if (item.elementCaptionForm) {
    return { tier: 'A', label: 'Natpisi tablica i slika', count: item.elementCaptionForm.candidates.length, render: (c) => renderElementCaptionControls(c, item) };
  }
  if (item.bibliographyForm) {
    return { tier: 'A', label: 'Literatura', count: item.bibliographyForm.entries.length, render: (c) => renderBibliographyControls(c, item) };
  }
  if (item.citationBibliographySyncForm) {
    return { tier: 'A', label: 'Citati', count: item.citationBibliographySyncForm.citations.length, render: (c) => renderCitationBibliographySyncControls(c, item) };
  }
  if (item.legalFootnoteRepairForm) {
    return { tier: 'A', label: 'Fusnote', count: item.legalFootnoteRepairForm.candidates.length, render: (c) => renderLegalFootnoteRepairControls(c, item) };
  }
  if (item.finalDocumentInspectorForm) {
    return { tier: 'B', label: 'Metapodaci i tragovi izrade', count: item.finalDocumentInspectorForm.findings.length, render: (c) => renderFinalDocumentInspectorControls(c, item) };
  }
  if (item.tableFigureRescueForm) {
    const count = item.tableFigureRescueForm.tables.length + item.tableFigureRescueForm.figures.length;
    return { tier: 'A', label: 'Tablice i slike', count, render: (c) => renderTableFigureRescueControls(c, item) };
  }
  if (item.sectionSurgeryForm) {
    return { tier: 'B', label: 'Sekcije', count: item.sectionSurgeryForm.sections.length, render: (c) => renderSectionSurgeryControls(c, item) };
  }
  if (item.fieldIntegrityForm) {
    return { tier: 'B', label: 'Polja dokumenta', count: item.fieldIntegrityForm.fields.length, render: (c) => renderFieldIntegrityControls(c, item) };
  }
  if (item.croatianTypographyForm) {
    return { tier: 'A', label: 'Hrvatska tipografija', count: item.croatianTypographyForm.occurrences.length, render: (c) => renderCroatianTypographyControls(c, item) };
  }
  if (item.consistencyForm) {
    return { tier: 'B', label: 'Dosljednost pojmova', count: item.consistencyForm.groups.length, render: (c) => renderConsistencyControls(c, item) };
  }
  if (item.requiredSectionsForm) {
    return { tier: 'B', label: 'Obvezni dijelovi', count: item.requiredSectionsForm.candidates.length, render: (c) => renderRequiredSectionsControls(c, item) };
  }
  if (item.linkDoiForm) {
    return { tier: 'A', label: 'Poveznice i DOI', count: item.linkDoiForm.occurrences.length, render: (c) => renderLinkDoiControls(c, item) };
  }
  if (item.crossFileSubmissionForm) {
    return { tier: 'B', label: 'Usklađenost datoteka', count: item.crossFileSubmissionForm.issues.length, render: (c) => renderCrossFileSubmissionControls(c, item) };
  }
  return null;
}

export function renderRepairPanel(ctx: RepairPanelContext): void {
  if (ctx.items.length === 0) return; // nema autoFixable stavki za ovaj rad

  const container = document.createElement('div');
  container.className = 'lekta-repair-panel';

  const list = document.createElement('ul');
  list.className = 'lekta-repair-panel__list';

  // Tri skupine, tim redom: prekrseno (predodabrano) > PREPORUKA fakulteta > neprekrseno-ali-
  // bodovano ("uskladi cijeli dokument", Feature B). Obje zadnje su uvijek opt-in.
  //
  // Preporuke su podignute IZNAD neprekrsenih bodovanih stavki namjerno. Vecina hrvatskih
  // fakultetskih uputa su preporuke, ne obveze (izmjereno na snapshotiranom korpusu: svih pet
  // ustanova iz pilota ima izricitu ogradu tipa "preporucuje se" ili "u dogovoru s mentorom").
  // Bodovati ih kao obveze znacilo bi lazan nalaz: student bi gubio bodove za rad koji je tocan
  // po mentorovoj uputi. Zato ostaju izvan ocjene, ali dobivaju mjesto koje odgovara njihovoj
  // stvarnoj vrijednosti za korisnika, umjesto zadnjeg mjesta na popisu.
  const rank = (i: RepairableItem) => (i.violated !== false ? 0 : i.recommended ? 1 : 2);
  const ordered = [...ctx.items].sort((a, b) => rank(a) - rank(b));
  const firstRecommendedIdx = ordered.findIndex((i) => rank(i) === 1);
  const firstExtraIdx = ordered.findIndex((i) => rank(i) === 2);

  ordered.forEach((item, orderIdx) => {
    const idx = ctx.items.indexOf(item);
    const isViolated = item.violated !== false;
    if (orderIdx === firstExtraIdx && firstExtraIdx !== -1) {
      const sub = document.createElement('li');
      sub.className = 'lekta-repair-panel__subtitle';
      // Kad NISTA nije prekrseno (uredan rad), "i ostalo" nema smisla: preokreni
      // u pozitivnu poruku. Inace: dodatne dimenzije ispod prekrsenih.
      sub.textContent =
        firstExtraIdx === 0
          ? 'Sve prepoznato je usklađeno. Po želji dodatno uskladi:'
          : 'Uskladi i ostalo (trenutno nije prekršeno):';
      list.appendChild(sub);
    }
    if (orderIdx === firstRecommendedIdx && firstRecommendedIdx !== -1) {
      const sub = document.createElement('li');
      sub.className = 'lekta-repair-panel__subtitle';
      // Naslov imenuje IZVOR preporuke: to je ono sto joj daje tezinu kod korisnika, a
      // istovremeno posteno kaze da ne ulazi u ocjenu.
      const count = ordered.filter((i) => rank(i) === 1).length;
      sub.textContent = `Vaš fakultet ovo preporučuje (${count}); ne ulazi u ocjenu:`;
      list.appendChild(sub);
    }
    const li = document.createElement('li');
    li.className = 'lekta-repair-panel__item';
    li.dataset.ruleId = item.ruleId;
    const badgeText = item.recommended
      ? 'Preporučeno'
      : isViolated
        ? 'Možemo ovo popraviti umjesto tebe'
        : 'Uskladi s profilom';
    li.innerHTML = `
      <label>
        <input type="checkbox" ${isViolated ? 'checked' : ''} data-idx="${idx}" />
        <span>${escapeHtml(item.label)}</span>
      </label>
      <span class="lekta-repair-panel__badge">${badgeText}</span>
    `;
    list.appendChild(li);
    // Napredna forma (literatura, citati, fusnote, naslovnica...) se VISE ne gradi ovdje inline:
    // list je uvijek skriven (ledger je jedini vidljivi prikaz, vidi nize), pa bi izgradnja ovdje
    // bila uzaludan posao za svaku stavku sinkrono pri svakom renderu. advancedFormFor (gore) je
    // sad jedino mjesto koje zna koji render*Controls ide uz koju formu; renderRepairLedgerModal
    // ga zove LIJENO, tek na klik na "Uredi..."/otvaranje <details> retka.
  });

  // v2 dubinsko ciscenje: uklanja izravno formatiranje u tekstu (font, prored,
  // poravnanje po runovima/odlomcima) da popravljeni stilovi stvarno pobijede.
  const deepAvailable = ctx.items.some((i) => DEEP_CAPABLE.has(i.fixerId));
  let deepToggle: HTMLInputElement | null = null;
  const deepRow = document.createElement('label');
  if (deepAvailable) {
    deepRow.className = 'lekta-repair-panel__deep';
    deepRow.innerHTML = `
      <input type="checkbox" checked />
      <span>Uskladi i ručno formatirane dijelove, da popravak stvarno primi.</span><details class="lekta-repair-panel__deep-more"><summary>Što to znači</summary><p>Ako je oblikovanje upisano izravno u tekst, ono nadjačava stilove i popravak se vizualno ne vidi. Ovo uklanja takvo izravno oblikovanje (font, prored, poravnanje). <strong>Netaknuti ostaju:</strong> naslovi i stilizirani dijelovi, podebljano i kurziv, centrirano, veće naslovne veličine, formule, tablice (prored i poravnanje), simbolski fontovi, tekstualni okviri i citatne kontrole (npr. Zotero, Mendeley). Tekst pisan drugim fontom uskladit će se s fontom profila.</p></details><span></span>
    `;
    deepToggle = deepRow.querySelector('input');
  }

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'lekta-repair-panel__download';
  downloadBtn.textContent = 'Preuzmi popravljeni dokument';
  let latestRepairedBytes: Uint8Array | null = null;
  const renderFieldButton = document.createElement('button');
  renderFieldButton.type = 'button';
  renderFieldButton.className = 'lekta-repair-panel__render-fields';
  renderFieldButton.textContent = 'Renderiraj i osvježi polja';
  renderFieldButton.hidden = !ctx.fieldRenderEndpoint;
  const renderFieldStatus = document.createElement('small');
  renderFieldStatus.className = 'lekta-repair-panel__render-fields-status';
  renderFieldButton.addEventListener('click', async () => {
    if (!latestRepairedBytes || !ctx.fieldRenderEndpoint) return;
    renderFieldButton.disabled = true;
    renderFieldStatus.textContent = 'Render je u tijeku…';
    const { requestFieldRender } = await import('../report/field-render-client');
    const rendered = await requestFieldRender({ endpoint: ctx.fieldRenderEndpoint }, ctx.getAccessToken ? await ctx.getAccessToken() : '', latestRepairedBytes);
    renderFieldStatus.textContent = rendered.status === 'done' && rendered.renderedDocx ? `Renderirano. Ažurirano polja: ${rendered.fieldsUpdated}; neriješeno: ${rendered.unresolvedFields}.` : rendered.warnings.join(' ');
    if (rendered.status === 'done' && rendered.renderedDocx) triggerDownload(rendered.renderedDocx, buildFixedFileName(ctx.originalFileName).replace(/\.docx$/i, '-field-renderirano.docx'));
    renderFieldButton.disabled = false;
  });

  // Potvrdni korak (K6): kad je odabrana stavka koja trazi potvrdu lokacije (umetanje sekcije),
  // klik na "Preuzmi" prikaze ovaj okvir umjesto da odmah popravi; strukturna izmjena krece tek
  // iz onConfirm callbacka. Bez trajne zastavice: potvrda se trazi na SVAKOJ takvoj primjeni, pa
  // se strukturni popravak nikad ne dogodi bez svjesnog pristanka bas na toj primjeni.
  const confirmBox = document.createElement('div');
  confirmBox.className = 'lekta-repair-panel__confirm-box';
  confirmBox.hidden = true;

  const summary = document.createElement('div');
  summary.className = 'lekta-repair-panel__summary';
  summary.hidden = true;

  function getCheckedItems(): RepairableItem[] {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const checked: RepairableItem[] = [];
    checkboxes.forEach((input) => {
      if (input.checked) checked.push(ctx.items[Number(input.dataset.idx)]);
    });
    return checked;
  }

  downloadBtn.addEventListener('click', () => {
    const checkedItems = getCheckedItems();
    if (checkedItems.length === 0) {
      // Tihi no-op zbunjuje: reci sto treba (i ocisti eventualni stari sazetak).
      confirmBox.hidden = true;
      summary.hidden = false;
      summary.innerHTML = '<strong>Odaberi barem jednu stavku za popravak.</strong>';
      return;
    }
    // Potvrda lokacije (K6): ako je odabrana stavka koja to trazi, prvo pokazi potvrdni korak.
    // Trazi se SVAKI put (nema trajne zastavice), pa uzastopni "Preuzmi" nakon prve potvrde ne
    // preskacu potvrdu za novu strukturnu primjenu. Popravak krece tek iz onConfirm callbacka.
    const needsConfirm = checkedItems.filter((i) => {
      if (!i.requiresConfirmation) return false;
      if (!i.headingCandidates?.length) return true;
      const targets = (i.params.targets as Array<{ paragraphIndex?: number }> | undefined) ?? [];
      return i.headingCandidates.some((candidate) =>
        candidate.confidence !== 'high' && targets.some((target) => target.paragraphIndex === candidate.paragraphIndex),
      );
    });
    if (needsConfirm.length > 0) {
      renderConfirmation(confirmBox, needsConfirm, async () => {
        confirmBox.hidden = true;
        confirmBox.innerHTML = '';
        await performRepair();
      });
      return;
    }
    void performRepair();
  });

  async function performRepair(): Promise<void> {
    const checkedItems = getCheckedItems();
    if (checkedItems.length === 0) return;

    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = 'Popravljam...';

    let repairedBytes: Uint8Array | null = null;
    try {
      const { applyFixers } = await import('../repair/apply-fixers');
      const deep = deepToggle?.checked === true;
      const requests = checkedItems.map((item) => ({
        ruleId: item.ruleId,
        fixerId: item.fixerId,
        params: deep && DEEP_CAPABLE.has(item.fixerId) ? { ...item.params, deep: true } : item.params,
      }));
      const docxBytes = await ctx.getDocxBytes();
      const result = await applyFixers(docxBytes, requests);

      // RE-36/41: "vec uskladjeno" (nema se sto popraviti) i "nije bilo moguce" izgledaju
      // identicno kad se ne razdvoje, pa uredan rad u "uskladi sve" toku djeluje kao kvar.
      const reasons = result.skippedReasons ?? {};
      const alreadyOk: string[] = [];
      const cannotFix: string[] = [];
      for (const ruleId of result.skipped) {
        const label = ctx.items.find((i) => i.ruleId === ruleId)?.label || ruleId;
        (reasons[ruleId] === 'already-ok' ? alreadyOk : cannotFix).push(label);
      }
      // Vrata integriteta su odbila isporuku: popravak bi proizveo neispravan paket. NIJE isto
      // sto i "nema se sto popraviti" (dolje), pa mora imati vlastitu, iskrenu poruku.
      if (result.integrityFailure) {
        renderIntegrityFailure(summary, result.integrityFailure);
        return;
      }
      if (result.changelog.length === 0) {
        // Nijedan popravak nije primijenjen: NE isporucuj "popravljeni" dokument,
        // reci iskreno sto se dogodilo (fail-safe skip, npr. atribut ne postoji).
        renderNothingApplied(summary, alreadyOk, cannotFix);
        return;
      }
      renderSummary(summary, result.changelog, alreadyOk, cannotFix);
      repairedBytes = result.docxBytes;
      latestRepairedBytes = result.docxBytes;
    } catch (err) {
      // Fail-safe: ne rusi ekran. Rucne upute iznad ove sekcije (postojeci
      // tekstualni popravci iz UX_PRINCIPLES.md ekrana 5) i dalje vrijede.
      console.error('Repair Engine: neuspjela primjena popravaka', err);
      summary.hidden = false;
      summary.textContent = 'Nažalost, automatski popravak nije uspio. Ručne upute iznad i dalje vrijede.';
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }

    // Re-check PRIJE isporuke (obrnuto od ugovora do 2026-08-16, kad se dokument preuzimao odmah
    // a ponovna analiza bila samo dopuna). Razlog: vrata integriteta hvataju POKVAREN paket, ali
    // ne i SEMANTICKU regresiju - popravak koji srusi provjeru koja je prije prolazila. Takav
    // dokument je tehnicki ispravan, pa je prije zavrsavao u Preuzimanjima kao "popravljen".
    //
    // Preuzimanje NIJE ukinuto, samo vise nije automatsko: korisnik uvijek moze uzeti popravljeni
    // dokument, ali kad postoji regresija glavna ponuda je original. Kad ponovna analiza padne,
    // popravljeni se isporucuje uz iskrenu napomenu - pad provjere ne smije zarobiti dokument.
    if (repairedBytes) {
      const verdict = await renderRecheck(summary, repairedBytes, ctx);
      renderDelivery(summary, repairedBytes, verdict, ctx);
    }
  }

  container.appendChild(list);
  // Ledger+modal je SADA uvijek jedini vidljivi prikaz (list ostaje checkbox izvor istine za
  // getCheckedItems, ali skriven): stavke s naprednom formom dobivaju "Uredi... ->"/<details>
  // akciju na svom retku (advancedFormFor), umjesto da cijeli panel padne natrag na dugu,
  // neogranicenu listu cim ijedna stavka nosi npr. literaturu.
  list.hidden = true;
  container.appendChild(renderRepairLedgerModal({ items: ctx.items, listEl: list, advancedFormFor }));
  if (deepToggle) container.appendChild(deepRow);
  container.appendChild(downloadBtn);
  container.appendChild(renderFieldButton);
  container.appendChild(renderFieldStatus);
  container.appendChild(confirmBox);
  container.appendChild(summary);
  ctx.mountEl.appendChild(container);
}

export function renderTitlePageControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.titlePageForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__title-page-form';
  const intro = document.createElement('p');
  intro.textContent = 'Potvrdi podatke naslovnice. Lekta će zamijeniti samo kontroliranu prvu stranicu, bez spajanja DOCX predloška.';
  section.appendChild(intro);
  const values: Record<string, string> = Object.fromEntries(definition.fields.map((field) => [field.key, field.value]));
  const form = document.createElement('div');
  form.className = 'lekta-repair-panel__title-page-fields';
  for (const field of definition.fields) {
    const label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = field.value;
    input.dataset.titlePageField = field.key;
    input.required = field.required === true;
    input.addEventListener('input', () => {
      values[field.key] = input.value;
      item.params = definition.buildParams(values);
    });
    label.appendChild(input);
    form.appendChild(label);
  }
  section.appendChild(form);
  if (definition.warnings.length) {
    const warnings = document.createElement('div');
    warnings.className = 'lekta-repair-panel__title-page-warnings';
    for (const message of definition.warnings) {
      const warning = document.createElement('p');
      warning.textContent = message;
      warnings.appendChild(warning);
    }
    section.appendChild(warnings);
  }
  li.appendChild(section);
}

export function renderElementCaptionControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.elementCaptionForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__element-captions';
  const summary = document.createElement('p');
  summary.textContent = 'Potvrdi opis, izvor i položaj. Tekst tablica, slika i grafikona ostaje netaknut.';
  section.appendChild(summary);
  const rows = document.createElement('div');
  rows.className = 'lekta-repair-panel__element-caption-list';
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const candidate of definition.candidates) {
    const row = document.createElement('div');
    row.className = 'lekta-repair-panel__element-caption-row';
    const apply = document.createElement('input');
    apply.type = 'checkbox';
    apply.checked = candidate.selected;
    apply.addEventListener('change', () => { candidate.selected = apply.checked; sync(); });
    const title = document.createElement('strong');
    title.textContent = `${candidate.kind} ${candidate.ordinal} (${candidate.confidence})`;
    const description = document.createElement('input');
    description.type = 'text';
    description.value = candidate.description;
    description.placeholder = 'Opis natpisa';
    description.addEventListener('input', () => { candidate.description = description.value; sync(); });
    const source = document.createElement('input');
    source.type = 'text';
    source.value = candidate.source;
    source.placeholder = 'Izvor, ako postoji';
    source.addEventListener('input', () => { candidate.source = source.value; sync(); });
    const position = document.createElement('select');
    for (const value of ['above', 'below'] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'above' ? 'iznad elementa' : 'ispod elementa';
      option.selected = value === candidate.position;
      position.appendChild(option);
    }
    position.addEventListener('change', () => { candidate.position = position.value as 'above' | 'below'; sync(); });
    const replace = document.createElement('input');
    replace.type = 'checkbox';
    replace.checked = candidate.replaceManualCaption;
    replace.disabled = !candidate.replaceManualCaption && !candidate.description;
    replace.addEventListener('change', () => { candidate.replaceManualCaption = replace.checked; sync(); });
    const replaceLabel = document.createElement('label');
    replaceLabel.textContent = ' zamijeni ručni broj';
    replaceLabel.prepend(replace);
    const evidence = document.createElement('small');
    evidence.textContent = candidate.evidence.join(', ');
    row.append(apply, title, description, source, position, replaceLabel, evidence);
    rows.appendChild(row);
  }
  section.appendChild(rows);
  if (definition.lists.length) {
    const listTitle = document.createElement('p');
    listTitle.textContent = 'Popisi, svaki se umeće samo nakon zasebne potvrde:';
    section.appendChild(listTitle);
    for (const list of definition.lists) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = list.selected;
      checkbox.addEventListener('change', () => { list.selected = checkbox.checked; sync(); });
      label.textContent = ` ${list.title}`;
      label.prepend(checkbox);
      section.appendChild(label);
    }
  }
  if (definition.references.length) {
    const refTitle = document.createElement('p');
    refTitle.textContent = 'Cross-reference prijedlozi, nisu zadano uključeni:';
    section.appendChild(refTitle);
    for (const reference of definition.references) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = reference.selected;
      checkbox.addEventListener('change', () => { reference.selected = checkbox.checked; sync(); });
      label.textContent = ` ${reference.rawText}`;
      label.prepend(checkbox);
      section.appendChild(label);
    }
  }
  li.appendChild(section);
}

export function renderBibliographyControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.bibliographyForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__bibliography';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const entry of definition.entries) {
    const row = document.createElement('div');
    row.className = 'lekta-repair-panel__bibliography-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = entry.selected;
    check.addEventListener('change', () => { entry.selected = check.checked; sync(); });
    const text = document.createElement('textarea');
    text.value = entry.replacementText ?? entry.rawText;
    text.rows = 2;
    text.setAttribute('aria-label', `Bibliografski zapis ${entry.id}`);
    text.addEventListener('input', () => { entry.replacementText = text.value; sync(); });
    const confidence = document.createElement('span');
    confidence.textContent = ` (${entry.confidence})`;
    const evidence = document.createElement('small');
    evidence.textContent = entry.evidence.join(', ');
    row.append(check, text, confidence, evidence);
    section.appendChild(row);
  }
  if (definition.enrichmentInputs?.length) {
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    const consentLabel = document.createElement('label');
    consentLabel.textContent = ' Dopusti zasebnu Crossref provjeru samo strukturiranih metapodataka';
    consentLabel.prepend(consent);
    const enrichButton = document.createElement('button');
    enrichButton.type = 'button';
    enrichButton.className = 'btn btn-secondary btn-sm';
    enrichButton.textContent = 'Pronađi moguće dopune';
    enrichButton.disabled = true;
    const status = document.createElement('small');
    consent.addEventListener('change', () => { enrichButton.disabled = !consent.checked; });
    enrichButton.addEventListener('click', async () => {
      enrichButton.disabled = true;
      status.textContent = 'Tražim strukturirane metapodatke…';
      const candidates = await enrichWithCrossref(definition.enrichmentInputs || [], { consent: true });
      status.textContent = candidates.length ? `Pronađeno kandidata: ${candidates.length}. Potvrdi ih u popisu.` : 'Nema dovoljno sigurnih kandidata ili provjera nije dostupna.';
      for (const candidate of candidates) {
        const row = document.createElement('div');
        row.className = 'lekta-repair-panel__bibliography-enrichment';
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'btn btn-ghost btn-sm';
        accept.textContent = `Primijeni ${candidate.id}`;
        accept.addEventListener('click', () => { definition.applyEnrichment?.(candidate); sync(); accept.disabled = true; });
        row.textContent = `${candidate.provenance.label}: ${candidate.fields.title || 'bez naslova'} `;
        row.appendChild(accept);
        section.appendChild(row);
      }
    });
    section.append(consentLabel, enrichButton, status);
  }
  if (definition.suffixes?.length) {
    const suffixTitle = document.createElement('p');
    suffixTitle.textContent = 'Potvrđene a/b/c oznake za istog autora i godinu:';
    section.appendChild(suffixTitle);
    for (const suffix of definition.suffixes) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = suffix.selected;
      check.addEventListener('change', () => { suffix.selected = check.checked; sync(); });
      label.textContent = ` ${suffix.entryId} → ${suffix.suffix}`;
      label.prepend(check);
      section.appendChild(label);
    }
  }
  li.appendChild(section);
}

export function renderCitationBibliographySyncControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.citationBibliographySyncForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__bibliography lekta-repair-panel__citation-sync';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const citation of definition.citations) {
    const row = document.createElement('div');
    row.className = 'lekta-repair-panel__bibliography-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = citation.selected;
    check.addEventListener('change', () => { citation.selected = check.checked; sync(); });
    const diff = document.createElement('div');
    diff.innerHTML = `<strong>Prije:</strong> ${escapeHtml(citation.rawText)}<br><strong>Poslije:</strong> ${escapeHtml(citation.replacementText || citation.rawText)}<br><small>Razlog: ${escapeHtml(citation.reason)} · ${escapeHtml(citation.status)} · ${escapeHtml(citation.confidence)}${citation.candidates.length ? ` · Kandidati: ${escapeHtml(citation.candidates.join(', '))}` : ''}</small>`;
    row.append(check, diff);
    if (citation.candidates.length) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Odaberi bibliografski zapis za ${citation.id}`);
      select.innerHTML = `<option value="">Odaberi zapis</option>${citation.candidates.map((candidate) => `<option value="${escapeHtml(candidate)}">${escapeHtml(candidate)}</option>`).join('')}`;
      select.value = citation.selectedCandidate || '';
      select.addEventListener('change', () => { citation.selectedCandidate = select.value || undefined; sync(); });
      diff.appendChild(select);
    }
    section.appendChild(row);
  }
  if (definition.missingEntries.length) {
    const title = document.createElement('p');
    title.textContent = 'Nedostajući zapisi, unesi potvrđeni puni bibliografski tekst:';
    section.appendChild(title);
    for (const missing of definition.missingEntries) {
      const row = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = missing.selected;
      check.addEventListener('change', () => { missing.selected = check.checked; sync(); });
      const input = document.createElement('input');
      input.type = 'text';
      input.value = missing.text;
      input.placeholder = 'Potvrđeni bibliografski zapis';
      input.setAttribute('aria-label', `Nedostajući zapis ${missing.id}`);
      input.addEventListener('input', () => { missing.text = input.value; sync(); });
      row.append(check, input);
      section.appendChild(row);
    }
  }
  if (definition.duplicates.length) {
    const title = document.createElement('p');
    title.textContent = 'Mogući duplikati, odabrani zapis može se ukloniti tek nakon potvrde:';
    section.appendChild(title);
    for (const duplicate of definition.duplicates) {
      const row = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = duplicate.selected;
      check.addEventListener('change', () => { duplicate.selected = check.checked; sync(); });
      row.append(check, document.createTextNode(` ukloni ${duplicate.entryId}: ${duplicate.rawText}`));
      section.appendChild(row);
    }
  }
  li.appendChild(section);
}

export function renderLegalFootnoteRepairControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.legalFootnoteRepairForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__bibliography lekta-repair-panel__legal-footnote';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };

  if (definition.markers.length) {
    const title = document.createElement('p');
    title.textContent = 'Sigurno mapirani markeri i tehničke promjene položaja:';
    section.appendChild(title);
    for (const marker of definition.markers) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = marker.selected;
      check.addEventListener('change', () => { marker.selected = check.checked; sync(); });
      label.append(check, document.createTextNode(` fusnota ${marker.footnoteId}, odlomak ${marker.paragraphIndex}: ${marker.rawText} (${marker.confidence})`));
      section.appendChild(label);
    }
  }

  for (const candidate of definition.candidates) {
    const heading = document.createElement('p');
    heading.innerHTML = `<strong>Fusnota ${candidate.footnoteId}</strong> · ${escapeHtml(candidate.type)} · ${escapeHtml(candidate.confidence)}<br><small>${escapeHtml(candidate.evidence.join(' · '))}</small>`;
    section.appendChild(heading);
    for (const operation of candidate.operations) {
      const row = document.createElement('div');
      row.className = 'lekta-repair-panel__bibliography-row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = operation.selected;
      check.setAttribute('aria-label', `Potvrdi izmjenu fusnote ${candidate.footnoteId}, ${operation.kind}`);
      check.addEventListener('change', () => { operation.selected = check.checked; sync(); });
      const diff = document.createElement('div');
      diff.innerHTML = `<strong>Prije:</strong> ${escapeHtml(operation.before)}<br><strong>Poslije:</strong>`;
      const input = document.createElement('textarea');
      input.value = operation.replacementText;
      input.setAttribute('aria-label', `Novi tekst fusnote ${candidate.footnoteId}, ${operation.kind}`);
      input.addEventListener('input', () => { operation.replacementText = input.value; operation.after = input.value; sync(); });
      const reason = document.createElement('small');
      reason.textContent = `Razlog: ${operation.reason} · confidence: ${operation.confidence}`;
      diff.append(input, document.createElement('br'), reason);
      row.append(check, diff);
      section.appendChild(row);
    }
  }

  if (definition.links.length) {
    const title = document.createElement('p');
    title.textContent = 'Povezivanje pravnih izvora s bibliografijom:';
    section.appendChild(title);
    for (const link of definition.links) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = link.selected;
      check.addEventListener('change', () => { link.selected = check.checked; sync(); });
      label.append(check, document.createTextNode(` fusnota ${link.footnoteId} → ${link.bibliographyEntryId}`));
      section.appendChild(label);
    }
  }
  for (const warning of definition.warnings) {
    const note = document.createElement('small');
    note.textContent = `Preskočeno: ${warning}`;
    section.appendChild(note);
  }
  li.appendChild(section);
}

export function renderFinalDocumentInspectorControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.finalDocumentInspectorForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__bibliography lekta-repair-panel__final-inspector';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const finding of definition.findings) {
    const row = document.createElement('div');
    row.className = 'lekta-repair-panel__final-inspector-row';
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = finding.selected;
    check.disabled = !finding.supported;
    check.addEventListener('change', () => { finding.selected = check.checked; sync(); });
    label.append(check, document.createTextNode(' ' + finding.summary + ' (' + finding.count + ')'));
    row.appendChild(label);
    const meta = document.createElement('small');
    meta.textContent = finding.category + ', ozbiljnost: ' + finding.severity + (finding.destructive ? ', destruktivan zahvat' : '');
    row.appendChild(meta);
    if (finding.warning) {
      const warning = document.createElement('small');
      warning.textContent = finding.warning;
      row.appendChild(warning);
    }
    if (finding.category === 'revisions') {
      for (const evidence of finding.evidence) {
        if (!evidence.revisionId) continue;
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Radnja za reviziju ' + evidence.revisionId);
        for (const action of ['accept', 'reject'] as const) {
          const option = document.createElement('option');
          option.value = action;
          option.textContent = action === 'accept' ? 'Prihvati reviziju' : 'Odbaci reviziju';
          option.selected = evidence.revisionAction === action;
          select.appendChild(option);
        }
        select.addEventListener('change', () => { evidence.revisionAction = select.value as 'accept' | 'reject'; sync(); });
        row.append(document.createTextNode(' Revizija ' + evidence.revisionId + ': '), select);
      }
    }
    section.appendChild(row);
  }
  const note = document.createElement('small');
  note.textContent = 'Izrađuje se nova čista kopija. Originalni dokument ostaje nepromijenjen; prihvat i odbacivanje revizija nisu objedinjeni.';
  section.appendChild(note);
  li.appendChild(section);
}

export function renderTableFigureRescueControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.tableFigureRescueForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__table-figure-rescue';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };
  const addGroup = (title: string) => { const h = document.createElement('h4'); h.textContent = title; section.appendChild(h); };
  addGroup('Tablice');
  for (const table of definition.tables) {
    const row = document.createElement('div'); row.className = 'lekta-repair-panel__rescue-row';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = table.selected;
    check.addEventListener('change', () => { table.selected = check.checked; sync(); });
    const label = document.createElement('label'); label.append(check, document.createTextNode(` ${table.summary}${table.wide ? ' · potrebna potvrda landscapea' : ''}`)); row.appendChild(label);
    const details = document.createElement('small'); details.textContent = table.evidence.join(' · '); row.appendChild(details);
    section.appendChild(row);
    const actions = document.createElement('div'); actions.className = 'lekta-repair-panel__rescue-actions';
    const actionLabels: Record<string, string> = { fitToTextWidth: 'Prilagodi širini teksta', equalColumns: 'Ujednači stupce', repeatHeader: 'Ponavljaj zaglavlje', preventRowSplit: 'Ne cijepaj retke', center: 'Centriraj tablicu', applyProfileTypography: 'Primijeni profilnu tipografiju', separateSource: 'Odvoji izvor tablice' };
    for (const [key, value] of Object.entries(table.actions)) {
      const actionLabel = document.createElement('label'); const actionCheck = document.createElement('input'); actionCheck.type = 'checkbox'; actionCheck.checked = value === true;
      actionCheck.addEventListener('change', () => { table.actions[key] = actionCheck.checked; sync(); }); actionLabel.append(actionCheck, document.createTextNode(' ' + (actionLabels[key] || key))); actions.appendChild(actionLabel);
    }
    section.appendChild(actions);
    if (table.source) {
      const sourceLabel = document.createElement('label'); const sourceCheck = document.createElement('input'); sourceCheck.type = 'checkbox'; sourceCheck.checked = table.source.selected;
      sourceCheck.addEventListener('change', () => { table.source!.selected = sourceCheck.checked; table.actions.separateSource = sourceCheck.checked; sync(); }); sourceLabel.append(sourceCheck, document.createTextNode(` Odvoji pronađeni izvor: ${table.source.text}`)); section.appendChild(sourceLabel);
    }
    if (table.landscape) {
      const landscapeLabel = document.createElement('label'); const landscapeCheck = document.createElement('input'); landscapeCheck.type = 'checkbox'; landscapeCheck.checked = table.landscape.selected;
      landscapeCheck.addEventListener('change', () => { table.landscape!.selected = landscapeCheck.checked; sync(); }); landscapeLabel.append(landscapeCheck, document.createTextNode(' Potvrđujem landscape sekciju prije i portrait nakon tablice')); section.appendChild(landscapeLabel);
    }
  }
  addGroup('Slike i grafikoni');
  for (const figure of definition.figures) {
    const row = document.createElement('div'); row.className = 'lekta-repair-panel__rescue-row';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = figure.selected;
    check.addEventListener('change', () => { figure.selected = check.checked; sync(); });
    const label = document.createElement('label'); label.append(check, document.createTextNode(` ${figure.summary}${figure.lowResolution ? ' · niska rezolucija' : ''}`)); row.appendChild(label);
    const alt = document.createElement('input'); alt.type = 'text'; alt.placeholder = 'Alt tekst (po želji)'; alt.value = figure.altText; alt.maxLength = 500; alt.addEventListener('input', () => { figure.altText = alt.value; sync(); }); row.appendChild(alt);
    const details = document.createElement('small'); details.textContent = figure.evidence.join(' · '); row.appendChild(details);
    section.appendChild(row);
    const actions = document.createElement('div'); actions.className = 'lekta-repair-panel__rescue-actions';
    const actionLabels: Record<string, string> = { constrainToTextWidth: 'Ograniči na širinu teksta', preserveAspectRatio: 'Očuvaj omjer stranica', center: 'Centriraj', removeWrapping: 'Ukloni wrapping', keepWithCaption: 'Drži sliku i natpis zajedno' };
    for (const [key, value] of Object.entries(figure.actions)) {
      const actionLabel = document.createElement('label'); const actionCheck = document.createElement('input'); actionCheck.type = 'checkbox'; actionCheck.checked = value === true;
      actionCheck.addEventListener('change', () => { figure.actions[key] = actionCheck.checked; sync(); }); actionLabel.append(actionCheck, document.createTextNode(' ' + (actionLabels[key] || key))); actions.appendChild(actionLabel);
    }
    section.appendChild(actions);
  }
  const note = document.createElement('small'); note.textContent = 'Niska rezolucija ostaje upozorenje. Landscape se umeće samo nakon zasebne potvrde; original ostaje nepromijenjen.'; section.appendChild(note);
  li.appendChild(section);
}

export function renderSectionSurgeryControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.sectionSurgeryForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__section-surgery';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const candidate of definition.sections) {
    const card = document.createElement('div');
    card.className = 'lekta-repair-panel__section-surgery-card';
    const heading = document.createElement('strong');
    heading.textContent = `${candidate.ordinal + 1}. ${candidate.summary}`;
    card.appendChild(heading);
    const meta = document.createElement('small');
    meta.textContent = `${candidate.confidence} · ${candidate.evidence.join(' · ')}`;
    card.appendChild(meta);
    for (const warning of candidate.warnings) {
      const note = document.createElement('small');
      note.textContent = `Upozorenje: ${warning}`;
      card.appendChild(note);
    }
    for (const operation of candidate.operations) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = operation.selected;
      check.disabled = operation.disabled === true;
      check.addEventListener('change', () => { operation.selected = check.checked; sync(); });
      label.append(check, document.createTextNode(` ${operation.label}`));
      card.appendChild(label);
    }
    section.appendChild(card);
  }
  const note = document.createElement('small');
  note.textContent = 'Sekcije se mijenjaju samo prema potvrđenim operacijama. Složene sekcije i zastarjela sidra preskaču se bez promjene sadržaja.';
  section.appendChild(note);
  li.appendChild(section);
}

export function renderFieldIntegrityControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.fieldIntegrityForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__field-integrity';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const note = document.createElement('p');
  note.className = 'lekta-repair-panel__hint';
  note.textContent = 'Lokalni XML popravak označava polja za osvježavanje. Word ili LibreOffice moraju izračunati konačne brojeve stranica.';
  section.appendChild(note);
  const sync = () => { item.params = definition.buildParams(definition); };
  const fields = document.createElement('div');
  fields.className = 'lekta-repair-panel__field-list';
  for (const field of definition.fields) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = field.selected;
    checkbox.addEventListener('change', () => { field.selected = checkbox.checked; sync(); });
    const text = document.createElement('span');
    text.textContent = `${field.kind.toUpperCase()} · ${field.status} · ${field.instruction || '(bez instrukcije)'} (${field.confidence})`;
    label.append(checkbox, text);
    if (field.evidence.length) { const evidence = document.createElement('small'); evidence.textContent = ` ${field.evidence.join('; ')}`; label.appendChild(evidence); }
    fields.appendChild(label);
  }
  section.appendChild(fields);
  if (definition.manualTocCandidates.length) {
    const title = document.createElement('p'); title.textContent = 'Ručni sadržaj, zamjena živim TOC poljem traži zasebnu potvrdu:'; section.appendChild(title);
    for (const candidate of definition.manualTocCandidates) {
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = candidate.selected;
      checkbox.addEventListener('change', () => { candidate.selected = checkbox.checked; sync(); });
      label.append(checkbox, document.createTextNode(` odlomci ${candidate.startParagraphIndex}–${candidate.endParagraphIndex}: ${candidate.rawText.slice(0, 120)}`)); section.appendChild(label);
    }
  }
  if (definition.bookmarks.some((bookmark) => bookmark.status !== 'ok')) {
    const warning = document.createElement('p'); warning.textContent = 'Prekinuti bookmarkovi ostaju dijagnostički nalaz dok nema jednoznačnog potvrđenog cilja.'; section.appendChild(warning);
  }
  li.appendChild(section);
}

export function renderCroatianTypographyControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.croatianTypographyForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__croatian-typography';
  const summary = document.createElement('p'); summary.textContent = definition.summary; section.appendChild(summary);
  const note = document.createElement('p'); note.className = 'lekta-repair-panel__hint'; note.textContent = 'Ovaj modul mijenja samo nedvojbene tehničko-tipografske raspone, ne akademski sadržaj.'; section.appendChild(note);
  const sync = () => { item.params = definition.buildParams(definition); };
  const quick = document.createElement('label');
  const quickInput = document.createElement('input'); quickInput.type = 'checkbox'; quickInput.checked = true;
  quick.append(quickInput, document.createTextNode(' Popravi samo nedvojbene tipografske pogreške'));
  quickInput.addEventListener('change', () => { for (const occurrence of definition.occurrences) occurrence.selected = quickInput.checked && occurrence.confidence === 'high'; for (const category of definition.categories) category.selected = quickInput.checked && definition.occurrences.some((occurrence) => occurrence.category === category.category && occurrence.selected); sync(); render(); });
  section.appendChild(quick);
  const body = document.createElement('div'); section.appendChild(body);
  const render = () => {
    body.replaceChildren();
    for (const category of definition.categories) {
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = category.selected;
      checkbox.addEventListener('change', () => { category.selected = checkbox.checked; for (const occurrence of definition.occurrences.filter((x) => x.category === category.category)) occurrence.selected = checkbox.checked && (quickInput.checked ? occurrence.confidence === 'high' : true); sync(); render(); });
      label.append(checkbox, document.createTextNode(` ${category.category} (${category.count})`)); body.appendChild(label);
      for (const occurrence of definition.occurrences.filter((x) => x.category === category.category)) {
        const row = document.createElement('label'); const choice = document.createElement('input'); choice.type = 'checkbox'; choice.checked = occurrence.selected; choice.disabled = quickInput.checked && occurrence.confidence !== 'high';
        choice.addEventListener('change', () => { occurrence.selected = choice.checked; category.selected = definition.occurrences.some((x) => x.category === category.category && x.selected); sync(); });
        row.append(choice, document.createTextNode(` ${occurrence.before} → ${occurrence.after} (${occurrence.confidence})`));
        if (occurrence.evidence.length) row.appendChild(document.createTextNode(`, ${occurrence.evidence.join('; ')}`));
        body.appendChild(row);
      }
    }
  };
  render(); li.appendChild(section);
}

export function renderConsistencyControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.consistencyForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__consistency';
  const summary = document.createElement('p'); summary.textContent = definition.summary; section.appendChild(summary);
  const hint = document.createElement('p'); hint.className = 'lekta-repair-panel__hint'; hint.textContent = 'Odaberite službenu varijantu i zasebno potvrdite semantičku zonu. Bez potvrde se tekst ne mijenja.'; section.appendChild(hint);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const group of definition.groups) {
    const block = document.createElement('fieldset');
    const legend = document.createElement('legend'); legend.textContent = `${group.label} (${group.confidence})`; block.appendChild(legend);
    const consent = document.createElement('label'); const consentInput = document.createElement('input'); consentInput.type = 'checkbox'; consentInput.checked = group.zoneConsent;
    consent.append(consentInput, document.createTextNode(` Potvrđujem zonu: ${group.zone}`)); block.appendChild(consent);
    consentInput.addEventListener('change', () => { group.zoneConsent = consentInput.checked; sync(); });
    for (const variant of group.variants) {
      const label = document.createElement('label'); const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `consistency-${group.id}`; radio.value = variant.text; radio.checked = group.selectedCanonical === variant.text;
      label.append(radio, document.createTextNode(` ${variant.text} (${variant.count})`)); block.appendChild(label);
      radio.addEventListener('change', () => { if (radio.checked) { group.selectedCanonical = variant.text; group.selected = true; sync(); } });
    }
    const preview = document.createElement('small'); preview.textContent = group.selectedCanonical ? ` Odabrano: ${group.selectedCanonical}. Zamjene: ${group.variants.filter((variant) => variant.text !== group.selectedCanonical).reduce((sum, variant) => sum + variant.count, 0)}.` : ' Odaberite kanonsku varijantu.'; block.appendChild(preview);
    if (group.evidence.length) { const evidence = document.createElement('small'); evidence.textContent = ` ${group.evidence.join('; ')}`; block.appendChild(evidence); }
    section.appendChild(block);
  }
  li.appendChild(section);
}

export function renderRequiredSectionsControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.requiredSectionsForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__required-sections';
  const summary = document.createElement('p'); summary.textContent = definition.summary; section.appendChild(summary);
  const hint = document.createElement('p'); hint.className = 'lekta-repair-panel__hint'; hint.textContent = 'Umetnut će se samo struktura. Lekta neće napisati sažetak, abstract, ključne riječi ni priloge.'; section.appendChild(hint);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const candidate of definition.candidates) {
    const block = document.createElement('fieldset');
    const title = document.createElement('legend'); title.textContent = `${candidate.label} (${candidate.confidence})`; block.appendChild(title);
    const select = document.createElement('input'); select.type = 'checkbox'; select.checked = candidate.selected; select.disabled = !candidate.insertionAnchor;
    const selectLabel = document.createElement('label'); selectLabel.append(select, document.createTextNode(' Umetni ovaj dio')); block.appendChild(selectLabel);
    select.addEventListener('change', () => { candidate.selected = select.checked; sync(); });
    const info = document.createElement('small'); info.textContent = candidate.insertionAnchor ? ` Mjesto: ${candidate.insertionAnchor.position} odlomka ${candidate.insertionAnchor.paragraphIndex}, Heading ${candidate.headingLevel}${candidate.numbered ? ', numeriranje uključeno' : ''}.` : ' Nema sigurnog sidra.'; block.appendChild(info);
    if (candidate.evidence.length) { const evidence = document.createElement('small'); evidence.textContent = ` ${candidate.evidence.join('; ')}`; block.appendChild(evidence); }
    const mode = document.createElement('select');
    for (const option of [['none', 'Samo naslov'], ['comment', 'Naslov + komentar'], ['placeholder', 'Naslov + placeholder'], ['statement', 'Službeni tekst']] as const) { const opt = document.createElement('option'); opt.value = option[0]; opt.textContent = option[1]; opt.disabled = option[0] === 'statement' && !candidate.verifiedStatement; mode.appendChild(opt); }
    mode.value = candidate.contentMode; mode.addEventListener('change', () => { candidate.contentMode = mode.value as typeof candidate.contentMode; sync(); });
    block.appendChild(mode);
    if (candidate.verifiedStatement) { const statement = document.createElement('small'); statement.textContent = ` Potvrđeni tekst: ${candidate.verifiedStatement}`; block.appendChild(statement); }
    if (candidate.warnings.length) { const warning = document.createElement('small'); warning.textContent = ` Upozorenje: ${candidate.warnings.join('; ')}`; block.appendChild(warning); }
    section.appendChild(block);
  }
  sync(); li.appendChild(section);
}

export function renderLinkDoiControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.linkDoiForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__link-doi';
  const summary = document.createElement('p'); summary.textContent = definition.summary; section.appendChild(summary);
  const hint = document.createElement('p'); hint.className = 'lekta-repair-panel__hint'; hint.textContent = 'Mrežna provjera dostupnosti i zamjena kanonskog URL-a nisu uključene bez zasebne potvrde.'; section.appendChild(hint);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const occurrence of definition.occurrences) {
    const block = document.createElement('fieldset');
    const legend = document.createElement('legend'); legend.textContent = `${occurrence.kind}: ${occurrence.rawText} (${occurrence.confidence})`; block.appendChild(legend);
    const target = document.createElement('small'); target.textContent = occurrence.target ? ` Cilj: ${occurrence.target}.` : ' Obični tekst bez cilja.'; block.appendChild(target);
    if (occurrence.evidence.length) { const evidence = document.createElement('small'); evidence.textContent = ` ${occurrence.evidence.join('; ')}`; block.appendChild(evidence); }
    for (const operation of occurrence.operations) {
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = operation.selected;
      checkbox.addEventListener('change', () => { operation.selected = checkbox.checked; sync(); });
      label.append(checkbox, document.createTextNode(` ${operation.action}${operation.replacementText ? `: ${operation.replacementText}` : ''}`)); block.appendChild(label);
    }
    section.appendChild(block);
  }
  sync(); li.appendChild(section);
}

export function renderCrossFileSubmissionControls(li: HTMLElement, item: RepairableItem): void {
  const definition = item.crossFileSubmissionForm;
  if (!definition) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__cross-file';
  const summary = document.createElement('p');
  summary.textContent = definition.summary;
  section.appendChild(summary);
  const hint = document.createElement('p');
  hint.className = 'lekta-repair-panel__hint';
  hint.textContent = 'Usporedba je lokalna. Lekta ne mijenja PDF ni tekst rada, a promjena DOCX metapodataka traži zasebnu potvrdu.';
  section.appendChild(hint);
  const sync = () => { item.params = definition.buildParams(definition); };
  for (const issue of definition.issues) {
    const block = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = issue.field + ' (' + issue.status + ')';
    block.appendChild(legend);
    const reason = document.createElement('small');
    reason.textContent = issue.reason;
    block.appendChild(reason);
    const values = document.createElement('ul');
    for (const value of issue.values) {
      const row = document.createElement('li');
      row.textContent = value.value + ' · ' + value.source + (value.fileName ? ' · ' + value.fileName : '');
      values.appendChild(row);
    }
    block.appendChild(values);
    if (issue.values.length > 1 || issue.suggestedCanonical) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Kanonska vrijednost za ' + issue.field);
      const options = [...new Set(issue.values.map((value) => value.value).concat(issue.suggestedCanonical ? [issue.suggestedCanonical] : []))];
      for (const value of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        option.selected = value === issue.selectedCanonical;
        select.appendChild(option);
      }
      select.addEventListener('change', () => { issue.selectedCanonical = select.value; sync(); });
      block.appendChild(select);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = issue.selected;
      const label = document.createElement('label');
      label.append(checkbox, document.createTextNode(' Potvrđujem odabranu kanonsku vrijednost'));
      checkbox.addEventListener('change', () => { issue.selected = checkbox.checked; sync(); });
      block.appendChild(label);
    }
    section.appendChild(block);
  }
  sync();
  li.appendChild(section);
}

export function renderHeadingCandidateControls(li: HTMLElement, item: RepairableItem): void {
  if (item.headingNumberingPlan?.mappings?.length) {
    renderHeadingNumberingPlan(li, item);
    return;
  }
  const candidates = item.headingCandidates ?? [];
  const targets = (item.params.targets as Array<Record<string, unknown>> | undefined) ?? [];
  const selected = new Set(targets.map((target) => Number(target.paragraphIndex)));
  const tree = document.createElement('ul');
  tree.className = 'lekta-repair-panel__heading-tree';
  for (const candidate of candidates) {
    const row = document.createElement('li');
    row.className = 'lekta-repair-panel__heading-node';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(candidate.paragraphIndex);
    checkbox.dataset.paragraphIndex = String(candidate.paragraphIndex);
    const text = document.createElement('span');
    text.textContent = `${candidate.text} (${candidate.confidence === 'high' ? 'sigurno' : 'potvrdi'})`;
    label.append(checkbox, text);

    const level = document.createElement('select');
    level.setAttribute('aria-label', `Razina naslova za odlomak ${candidate.paragraphIndex}`);
    for (let value = 1; value <= 9; value += 1) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = `Heading ${value}`;
      option.selected = value === candidate.proposedLevel;
      level.appendChild(option);
    }
    level.dataset.paragraphIndex = String(candidate.paragraphIndex);
    const evidence = document.createElement('small');
    evidence.textContent = candidate.evidence.join(', ');
    row.append(label, level, evidence);
    tree.appendChild(row);

    const sync = () => {
      const nextTargets: Array<Record<string, unknown>> = [];
      tree.querySelectorAll<HTMLLIElement>('.lekta-repair-panel__heading-node').forEach((node) => {
        const input = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const select = node.querySelector<HTMLSelectElement>('select');
        if (!input?.checked || !select) return;
        const paragraphIndex = Number(input.dataset.paragraphIndex);
        const original = candidates.find((entry) => entry.paragraphIndex === paragraphIndex);
        if (!original) return;
        nextTargets.push({
          paragraphIndex,
          level: Number(select.value),
          numbered: original.numbered,
          removeManualNumbering: original.numbered && original.numberPrefix != null,
          clearDirectFont: (item.params.targets as Array<Record<string, unknown>> | undefined)?.some((target) => target.clearDirectFont === true) ?? false,
          clearDirectSize: (item.params.targets as Array<Record<string, unknown>> | undefined)?.some((target) => target.clearDirectSize === true) ?? false,
          clearDirectAlignment: (item.params.targets as Array<Record<string, unknown>> | undefined)?.some((target) => target.clearDirectAlignment === true) ?? false,
        });
      });
      item.params.targets = nextTargets;
    };
    checkbox.addEventListener('change', sync);
    level.addEventListener('change', sync);
  }
  if (item.headingWarnings?.length) {
    const warning = document.createElement('li');
    warning.className = 'lekta-repair-panel__heading-warning';
    warning.textContent = item.headingWarnings.map((entry) => entry.message).join(' ');
    tree.appendChild(warning);
  }
  li.appendChild(tree);
}

function renderHeadingNumberingPlan(li: HTMLElement, item: RepairableItem): void {
  const plan = item.headingNumberingPlan;
  if (!plan) return;
  const section = document.createElement('section');
  section.className = 'lekta-repair-panel__numbering-plan';
  const summary = document.createElement('p');
  summary.className = 'lekta-repair-panel__numbering-summary';
  summary.textContent = `Plan: ${plan.summary.numbered} numeriranih, ${plan.summary.unnumbered} bez broja, ${plan.summary.removeManualPrefixes} ručnih prefiksa za uklanjanje. TOC: ${plan.tocComparison.status === 'not-present' ? 'nije pronađen' : plan.tocComparison.status === 'count-mismatch' ? 'broj stavki ne odgovara' : 'provjera dostupna'}.`;
  section.appendChild(summary);
  const list = document.createElement('ul');
  list.className = 'lekta-repair-panel__heading-numbering-list';
  const targets = (item.params.targets as Array<Record<string, unknown>> | undefined) ?? [];
  const selected = new Set(targets.map((target) => Number(target.paragraphIndex)));
  for (const mapping of plan.mappings) {
    const row = document.createElement('li');
    row.className = 'lekta-repair-panel__heading-numbering-node';
    const apply = document.createElement('input');
    apply.type = 'checkbox';
    apply.checked = selected.has(mapping.paragraphIndex);
    apply.dataset.paragraphIndex = String(mapping.paragraphIndex);
    const title = document.createElement('span');
    title.textContent = `${mapping.text} (${mapping.existingHeading ? 'postojeći stil' : mapping.confidence}; ${mapping.evidence.join(', ')})`;
    const level = document.createElement('select');
    level.setAttribute('aria-label', `Razina numeriranja za odlomak ${mapping.paragraphIndex}`);
    for (let value = 1; value <= plan.rules.maxLevel; value += 1) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = `Razina ${value}`;
      option.selected = value === mapping.level;
      level.appendChild(option);
    }
    const numbered = document.createElement('input');
    numbered.type = 'checkbox';
    numbered.checked = mapping.numbered;
    numbered.setAttribute('aria-label', `Numeriraj odlomak ${mapping.paragraphIndex}`);
    const numberedLabel = document.createElement('label');
    numberedLabel.textContent = ' broj';
    numberedLabel.prepend(numbered);
    const remove = document.createElement('input');
    remove.type = 'checkbox';
    remove.checked = mapping.removeManualNumbering;
    remove.disabled = !numbered.checked || mapping.manualPrefix == null;
    remove.setAttribute('aria-label', `Ukloni ručni broj iz odlomka ${mapping.paragraphIndex}`);
    const removeLabel = document.createElement('label');
    removeLabel.textContent = ' ukloni ručni broj';
    removeLabel.prepend(remove);
    row.append(apply, title, level, numberedLabel, removeLabel);
    list.appendChild(row);

    const sync = () => {
      const nextTargets: Array<Record<string, unknown>> = [];
      list.querySelectorAll<HTMLLIElement>('.lekta-repair-panel__heading-numbering-node').forEach((node) => {
        const include = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const inputs = node.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
        const select = node.querySelector<HTMLSelectElement>('select');
        if (!include?.checked || !select || inputs.length < 3) return;
        const entry = plan.mappings.find((candidate) => candidate.paragraphIndex === Number(include.dataset.paragraphIndex));
        if (!entry) return;
        nextTargets.push({
          paragraphIndex: entry.paragraphIndex,
          level: Number(select.value),
          numbered: inputs[1].checked,
          removeManualNumbering: inputs[2].checked,
        });
      });
      item.params.targets = nextTargets;
    };
    apply.addEventListener('change', sync);
    level.addEventListener('change', sync);
    numbered.addEventListener('change', () => {
      remove.disabled = !numbered.checked || mapping.manualPrefix == null;
      sync();
    });
    remove.addEventListener('change', sync);
  }
  section.appendChild(list);
  li.appendChild(section);
}

/**
 * Potvrdni korak za stavke koje traze potvrdu lokacije (K6 umetanje sekcije). Prikazuje sto
 * ce se tocno napraviti i gdje, pa trazi izricit klik prije primjene. onConfirm se poziva
 * tek na "Potvrdi i popravi"; "Odustani" samo zatvori okvir (nista se ne mijenja).
 */
export function renderConfirmation(box: HTMLElement, items: RepairableItem[], onConfirm: () => void): void {
  box.hidden = false;
  const texts = items.map((i) => i.confirmationText || `Potvrdi popravak: ${i.label}`);
  box.innerHTML =
    '<p><strong>Potvrdi lokaciju prije popravka:</strong></p>' +
    texts.map((t) => `<p>${escapeHtml(t)}</p>`).join('');

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'lekta-repair-panel__confirm';
  confirmBtn.textContent = 'Potvrdi i popravi';
  confirmBtn.addEventListener('click', onConfirm);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'lekta-repair-panel__cancel';
  cancelBtn.textContent = 'Odustani';
  cancelBtn.addEventListener('click', () => {
    box.hidden = true;
    box.innerHTML = '';
  });

  box.appendChild(confirmBtn);
  box.appendChild(cancelBtn);
}

// Hrvatska sklonidba uz broj: 1 popravak, 2-4 popravka, 5+ popravaka
// (iznimka 11-14 -> popravaka). Isti obrazac kao renderIssues drugdje u appu.
function pluralRepairs(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} popravak`;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return `${n} popravka`;
  return `${n} popravaka`;
}

function renderSummary(
  el: HTMLElement,
  changelog: { ruleId: string; beforeLabel: string; afterLabel: string }[],
  alreadyOk: string[],
  cannotFix: string[],
): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Primijenjeno ${pluralRepairs(changelog.length)}</strong>
    <ul>
      ${changelog
        .map((c) => `<li>${escapeHtml(c.beforeLabel)} &rarr; ${escapeHtml(c.afterLabel)}</li>`)
        .join('')}
    </ul>
    ${alreadyOk.length ? `<p>Već usklađeno, nije trebalo mijenjati: ${alreadyOk.map(escapeHtml).join(', ')}.</p>` : ''}
    ${cannotFix.length ? `<p>Nije bilo moguće automatski primijeniti: ${cannotFix.map(escapeHtml).join(', ')}. Za to i dalje vrijede ručne upute iznad.</p>` : ''}
  `;
}

const CATEGORY_LABELS: Record<string, string> = {
  formatting: 'Oblikovanje',
  structure: 'Struktura',
  citations: 'Citatnice',
  elements: 'Elementi',
};

/** Postotak kategorije (earned/max), ili null kad kategorija nije bodovana. */
function categoryPct(cat: { earned: number; max: number } | undefined): number | null {
  if (!cat || !cat.max) return null;
  return Math.round((cat.earned / cat.max) * 100);
}

/** Ishod ponovne analize; odlucuje sto se nudi kao GLAVNO preuzimanje. */
export interface RecheckVerdict {
  /** Ponovna analiza nije uspjela (ili je nema): isporuci popravljeni uz napomenu. */
  unavailable: boolean;
  /** Broj provjera koje su prije prolazile, a sada ne prolaze. */
  regressions: number;
}

/**
 * Ponovna analiza POPRAVLJENIH bajtova istim profilom: "spremnost prije -> poslije".
 * Read-only (ne pise u povijest). Nikad ne baca.
 *
 * Od 2026-08-16 se izvodi PRIJE isporuke i vraca verdikt, jer o njemu ovisi sto je glavna
 * ponuda za preuzimanje (vidi `renderDelivery`).
 */
async function renderRecheck(el: HTMLElement, bytes: Uint8Array, ctx: RepairPanelContext): Promise<RecheckVerdict> {
  const before = ctx.beforeScore;
  const reanalyze = ctx.reanalyze;
  if (!reanalyze || !before) return { unavailable: true, regressions: 0 }; // lokalni const: narrowing prezivi await ispod
  const pending = document.createElement('p');
  pending.className = 'lekta-repair-panel__recheck-pending';
  pending.textContent = 'Računam spremnost popravljenog dokumenta...';
  el.appendChild(pending);

  let after: RepairScoreSnapshot | null = null;
  let failed = false;
  try {
    after = await reanalyze(bytes);
  } catch {
    failed = true; // analiza popravljenog nije uspjela (rijetko)
  }
  pending.remove();

  if (failed) {
    const note = document.createElement('p');
    note.textContent =
      'Novi rezultat nije bilo moguće izračunati, pa provjera popravljenog dokumenta ovaj put izostaje.';
    el.appendChild(note);
    return { unavailable: true, regressions: 0 };
  }
  if (after === null) {
    const note = document.createElement('p');
    note.textContent = 'Ovaj profil ne daje bodovnu ocjenu, pa se popravak prikazuje samo kao popis iznad.';
    el.appendChild(note);
    return { unavailable: true, regressions: 0 };
  }
  const box = buildBeforeAfter(before, after);
  const regressions = before.checks && after.checks ? detectPassRegressions(before.checks, after.checks) : [];
  const regression = buildRegressionWarning(regressions);
  // Regresija ide ODMAH iza retka sa score-om: u zbroju se pad pojedine provjere ne vidi
  // (+6 na marginama i -3 na fusnotama izgleda kao cist +3), pa mora imati vlastito mjesto.
  if (regression) box.insertBefore(regression, box.firstChild?.nextSibling ?? null);
  el.appendChild(box);
  return { unavailable: false, regressions: regressions.length };
}

/**
 * Isporuka nakon ponovne analize: sto se nudi kao GLAVNO preuzimanje.
 *
 * Do 2026-08-16 se popravljeni dokument preuzimao automatski PRIJE ponovne analize, pa je
 * regresirani dokument vec bio u Preuzimanjima dok mu je upozorenje tek stizalo na ekran. Sada
 * odluka dolazi nakon dokaza:
 *  - bez regresije    -> glavni gumb je popravljeni dokument (kao i prije, samo eksplicitno),
 *  - s regresijom     -> glavni gumb je IZVORNI dokument, popravljeni ostaje kao sporedan izbor,
 *  - provjera pala    -> glavni gumb je popravljeni, uz napomenu da provjera nije uspjela.
 *
 * Preuzimanje je namjerno gumb, a ne automatski `triggerDownload`: nakon `await` ponovne analize
 * programski download vise nije u korisnickoj gesti, pa ga preglednik moze blokirati (isti razlog
 * vec je dokumentiran na serverskom putu u app.ts).
 */
function renderDelivery(el: HTMLElement, repaired: Uint8Array, verdict: RecheckVerdict, ctx: RepairPanelContext): void {
  const box = document.createElement('div');
  box.className = 'lekta-repair-panel__delivery';
  const regressed = verdict.regressions > 0;

  if (regressed) {
    const lead = document.createElement('p');
    lead.innerHTML =
      '<strong>Popravljeni dokument nije ponuđen kao glavni.</strong> Popravak je tehnički ispravan, ali je srušio provjeru koja je prije prolazila (popis iznad). Preporučujemo izvorni dokument dok to ne razriješiš.';
    box.appendChild(lead);
  } else if (verdict.unavailable) {
    const lead = document.createElement('p');
    lead.textContent = 'Popravak je gotov. Provjeru popravljenog dokumenta nije bilo moguće izvesti, pa je preuzmi i provjeri ručno.';
    box.appendChild(lead);
  }

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'btn btn-primary';
  const secondary = document.createElement('button');
  secondary.type = 'button';
  secondary.className = 'btn btn-secondary btn-sm';

  const downloadRepaired = () => triggerDownload(repaired, buildFixedFileName(ctx.originalFileName));
  const downloadOriginal = async () => {
    try {
      triggerDownload(await ctx.getDocxBytes(), ctx.originalFileName);
    } catch (err) {
      console.error('Preuzimanje izvornog dokumenta:', err);
    }
  };

  if (regressed) {
    primary.textContent = 'Preuzmi izvorni dokument';
    primary.onclick = downloadOriginal;
    secondary.textContent = 'Ipak preuzmi popravljeni';
    secondary.onclick = downloadRepaired;
  } else {
    primary.textContent = 'Preuzmi popravljeni dokument';
    primary.onclick = downloadRepaired;
    secondary.textContent = 'Preuzmi izvorni dokument';
    secondary.onclick = downloadOriginal;
  }
  box.append(primary, secondary);
  el.appendChild(box);
}

/**
 * Provjere koje su prije popravka prolazile, a sada ne prolaze.
 *
 * SAMO prikaz popisa: izbor izmedju izvornog i popravljenog dokumenta zivi u `renderDelivery`,
 * koji se izvodi nakon ponovne analize. Prije je ovaj blok nosio vlastiti gumb "Preuzmi izvorni
 * dokument", ali je tada bio jedini izlaz jer se popravljeni vec automatski preuzeo.
 */
function buildRegressionWarning(regressions: ReturnType<typeof detectPassRegressions>): HTMLElement | null {
  if (regressions.length === 0) return null;

  const box = document.createElement('div');
  box.className = 'lekta-repair-panel__regression';
  const head = document.createElement('p');
  head.innerHTML = `<strong>Pozor: ${regressions.length === 1 ? 'jedna provjera koja je prije prolazila sada ne prolazi' : `${regressions.length} provjere koje su prije prolazile sada ne prolaze`}.</strong>`;
  box.appendChild(head);
  const ul = document.createElement('ul');
  for (const item of regressions) {
    const li = document.createElement('li');
    li.textContent = item.after ? `${item.title} (sada: ${item.after})` : `${item.title} (provjere više nema u rezultatu)`;
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

/**
 * Kad popravljeni dokument NE dosegne 100 SAMO zato sto preostale bodovane provjere trazes
 * sadrzajnu (rucnu) prosudbu koju alat namjerno ne smije automatski mijenjati (repairCeiling),
 * jasno reci da je to maksimum koji automatski popravak moze jamciti - a ne nedovrsen popravak.
 * Ako jos ima auto/assisted-popravljivih stavki (after.score < strop), NE prikazuje se ova
 * poruka jer bi tvrdnja "ovo je maksimum" bila netocna.
 */
function buildRepairCeilingNote(after: RepairScoreSnapshot): HTMLElement | null {
  if (after.score == null || after.score >= 100 || !after.checks) return null;
  const ceiling = repairCeiling(after.checks);
  if (!ceiling.hasManualGap || after.score !== ceiling.maxScore) return null;

  const box = document.createElement('div');
  box.className = 'lekta-repair-panel__ceiling';
  const p = document.createElement('p');
  p.innerHTML = `<strong>${after.score}/100 je maksimalna ocjena koju automatski popravak može jamčiti</strong> za ovaj profil. Preostale stavke traže tvoju sadržajnu provjeru - alat ih namjerno ne smije mijenjati bez tebe:`;
  box.appendChild(p);
  const ul = document.createElement('ul');
  for (const item of ceiling.items) {
    const li = document.createElement('li');
    li.textContent = `${item.title} (−${item.lostPoints})`;
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

function buildBeforeAfter(before: RepairScoreSnapshot, after: RepairScoreSnapshot): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'lekta-repair-panel__recheck';

  if (before.score == null || after.score == null) {
    const p = document.createElement('p');
    p.textContent = 'Ovaj profil ne daje bodovnu ocjenu, pa se popravak prikazuje samo kao popis iznad.';
    wrap.appendChild(p);
    return wrap;
  }

  const delta = after.score - before.score;
  const deltaTxt = delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : '';
  const head = document.createElement('p');
  head.innerHTML = `<strong>Spremnost: ${before.score} &rarr; ${after.score}${escapeHtml(deltaTxt)}</strong>`;
  wrap.appendChild(head);

  const ceilingNote = buildRepairCeilingNote(after);
  if (ceilingNote) wrap.appendChild(ceilingNote);

  const keys = Object.keys(CATEGORY_LABELS).filter(
    (k) => categoryPct(before.categories?.[k]) != null || categoryPct(after.categories?.[k]) != null,
  );
  if (keys.length) {
    const ul = document.createElement('ul');
    for (const k of keys) {
      const b = categoryPct(before.categories?.[k]);
      const a = categoryPct(after.categories?.[k]);
      const li = document.createElement('li');
      li.textContent = `${CATEGORY_LABELS[k]}: ${b ?? '-'}% → ${a ?? '-'}%`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

/**
 * Popravak je zaustavljen na vratima integriteta (applyFixers.detectIntegrityFailure): izlazni
 * paket ne bi bio ispravan pa se NE isporucuje. Poruka mora biti jasno drukcija od "vec je
 * uskladjeno", inace alat prikriva vlastiti kvar kao uredan rad. Tehnicki detalj (dio + opis)
 * ostaje vidljiv jer je jedina korisna stvar koju korisnik moze proslijediti u prijavi.
 */
function renderIntegrityFailure(
  el: HTMLElement,
  failure: { part: string; problem: string; preexisting?: boolean },
): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Popravak nije isporučen jer rezultat nije prošao provjeru ispravnosti.</strong>
    <p>Tvoj dokument nije mijenjan i ništa nije naplaćeno.${failure.preexisting
      ? ' Neispravan dio postojao je već u učitanoj datoteci, pa za rezultat popravka ne možemo jamčiti. Pokušaj dokument prvo otvoriti i ponovno spremiti u Wordu.'
      : ' Ovo je greška na našoj strani, ne u tvom radu.'}</p>
    <p class="muted">Tehnički detalj: ${escapeHtml(failure.part)} - ${escapeHtml(failure.problem)}</p>
    <p>Ručne upute iznad i dalje vrijede.</p>
  `;
}

function renderNothingApplied(el: HTMLElement, alreadyOk: string[], cannotFix: string[]): void {
  el.hidden = false;
  // RE-36: kad je SVE odabrano vec uskladjeno, "nista nije primijenjeno" izgleda kao kvar iako je
  // rad uredan; naslov se preokrene u pozitivnu poruku samo u tom slucaju.
  const allAlreadyOk = alreadyOk.length > 0 && cannotFix.length === 0;
  el.innerHTML = `
    <strong>${allAlreadyOk ? 'Odabrano je već usklađeno, nije bilo potrebno ništa mijenjati.' : 'Nijedan odabrani popravak nije bilo moguće automatski primijeniti.'}</strong>
    ${alreadyOk.length ? `<p>Već usklađeno: ${alreadyOk.map(escapeHtml).join(', ')}.</p>` : ''}
    ${cannotFix.length ? `<p>Nije bilo moguće automatski primijeniti: ${cannotFix.map(escapeHtml).join(', ')}.</p>` : ''}
    <p>Dokument nije mijenjan. Ručne upute iznad i dalje vrijede.</p>
  `;
}

function buildFixedFileName(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  if (dotIdx === -1) return `${originalName}-popravljeno`;
  return `${originalName.slice(0, dotIdx)}-popravljeno${originalName.slice(dotIdx)}`;
}

function triggerDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Odgodjena revokacija kao downloadBlob u app.ts: sinkroni revoke zna
  // povremeno prekinuti download u nekim preglednicima.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
