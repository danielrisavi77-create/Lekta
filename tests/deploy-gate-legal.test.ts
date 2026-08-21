/**
 * Deploy gate nad pravnim identitetom pruzatelja: DVA praga, ne jedan.
 *
 * Gate je dugo tvrdo padao samo uz `LEKTA_COMMERCE_LIVE=1`, uz obrazlozenje "za BESPLATNU
 * analizu je prazan identitet podnosljiv". To je vrijedilo dok je besplatni sloj bio 100%
 * lokalna analiza. Besplatna beta popravka (`REPAIR_FREE_MODE=true`) uploada i POHRANJUJE
 * dokument, sto GO_LIVE_REPAIR.md sam zove privatnosnim zaokretom, pa GDPR cl. 13 trazi
 * imenovanog voditelja obrade neovisno o naplati.
 *
 * `verify-deploy-dist.mjs` se izvodi tek na kraju netlify build lanca i trazi pravi `dist/`,
 * pa se ne moze pozvati iz vitesta. Zato se, kao u `deploy-origin.test.ts`, cita IZVOR i tvrdi
 * struktura gatea.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'scripts/verify-deploy-dist.mjs'), 'utf8');
const provider = JSON.parse(readFileSync(path.join(ROOT, 'data/legal/provider.json'), 'utf8'));

/** Tijelo objektnog literala imenovane konstante (od `= {` do prvog `};`). */
function objectBody(name: string): string {
  const start = src.indexOf(`const ${name} = {`);
  expect(start, `${name} ne postoji u verify-deploy-dist.mjs`).toBeGreaterThan(-1);
  const end = src.indexOf('};', start);
  expect(end, `${name} nema zatvaranje`).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Tijelo `if (...) { ... }` grane, omedjeno stvarnim parom viticastih zagrada. */
function branchBody(marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `grana ne postoji: ${marker}`).toBeGreaterThan(-1);
  const open = src.indexOf('{', at);
  expect(open).toBeGreaterThan(at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`grana nije zatvorena: ${marker}`);
}

describe('deploy gate: pravni identitet pruzatelja', () => {
  it('gard protiv vakuumskog prolaza: gate i dalje cita data/legal/provider.json', () => {
    expect(src).toContain("'data', 'legal', 'provider.json'");
    // Ako se ovo promijeni, ostatak testa mjeri mrtav kod.
    expect(src).toContain('const provider = JSON.parse(');
  });

  it('prag OBRADE trazi voditelja i sjediste, a NE trazi podatke trgovca', () => {
    const processing = objectBody('REQUIRED_FOR_PROCESSING');
    expect(processing).toContain('privacyController');
    expect(processing).toContain('address');
    // OIB i telefon su ZZP predugovorne informacije trgovca, ne GDPR cl. 13; ne smiju blokirati
    // betu popravka, inace se prag obrade ne moze zadovoljiti bez registriranog trgovca.
    expect(processing).not.toContain('oib');
    expect(processing).not.toContain('phone');
  });

  it('prag NAPLATE nasljeduje prag obrade i dodaje OIB i telefon', () => {
    const commerce = objectBody('REQUIRED_FOR_COMMERCE');
    expect(commerce).toContain('...REQUIRED_FOR_PROCESSING');
    expect(commerce).toContain('oib');
    expect(commerce).toContain('phone');
  });

  it('LEKTA_REPAIR_LIVE je vezan uz fail(), ne samo uz upozorenje', () => {
    expect(src).toContain("process.env.LEKTA_REPAIR_LIVE === '1'");
    // Tijelo grane, omedjeno zagradama: prozor fiksne duljine bi procurio u sljedeci blok
    // i test bi mjerio tudji `console.warn`.
    const body = branchBody('if (repairLive && missingForProcessing.length)');
    expect(body).toContain('fail(');
    expect(body).not.toContain('console.warn');
  });

  it('LEKTA_COMMERCE_LIVE ostaje tvrd (regresija na postojece ponasanje)', () => {
    expect(src).toContain("process.env.LEKTA_COMMERCE_LIVE === '1'");
    const body = branchBody('if (commerceLive && missingForCommerce.length)');
    expect(body).toContain('fail(');
    expect(body).not.toContain('console.warn');
  });

  it('bez ijedne zastavice gate ne blokira lokalnu analizu', () => {
    expect(src).toContain('if (!commerceLive && !repairLive && missingForCommerce.length)');
  });

  it('identitet voditelja obrade je sve-ili-nista, nikad polovican', () => {
    /**
     * Polovicno popunjen identitet je GORI od praznog: `legal-content.ts` tada prestaje
     * renderirati napomenu "subjekt nije registriran" cim se pojavi OIB, pa dokument citatelju
     * izgleda kao da je voditelj obrade potpuno identificiran iako mu fali sjediste.
     */
    const controller = String(provider.privacyController ?? '').trim();
    const address = String(provider.address ?? '').trim();
    const oib = String(provider.oib ?? '').trim();

    expect(
      Boolean(controller) === Boolean(address),
      `privacyController=${JSON.stringify(controller)} i address=${JSON.stringify(address)} moraju biti oba prazna ili oba popunjena`,
    ).toBe(true);

    // OIB je okidac koji GASI napomenu (`registrationNote` u legal-content.ts: `if (c.oib) return ''`).
    // Zato upisan OIB bez voditelja ili bez sjedista daje najgori ishod: napomena "subjekt nije
    // registriran" nestane, a polja koja bi ga identificirala se i dalje ne renderiraju.
    if (oib) {
      expect(controller, 'OIB je upisan pa privacyController vise ne smije biti prazan').not.toBe('');
      expect(address, 'OIB je upisan pa address vise ne smije biti prazan').not.toBe('');
    }
  });
});
