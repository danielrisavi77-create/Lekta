/**
 * SVAKI FIXER MORA BITI DOSEZAN, ILI IZRICITO IZUZET.
 *
 * "31 fixer" je brojka koju proizvod komunicira (docs/REPAIR_RECIPE.md, marketing). Ta brojka je
 * postena samo ako svaki od njih ima put kojim ga korisnik moze pokrenuti. Zatecena stanja koja su
 * ovo opravdala:
 *
 *  - `element-caption-fixer` i `table-figure-rescue-fixer` bili su MRTVI jer im `element-caption-rules`
 *    odnosno `table-figure-rescue-rules` nema NIJEDAN od 368 profila. Rijeseno (RE-59, RE-61) tako da
 *    se bez profilnog pravila nude kao PREPORUKA (violated:false, recommended:true, bez matchKeys),
 *    dakle izvan bodovanja - vidi "Dopusteno bez fakultetskog pravila" u CLAUDE.md.
 *  - `legal-footnote-repair-fixer` NAMJERNO ostaje vezan uz profilno pravilo: bez sluzbene upute
 *    prepravljanje op. cit./Ibid. znacilo bi izmisljanje citatne konvencije, sto tvrdo pravilo
 *    zabranjuje. Dosezan je, ali samo za pravne profile.
 *  - `footer-page-fixer` je jedini koji NEMA samostalan put i to je odluka: na jednosekcijskom radu
 *    broj stranice bi pao i na naslovnicu, pa zivi iskljucivo unutar kompozita `section-insert-fixer`
 *    (server ga drzi u DARK_FIXERS da ga ni rucno skrojen zahtjev ne moze pozvati izravno).
 *
 * Test pada kad se doda nov fixer bez ijednog puta do korisnika, ili kad postojeci ostane bez puta.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIXER_IDS } from '../src/repair/apply-fixers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPAIR_ITEMS = readFileSync(join(root, 'src/ui/repair-items.ts'), 'utf8');
const REPAIR_MAP = JSON.parse(readFileSync(join(root, 'data/profiles/repair-map.json'), 'utf8')) as Record<
  string,
  Array<{ fixerId: string }>
>;

/** Fixeri bez SAMOSTALNOG puta, uz razlog. Dodavanje ovdje mora biti svjesna odluka. */
const INTENTIONALLY_UNREACHABLE: Record<string, string> = {
  'footer-page-fixer': 'zivi samo unutar kompozita section-insert-fixer (DARK_FIXERS na serveru)',
};

function fixersInProfiles(): Set<string> {
  const out = new Set<string>();
  for (const rules of Object.values(REPAIR_MAP)) for (const rule of rules) out.add(rule.fixerId);
  return out;
}

describe('dosezljivost fixera', () => {
  const inProfiles = fixersInProfiles();
  const offeredByUi = (id: string) => REPAIR_ITEMS.includes(`'${id}'`);

  it('svaki registrirani fixer ima put do korisnika (profil ili UI stavka)', () => {
    const unreachable = FIXER_IDS.filter(
      (id) => !inProfiles.has(id) && !offeredByUi(id) && !INTENTIONALLY_UNREACHABLE[id],
    );
    expect(unreachable, `fixeri bez ijednog puta: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('izuzeci su stvarno nedosezni (mrtav izuzetak se brise, ne skuplja)', () => {
    for (const [id, razlog] of Object.entries(INTENTIONALLY_UNREACHABLE)) {
      expect(FIXER_IDS as readonly string[], `${id} vise ne postoji: makni izuzetak`).toContain(id);
      expect(inProfiles.has(id), `${id} je dobio profilno pravilo: makni izuzetak (${razlog})`).toBe(false);
    }
  });

  it('tri fixera koja nemaju NIJEDNO profilno pravilo i dalje se nude kao preporuka', () => {
    // Ako ijedan od njih ikad dobije profilno pravilo, ovaj test pada i tjera na osvjezavanje
    // dokumentacije (broj "profila s popravkom" u REPAIR_RECIPE.md se tada mijenja).
    for (const id of ['element-caption-fixer', 'table-figure-rescue-fixer', 'legal-footnote-repair-fixer']) {
      expect(inProfiles.has(id), `${id} sada IMA profilno pravilo`).toBe(false);
      expect(offeredByUi(id), `${id} nema put kroz repair-items`).toBe(true);
    }
  });

  it('repair-map pokriva samo dimenzije s ciljanom vrijednoscu iz profila', () => {
    // Danas 6 od 31: ostali fixeri se ne vode profilnom vrijednoscu nego strukturom dokumenta
    // (details.*) ili univerzalnom preporukom. To NIJE kvar, ali jest cinjenica koju treba drzati
    // na oku prije nego se u marketingu tvrdi "svaki popravak dolazi iz pravila fakulteta".
    expect(inProfiles.size).toBeGreaterThan(0);
    expect(inProfiles.size).toBeLessThan(FIXER_IDS.length);
  });
});
