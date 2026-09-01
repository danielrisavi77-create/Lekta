import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * UGOVOR ZATECENE STRANICE: `index.html` mora sadrzavati svaki element koji ozicenje dira.
 *
 * Ovaj gard postoji jer je jedan drugi nestao. Do uvodjenja `ctl` ozicenje je pridruzivalo
 * rukovatelje bezuvjetno (`$('#x').onclick=...`), pa je nedostajuci element rusio montazu. To je
 * bila gruba, ali stvarna provjera: greska se vidjela odmah. `ctl` je taj pad pretvorio u tihi
 * no-op, jer tanka ruta ne smije pasti zbog cjenika kojeg nema.
 *
 * Bez zamjene bi se time izgubio signal: element obrisan iz `index.html` prosao bi neopazeno, a
 * gumb bi na zatecenoj stranici jednostavno prestao raditi. Zato se provjera SELI, i to na bolje
 * mjesto: pada u CI-ju, nad statickim HTML-om, bez ijednog klika. Prije je trebalo da korisnik
 * otvori stranicu da bi se kvar vidio; sada ga vidi svaki build.
 *
 * Popis se IZVODI iz izvora, ne prepisuje. Prepisan popis istrune: ostao bi zelen dokazujuci
 * nesto o id-jevima koje ozicenje vise ne dira.
 */

const ROOT = resolve(__dirname, '..');
const APP = readFileSync(resolve(ROOT, 'src', 'ui', 'app.ts'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/** Tijelo `initLegacy` + `bind`: sve sto se izvodi pri montazi zatecene stranice. */
function wiringSource(): string {
  const start = APP.indexOf('function initLegacy(');
  expect(start).toBeGreaterThan(-1);
  const bind = APP.indexOf('\nfunction bind()', start);
  expect(bind).toBeGreaterThan(start);
  const end = APP.indexOf('\n}', bind);
  expect(end).toBeGreaterThan(bind);
  return APP.slice(start, end);
}

function wiredIds(): string[] {
  const src = wiringSource();
  const ids = new Set<string>();
  for (const m of src.matchAll(/ctl\('#([A-Za-z0-9_-]+)'\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)\?\./g)) ids.add(m[1]);
  return [...ids].sort();
}

describe('ugovor zatecene stranice', () => {
  it('popis se doista izvodi iz izvora, a ne iz prazne pretrage', () => {
    // Prazan popis bi ucinio tvrdnju ispod vakuumskom: prosla bi bez ijedne provjere.
    // Isti razred kao SENTINEL u klasifikacijskom gardu (nula mapiranih modula = pad).
    expect(wiredIds().length).toBeGreaterThan(50);
  });

  it('index.html sadrzi SVAKI element koji ozicenje dira', () => {
    const missing = wiredIds().filter((id) => !new RegExp(`id="${id}"`).test(INDEX));
    expect(missing).toEqual([]);
  });

  it('ozicenje ne koristi nezasticen pristup, jer bi tanka ruta pala na njemu', () => {
    // `$('#x').onclick=` baca kad elementa nema. Na zatecenoj stranici to nikad ne pukne, pa se
    // regresija vidi tek na tankoj ruti, i to kao pad montaze bez ocitog uzroka.
    const bare = [...wiringSource().matchAll(/\$\('#([A-Za-z0-9_-]+)'\)\.[A-Za-z]/g)].map((m) => m[1]);
    expect([...new Set(bare)]).toEqual([]);
  });
});
