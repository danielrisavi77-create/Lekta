/**
 * CitationSpec: vjeran per-fakultetski citatni format, izveden iz SLUZBENIH uputa i
 * verificiran od covjeka (docs/VERIFICATION_PIPELINE.md disciplina, prilagodjena content
 * sloju alata: status/quoteRaw/sourcePage/verifiedHash/ledger).
 *
 * Template jezik (namjerno primitivan, verifikator ga usporedjuje s PDF-om okom):
 *  - {placeholder}: polje iz CitationInput ili izvedeno (authors, authorsShort, doiUrl, link).
 *  - [[ ... ]]: opcionalna grupa; ispada u cijelosti ako su SVI placeholderi u njoj prazni
 *    (jednostruke uglate ostaju literal, pa IEEE "[1]" i Vancouver "[Internet]" ne kolidiraju).
 *  - interpunkcija se pise DOSLOVNO; nakon zamjene ide tidy() cleanup iz citation.ts.
 *
 * Specovi zive u data/tools/citation-specs/{drafts,verified}/<fac>.json; u build ulazi
 * ISKLJUCIVO verified/ (gate u generatoru + tests/citation-specs.test.ts).
 */
import {
  parseAuthors, tidy, doiUrl, initials,
  type CitationInput, type CitationResult, type SourceType, type ParsedAuthor,
} from '../tools/citation';

export interface AuthorFormatOptions {
  /** family-first: "Prezime, I."; given-first: "I. Prezime". */
  order: 'family-first' | 'given-first';
  /** Samo prvi autor obrnut, ostali prirodno (Chicago/fusnotni obicaj). */
  firstAuthorOnlyInverted?: boolean;
  /** dotted-spaced "I. P."; dotted-compact "I.P."; plain-compact "IP" (Vancouver); none = puno ime. */
  initials: 'dotted-spaced' | 'dotted-compact' | 'plain-compact' | 'none';
  /** Separator izmedju autora (osim zadnjeg), npr. ", " ili "; ". */
  separator: string;
  /** Spojnica prije zadnjeg autora, npr. " i ", ", & ", " and ", ili null = separator. */
  finalJoiner?: string | null;
  /** Nakon N autora skrati na etAlText (null = nikad). */
  etAlAfter?: number | null;
  etAlText?: string;
  /** Koliko autora ZADRZATI pri kracenju (default = etAlAfter). FPZG: 3+ autora -> prvi + "i dr." (etAlAfter 2, etAlKeep 1). */
  etAlKeep?: number;
  /** Spojnica prije etAlText (default = separator). FPZG: " " ("Babic, Stjepan i dr."), Vancouver: ", ". */
  etAlJoiner?: string;
  /** Prezime velikim/malim slovima (neke Harvard varijante: "NEVILLE, C."); default = doslovno. Ne dira institucije. */
  surnameCase?: 'upper' | 'lower';
}

export interface SpecProvenance {
  /** worked-example: doslovan primjer iz PDF-a; rule-text: pravilo prozom; derived: izvedeno (uz note). */
  kind: 'worked-example' | 'rule-text' | 'derived';
  /** Doslovni citat iz EKSTRAKCIJE izvora (greppable; dijakritika moze biti osteceena od pdftotext-a). */
  quoteRaw: string;
  /** Lokator u snapshotu (npr. "str. 2"); null dok ga covjek ne potvrdi. */
  sourcePage: string | null;
  note?: string;
}

export interface SpecSourceType {
  type: SourceType;
  template: string;
  /** Za "missing" prikaz; fallback na RECOMMENDED mapu iz citation.ts kad izostane. */
  requiredFields?: string[];
  provenance: SpecProvenance;
  /** Worked example za dosje i golden: input polja + ocekivani citat IZ IZVORA.
   *  Dossier renderira formatFromSpec(spec, input) i diffa protiv expected.
   *  knownDiff: izricito deklariran razlog zasto render NE odgovara expected (npr. izvor
   *  interno nekonzistentan ili sadrzi tipfeler); gate tada preskace bajt-jednakost, ali
   *  dossier i dalje pokazuje DIFF covjeku. Zastarjeli knownDiff (render ipak jednak) rusi gate. */
  example?: { input: Record<string, string>; expected: string; knownDiff?: string } | null;
}

export interface SpecInText {
  mode: 'author-year' | 'author-page' | 'note-number' | 'bracket-number' | 'paren-number';
  /** Npr. "({authorsShort} {year})" — interpunkcija doslovna, i "(Lovric 1988)" bez zareza je izraziv. */
  template?: string;
  /** Varijanta s brojem stranice, npr. "({authorsShort} {year}: {pages})". */
  withPagesTemplate?: string;
  authorsShort?: { twoJoiner?: string; etAlAfter?: number; etAlText?: string };
  provenance?: SpecProvenance;
}

export interface CitationSpec {
  facultyId: string;
  styleToken: string;
  /** Gate pusta u build SAMO "verified". */
  status: 'draft' | 'verified' | 'needs-recheck';
  /** a: puni custom spec; b: pin na standardni stil s dokazom; c se ne zapisuje kao spec. */
  outcome: 'custom-spec' | 'style-pin';
  label: string;
  sourceId: string;
  sourceLabel: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** snapshotHash izvora u trenutku verifikacije (drift detekcija, fail-closed). */
  verifiedHash: string | null;
  accessDate?: boolean;
  authorFormat: AuthorFormatOptions;
  inText: SpecInText;
  /** Za numericke stilove: markeri; inace null. */
  numbering?: { referenceMarker: string } | null;
  bibliography: { sort: 'alphabetical' | 'appearance' };
  sourceTypes: SpecSourceType[];
  /** Za style-pin: dokaz da izvor PROPISUJE standardni stil (quoteRaw + sourcePage).
   *  Pin ne nosi vlastite predloske; renderira obiteljski motor, spec dodaje provenijenciju. */
  evidence?: SpecProvenance | null;
  /** Kontradikcije/nesigurnosti za covjeka (draft faza). */
  contradictions?: string[];
  /** Facultet-siroki facultyId (npr. "unizd") moze agregirati profile iz VISE odjela pod
   *  istim styleToken, no spec je verificiran iz JEDNOG odjela/izvora. Kad je postavljeno,
   *  generator (generate-citation-tools.mjs buildFaculties) primjenjuje spec na (unitId,token)
   *  kanticu SAMO ako SVI profili u kantici imaju program koji sadrzi ovaj podniz; inace
   *  kantica pada na genericki prikaz umjesto lazne tvrdnje "propisano" za odjele cije upute
   *  nisu provjerene. Izostavljeno = spec pokriva citavu kanticu (facultyId je vec granularan). */
  scopeProgramContains?: string;
}

const PLACEHOLDERS = new Set([
  'authors', 'authorsShort', 'year', 'title', 'container', 'editor', 'place', 'publisher',
  'volume', 'issue', 'pages', 'url', 'doi', 'doiUrl', 'link', 'accessed', 'institution', 'n',
]);
const SOURCE_TYPES_ALL: SourceType[] = ['knjiga', 'poglavlje', 'clanak', 'mrezni', 'zavrsni', 'propis'];

function initialsCompact(first: string): string {
  return first.split(/[\s-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join('');
}
function initialsPlain(first: string): string {
  return first.split(/[\s-]+/).filter(Boolean).map((p) => p[0].toUpperCase()).join('');
}

function surnameCased(last: string, opts: AuthorFormatOptions): string {
  if (opts.surnameCase === 'upper') return last.toLocaleUpperCase('hr-HR');
  if (opts.surnameCase === 'lower') return last.toLocaleLowerCase('hr-HR');
  return last;
}

function oneAuthor(a: ParsedAuthor, opts: AuthorFormatOptions, inverted: boolean): string {
  if (!a.first) return a.last; // institucija ili samo prezime: doslovno, bez surnameCase
  const last = surnameCased(a.last, opts);
  let f: string;
  switch (opts.initials) {
    case 'dotted-spaced': f = initials(a.first); break;
    case 'dotted-compact': f = initialsCompact(a.first); break;
    case 'plain-compact': f = initialsPlain(a.first); break;
    default: f = a.first;
  }
  if (inverted) return opts.initials === 'plain-compact' ? `${last} ${f}` : `${last}, ${f}`;
  return `${f} ${last}`;
}

/** Generalizacija authorsAuthorYear/authorsFootnote/authorsIeee/authorsVancouver:
 *  sva 4 postojeca ponasanja su izraziva opcijama (dokazano testom), plus fakultetske varijante. */
export function authorsFromOptions(list: ParsedAuthor[], opts: AuthorFormatOptions): string {
  if (!list.length) return '';
  let shown = list;
  let etAl = false;
  if (opts.etAlAfter != null && list.length > opts.etAlAfter) {
    shown = list.slice(0, opts.etAlKeep ?? opts.etAlAfter);
    etAl = true;
  }
  const parts = shown.map((a, i) => {
    const inverted = opts.order === 'family-first' && (!opts.firstAuthorOnlyInverted || i === 0);
    return oneAuthor(a, opts, inverted);
  });
  let out: string;
  if (parts.length === 1) out = parts[0];
  else if (etAl || opts.finalJoiner == null) out = parts.join(opts.separator);
  else out = parts.slice(0, -1).join(opts.separator) + opts.finalJoiner + parts[parts.length - 1];
  if (etAl) out += (opts.etAlJoiner ?? opts.separator) + (opts.etAlText ?? 'et al.'); // Vancouver: ", et al."; FPZG: " i dr."
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Kratki oblik za in-text: samo prezimena, s two-joiner i et-al pragom. */
function authorsShortFrom(list: ParsedAuthor[], o?: SpecInText['authorsShort']): string {
  if (!list.length) return '';
  const sur = (a: ParsedAuthor) => a.last;
  const etAfter = o?.etAlAfter ?? 3;
  const etText = o?.etAlText ?? 'i sur.';
  const two = o?.twoJoiner ?? ' i ';
  if (list.length === 1) return sur(list[0]);
  if (list.length === 2) return `${sur(list[0])}${two}${sur(list[1])}`;
  if (list.length >= etAfter) return `${sur(list[0])} ${etText}`;
  return list.slice(0, -1).map(sur).join(', ') + two + sur(list[list.length - 1]);
}

/** Zamijeni {placeholder}e i rijesi [[...]] opcionalne grupe (drop ako su SVI unutra prazni). */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const withGroups = template.replace(/\[\[(.*?)\]\]/g, (_, group: string) => {
    const keys = [...group.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const anyFilled = keys.some((k) => (values[k] ?? '').trim() !== '');
    return anyFilled ? group : '';
  });
  return withGroups.replace(/\{(\w+)\}/g, (_, key: string) => (values[key] ?? '').trim());
}

/** Strukturna validacija speca; [] znaci valjan. Koriste je generator gate i testovi. */
export function validateCitationSpec(spec: unknown): string[] {
  const errs: string[] = [];
  const s = spec as CitationSpec;
  if (!s || typeof s !== 'object') return ['spec nije objekt'];
  if (!s.facultyId) errs.push('facultyId nedostaje');
  if (!s.styleToken) errs.push('styleToken nedostaje');
  if (!['draft', 'verified', 'needs-recheck'].includes(s.status)) errs.push(`status nevaljan: ${s.status}`);
  if (!['custom-spec', 'style-pin'].includes(s.outcome)) errs.push(`outcome nevaljan: ${s.outcome}`);
  if (!s.sourceId) errs.push('sourceId nedostaje');
  if (!s.label) errs.push('label nedostaje');
  if (s.outcome === 'custom-spec') {
    if (!s.authorFormat) errs.push('authorFormat nedostaje');
    if (!s.inText || !s.inText.mode) errs.push('inText.mode nedostaje');
    if (!s.bibliography || !['alphabetical', 'appearance'].includes(s.bibliography.sort)) {
      errs.push('bibliography.sort nevaljan');
    }
    const types = new Set((s.sourceTypes ?? []).map((t) => t.type));
    for (const t of SOURCE_TYPES_ALL) if (!types.has(t)) errs.push(`sourceTypes ne pokriva "${t}"`);
    for (const st of s.sourceTypes ?? []) {
      if (!st.template) { errs.push(`${st.type}: template nedostaje`); continue; }
      for (const m of st.template.matchAll(/\{(\w+)\}/g)) {
        if (!PLACEHOLDERS.has(m[1])) errs.push(`${st.type}: nepoznat placeholder {${m[1]}}`);
      }
      const p = st.provenance;
      if (!p || !p.kind) errs.push(`${st.type}: provenance nedostaje`);
      else {
        if (!p.quoteRaw) errs.push(`${st.type}: provenance.quoteRaw prazan`);
        if (p.kind === 'derived' && !p.note) errs.push(`${st.type}: derived bez note`);
      }
    }
    if (s.inText.template) {
      for (const m of s.inText.template.matchAll(/\{(\w+)\}/g)) {
        if (!PLACEHOLDERS.has(m[1])) errs.push(`inText: nepoznat placeholder {${m[1]}}`);
      }
    }
  }
  if (s.outcome === 'style-pin') {
    if (!s.evidence || !s.evidence.quoteRaw) errs.push('style-pin bez evidence.quoteRaw (dokaz da izvor propisuje stil)');
  }
  if (s.status === 'verified') {
    if (!s.verifiedAt) errs.push('verified bez verifiedAt');
    if (!s.verifiedBy) errs.push('verified bez verifiedBy');
    if (!s.verifiedHash) errs.push('verified bez verifiedHash');
    if (s.outcome === 'custom-spec') {
      for (const st of s.sourceTypes ?? []) {
        if (st.provenance && st.provenance.sourcePage == null) {
          errs.push(`${st.type}: verified spec s sourcePage=null (nikad se ne nagadja, ali verified trazi potvrdu)`);
        }
      }
    }
    if (s.outcome === 'style-pin' && s.evidence && s.evidence.sourcePage == null) {
      errs.push('verified style-pin s evidence.sourcePage=null');
    }
  }
  return errs;
}

// Fallback "missing" mapa kad spec ne definira requiredFields (uskladjeno s citation.ts RECOMMENDED).
const RECOMMENDED_FALLBACK: Record<SourceType, string[]> = {
  knjiga: ['authors', 'title', 'year', 'publisher'],
  poglavlje: ['authors', 'title', 'container', 'editor', 'year', 'publisher'],
  clanak: ['authors', 'title', 'container', 'year'],
  mrezni: ['title', 'url'],
  zavrsni: ['authors', 'title', 'year', 'institution'],
  propis: ['title', 'container'],
};
const FIELD_LABEL: Record<string, string> = {
  authors: 'autor', title: 'naslov', container: 'izvor (časopis/zbornik/službeni list)',
  editor: 'urednik', year: 'godina', publisher: 'izdavač', url: 'poveznica', institution: 'ustanova',
};

/** Vjeran render po verificiranom specu. Isti CitationResult ugovor kao formatCitation.
 *  Style-pin specovi nemaju predloske (renderira ih obiteljski motor) - guard vraca prazno. */
export function formatFromSpec(spec: CitationSpec, inp: CitationInput): CitationResult {
  const st = spec.sourceTypes.find((t) => t.type === inp.type) ?? spec.sourceTypes[0];
  if (!st) return { citation: '', inText: '', missing: [] };
  const list = parseAuthors(inp.authors);

  const values: Record<string, string> = {};
  for (const k of ['year', 'title', 'container', 'editor', 'place', 'publisher', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'] as const) {
    values[k] = String(inp[k] ?? '').trim();
  }
  values.authors = authorsFromOptions(list, spec.authorFormat);
  values.authorsShort = authorsShortFrom(list, spec.inText.authorsShort);
  values.doiUrl = doiUrl(inp.doi);
  values.link = values.doiUrl || values.url;

  const citation = tidy(renderTemplate(st.template, values));

  let inText = '';
  if ((spec.inText.mode === 'author-year' || spec.inText.mode === 'author-page') && spec.inText.template) {
    const tpl = values.pages && spec.inText.withPagesTemplate ? spec.inText.withPagesTemplate : spec.inText.template;
    if (values.authorsShort || values.year) {
      if (!values.year) values.year = 'bez dat.';
      inText = tidy(renderTemplate(tpl, values));
    }
  }

  const req = st.requiredFields ?? RECOMMENDED_FALLBACK[inp.type] ?? [];
  const missing = req
    .filter((f) => !String((inp as unknown as Record<string, unknown>)[f] ?? '').trim())
    .map((f) => FIELD_LABEL[f] ?? f);

  return { citation, inText, missing };
}
