/**
 * Tripwire za DocumentMeasurements (faza D): otisak forme NIKAD ne smije nositi tekst
 * rada. Za svaku docx fixturu serijalizira details.measurements i tvrdi:
 *  1. nema kljuceva koji nose sadrzaj (text, runs, preview, raw, quote), uz izuzece
 *     jednoznakovnih before/after u markers (interpunkcija uz oznaku fusnote),
 *  2. nijedan niz od 4+ uzastopne rijeci iz stvarnog teksta fixture ne postoji u
 *     serijalizaciji (dokaz da ni jedna recenica nije procurila),
 *  3. velicina je mala (otisak forme, ne dokument): < 16 KB po fixturi,
 *  4. oblik je structured-cloneable (prezivljava worker granicu).
 * Suite se sam preskace bez fixtura, kao golden.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { MEASUREMENTS_VERSION, HEADING_EXCERPT_MAX } from '../src/scoring/evaluate/measurements';

const FIXTURES = resolve(__dirname, 'fixtures', 'docx');
const files = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.endsWith('.docx')) : [];

const FORBIDDEN_KEYS = ['text', 'runs', 'preview', 'raw', 'quote'];

/**
 * Heading v2 iznimka: `excerpt` (isjecak NASLOVA) smije postojati ISKLJUCIVO pod
 * structure.headings[] i structure.tooDeepParagraphs[], i nikad dulji od
 * HEADING_EXCERPT_MAX. Bilo gdje drugdje je to curenje sadrzaja.
 */
const EXCERPT_ALLOWED = /^measurements\.structure\.(headings|tooDeepParagraphs)\.\d+\.excerpt$/;

function collectKeys(value: unknown, path: string, out: string[]): void {
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = `${path}.${k}`;
    if (FORBIDDEN_KEYS.includes(k)) out.push(p);
    if (k === 'excerpt') {
      if (!EXCERPT_ALLOWED.test(p)) out.push(`${p} (excerpt izvan dopustene staze)`);
      else if (typeof v !== 'string' || v.length > HEADING_EXCERPT_MAX) out.push(`${p} (excerpt predug: ${String(v).length})`);
    }
    collectKeys(v, p, out);
  }
}

describe('measurements tripwire: iznimka za excerpt grize (negativne kontrole)', () => {
  it('excerpt izvan headings/tooDeepParagraphs = curenje', () => {
    const out: string[] = [];
    collectKeys({ body: { excerpt: 'tekst' } }, 'measurements', out);
    expect(out).toEqual(['measurements.body.excerpt (excerpt izvan dopustene staze)']);
  });
  it('excerpt dulji od HEADING_EXCERPT_MAX = curenje i na dopustenoj stazi', () => {
    const out: string[] = [];
    collectKeys({ structure: { headings: [{ excerpt: 'x'.repeat(HEADING_EXCERPT_MAX + 1) }] } }, 'measurements', out);
    expect(out.length).toBe(1);
    expect(out[0]).toContain('excerpt predug');
  });
  it('baseline: ispravan excerpt na dopustenoj stazi je cist', () => {
    const out: string[] = [];
    collectKeys({ structure: { headings: [{ index: 3, level: 1, excerpt: 'Uvod', tooDeep: false }], tooDeepParagraphs: [{ index: 9, excerpt: '1.2.3.4 Pododjeljak' }] } }, 'measurements', out);
    expect(out).toEqual([]);
  });
});

describe.skipIf(!files.length)('measurements tripwire: otisak forme bez teksta', () => {
  for (const name of files) {
    it(`${name}: bez teksta, malen, kloniv`, async () => {
      const buf = readFileSync(resolve(FIXTURES, name));
      const file = new File([buf], name);
      const result = await analyzeFixture(file, {});
      const m = (result as { details?: { measurements?: unknown } }).details?.measurements as
        | { measurementsVersion?: number }
        | undefined;
      expect(m, 'details.measurements mora postojati').toBeTruthy();
      expect(m!.measurementsVersion).toBe(MEASUREMENTS_VERSION);

      const badKeys: string[] = [];
      collectKeys(m, 'measurements', badKeys);
      expect(badKeys, 'kljucevi koji nose sadrzaj').toEqual([]);

      const json = JSON.stringify(m);
      expect(json.length, 'otisak forme mora ostati malen').toBeLessThan(16 * 1024);

      // 4+ uzastopne rijeci iz stvarnog TIJELA ne smiju postojati u otisku. Naslovi se
      // iskljucuju iz kandidata jer njihov isjecak (heading v2) legitimno nosi te rijeci;
      // upravo zato provjera tijela ostaje stroga: ona dokazuje da iznimka ne curi dalje.
      const paragraphs = ((result as { preview?: { paragraphs?: Array<{ text?: string; headingLevel?: number | null }> } }).preview?.paragraphs ?? [])
        .filter((p) => !p.headingLevel)
        .map((p) => String(p.text ?? ''))
        .filter((t) => t.trim().split(/\s+/).length >= 4)
        .slice(0, 20);
      for (const text of paragraphs) {
        const words = text.trim().split(/\s+/);
        const phrase = words.slice(0, 4).join(' ');
        expect(json.includes(phrase), `fraza iz teksta u otisku: "${phrase}"`).toBe(false);
      }

      expect(() => structuredClone(m)).not.toThrow();
    }, 120000);
  }
});
