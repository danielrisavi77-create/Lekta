/**
 * Gard za parser Upisnika studijskih programa (P1-2 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Uzorak je izrezan iz STVARNOG odgovora sluzbenog Upisnika (hko.srce.hr/usp), pa se ponasanje
 * parsera dokazuje bez mreze u CI-ju. Kad se sucelje Upisnika promijeni, ovaj test pada nad
 * osvjezenim uzorkom prije nego pokvareni podaci udju u registar programa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseUpisnikResults, UPISNIK_VRSTE } from '../src/programs/upisnik-parse';

const html = readFileSync(resolve(process.cwd(), 'tests/fixtures/upisnik-rezultati-uzorak.html'), 'utf8');
const parsed = parseUpisnikResults(html);

describe('parser Upisnika: stupci i sadrzaj', () => {
  it('cita svaki podatkovni redak, bez tihog preskakanja', () => {
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.skipped).toEqual([]);
  });

  it('preslikava stupce na tocna polja (nije skliznuo za stupac)', () => {
    const first = parsed.rows[0];
    expect(first.sifraUpisnik).toBe('3');
    expect(first.sifraZapisa).toBe('2939');
    expect(first.naziv).toBe('Elektrotehnika');
    expect(first.nositelj).toBe('Sveučilište u Rijeci');
    expect(first.izvoditelj).toBe('Sveučilište u Rijeci, Tehnički fakultet');
    expect(first.vrsta).toBe('Sveučilišni prijediplomski studij');
    expect(first.mjesto).toBe('Rijeka');
  });

  it('vrsta studija je uvijek iz poznatog skupa Upisnika', () => {
    for (const row of parsed.rows) {
      expect(UPISNIK_VRSTE as readonly string[]).toContain(row.vrsta);
    }
  });

  /**
   * Vodeca znamenka je strukturni marker sucelja, ne dio imena. Skida se TOCNO jedna, pa program
   * koji se doista zove "3D dizajn" (u tablici "13D dizajn") ostaje citav. Marker se cuva
   * neprotumacen: izgleda kao oznaka jezika naziva, ali dok to nije potvrdjeno iz izvora, jezik se
   * ne smije izvoditi iz njega.
   */
  it('odvaja strukturni marker od naziva, ne pretpostavljajuci mu znacenje', () => {
    expect(parsed.rows[0].nameMarker).toBe('1');
    const english = parsed.rows.find((r) => r.nameMarker === '2');
    expect(english, 'uzorak mora sadrzavati i redak s markerom 2').toBeDefined();
    expect(english!.naziv.startsWith('2')).toBe(false);
    for (const row of parsed.rows) expect(row.naziv[0]).not.toMatch(/^\d$/);
  });

  it('naziv koji stvarno pocinje znamenkom ne bi bio okrnjen', () => {
    const synthetic = parseUpisnikResults(
      '<table><tr><td>9</td><td>1</td><td class="naziv">13D dizajn</td>' +
        '<td>N</td><td>I</td><td>Doktorski studij</td><td>Zagreb</td></tr></table>',
    );
    expect(synthetic.rows[0].naziv).toBe('3D dizajn');
    expect(synthetic.rows[0].nameMarker).toBe('1');
  });

  it('redak s neocekivanim brojem stupaca zavrsi u skipped, ne u tisini', () => {
    const broken = parseUpisnikResults('<table><tr><td>1</td><td>2</td></tr></table>');
    expect(broken.rows).toEqual([]);
    expect(broken.skipped).toHaveLength(1);
  });

  it('dekodira entitete i cisti visestruke razmake', () => {
    const entity = parseUpisnikResults(
      '<table><tr><td>1</td><td>2</td><td class="naziv">1Pravo&amp;  ekonomija</td>' +
        '<td>N</td><td>I</td><td>Doktorski studij</td><td>Split</td></tr></table>',
    );
    expect(entity.rows[0].naziv).toBe('Pravo& ekonomija');
  });
});
