/**
 * Metapodaci citatnih stilova: oznaka za prikaz, zahtjev datuma pristupa i nacin rada
 * enginea (mode). Izvuceno iz monolita (src/ui/app.ts) kako bi analyzeDocx i UI dijelili
 * jedan izvor istine; mape mode-ova identicne su povijesnom ponasanju (golden ih stiti).
 * Kanonski tokeni stilova su kljucevi mape (apa7, NE apa; vidi recommendedCitation).
 */
export interface CitationMeta {
  label: string;
  accessDate: boolean;
  mode: 'author-year' | 'legal-notes' | 'notes' | 'author-page' | 'numeric' | 'custom';
}

const CITATION_META: Record<string, CitationMeta> = {
  fpzg: { label: 'FPZG autor-godina', accessDate: true, mode: 'author-year' },
  'pravo-fusnote': { label: 'Pravni fakultet: pravne fusnote', accessDate: false, mode: 'legal-notes' },
  'pravo-social-author': { label: 'Pravni fakultet: Socijalni rad autor-godina', accessDate: true, mode: 'author-year' },
  apa7: { label: 'APA 7', accessDate: false, mode: 'author-year' },
  harvard: { label: 'Harvard / autor-godina', accessDate: true, mode: 'author-year' },
  'chicago-author': { label: 'Chicago autor-datum', accessDate: false, mode: 'author-year' },
  'chicago-notes': { label: 'Chicago fusnote', accessDate: false, mode: 'notes' },
  mla9: { label: 'MLA 9', accessDate: false, mode: 'author-page' },
  vancouver: { label: 'Vancouver', accessDate: false, mode: 'numeric' },
  ieee: { label: 'IEEE', accessDate: false, mode: 'numeric' },
  custom: { label: 'Prema posebnim uputama', accessDate: false, mode: 'custom' },
};

/**
 * Tokeni koje motor POZNAJE. Postoji jer `citationMeta` na nepoznat token tiho pada na `custom`
 * (redak ispod), pa profil koji je htio autor-godina dobije granu "bez stila" i izgubi bodovane
 * citatne provjere. Bez ovog popisa se takav promasaj ne moze ni izmjeriti.
 */
export const CITATION_TOKENS: readonly string[] = Object.keys(CITATION_META);

export function citationMeta(id: string): CitationMeta {
  return CITATION_META[id] || CITATION_META.custom;
}
