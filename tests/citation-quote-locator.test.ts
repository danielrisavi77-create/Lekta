/**
 * GARD NAD PROVJEROM `citation.direct-quote-locator`.
 *
 * Provjera zivi kao INLINE regex u `analyze-docx.ts`, pa se ne da testirati kao funkcija; jedini
 * posten ulaz je stvarna commitana fixtura. Uzeta je `fpzg--project--diplomski--uskladjen`, koja
 * NAMJERNO nosi oba oblika doslovnog navoda:
 *
 *   pripovjedni     Maric (2023a, str. 47) tvrdi: „...”
 *   zagradni        „...” (Juric i Pavlic, 2024, str. 61)
 *
 * Do 2026-09-08 je provjera vidjela samo drugi, jer je njezin regex trazio barem jedan znak PRIJE
 * godine unutar zagrade (`[^)]+`), a u pripovjednom obliku godina stoji na pocetku zagrade. Isti
 * razred kao AUD-16 u `extractCitations`, samo na drugom regexu.
 *
 * Test tvrdi OBA broja iz poruke provjere: koliko je navoda prepoznato i koliko ih je bez stranice.
 * Sam broj prepoznatih ne bi bio dovoljan, jer bi rastao i da provjera pocne brojati bilo sto.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FIXTURA = join(
  __dirname,
  'fixtures',
  'docx-authored',
  'fpzg--project--diplomski--uskladjen.docx',
);

describe('citation.direct-quote-locator nad fixturom s oba oblika navoda', () => {
  it('prepoznaje DVA doslovna navoda i nijedan bez stranice', async () => {
    // Prazan skup bi test ucinio vakuumskim: bez fixture nema sto mjeriti, pa to mora pasti.
    expect(existsSync(FIXTURA), `nema fixture ${FIXTURA}`).toBe(true);
    const bytes = new Uint8Array(readFileSync(FIXTURA));
    const rezultat: any = await analyzeFixture(
      new File([bytes], 'fpzg--project--diplomski--uskladjen.docx', { type: DOCX }),
      { profileId: 'fpzg-opci-akademski-rad' },
    );
    const provjera = (rezultat.checks ?? []).find(
      (c: any) => c.id === 'citation.direct-quote-locator',
    );
    expect(provjera, 'provjera lokatora nije emitirana; profil mora imati quoteLocatorRequired').toBeTruthy();
    expect(provjera.detail).toMatch(/2 mogućih izravnih citata/);
    expect(provjera.detail).toMatch(/0 bez prepoznate stranice/);
  }, 60_000);

  it('ista fixtura nema nijednu palu bodovanu provjeru citiranja', async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURA));
    const rezultat: any = await analyzeFixture(
      new File([bytes], 'fpzg--project--diplomski--uskladjen.docx', { type: DOCX }),
      { profileId: 'fpzg-opci-akademski-rad' },
    );
    const paleCitatne = (rezultat.checks ?? []).filter(
      (c: any) => (c.max ?? 0) > 0 && c.status !== 'pass' && /^(citation|reference)\./.test(String(c.id)),
    );
    expect(paleCitatne.map((c: any) => c.id)).toEqual([]);
  }, 60_000);
});
