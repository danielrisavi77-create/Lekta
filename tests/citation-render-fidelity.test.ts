import { describe, it, expect } from 'vitest';

import { formatCitation, type CitationInput, type CitationStyle } from '../src/tools/citation';
import fixture from './fixtures/citation-render-fidelity.json';

/**
 * RENDER FIDELITY: nas izlazni renderer (apa/harvard/chicago-author-date) mora reproducirati
 * doi.org/CSL autoritativni izlaz istog stila na strukturiranim Crossref poljima. Korpus je
 * self-clean (harvest zadrzava samo stavke koje renderer vec vjerno reproducira; rijetki locale
 * rubovi izbaceni i logirani). Normalizacija identicna scripts/render-fidelity-audit.mjs:
 * case (chicago title-case), en-crtica->hyphen, kurzivni navodnici, DOI token, chicago mjesec/elizija.
 * Ako renderer regresira, pukne ovdje. Novi bugovi se love svjezim harvestom + adversarijalno.
 */
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter';
function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\bportico\.?\s*/g, '')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/\S+/g, 'doiref')
    .replace(new RegExp(`\\s\\((?:${MONTHS})(?:\\s+\\d+)?\\)`, 'g'), '')
    .replace(/(\d+)-(\d+)/g, (m, a, b) => (b.length < a.length ? `${a}-${a.slice(0, a.length - b.length) + b}` : m))
    .replace(/\s+/g, ' ')
    .replace(/\s*([.,:;])/g, '$1')
    .replace(/[.\s]+$/, '')
    .trim();
}

const STYLES: CitationStyle[] = ['apa', 'harvard', 'chicago-author-date'];

describe('render fidelity: nas renderer == doi.org/CSL', () => {
  const items = (fixture as { items: Array<{ doi: string; fields: CitationInput; styles: Record<string, string> }> }).items;
  for (const item of items) {
    for (const style of STYLES) {
      const csl = item.styles[style];
      if (!csl) continue;
      it(`[${style}] ${item.doi}`, () => {
        expect(norm(formatCitation(item.fields, style).citation)).toBe(norm(csl));
      });
    }
  }
});
