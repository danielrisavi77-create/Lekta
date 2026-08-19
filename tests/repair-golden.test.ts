/**
 * Golden harness za Repair Engine (pipeline korak K2; CLAUDE.md "Parser: ne diraj
 * bez golden testa"). Repair engine je do sada imao samo jedinicne testove; ovaj
 * harness snima BASELINE ponasanja svih fixera nad realnim i sintetickim .docx
 * dokumentima, pa je OBAVEZAN GATE prije svakog novog fixera (K4-K6) i svake
 * izmjene postojecih: ako se ponasanje bilo kojeg fixera promijeni, snapshot pada.
 *
 * Sto snima (deterministicki, stabilno, NE sirovi bajtovi):
 *   - params izvedeni IZ PROFILA (realni fixturi) ili fiksni (sinteticki),
 *   - applied / changelog (before -> after labeli) / skipped,
 *   - noOpBitIdentican: je li rezultat === ulaz (referencijalno; jamstvo koje
 *     applyFixers daje kad nijedan popravak nije primijenjen),
 *   - markeri izvuceni iz IZLAZNOG document.xml i styles.xml (docDefaults, Normal,
 *     sve sectPr sekcije, brojaci izravnog formatiranja) da se uhvate XML regresije
 *     koje se ne vide u changelog labelima.
 *
 * Tvrdi invarijanti (osim snapshota):
 *   - idempotencija: ponovna primjena istog popravka na vlastiti izlaz je no-op
 *     (bit-identicna), jer patchTagAttributes ne mijenja vec postignutu vrijednost.
 *   - bit-identican no-op: popravak koji nema sto promijeniti vraca ULAZNE bajtove.
 *
 * Kako snimiti/obnoviti baseline (vidi docs/GOLDEN.md): npm test -- -u
 *   (snapshot se smije mijenjati SAMO uz svjesnu, recenziranu promjenu ponasanja).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { applyFixers, FIXER_IDS, type FixerId, type FixerRequest } from '../src/repair/apply-fixers';
import { readZip } from '../src/repair/zip-codec';
import {
  paramsForCheck,
  headingFormatRepairableItem,
  headingCaseRepairableItem,
  footnoteTypographyRepairableItem,
  pageNumberAlignmentRepairableItem,
  bibliographyRepairableItem,
  citationBibliographySyncRepairableItem,
  consistencyRepairableItem,
  croatianTypographyRepairableItem,
  elementCaptionRepairableItem,
  fieldIntegrityRepairableItem,
  finalDocumentInspectorRepairableItem,
  headingStructureRepairableItem,
  introSectionRepairableItem,
  legalFootnoteRepairableItem,
  linkDoiRepairableItem,
  pageNumberingRepairableItem,
  requiredSectionsRepairableItem,
  sectionSurgeryRepairableItem,
  tableFigureRescueRepairableItem,
  titlePageRepairableItem,
  tocFieldRepairableItem,
} from '../src/ui/repair-items';
import type { RepairableItem } from '../src/ui/repair-panel';
import { confirmedParamsFor } from './helpers/confirm-repair-form';
import { repairEntriesFor , ensureRepairMapHeavy } from '../src/profiles/profile-runtime-maps';

// repair-map je lijen; ucitaj ga prije prvog repairEntriesFor u ovom modulu.
await ensureRepairMapHeavy();
import { ensureTemplatesHeavy, selectTemplate } from '../src/title-pages/template-loader';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { assertPackageIntact } from './helpers/docx-package-assert';
import { singleSectionDocx, multiSectionDocx } from './helpers/synthetic-docx';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set<FixerId>([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'footnote-spacing-fixer',
]);

// Fiksni ciljevi za sinteticke dokumente (bez profila). Namjerno se razlikuju od
// polaznih vrijednosti u synthetic-docx.ts da svaki fixer STVARNO primijeni izmjenu
// (osim gdje testiramo no-op putanju eksplicitno).
const SYNTHETIC_PARAMS: Record<FixerId, Record<string, unknown>> = {
  'margins-fixer': { top: 3.0, right: 3.0, bottom: 3.0, left: 3.0 },
  'paper-size-fixer': { w: 21.0, h: 29.7 },
  'font-fixer': { fontName: 'Times New Roman', fontSizePt: 12 },
  'line-spacing-fixer': { multiplier: 1.5 },
  'alignment-fixer': { val: 'both' },
  // paragraphSpacingFixer ne uzima ciljane vrijednosti (uvijek gadja 0/0), pa je jedini
  // "param" opcionalni deep flag koji withDeep() dodaje; prazan objekt ovdje samo osigurava
  // da FixerRequest.params nikad nije undefined (runFixer cita p.deep bez null-guarda).
  'paragraph-spacing-fixer': {},
  // pageNumberingFixer uzima targets ovisne O DOKUMENTU (koje su sekcije rimske, koja prva
  // glavna), pa fiksni map ne moze posluziti oba sinteticka dokumenta. Prazni targets =
  // bit-identican no-op (jedini smislen fiksni default; idempotencijski test nad
  // single-section dokumentom ga zato preskace). buildCases per-dokument override daje prave
  // targete multi-section dokumentu.
  'page-numbering-fixer': { targets: [] },
  // footerPageFixer umece podnozje u ciljanu sekciju. Default sekcija 0 (single-section
  // dokument); buildCases per-dokument override cilja glavnu sekciju multi-section dokumenta.
  'footer-page-fixer': { target: { sectionIndex: 0, align: 'right' } },
  // Isti obrazac kao paragraph-spacing-fixer (uvijek gadja 0/0 u FootnoteText stilu), samo
  // nad word/footnotes.xml; sinteticki dokumenti nemaju fusnote pa footnoteSpacingFixer ovdje
  // uvijek zavrsi kao no-op (parts.footnotesXml je undefined), sto je ocekivano i pokriveno.
  'footnote-spacing-fixer': {},
  // pageNumberAlignmentFixer bez params.align defaultira na "right" (RE-04), a sinteticki
  // dokumenti nemaju footer/header partove pa uvijek zavrsi kao no-op (parts.footerHeaderParts
  // je prazna mapa), sto je ocekivano i pokriveno (isti obrazac kao footnote-spacing-fixer).
  'page-number-alignment-fixer': {},
  // sectionInsertFixer umece prijelom prije Uvoda (odlomak 2 u OBA sinteticka dokumenta).
  // Single-section: primijeni (nema splita) -> 2 sekcije + rimski/arapski + footer + titlePg.
  // Multi-section: NO_OP (odlomak prije Uvoda vec nosi sectPr = prijelom vec postoji).
  'section-insert-fixer': { target: { introParagraphIndex: 2, align: 'center' } },
  // tocFieldFixer RE-DERIVIRA sidro po tekstu naslova "Sadrzaj" (ne po indeksu). Sinteticki docx
  // (singleSection/multiSection) NEMAJU naslov Sadrzaj pa je ovdje bit-identican NO_OP; umetanje
  // TOC polja pokriveno je jedinicno u src/repair/toc-field.test.ts (nad tocManualDocx). Index je
  // samo gate signal. Prazan/nepostojeci Sadrzaj -> NO_OP je ocekivano i pokriveno.
  'toc-field-fixer': { target: { sadrzajParagraphIndex: 1 } },
  // emptyParagraphFixer je univerzalna higijena (nije vezan za profilnu vrijednost, vidi
  // universalRepairableItems u repair-items.ts: params je uvijek {}). Sinteticki dokumenti nemaju
  // osirotjele prazne odlomke pa je ovdje bit-identican no-op (isti obrazac kao paragraph-spacing).
  'empty-paragraph-fixer': {},
  // headingFormatFixer cilja POSTOJECI stil HeadingN u styles.xml (patchHeadingFormat ne izmislja
  // stil). Sinteticki STYLES_XML ne definira Heading1 pa je ovdje bit-identican no-op; stvarna
  // primjena je jedinicno pokrivena u src/repair/xml-patch.test.ts (patchHeadingFormat).
  'heading-format-fixer': { targets: [{ level: 1, sizeHalfPoints: 32, bold: true }] },
  'heading-style-fixer': { targets: [{ paragraphIndex: 1, level: 1 }] },
  // footnoteTypographyFixer trazi word/footnotes.xml (isti gard kao footnote-spacing-fixer) i stil
  // FootnoteText; sinteticki dokumenti nemaju fusnote pa je ovdje uvijek bit-identican no-op.
  'footnote-typography-fixer': { fontName: 'Times New Roman', fontSizePt: 10 },
  // headingCaseFixer cilja doslovni pStyle="Heading1" (RE-08, jos neizmijenjeno u Fazi 0/1). Oba
  // sinteticka dokumenta imaju odlomak "Uvod" s pStyle Heading1 pa se STVARNO primjenjuje.
  'heading-case-fixer': { levels: [1] },
};

/** Ciljani params po fixeru IZ PROFILA (isti izvor kao zivi repair-items.ts). */
function paramsForFixer(fixerId: FixerId, profile: unknown): Record<string, unknown> | null {
  switch (fixerId) {
    case 'margins-fixer':
      return paramsForCheck('margins', profile);
    case 'paper-size-fixer':
      return paramsForCheck('paper-size', profile);
    case 'font-fixer': {
      const f = paramsForCheck('font', profile);
      const s = paramsForCheck('font-size', profile);
      return f || s ? { ...(f || {}), ...(s || {}) } : null;
    }
    case 'line-spacing-fixer':
      return paramsForCheck('line-spacing', profile);
    case 'alignment-fixer':
      return paramsForCheck('justify', profile);
    case 'paragraph-spacing-fixer':
      // Nema paramsForCheck ekvivalent: paragraphSpacingFixer nije ciljan profilnom
      // vrijednoscu vec profilnom zastavicom (isto gate kao paragraphSpacingRepairableItem
      // u src/ui/repair-items.ts), a njegov stvarni cilj je uvijek fiksno 0/0.
      return (profile as { checkParagraphSpacingZero?: boolean } | null)?.checkParagraphSpacingZero === true
        ? {}
        : null;
    case 'footnote-spacing-fixer':
      // Isto gate kao footnoteSpacingRepairableItem u src/ui/repair-items.ts: zastavica, ne
      // ciljana profilna vrijednost (cilj je uvijek fiksno 0/0 u FootnoteText stilu).
      return (profile as { checkFootnoteParagraphSpacingZero?: boolean } | null)
        ?.checkFootnoteParagraphSpacingZero === true
        ? {}
        : null;
    case 'page-number-alignment-fixer': {
      // Prije je ovdje stajala rucna kopija gatea `pageNumberAlignment === true`, koja se u
      // medjuvremenu razisla sa zivim panelom: RE-05 je gate prebacio na truthy, a STRING
      // vrijednost ('right') od tada ide u params.align. Profili koji to pravilo imaju nose
      // upravo string, pa je golden za njih vracao null i fixer nikad nije dobio cilj.
      // Otad se cita isti builder koji koristi panel, kao i za heading-format/heading-case.
      const item = pageNumberAlignmentRepairableItem([], profile)[0];
      return item ? (item.params as Record<string, unknown>) : null;
    }
    case 'empty-paragraph-fixer':
      // Univerzalna higijena (universalRepairableItems): nije vezana za profil, params je uvijek {}.
      return {};
    case 'heading-format-fixer': {
      // ISTI izvor kao zivi panel (repair-items.ts): checks se ovdje ne racuna (utjece samo na
      // violated, ne na params), pa je prazan niz dovoljan da se izvuku ciljane params vrijednosti.
      const item = headingFormatRepairableItem([], profile)[0];
      return item ? (item.params as Record<string, unknown>) : null;
    }
    case 'footnote-typography-fixer': {
      const item = footnoteTypographyRepairableItem([], profile)[0];
      return item ? (item.params as Record<string, unknown>) : null;
    }
    case 'heading-case-fixer': {
      const item = headingCaseRepairableItem([], profile)[0];
      return item ? (item.params as Record<string, unknown>) : null;
    }
    default:
      return null;
  }
}

/** params + deep zastavica za deep-capable fixere (kao repair-panel.ts). */
function withDeep(fixerId: FixerId, params: Record<string, unknown>, deep: boolean): Record<string, unknown> {
  return deep && DEEP_CAPABLE.has(fixerId) ? { ...params, deep: true } : params;
}

// === Izvlacenje stabilnih markera iz izlaznog docx-a ===

function attr(tag: string | undefined, name: string): string | null {
  if (!tag) return null;
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function firstTag(xml: string, tagName: string): string | undefined {
  return xml.match(new RegExp(`<${tagName}\\b[^>]*/?>`))?.[0];
}

function docDefaultsMarkers(stylesXml: string) {
  const dd = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? '';
  const rFonts = firstTag(dd, 'w:rFonts');
  const sz = firstTag(dd, 'w:sz');
  return { ascii: attr(rFonts, 'w:ascii'), hAnsi: attr(rFonts, 'w:hAnsi'), sz: attr(sz, 'w:val') };
}

function normalStyleMarkers(stylesXml: string) {
  const normal = stylesXml.match(/<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>/)?.[0] ?? '';
  const pPr = normal.replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/, '');
  const spacing = firstTag(pPr, 'w:spacing');
  const jc = firstTag(pPr, 'w:jc');
  return { line: attr(spacing, 'w:line'), lineRule: attr(spacing, 'w:lineRule'), jc: attr(jc, 'w:val') };
}

function sectPrMarkers(documentXml: string) {
  const sects = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];
  return sects.map((s) => {
    const pgSz = firstTag(s, 'w:pgSz');
    const pgMar = firstTag(s, 'w:pgMar');
    const pgNum = firstTag(s, 'w:pgNumType');
    return {
      pgSz: pgSz ? { w: attr(pgSz, 'w:w'), h: attr(pgSz, 'w:h') } : null,
      pgMar: pgMar
        ? {
            top: attr(pgMar, 'w:top'),
            right: attr(pgMar, 'w:right'),
            bottom: attr(pgMar, 'w:bottom'),
            left: attr(pgMar, 'w:left'),
          }
        : null,
      pgNumType: pgNum ? { fmt: attr(pgNum, 'w:fmt'), start: attr(pgNum, 'w:start') } : null,
      // K6: titlePg (naslovnica = drukcija prva stranica -> bez broja). Lockamo ga u golden
      // da regresija u suzbijanju naslovnice padne snapshot.
      titlePg: /<w:titlePg\b/.test(s),
    };
  });
}

/** Brojaci IZRAVNOG formatiranja u tijelu (mjeri ucinak deep ciscenja). */
function directFormattingCounts(documentXml: string) {
  const body = documentXml.match(/<w:body>[\s\S]*<\/w:body>/)?.[0] ?? documentXml;
  return {
    runFonts: (body.match(/<w:rFonts\b[^>]*w:ascii=/g) ?? []).length,
    runSz: (body.match(/<w:sz\b[^>]*w:val=/g) ?? []).length,
    directLine: (body.match(/<w:spacing\b[^>]*w:line=/g) ?? []).length,
    directLeftJc: (body.match(/<w:jc\b[^>]*w:val="(left|start)"/g) ?? []).length,
  };
}

/** K5 footer flow: koje word/footerN.xml partove izlaz ima (+ imaju li PAGE polje) i koliko je
 *  footerReference oznaka u document.xml. Prazno {parts:[],footerRefs:0} za sve fixere osim footera. */
function footerMarkers(entries: { name: string; data: Uint8Array }[], documentXml: string) {
  const dec = new TextDecoder();
  const parts = entries
    .filter((e) => /^word\/footer\d+\.xml$/.test(e.name))
    .map((e) => ({ name: e.name, hasPage: /\bPAGE\b/.test(dec.decode(e.data)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { parts, footerRefs: (documentXml.match(/<w:footerReference\b/g) ?? []).length };
}

async function extractMarkers(bytes: Uint8Array) {
  const entries = await readZip(bytes);
  const dec = new TextDecoder();
  const doc = entries.find((e) => e.name === 'word/document.xml');
  const styles = entries.find((e) => e.name === 'word/styles.xml');
  const documentXml = doc ? dec.decode(doc.data) : '';
  const stylesXml = styles ? dec.decode(styles.data) : '';
  return {
    docDefaults: docDefaultsMarkers(stylesXml),
    normal: normalStyleMarkers(stylesXml),
    sectPr: sectPrMarkers(documentXml),
    directFormatting: directFormattingCounts(documentXml),
    footer: footerMarkers(entries, documentXml),
  };
}

// === Fixture izvori ===

function discoverRealFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR)
    .filter((n) => n.toLowerCase().endsWith('.docx'))
    .sort();
}

function fixtureProfileId(fileName: string): string | undefined {
  const sidecar = join(FIXTURE_DIR, fileName.replace(/\.docx$/i, '.json'));
  if (!existsSync(sidecar)) return undefined;
  try {
    const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
    return typeof meta.profileId === 'string' ? meta.profileId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * B0: params za ASISTIRANE fixere izvedeni IZ ANALIZE dokumenta, ne iz profila.
 *
 * Zasto je ovo trebalo: paramsForFixer iznad ima `default: return null`, a SYNTHETIC_PARAMS ne
 * sadrzi ovih 18 fixera, pa je snapshot za njih zapisivao "nema-cilja-u-profilu" nad SVAKIM
 * dokumentom. Poruka je bila zavaravajuca: profil s tim nema veze, harness ih jednostavno nije
 * znao izgraditi. Mjereno na baselineu: 18 od 31 fixera nije imalo NIJEDNU stvarnu primjenu,
 * a 14 ih nije bilo ni ponudjeno.
 *
 * Njihovi params ovise o dokumentu (fingerprinti odlomaka, ID-jevi polja, indeksi sekcija), pa
 * ih fiksni map principijelno ne moze pokriti. Isti put koji koristi zivi panel (src/ui/app.ts)
 * i closed-loop harness: analiziraj dokument pa iz rezultata izvuci RepairableItem.
 */
function unitIdForProfile(profileId: string): string | undefined {
  const entry = (VERIFIED_PROFILE_REGISTRY as Array<{ id?: string; unitId?: string }>).find((item) => item.id === profileId);
  return entry?.unitId;
}

const ASSISTED_BUILDERS: Partial<Record<FixerId, (result: any, profile: any) => Array<{ params: unknown }>>> = {
  'bibliography-repair-fixer': (r, p) => bibliographyRepairableItem(r, p),
  'citation-bibliography-sync-fixer': (r, p) => citationBibliographySyncRepairableItem(r, p),
  'consistency-fixer': (r) => consistencyRepairableItem(r),
  'croatian-typography-fixer': (r) => croatianTypographyRepairableItem(r),
  'element-caption-fixer': (r, p) => elementCaptionRepairableItem(r, p),
  'field-integrity-fixer': (r) => fieldIntegrityRepairableItem(r),
  'final-document-inspector-fixer': (r) => finalDocumentInspectorRepairableItem(r),
  'heading-style-fixer': (r, p) => headingStructureRepairableItem(r, p),
  'legal-footnote-repair-fixer': (r, p) => legalFootnoteRepairableItem(r, p),
  'link-doi-fixer': (r, p) => linkDoiRepairableItem(r, p),
  'page-numbering-fixer': (r, p) => pageNumberingRepairableItem(r, p),
  'required-section-fixer': (r, p) => requiredSectionsRepairableItem(r, p),
  'section-insert-fixer': (r, p) => introSectionRepairableItem(r, p),
  'section-surgery-fixer': (r, p) => sectionSurgeryRepairableItem(r, p),
  'table-figure-rescue-fixer': (r, p) => tableFigureRescueRepairableItem(r, p),
  // unitId dolazi iz registra profila, ne iz rezultata analize: analyzeFixture salje
  // selectionIds: {} pa bi selectTemplate(undefined) uvijek vratio null i naslovnica bi ostala
  // neprovjerena na SVIM dokumentima. Zivi app unit dobiva iz odabira u sucelju; ovdje je
  // ekvivalent citanje iz VERIFIED_PROFILE_REGISTRY, gdje polje ionako postoji.
  'title-page-fixer': (r, p) =>
    titlePageRepairableItem(
      r,
      p,
      selectTemplate(
        r?.settings?.selectionIds?.unit || r?.selection?.unit || unitIdForProfile(String((p as { definitionId?: unknown })?.definitionId ?? '')),
        r?.settings?.workType || r?.selection?.workType || 'final',
      ).template,
    ),
  'toc-field-fixer': (r, p) => tocFieldRepairableItem(r, p),
  // submission-metadata-fixer namjerno IZOSTAVLJEN: crossFileSubmissionRepairableItem trazi
  // result.details.crossFileSubmissionConsistency, koje gradi privatna funkcija u src/ui/app.ts
  // iz PDF-a predaje (drugi dokument). Golden ima samo .docx, pa bi grana uvijek bila prazna;
  // laznu granu koja nista ne moze naci ne treba dodavati. Pokriven je jedinicno.
};

function assistedParams(fixerId: FixerId, result: unknown, profile: unknown): Record<string, unknown> | null {
  const build = ASSISTED_BUILDERS[fixerId];
  if (!build) return null;
  const items = build(result, profile);
  return items.length > 0 ? (items[0].params as Record<string, unknown>) : null;
}

/**
 * Params kakve bi fixer dobio da je korisnik potvrdio sve ponudjeno u obrascu.
 *
 * Vecina asistiranih fixera dolazi s NEOZNACENIM stavkama, jer sucelje trazi potvrdu po stavci
 * prije nego dira dokument. Golden je zato za njih biljezio applied=false i nikad nije izvrtio
 * njihovu stvarnu granu. Ovdje se ta grana snima pod zasebnim kljucem `<fixerId>(potvrdjeno)`,
 * pa snapshot pokazuje OBOJE: sto proizvod radi bez potvrde i sto radi s njom.
 */
function confirmedAssistedParams(fixerId: FixerId, result: unknown, profile: unknown): Record<string, unknown> | null {
  const build = ASSISTED_BUILDERS[fixerId];
  if (!build) return null;
  const items = build(result, profile);
  return items.length > 0 ? confirmedParamsFor(items[0] as unknown as RepairableItem) : null;
}

interface Case {
  name: string;
  bytes: Uint8Array;
  paramsFor: (fixerId: FixerId) => Record<string, unknown> | null;
  /** Razlikuje "profil nema cilj" od "dokument nema sto popraviti" (samo za citljivost snapshota). */
  hasAnalysis?: boolean;
  /** Params uz simuliranu potvrdu svih stavki obrasca; null kad fixer nema obrazac. */
  confirmedParamsFor?: (fixerId: FixerId) => Record<string, unknown> | null;
}

async function buildCases(): Promise<Case[]> {
  // Predlosci naslovnice zive u LAZY heavy dijelu (template.elements je bez njega undefined).
  // Zivi app to radi u src/ui/app.ts prije poziva builderima; bez toga buildTitlePage baca.
  await ensureTemplatesHeavy();
  const cases: Case[] = [];
  for (const fileName of discoverRealFixtures()) {
    const profileId = fixtureProfileId(fileName);
    if (!profileId) continue;
    const profile = resolveProfile(profileId) as Record<string, unknown>;
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, fileName)));
    // BAKANI ruleEntries MORAJU biti na profilu PRIJE poziva asistiranih buildera: sedam ih
    // (element-caption, bibliography, citation-sync, legal-footnote, table-figure-rescue,
    // section-surgery, required-sections) cita profile.ruleEntries izravno. Bez ovoga bi grana
    // uvijek bila prazna, ma koliko podataka dokument imao. Isti wiring kao src/ui/app.ts.
    profile.ruleEntries = repairEntriesFor(profileId);
    const analyzed = await analyzeFixture(new File([bytes], fileName, { type: DOCX_MIME }), { profileId });
    cases.push({
      name: fileName,
      bytes,
      hasAnalysis: true,
      paramsFor: (id) => paramsForFixer(id, profile) ?? assistedParams(id, analyzed, profile),
      confirmedParamsFor: (id) => confirmedAssistedParams(id, analyzed, profile),
    });
  }
  // Multi-section: naslovnica (sekcija 0) -> rimski start=1, tijelo od Uvoda (sekcija 1) ->
  // arapski start=1. Isti targeti koje bi sectionNumberingTargets izracunao iz granice Uvoda.
  const multiTargets = [
    { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
    { sectionIndex: 1, fmt: 'decimal', start: 1 },
  ];
  cases.push({
    name: 'synthetic-single-section',
    bytes: await singleSectionDocx(),
    // Jedna sekcija = nema front/main split -> prazni targeti -> bit-identican no-op (kao ziva
    // putanja gdje sectionNumberingTargets vrati detectable:false pa se popravak ne nudi).
    paramsFor: (id) => (id === 'page-numbering-fixer' ? { targets: [] } : SYNTHETIC_PARAMS[id]),
  });
  cases.push({
    name: 'synthetic-multi-section',
    bytes: await multiSectionDocx(),
    // Footer u GLAVNU sekciju (index 1, od Uvoda); naslovnica (sekcija 0) ostaje bez broja.
    paramsFor: (id) =>
      id === 'page-numbering-fixer'
        ? { targets: multiTargets }
        : id === 'footer-page-fixer'
          ? { target: { sectionIndex: 1, align: 'right' } }
          : SYNTHETIC_PARAMS[id],
  });
  return cases;
}

/** Jedan popravak nad jednim dokumentom: strukturiran, deterministican rezultat. */
async function runOne(bytes: Uint8Array, request: FixerRequest) {
  const result = await applyFixers(bytes, request ? [request] : []);
  const applied = result.changelog.length > 0;
  return {
    request,
    result,
    snapshot: {
      applied,
      changelog: result.changelog.map((c) => ({ before: c.beforeLabel, after: c.afterLabel })),
      skipped: result.skipped,
      noOpBitIdentican: result.docxBytes === bytes,
      markers: applied ? await extractMarkers(result.docxBytes) : null,
    },
  };
}

describe('Repair golden harness', () => {
  it('baseline: svi fixeri x svi dokumenti (shallow + deep + kombinirano)', async () => {
    const cases = await buildCases();
    const out: Record<string, unknown> = {};

    for (const c of cases) {
      const perFixture: Record<string, unknown> = {};

      for (const fixerId of FIXER_IDS) {
        const params = c.paramsFor(fixerId);
        if (!params) {
          // Za analizirane dokumente razlog vise nije nuzno profil: asistirani fixer moze biti
          // ponudjen a ne naci cilj U DOKUMENTU. Snapshot to razlikuje da se ne cita krivo.
          perFixture[fixerId] =
            c.hasAnalysis && ASSISTED_BUILDERS[fixerId]
              ? { params: 'nema-stavke-za-ovaj-dokument' }
              : { params: 'nema-cilja-u-profilu' };
          continue;
        }
        // Shallow
        const shallow = await runOne(c.bytes, { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, false) });
        perFixture[fixerId] = { params, ...shallow.snapshot };

        // Deep (samo deep-capable)
        if (DEEP_CAPABLE.has(fixerId)) {
          const deep = await runOne(c.bytes, { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, true) });
          perFixture[`${fixerId}(deep)`] = { params: withDeep(fixerId, params, true), ...deep.snapshot };
        }

        // Potvrdjena grana: ono sto motor stvarno izvrsi kad korisnik u sucelju sve odobri.
        // Snima se samo kad se od zadanih params RAZLIKUJE, da snapshot ne raste bez potrebe.
        const confirmed = c.confirmedParamsFor?.(fixerId) ?? null;
        if (confirmed && JSON.stringify(confirmed) !== JSON.stringify(params)) {
          const run = await runOne(c.bytes, { ruleId: `${fixerId}-rule`, fixerId, params: confirmed });
          perFixture[`${fixerId}(potvrdjeno)`] = { params: confirmed, ...run.snapshot };
          // Potvrdjena grana izvodi i destruktivne operacije (brisanje komentara, prihvacanje
          // revizija, uklanjanje duplikata), pa bas nju treba drzati pod Tier 0 gateom. Ide kao
          // zasebna asercija, NIKAD kao polje u snapshotu.
          if (run.snapshot.applied) {
            await assertPackageIntact(c.bytes, run.result.docxBytes, `${c.name}: ${fixerId} (potvrdjeno)`, {
              // Isti legitiman slucaj kao u closed-loopu: cista kopija bez komentara mice i sam dio.
              allowDropped: ['word/comments.xml'],
            });
          }
        }
      }

      // Kombinirani "uskladi sve" prolaz: svi fixeri s ciljem odjednom (deep za capable),
      // dokazuje da se document.xml (deep) i styles.xml (stilski patch) ne gaze medjusobno.
      const combinedRequests: FixerRequest[] = FIXER_IDS.map((fixerId) => {
        const params = c.paramsFor(fixerId);
        return params ? { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, true) } : null;
      }).filter((r): r is FixerRequest => r !== null);
      const combined = await applyFixers(c.bytes, combinedRequests);
      // Faza A (RE-47): gate ide kao ZASEBNA asercija, NIKAD kao polje u `perFixture`. Da ude u
      // snapshot, promijenio bi 5940 redaka i zauvijek zamaglio svaki buduci diff.
      if (combined.changelog.length > 0) {
        await assertPackageIntact(c.bytes, combined.docxBytes, `${c.name}: kombinirani prolaz`);
      }
      perFixture['__kombinirano'] = {
        applied: combined.changelog.length,
        changelog: combined.changelog.map((c2) => ({ before: c2.beforeLabel, after: c2.afterLabel })),
        skipped: combined.skipped,
        markers: combined.changelog.length > 0 ? await extractMarkers(combined.docxBytes) : null,
      };

      out[c.name] = perFixture;
    }

    expect(out).toMatchSnapshot();
  }, 60000);

  it('bit-identican no-op: popravak bez promjene vraca ULAZNE bajtove', async () => {
    const bytes = await singleSectionDocx();
    // Margine su vec 2,5 cm (1417 twips) u sintetickom dokumentu -> cilj 2,5 cm je no-op.
    const result = await applyFixers(bytes, [
      { ruleId: 'margins-rule', fixerId: 'margins-fixer', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
    ]);
    expect(result.changelog).toHaveLength(0);
    expect(result.docxBytes).toBe(bytes); // ista referenca, nista nije rekomprimirano
    expect(result.skipped).toEqual(['margins-rule']);
  });

  it('idempotencija: ponovna primjena istog popravka je bit-identican no-op', async () => {
    const bytes = await singleSectionDocx();
    for (const fixerId of FIXER_IDS) {
      const params = SYNTHETIC_PARAMS[fixerId];
      for (const deep of DEEP_CAPABLE.has(fixerId) ? [false, true] : [false]) {
        const req: FixerRequest = { ruleId: `${fixerId}-rule`, fixerId, params: withDeep(fixerId, params, deep) };
        const first = await applyFixers(bytes, [req]);
        if (first.changelog.length === 0) continue; // fixer nista nije promijenio na sintetickom, preskoci
        const second = await applyFixers(first.docxBytes, [req]);
        // Drugi prolaz nema sto promijeniti -> changelog prazan -> vraca prvi izlaz bit-identican.
        expect(second.changelog, `${fixerId} deep=${deep} mora biti idempotentan`).toHaveLength(0);
        expect(second.docxBytes).toBe(first.docxBytes);
      }
    }
  });
});
