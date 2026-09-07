/**
 * `post-deploy-smoke` se mora STVARNO POKRENUTI, na svakoj platformi.
 *
 * MOTIV, izmjeren 2026-09-07. Skripta je ulaznu tocku cuvala usporedbom
 * `import.meta.url === \`file://${process.argv[1]}\``. Na Linuxu se to poklopi, na Windowsu nikad
 * (`C:\...` naspram `file:///C:/...`), pa je ista naredba ondje ucitala modul, izvela NISTA i
 * vratila izlazni kod 0. Posljedica nije bila samo kozmeticka: zakazani smoke je bio crven 40
 * uzastopnih pokretanja (od 2026-08-28), a svatko tko bi ga pokusao reproducirati na razvojnom
 * Windows stroju dobio bi tisinu i nulu, dakle "kod mene prolazi".
 *
 * Dva su razlicita pitanja i oba se mjere:
 *   1. IZVODI LI SE uopce ulazna tocka na OVOJ platformi (spawn `--self-test`, ocekuje se ispis).
 *      Ova tvrdnja pada na Windowsu uz naivnu strazu, a na Linuxu ne.
 *   2. Postoji li naivna straza IGDJE u `scripts/` (citanje izvora). Ova tvrdnja pada svugdje, pa
 *      gard grize i na CI-ju, koji je Linux. Bez nje bi se kvar mogao vratiti a da CI suti.
 *
 * `--self-test` je posve offline (podmece sinteticke odgovore), pa ovaj test ne dira mrezu.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasNaiveEntryGuard } from './helpers/entry-guard';

const SCRIPTS = resolve(process.cwd(), 'scripts');

describe('post-deploy-smoke: ulazna tocka', () => {
  it('self-test se stvarno izvede i ispise ishod (nije tihi no-op)', () => {
    const r = spawnSync(process.execPath, [resolve(SCRIPTS, 'post-deploy-smoke.mjs'), '--self-test'], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    const izlaz = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    // Prazan ispis uz kod 0 je upravo kvar zbog kojeg ovaj test postoji, pa se tvrdi ISPIS, ne kod.
    expect(izlaz.trim(), 'skripta nije ispisala nista: ulazna straza nije okinula').not.toBe('');
    expect(izlaz).toContain('SELF-TEST OK');
    expect(r.status, izlaz.slice(0, 500)).toBe(0);
  }, 150_000);

  it('nijedna .mjs skripta ne cuva ulaz slijepljenom stazom', () => {
    const pali: string[] = [];
    for (const ime of readdirSync(SCRIPTS)) {
      if (!ime.endsWith('.mjs')) continue;
      if (hasNaiveEntryGuard(readFileSync(resolve(SCRIPTS, ime), 'utf8'))) pali.push(ime);
    }
    expect(pali, 'straza mora ici preko pathToFileURL(process.argv[1]).href').toEqual([]);
  });

  it('gard prepoznaje naivnu strazu (inace bi prazan popis znacio i "cisto" i "ne radi")', () => {
    expect(hasNaiveEntryGuard('if (import.meta.url === `file://${process.argv[1]}`) main();')).toBe(true);
    expect(hasNaiveEntryGuard("if (import.meta.url === 'file://' + process.argv[1]) main();")).toBe(true);
    expect(hasNaiveEntryGuard('if (import.meta.url === pathToFileURL(process.argv[1]).href) main();')).toBe(false);
  });
});
