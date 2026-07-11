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
import { formatCitation, parseAuthors } from '../tools/citation';
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

// Polja forme po vrsti izvora. Kljucevi odgovaraju CitationInput poljima (citation.ts).
const F: Record<string, FormField> = {
  authors: { key: 'authors', label: 'Autor(i) — "Prezime, Ime", vise odvoji s ";"' },
  title: { key: 'title', label: 'Naslov' },
  year: { key: 'year', label: 'Godina' },
  place: { key: 'place', label: 'Mjesto izdanja' },
  publisher: { key: 'publisher', label: 'Izdavac' },
  journal: { key: 'container', label: 'Casopis' },
  book: { key: 'container', label: 'Naslov knjige/zbornika' },
  law: { key: 'container', label: 'Sluzbeni list (npr. Narodne novine)' },
  editor: { key: 'editor', label: 'Urednik' },
  volume: { key: 'volume', label: 'Godiste / svezak' },
  issue: { key: 'issue', label: 'Broj' },
  pages: { key: 'pages', label: 'Stranice (npr. 145-170)' },
  doi: { key: 'doi', label: 'DOI (neobavezno)' },
  url: { key: 'url', label: 'URL' },
  accessed: { key: 'accessed', label: 'Datum pristupa' },
  institution: { key: 'institution', label: 'Ustanova' },
};

export const SOURCE_TYPES: SourceTypeForm[] = [
  { type: 'knjiga', label: 'Knjiga', fields: [F.authors, F.title, F.year, F.place, F.publisher] },
  { type: 'clanak', label: 'Clanak u casopisu', fields: [F.authors, F.title, F.journal, F.volume, F.issue, F.year, F.pages, F.doi] },
  { type: 'poglavlje', label: 'Poglavlje u knjizi/zborniku', fields: [F.authors, F.title, F.editor, F.book, F.place, F.publisher, F.year, F.pages] },
  { type: 'mrezni', label: 'Mrezni izvor', fields: [F.authors, F.title, F.publisher, F.year, F.url, F.accessed] },
  { type: 'zavrsni', label: 'Zavrsni / diplomski rad', fields: [F.authors, F.title, F.institution, F.year] },
  { type: 'propis', label: 'Propis / sluzbeni akt', fields: [F.title, F.law, F.issue, F.year] },
];
