import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RUTA `/moji-radovi/`: osobni prostor (lokalni rad + popravci na racunu).
 *
 * Ruta postoji zato sto ju je javni direktorij vec OBECAVAO, kao zapisanu namjeru. Dok obecanje
 * stoji a rute nema, poveznica vodi u 404; dok ruta postoji a ne isporucuje ono sto opis kaze,
 * obecanje je i dalje neispunjeno, samo tise.
 */

const ROOT = resolve(__dirname, '..');
const STRANICA = readFileSync(resolve(ROOT, 'moji-radovi', 'index.html'), 'utf8');
const ULAZ = readFileSync(resolve(ROOT, 'src', 'routes', 'my-work', 'main.ts'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const CSS = readFileSync(resolve(ROOT, 'src', 'shared', 'page.css'), 'utf8');
const DIREKTORIJ = readFileSync(resolve(ROOT, 'src', 'routes', 'shared', 'public-route-directory.json'), 'utf8');

describe('ruta /moji-radovi/', () => {
  it('isporucuje SIDRA koja javni direktorij obecava', () => {
    // `/moji-radovi/#racun` je zapisan u direktoriju. Ruta bez tog sidra ispunjava obecanje samo
    // napola: poveznica se otvori, ali ne vodi nikamo unutar stranice.
    const obecana = Array.from(DIREKTORIJ.matchAll(/"href": "\/moji-radovi\/#([^"]+)"/g), (m) => m[1]);
    expect(obecana.length, 'direktorij vise ne obecava nijedno sidro; provjeri jesi li mjerio pravu datoteku').toBeGreaterThan(0);
    for (const anchor of obecana) {
      expect(STRANICA, `direktorij obecava #${anchor}`).toContain(`id="${anchor}"`);
    }
  });

  it('NIJEDNO sidro nije mrtvo: odrediste postoji NA TOJ stranici', () => {
    // Navigacija je DOSLOVNO preuzeta s druge rute, gdje `#how` i slicni postoje. Ovdje ne postoje.
    // Ista greska je vec jednom isporucena na `/saznaj-vise/` (pet mrtvih sidara), pa se ovdje mjeri
    // od prvog dana.
    const ids = new Set(Array.from(STRANICA.matchAll(/[\s]id="([^"]+)"/g), (m) => m[1]));
    const mrtva = Array.from(new Set(Array.from(STRANICA.matchAll(/href="#([^"]+)"/g), (m) => m[1])))
      .filter((h) => !ids.has(h));
    expect(mrtva, 'sidro bez odredista na ovoj stranici').toEqual([]);
  });

  it('NE uvozi analizator, jer bi time povukla cijeli graf', () => {
    expect(ULAZ).not.toMatch(/from '.*ui\/app'/);
    expect(STRANICA).not.toContain('/src/main.ts');
    expect(STRANICA).toContain('/src/routes/my-work/main.ts');
  });

  it('NE duplicira prijavu, nego cita sesiju koju analizator zapisuje', () => {
    // Druga kopija toka prijave znacila bi dvije izvedbe sigurnosno osjetljivog koda koje se mogu
    // razici. Ruta zato cita ISTI kljuc i za prijavu upucuje na alat.
    expect(ULAZ).toContain('STORAGE_KEYS.session');
    for (const zabranjeno of ['requestEmailOtp', 'verifyEmailOtp', 'signInWithPassword']) {
      expect(ULAZ, `${zabranjeno} pripada jednom mjestu`).not.toContain(zabranjeno);
    }
  });

  it('konfiguracija povijesti se IZVODI, ne prepisuje', () => {
    // Prepisana izvedba URL-a razisla bi se tiho, a pogodila bi tek korisnika kojem preuzimanje ne
    // radi. Zato se koristi ista funkcija koju zove analizator.
    expect(ULAZ).toContain('repairHistoryConfigFrom');
    expect(ULAZ, 'staza se izvodi iz projektnog URL-a, ne pise rucno').not.toContain('/functions/v1/delete-repair-job');
  });

  it('dvije polovice su NEOVISNE: pad racuna ne smije odnijeti lokalni popis', () => {
    // Student koji nije prijavljen mora vidjeti svoje lokalne radove. Zato se ne cekaju u nizu i
    // svaka ima vlastiti `catch`.
    expect(ULAZ).toMatch(/void loadLocal\(now\);\s*\n\s*void loadAccount\(now\);/);
    expect((ULAZ.match(/catch \(error\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('inline skripta teme je BAJT-IDENTICNA, pa joj CSP hash vrijedi', () => {
    const re = /<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>[\s\S]*?<\/script>/;
    const eol = (t: string) => t.split('\r\n').join('\n');
    expect(eol(STRANICA.match(re)?.[0] ?? '')).toBe(eol(INDEX.match(re)?.[0] ?? ''));
  });

  it('canonical ide kroz produkcijski origin i stranica se NE indeksira', () => {
    // Osobni prostor nema sto raditi u trazilici: sadrzaj je prazan bez korisnikovih podataka.
    expect(STRANICA).toContain('<link rel="canonical" href="https://lektahr.netlify.app/moji-radovi/">');
    expect(STRANICA).toContain('name="robots" content="noindex,follow"');
  });

  it('svaki CSS token koji ruta koristi doista POSTOJI', () => {
    // Token koji ne postoji ne rusi nista: element se samo iscrta bez boje, i to se vidi tek okom.
    const pravila = Array.from(CSS.matchAll(/\.mw-[^}]*}/g), (m) => m[0]).join('');
    expect(pravila.length, 'stil rute nije nadjen; bez njega je popis nestiliziran').toBeGreaterThan(0);

    // SVAKA klasa koju ulaz ispisuje mora imati OSNOVNO pravilo. Trazi se selektor koji POCINJE tom
    // klasom, ne bilo koja pojava njezina imena:
    //
    //   `.mw-item-name{...}`        osnovno stanje, ovo je ono sto stranicu cini stiliziranom
    //   `a.mw-item-name:hover{...}` samo stanje; sadrzi isti niz, a element je u mirovanju gol
    //
    // Prve dvije izvedbe ovog garda su pale upravo na toj razlici: `toContain('.mw-item-name')`
    // prolazi i kad je osnovno pravilo obrisano, jer ga hover pravilo i dalje sadrzi. Kvar koji se
    // time propusta je onaj koji je `/rad/` ucinio NESTILIZIRANIM: stranica se ucita, svi testovi
    // produ, a element nema nijedno pravilo.
    for (const klasa of new Set(Array.from(ULAZ.matchAll(/class="(mw-[a-z-]+)"/g), (m) => m[1]))) {
      const osnovno = new RegExp(`(?:^|[}\n])\s*\.${klasa}(?![a-z-])[^{]*\{`);
      expect(osnovno.test(CSS), `klasa ${klasa} nema OSNOVNO pravilo (samo stanje se ne racuna)`).toBe(true);
    }
    const definirani = new Set(Array.from(CSS.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1]));
    for (const token of new Set(Array.from(pravila.matchAll(/var\((--[a-z0-9-]+)\)/g), (m) => m[1]))) {
      expect(definirani.has(token), `token ${token} nije definiran`).toBe(true);
    }
  });
});
