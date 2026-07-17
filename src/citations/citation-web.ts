/**
 * Browser/build ulaz za citatni motor free-tool generatora (SEO alati /alati/citati).
 *
 * Jedan izvor istine: re-izvozi formatCitation iz src/tools/citation.ts (autor-godina,
 * fusnota, ieee, vancouver) i citationMeta iz citation-meta.ts, te dodaje derivaciju
 * engine-stila iz recommendedCitation tokena i shemu polja forme. Generator ga esbuildom
 * bundla u IIFE (globalName LektaCitation) i inlinea u staticke stranice; isti bundle Node
 * eval-om cita citationMeta/engineStyleFor pri gradnji mape fakultet -> stil. Bez duplog
 * odrzavanja logike formatiranja.
 */
import { formatCitation, parseAuthors, SOURCE_TYPE_FIELDS } from '../tools/citation';
import type { CitationStyle, SourceType } from '../tools/citation';
import { citationMeta } from './citation-meta';
import { parseReference, splitReferences } from './parse-reference';
import { formatFromSpec, validateCitationSpec, authorsFromOptions, renderTemplate } from './citation-spec';

export {
  formatCitation, parseAuthors, citationMeta, parseReference, splitReferences,
  formatFromSpec, validateCitationSpec, authorsFromOptions, renderTemplate,
};

/**
 * recommendedCitation token -> engine stil za formatCitation.
 * null = nema vjernog auto-formata (custom / posebne upute); stranica tada vodi na opci alat.
 */
export function engineStyleFor(token: string): CitationStyle | null {
  if (token === 'ieee') return 'ieee';
  if (token === 'vancouver') return 'vancouver';
  // Vjerni autor-datum pod-stilovi (validirano protiv doi.org/CSL). fpzg/pravo-social-author ostaju
  // genericki 'autor-godina' (hrvatske strukturne rijeci; njihov TOCAN oblik zivi u per-fakultet spec-u).
  if (token === 'apa7') return 'apa';
  if (token === 'harvard') return 'harvard';
  if (token === 'chicago-author') return 'chicago-author-date';
  const mode = citationMeta(token).mode;
  if (mode === 'author-year' || mode === 'author-page') return 'autor-godina';
  if (mode === 'notes' || mode === 'legal-notes') return 'fusnota';
  if (mode === 'numeric') return 'ieee';
  return null; // custom
}

export interface FormField {
  key: string;
  label: string;
}
export interface SourceTypeForm {
  type: SourceType;
  label: string;
  fields: FormField[];
}

// Labele polja forme. Kljucevi odgovaraju CitationInput poljima (citation.ts); koji su polja
// za koju vrstu izvora dolazi iz SOURCE_TYPE_FIELDS (citation.ts), ne odavde.
const FIELD_LABEL: Record<string, string> = {
  authors: 'Autor(i) — "Prezime, Ime", vise odvoji s ";"',
  title: 'Naslov',
  year: 'Godina',
  place: 'Mjesto izdanja',
  publisher: 'Izdavac',
  editor: 'Urednik',
  volume: 'Godiste / svezak',
  issue: 'Broj',
  pages: 'Stranice (npr. 145-170)',
  doi: 'DOI (neobavezno)',
  url: 'URL',
  accessed: 'Datum pristupa',
  institution: 'Ustanova',
};

// "container" nosi razlicitu labelu ovisno o vrsti izvora (casopis/knjiga-zbornik/sluzbeni list).
const CONTAINER_LABEL: Partial<Record<SourceType, string>> = {
  clanak: 'Casopis',
  poglavlje: 'Naslov knjige/zbornika',
  propis: 'Sluzbeni list (npr. Narodne novine)',
};

const TYPE_LABEL: Record<SourceType, string> = {
  knjiga: 'Knjiga',
  clanak: 'Clanak u casopisu',
  poglavlje: 'Poglavlje u knjizi/zborniku',
  mrezni: 'Mrezni izvor',
  zavrsni: 'Zavrsni / diplomski rad',
  propis: 'Propis / sluzbeni akt',
};

function fieldLabel(type: SourceType, key: string): string {
  return key === 'container' ? CONTAINER_LABEL[type] || 'Izvor' : FIELD_LABEL[key] || key;
}

export const SOURCE_TYPES: SourceTypeForm[] = (Object.keys(SOURCE_TYPE_FIELDS) as SourceType[]).map((type) => ({
  type,
  label: TYPE_LABEL[type],
  fields: SOURCE_TYPE_FIELDS[type].map((f) => ({ key: f.key, label: fieldLabel(type, f.key) })),
}));
