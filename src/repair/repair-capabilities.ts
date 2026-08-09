/**
 * SPOSOBNOSTI POPRAVKA: koje bodovane provjere koji fixer moze dovesti do maxa.
 *
 * Zasto zaseban modul, a ne polje u `repair-surface.ts`: `src/analysis/check-fixer-map.ts` (koji
 * ovo cita) vrti se u analitickoj jezgri i Web Workeru i namjerno NEMA runtime ovisnost o
 * `src/repair/*` (zip-codec povlaci CompressionStream). `repair-surface.ts` uvozi `FIXER_IDS` kao
 * VRIJEDNOST, pa bi uvoz iz njega povukao cijeli repair graf. Ovdje je `FixerId` samo TIP, pa
 * modul ostaje cist podatak.
 *
 * `Record<FixerId, ...>` je jaci od `satisfies`: nov fixer ne moze proci bez unosa ovdje, pa
 * sposobnost ne moze tiho zaostati za motorom. Bas je taj drift bio kvar koji se ovime zatvara:
 * `check-fixer-map.ts` je poznavao 14 od 31 fixera, pa je `repairCeiling` bodove za koje POSTOJI
 * zivi popravak proglasavao trajno izgubljenima i obecavao nizi maksimum nego sto je stvaran.
 */
import type { FixerId } from './apply-fixers';

/** Trazi li popravak izricitu potvrdu korisnika (izvedeno iz `requiresConfirmation` u repair-items). */
export type RepairMode = 'safe-auto' | 'confirm';

export interface FixerCapability {
  /**
   * Kanonski `Check.id`-evi (`src/scoring/check-ids.ts`) koje fixer moze dovesti do maxa.
   *
   * SPOSOBNOST, ne pravo na bodove: profil i dalje odlucuje boduje li se pravilo uopce.
   * Prazno znaci "ne cilja nijednu BODOVANU provjeru" - npr. final-document-inspector i
   * consistency rade nad nalazima (`Komentari`, `Dosljednost`) koji NISU emitirane provjere.
   *
   * Popunjeno iskljucivo iz dokaza: `matchKeys` u repair-items, presjeceno s inventarom stvarno
   * emitiranih naslova. Naslov iz matchKeys koji nije emitirana provjera namjerno je izostavljen
   * (npr. section-surgery ima 'Numeriranje stranica' i 'Sekcije', a nijedno nije provjera).
   * Precijenjen strop obecava bodove koje popravak ne moze isporuciti, sto je gora greska od
   * podcjenjivanja.
   */
  checkIds: readonly string[];
  mode: RepairMode;
  /** Komplementaran put za ISTI nalaz; nikad se ne nude oba (npr. ovisno o broju sekcija). */
  alternativeOf?: FixerId;
}

export const FIXER_CAPABILITIES: Record<FixerId, FixerCapability> = {
  'margins-fixer': { checkIds: ['page.margins'], mode: 'safe-auto' },
  'paper-size-fixer': { checkIds: ['page.size.a4', 'page.size.a4-list', 'page.size.project'], mode: 'safe-auto' },
  'font-fixer': { checkIds: ['format.font.dominant', 'format.size.body'], mode: 'safe-auto' },
  'line-spacing-fixer': { checkIds: ['format.spacing.body'], mode: 'safe-auto' },
  'alignment-fixer': { checkIds: ['format.justify.body'], mode: 'safe-auto' },
  'paragraph-spacing-fixer': { checkIds: ['format.spacing.paragraph'], mode: 'safe-auto' },
  'page-numbering-fixer': { checkIds: ['page.numbers.start', 'page.numbers.scheme'], mode: 'safe-auto' },
  'footer-page-fixer': { checkIds: [], mode: 'safe-auto' },
  'section-insert-fixer': { checkIds: ['page.numbers.start', 'page.numbers.scheme'], mode: 'confirm', alternativeOf: 'page-numbering-fixer' },
  'empty-paragraph-fixer': { checkIds: ['element.empty-paragraphs'], mode: 'safe-auto' },
  'footnote-spacing-fixer': { checkIds: ['footnote.spacing'], mode: 'safe-auto' },
  'page-number-alignment-fixer': { checkIds: ['page.numbers.position'], mode: 'safe-auto' },
  'toc-field-fixer': { checkIds: ['toc.present', 'toc.field'], mode: 'safe-auto' },
  'heading-format-fixer': { checkIds: ['structure.heading.format'], mode: 'safe-auto' },
  'heading-style-fixer': { checkIds: ['structure.heading.word-styles', 'structure.heading.hierarchy'], mode: 'confirm' },
  'title-page-fixer': { checkIds: ['title.elements', 'title.order'], mode: 'confirm' },
  'footnote-typography-fixer': { checkIds: ['footnote.format'], mode: 'safe-auto' },
  'heading-case-fixer': { checkIds: ['structure.heading.format'], mode: 'confirm' },
  'element-caption-fixer': { checkIds: ['element.table.caption', 'element.figure.caption', 'element.source', 'element.lists'], mode: 'confirm' },
  'bibliography-repair-fixer': { checkIds: ['reference.completeness', 'citation.author-year.missing-reference', 'reference.uncited', 'reference.alphabetical', 'citation.author-year.suffix'], mode: 'confirm' },
  'citation-bibliography-sync-fixer': { checkIds: ['citation.author-year.missing-reference', 'reference.uncited', 'citation.direct-quote-locator', 'citation.author-year.suffix'], mode: 'confirm' },
  'legal-footnote-repair-fixer': { checkIds: ['legal.footnotes-present', 'legal.opcit', 'legal.ibid', 'legal.act-abbrev', 'legal.footnote-bibliography'], mode: 'confirm' },
  'final-document-inspector-fixer': { checkIds: [], mode: 'confirm' },
  // 'element.link-form' NAMJERNO izostavljen iako je u matchKeys: poveznice popravlja link-doi-fixer,
  // a ovaj radi spas tablica i slika. Dvostruka tvrdnja samo bi krivom fixeru pripisala nalaz.
  'table-figure-rescue-fixer': { checkIds: ['element.lists'], mode: 'confirm' },
  'section-surgery-fixer': { checkIds: ['page.margins'], mode: 'confirm' },
  // Prazno unatoc matchKeys ['Sadrzaj','Word polja','Cross-reference','Brojevi stranica']: to su
  // nazivi NALAZA o integritetu Word polja, ne obecanje da ce dokument dobiti brojeve stranica
  // (to radi footer-page-fixer). Slab dokaz ne smije podici obecani strop.
  'field-integrity-fixer': { checkIds: [], mode: 'safe-auto' },
  'croatian-typography-fixer': { checkIds: ['format.typography.consistency'], mode: 'confirm' },
  'consistency-fixer': { checkIds: [], mode: 'confirm' },
  'required-section-fixer': { checkIds: ['structure.sections.profile'], mode: 'confirm' },
  'link-doi-fixer': { checkIds: ['element.link-form'], mode: 'confirm' },
  'submission-metadata-fixer': { checkIds: [], mode: 'confirm' },
};

/**
 * checkId -> najbolji dostupan popravak. Kad istu provjeru cilja vise fixera, pobjedjuje
 * `safe-auto` (postoji put bez potvrde); inace prvi `confirm`. Deterministicno je jer se
 * iterira po redoslijedu kljuceva u `FIXER_CAPABILITIES`.
 */
export const FIXER_BY_CHECK_ID: ReadonlyMap<string, { fixerId: FixerId; mode: RepairMode }> = (() => {
  const out = new Map<string, { fixerId: FixerId; mode: RepairMode }>();
  for (const [fixerId, cap] of Object.entries(FIXER_CAPABILITIES) as Array<[FixerId, FixerCapability]>) {
    for (const checkId of cap.checkIds) {
      const current = out.get(checkId);
      if (!current || (current.mode === 'confirm' && cap.mode === 'safe-auto')) {
        out.set(checkId, { fixerId, mode: cap.mode });
      }
    }
  }
  return out;
})();
