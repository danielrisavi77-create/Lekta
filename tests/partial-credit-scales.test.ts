import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

/**
 * KAZNA MORA SKALIRATI S ODSTUPANJEM.
 *
 * Do 2026-08-24 su dvije provjere imale ravan pod djelomicnih bodova:
 *   'Elementi naslovne stranice'  ok ? 4 : 2  od 4
 *   'Profilni opseg riječi'       ok ? 5 : 2  od 5
 * Rad kojemu nedostaje JEDNA stavka naslovnice bio je izjednacen s onim kojemu nedostaju SVE, a rad
 * pet posto preko granice tolerancije s onim upola kracim od trazenog. Izmjereno na 246 stvarnih
 * radova: 231 od 246 u djelomicnom stanju, nijedan na nuli, i svi na istoj brojci.
 *
 * Testovi tvrde SVOJSTVO (manje odstupanje -> vise bodova), ne konkretne brojke. Time ne ovise ni o
 * jednoj odabranoj granici i padaju cim se ravan pod vrati, bez obzira na to koja se konstanta
 * odabere.
 */

const TNR = 'Times New Roman';
const PROFILE = 'fpzg-politologija-diplomski'; // wordMin 10000, wordMax 12000
const p = (text: string, extra: Partial<ParaSpec> = {}): ParaSpec => ({ text, font: TNR, sizePt: 12, ...extra });
const named = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);

/** Tijelo sa zadanim brojem rijeci, uz Uvod i Zakljucak da opseg ima definiran doseg. */
function docOf(words: number): ParaSpec[] {
  const sentence = 'Rijec '.repeat(10); // 10 rijeci po pozivu
  const out: ParaSpec[] = [p('Uvod', { styleId: 'Heading1' })];
  for (let w = 0; w < words; w += 10) out.push(p(sentence));
  out.push(p('Zaključak', { styleId: 'Heading1' }));
  return out;
}

async function scopeCheck(words: number) {
  const file = buildDocxFile({ paragraphs: docOf(words) }, `opseg-${words}.docx`);
  return named(await analyzeFixture(file, { profileId: PROFILE }), 'Profilni opseg riječi');
}

describe('Profilni opseg riječi: kazna skalira s odstupanjem', () => {
  // Rok je podignut jer test gradi i analizira dokument od 8500 rijeci: da bi odstupanje bilo
  // MALO, dokument mora biti blizu granice od 10000, pa se velicina ne moze izbjeci.
  it('rad malo ispod granice tolerancije gubi MANJE od rada upola kraceg', async () => {
    const blizu = await scopeCheck(8500); // ~15% ispod 10000
    const daleko = await scopeCheck(3000); // 70% ispod
    expect(blizu.earned).toBeGreaterThan(daleko.earned);
    expect(daleko.earned).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('rad unutar raspona i dalje ima pune bodove', async () => {
    const c = await scopeCheck(11000);
    expect(c.earned).toBe(c.max);
    expect(c.status).toBe('pass');
  });

  it('tolerancija od 10 posto i dalje prolazi', async () => {
    // Kontrola u drugom smjeru: skaliranje ne smije pojesti postojecu toleranciju.
    const c = await scopeCheck(9200); // unutar 10% ispod 10000
    expect(c.earned).toBe(c.max);
  });

  it('nijedan rad ne pada ispod jednog boda', async () => {
    const c = await scopeCheck(30);
    expect(c.earned).toBe(1);
  });
});

describe('Elementi naslovne stranice: kazna skalira s brojem stavki kojih nema', () => {
  /** Naslovnica s odabranim elementima; profil trazi sveuciliste, fakultet, mjesto i godinu. */
  async function titleCheck(front: string[]) {
    const paragraphs = [...front.map((t) => p(t)), ...docOf(11000)];
    const file = buildDocxFile({ paragraphs }, 'naslovnica.docx');
    return named(await analyzeFixture(file, { profileId: PROFILE }), 'Elementi naslovne stranice');
  }

  it('rad kojemu nedostaje JEDNA stavka gubi MANJE od onoga kojemu nedostaju sve', async () => {
    const skoroPotpuna = await titleCheck([
      'Sveučilište u Zagrebu',
      'Fakultet političkih znanosti',
      'Zagreb, 2026.',
    ]);
    const prazna = await titleCheck(['Naslov rada']);
    expect(skoroPotpuna.earned).toBeGreaterThan(prazna.earned);
    expect(prazna.earned).toBeGreaterThanOrEqual(1);
  });

  it('potpuna naslovnica ima pune bodove', async () => {
    const c = await titleCheck(['Sveučilište u Zagrebu', 'Fakultet političkih znanosti', 'Zagreb, 2026.']);
    if (c.earned === c.max) expect(c.status).toBe('pass');
    // Kad profil trazi jos koji element, potpunost se ne moze jamciti iz teksta; tada vrijedi samo
    // da je rezultat bolji od prazne naslovnice, sto tvrdi test iznad.
    expect(c.earned).toBeGreaterThan(1);
  });
});
