/**
 * MJERENJE prije odluke (P3-1 u docs/PLAN_POTPUNA_POKRIVENOST.md), po uzoru na cb74b5d.
 *
 * Cetiri asistirane provjere u `check-fixer-map.ts` nemaju `fixId`:
 * `structure.heading.word-styles`, `element.table.caption`, `element.figure.caption`,
 * `element.lists`. Posljedica NIJE ono sto je audit tvrdio (strop popravka im ne pada na 'manual',
 * jer `groupKey` ih vec svrstava u 'assisted'), nego uza i konkretnija: `finding-view-model`
 * postavlja `autoRepairable: !!triage?.fixId`, a kartica nalaza gumb "Otvori mogucnost popravka"
 * prikazuje samo uz `autoRepairable`. Kako te provjere nisu ni 'manual', ne dobivaju ni gumbe za
 * rucnu potvrdu - kartica ostaje BEZ IJEDNE radnje.
 *
 * Mapirati fixer smije se samo ako je popravak DOISTA ponudjen kad provjera prijavi nalaz. Ovaj
 * test to mjeri nad stvarnim dokumentima i ostaje kao gard: ako veza pukne, obecanje na kartici
 * postaje lazno.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { headingStructureRepairableItem, elementCaptionRepairableItem } from '../src/ui/repair-items';

const DIR = resolve(process.cwd(), 'tests/fixtures/docx');
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.docx')) : [];

interface Measured {
  file: string;
  headingWarn: boolean;
  headingOffer: boolean;
  captionWarn: boolean;
  captionOffer: boolean;
  listsWarn: boolean;
}

const measured: Measured[] = [];

describe('P3-1: je li popravak doista ponudjen kad provjera prijavi nalaz', () => {
  it('izmjeri sve stvarne fixture', async () => {
    for (const f of files) {
      const sidecar = join(DIR, f.replace(/\.docx$/, '.json'));
      const profileId = existsSync(sidecar)
        ? (JSON.parse(readFileSync(sidecar, 'utf8')).profileId as string | undefined)
        : undefined;
      const bytes = readFileSync(join(DIR, f));
      const file = new File([new Uint8Array(bytes)], f);
      const result = (await analyzeFixture(file, profileId ? { profileId } : {})) as {
        checks?: Array<{ title: string; status: string }>;
      };
      const profile = profileId ? resolveProfile(profileId) : null;
      const warn = (title: string): boolean => {
        const check = (result.checks ?? []).find((c) => c.title === title);
        return !!check && check.status !== 'pass';
      };
      measured.push({
        file: f,
        headingWarn: warn('Uporaba Word stilova naslova'),
        headingOffer: headingStructureRepairableItem(result, profile).length > 0,
        captionWarn: warn('Naslovi tablica') || warn('Naslovi slika i grafikona'),
        captionOffer: elementCaptionRepairableItem(result, profile).length > 0,
        listsWarn: warn('Popisi slika i tablica'),
      });
    }
    expect(measured.length).toBeGreaterThan(0);
  }, 180_000);

  /**
   * IZMJERENO 2026-08-20 nad svih 15 stvarnih fixtura. Ishod je OBRNUT od preporuke audita: ni za
   * jednu od cetiri provjere mapiranje fixera danas nije opravdano.
   */
  it('"Uporaba Word stilova naslova" ne prijavi nalaz ni na jednom stvarnom dokumentu', () => {
    // Nema dokaza da je ta provjera ikad vidljiva korisniku, pa se fixer ne smije obecati na
    // temelju pretpostavke. Isti zakljucak kao za `section-surgery` (cb74b5d).
    expect(measured.filter((m) => m.headingWarn)).toEqual([]);
  });

  /**
   * KLJUCNI NALAZ: natpisi tablica/slika PRIJAVLJUJU nalaz, ali popravak natpisa tada NIJE
   * ponudjen. Provjera se javlja kad natpisa NEMA, dok `elementCaptionRepairableItem` treba
   * `elementStructure.candidates` - elemente na koje se natpis moze objesiti. Mapirati
   * `element-caption-fixer` na te provjere znacilo bi obecati gumb koji ne otvara nista.
   */
  it('natpis tablice/slike prijavi nalaz, a popravak natpisa NIJE ponudjen', () => {
    const warned = measured.filter((m) => m.captionWarn);
    expect(warned.length, 'mjerenje mora imati barem jedan slucaj').toBeGreaterThan(0);
    expect(warned.some((m) => !m.captionOffer), 'barem jedan nalaz bez ponudjenog popravka').toBe(true);
  });

  /**
   * `element.lists` SE emitira na stvarnom dokumentu (word-veliki-neuredan.docx), sto je oborilo
   * raniju statiku: `requireListsWhenElements` ne stoji u `verified-profiles-heavy.json` nego se
   * dobiva kompilacijom `ruleEntries`, pa je brojanje po heavy datoteci davalo lazno nula.
   * Popis slika bi umetnuo `required-section-fixer`, ali samo profilima ciji `required-section-rules`
   * sadrze `figure-list`/`table-list`; taj profil ih nema, pa popravak i dalje ne postoji.
   */
  it('"Popisi slika i tablica" se emitira, ali za njega nema fixera', () => {
    const warned = measured.filter((m) => m.listsWarn);
    expect(warned.length).toBeGreaterThan(0);
    expect(warned.map((m) => m.file)).toContain('word-veliki-neuredan.docx');
  });
});
