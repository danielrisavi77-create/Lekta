import { describe, it, expect } from 'vitest';
import { makeCheck, unmeasurableCheck } from '../src/scoring/checks';

/**
 * STATUS I BODOVI MORAJU GOVORITI ISTO. Provjera koja javi `pass` a ne dodijeli sve bodove pokazuje
 * studentu zelenu kvacicu dok mu bodovi nestaju.
 *
 * KAKO JE OVAJ TEST NASTAO, jer je put poucniji od rezultata: prvo sam ga napisao nad golden
 * fixturama (analiziraj dokument, tvrdi da nijedan `pass` ne krije izgubljene bodove). Prosao je.
 * Onda sam MUTIRAO poziv u jezgri da uvijek javlja `pass` uz 2/4 boda i test je i dalje prolazio.
 * Gard koji ne moze pasti nije gard, pa sam trazio zasto.
 *
 * Odgovor: `makeCheck` invarijantu VEC ODRZAVA na izvoru (`if (max > 0 && scoredEarned < max &&
 * status === 'pass') status = scoredEarned > 0 ? 'warn' : 'fail'`). Zato je mjerenje na 246 stvarnih
 * radova i 27 bodovanih provjera naslo NULA neslaganja: nije sreca nego konstrukcija.
 *
 * Test zato stoji ondje gdje invarijanta zivi. Nad dokumentima bi bio prazan zauvijek.
 */

describe('makeCheck: status se ne smije razici s bodovima', () => {
  it("'pass' uz DJELOMICNE bodove postaje 'warn'", () => {
    const c = makeCheck('structure', 'Nesto', 'pass', 2, 4, 'detalj');
    expect(c.status).toBe('warn');
    expect(c.earned).toBe(2);
  });

  it("'pass' uz NULA bodova postaje 'fail'", () => {
    expect(makeCheck('structure', 'Nesto', 'pass', 0, 4, 'detalj').status).toBe('fail');
  });

  it('zasluzen pun rezultat ostaje pass', () => {
    // Kontrola u drugom smjeru: normalizacija ne smije obarati ispravan prolaz.
    const c = makeCheck('structure', 'Nesto', 'pass', 4, 4, 'detalj');
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(4);
  });

  it('bodovi izvan raspona se pritezu prije usporedbe', () => {
    expect(makeCheck('structure', 'Nesto', 'pass', 9, 4, 'detalj').earned).toBe(4);
    expect(makeCheck('structure', 'Nesto', 'pass', -3, 4, 'detalj').status).toBe('fail');
  });

  it('nebodovana provjera (max 0) je informativna, ne prolaz', () => {
    const c = makeCheck('structure', 'Nesto', 'pass', 0, 0, 'detalj');
    expect(c.status).toBe('informational');
    expect(c.scored).toBe(false);
  });

  it('nemjerljiva provjera je 0/0 i ne glumi prolaz', () => {
    const c = unmeasurableCheck('structure', 'Nesto', 'Word nije zapisao prored');
    expect(c.status).toBe('unmeasurable');
    expect(c.max).toBe(0);
    expect(c.scored).toBe(false);
    expect(c.detail).toContain('Nije moguće utvrditi');
  });

  it('NEUHVACEN SMJER, zabiljezen namjerno: warn uz PUN rezultat se ne ispravlja', () => {
    // `makeCheck` normalizira samo `pass` prema dolje. Obrnuti nesklad je moguc, ali ga nijedan
    // poziv u jezgri danas ne proizvodi: izmjereno na 246 radova, nula slucajeva. Zapisano da se
    // zna da je granica poznata, a ne previdjena.
    expect(makeCheck('structure', 'Nesto', 'warn', 4, 4, 'detalj').status).toBe('warn');
  });
});
