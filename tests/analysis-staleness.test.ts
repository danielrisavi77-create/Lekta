import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ZASTARIO REZULTAT: dokument odabran TIJEKOM analize ne smije dobiti tudji nalaz.
 *
 * `runAnalysis` je uvijek imao provjeru aktualnosti, ali na krivom mjestu: odmah nakon glavne
 * analize, a PRIJE `await import('../docx/intake-gate')`. Dinamicki uvoz je mrezni ili diskovni
 * dohvat na hladnom kesu, pa se u taj prozor stigne odabrati druga datoteka. Rezultat starog
 * dokumenta zavrsio bi u `currentResult` i korisnik bi gledao nalaz koji ne pripada radu koji je
 * upravo ucitao. Ocjena bi bila tudja, a nista u sucelju to ne bi reklo.
 *
 * ZASTO STRUKTURNI TEST, a ne ponasajni: pokretanje `runAnalysis` trazi cijelu radnu povrsinu,
 * Web Worker i stvaran .docx, a kvar je jednoredcani propust u redoslijedu. Ponasajni test bi
 * bio spor i krhak, a ne bi hvatao REGRESIJU koja je ovdje najizglednija: da netko doda NOV
 * `await` izmedju posljednje provjere i upisa. Ovaj gard hvata bas to, jer mjeri redoslijed.
 *
 * Ako ovaj test padne, ne micati tvrdnju nego provjeru: svaki `await` u `runAnalysis` mora biti
 * pokriven provjerom aktualnosti prije nego se rezultat upise.
 */

const SOURCE = readFileSync(resolve(__dirname, '..', 'src', 'ui', 'app.ts'), 'utf8');
const STALENESS = 'token!==_analyzeToken';
const WRITE = 'currentResult=result';

/** Tijelo `runAnalysis`: od njegove deklaracije do sljedece deklaracije funkcije na vrhu. */
function runAnalysisBody(): string {
  const start = SOURCE.indexOf('async function runAnalysis(');
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\nfunction cancelAnalysis(', start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe('aktualnost rezultata analize', () => {
  it('rezultat se upisuje tocno jednom, pa je jedno mjesto dovoljno cuvati', () => {
    expect(runAnalysisBody().split(WRITE).length - 1).toBe(1);
  });

  it('izmedju POSLJEDNJEG awaita i upisa rezultata stoji provjera aktualnosti', () => {
    const body = runAnalysisBody();
    const write = body.indexOf(WRITE);
    expect(write).toBeGreaterThan(-1);

    const lastAwait = body.lastIndexOf('await ', write);
    expect(lastAwait).toBeGreaterThan(-1);

    const guard = body.lastIndexOf(STALENESS, write);
    // Provjera mora doci POSLIJE posljednjeg awaita. Provjera prije njega ne vrijedi nista:
    // upravo je taj razmak prozor u kojem korisnik promijeni datoteku.
    expect(guard).toBeGreaterThan(lastAwait);
    expect(guard).toBeLessThan(write);
  });

  it('provjera pokriva I zeton analize I odabranu datoteku', () => {
    // Sam zeton ne bi uhvatio zamjenu datoteke bez novog pokretanja, a sama datoteka ne bi
    // uhvatila otkazivanje. Trebaju oba uvjeta.
    const body = runAnalysisBody();
    const write = body.indexOf(WRITE);
    const guard = body.lastIndexOf(STALENESS, write);
    const clause = body.slice(guard, write);
    expect(clause).toContain('selectedDocx!==docxFile');
  });

  it('provjera prekida, a ne samo biljezi', () => {
    const body = runAnalysisBody();
    const write = body.indexOf(WRITE);
    const guard = body.lastIndexOf(STALENESS, write);
    // Bez `return` bi se izvodenje nastavilo i upis bi se svejedno dogodio, a gard bi izgledao
    // prisutan. Trazi se stvarni izlaz izmedju provjere i upisa.
    expect(body.slice(guard, write)).toMatch(/\breturn\b/);
  });
});
