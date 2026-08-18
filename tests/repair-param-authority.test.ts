/**
 * SERVER, NE KLIJENT, ODLUCUJE CILJANU VRIJEDNOST (RE-62).
 *
 * Do 2026-08-16 je Edge funkcija primala `{fixerId, ruleId, params}` i provjeravala samo je li fixer
 * poznat i ziv; `params` je isao doslovno u `runFixer`, gdje se sanira tipski i rasponski, ali se
 * NIKAD ne usporedjuje s profilom. Rucno skrojen zahtjev mogao je zatraziti vrijednost koju nijedan
 * fakultet ne propisuje. Nije klasicna ranjivost (korisnik mijenja vlastiti dokument), ali rusi
 * tvrdnju "popravljamo prema pravilima tvog fakulteta".
 *
 * Ovi testovi cuvaju dvoje: (1) da server doista prepisuje klijentovu vrijednost profilnom, i
 * (2) da peceni artefakt ne odluta od zivog recepta.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveParams, hasParamAuthority, PARAM_AUTHORITY } from '../src/repair/param-authority';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = readFileSync(join(root, 'supabase/functions/repair-docx/index.ts'), 'utf8');

describe('resolveParams: profil pobjedjuje klijenta', () => {
  // Uzmi PRVI stvarni zapis iz pecenog artefakta, da test ne ovisi o konkretnom fakultetu.
  const profileId = Object.keys(PARAM_AUTHORITY)[0];
  const ruleId = Object.keys(PARAM_AUTHORITY[profileId])[0];
  const entry = PARAM_AUTHORITY[profileId][ruleId];

  it('artefakt uopce postoji i nije prazan', () => {
    expect(Object.keys(PARAM_AUTHORITY).length).toBeGreaterThan(300);
    expect(entry.f).toBeTruthy();
    expect(Object.keys(entry.p).length).toBeGreaterThan(0);
  });

  it('klijentova vrijednost se IGNORIRA kad profil propisuje svoju', () => {
    const podmetnuto = { top: 99, right: 99, bottom: 99, left: 99, fontName: 'Comic Sans MS', fontSizePt: 42 };
    const out = resolveParams(profileId, ruleId, entry.f, podmetnuto);
    expect(out.source).toBe('profile');
    expect(out.params).toEqual(entry.p);
    // Kljuc koji profil ne propisuje NE smije prezivjeti: spajanje bi vratilo istu rupu.
    expect(out.params).not.toHaveProperty('fontName', 'Comic Sans MS');
  });

  it('bez profilnog zapisa ostaje sanirani klijentski put, ali je to OZNACENO', () => {
    const client = { keep: 1 };
    const out = resolveParams(profileId, 'pravilo-koje-ne-postoji', 'font-fixer', client);
    expect(out.source).toBe('client');
    expect(out.params).toEqual(client);
  });

  it('zapis vrijedi za TOCNO jedan fixer (drugi fixer ne pokupi tudju vrijednost)', () => {
    const out = resolveParams(profileId, ruleId, 'nepostojeci-fixer', { a: 1 });
    expect(out.source).toBe('client');
  });

  it('nepoznat ili prazan profileRef ne rusi nego pada na klijenta', () => {
    expect(resolveParams(null, ruleId, entry.f, { a: 1 }).source).toBe('client');
    expect(resolveParams('nepostojeci-profil', ruleId, entry.f, { a: 1 }).source).toBe('client');
    expect(hasParamAuthority('nepostojeci-profil')).toBe(false);
    expect(hasParamAuthority(profileId)).toBe(true);
  });
});

describe('drift: peceni artefakt odgovara zivom receptu', () => {
  /**
   * Isti obrazac kao tests/repair-recipe.test.ts: artefakt se generira iz `buildRecipe()`, pa
   * uredjivanje profila bez `npm run repair-recipe` mora pasti ovdje, a ne tiho na produkciji.
   * Usporedjuje se s VEC generiranim docs/generated/repair-recipe.json (jeftino), ne ponovnim
   * pokretanjem cijelog buildRecipe (koji povlaci drafts-runtime glob).
   */
  const recipe = JSON.parse(readFileSync(join(root, 'docs/generated/repair-recipe.json'), 'utf8')) as Array<{
    id: string;
    items: Array<{ ruleId: string; fixerId: string; scope: string; params: Record<string, unknown> }>;
  }>;

  it('svaki profilni zapis iz recepta postoji u artefaktu s istim fixerom i parametrima', () => {
    const missing: string[] = [];
    for (const profile of recipe) {
      for (const item of profile.items) {
        if (item.scope !== 'profil') continue;
        if (!item.params || Object.keys(item.params).length === 0) continue;
        const baked = PARAM_AUTHORITY[profile.id]?.[item.ruleId];
        if (!baked || baked.f !== item.fixerId || JSON.stringify(baked.p) !== JSON.stringify(item.params)) {
          missing.push(`${profile.id}/${item.ruleId}`);
        }
      }
    }
    expect(missing.slice(0, 10), `pokreni: npm run repair-recipe (${missing.length} neuskladjenih)`).toEqual([]);
  });

  it('artefakt ne sadrzi nista sto recept ne propisuje', () => {
    const allowed = new Set<string>();
    for (const profile of recipe) {
      for (const item of profile.items) {
        if (item.scope === 'profil') allowed.add(`${profile.id}/${item.ruleId}`);
      }
    }
    const extra: string[] = [];
    for (const [profileId, rules] of Object.entries(PARAM_AUTHORITY)) {
      for (const ruleId of Object.keys(rules)) {
        if (!allowed.has(`${profileId}/${ruleId}`)) extra.push(`${profileId}/${ruleId}`);
      }
    }
    expect(extra.slice(0, 10)).toEqual([]);
  });

  it('univerzalna higijena (scope opce) NIJE u artefaktu: nema fakultetskog pravila iza sebe', () => {
    const universal = recipe.flatMap((p) => p.items.filter((i) => i.scope === 'opce').map((i) => `${p.id}/${i.ruleId}`));
    expect(universal.length).toBeGreaterThan(0);
    const leaked = universal.filter((key) => {
      const [profileId, ruleId] = key.split('/');
      return !!PARAM_AUTHORITY[profileId]?.[ruleId];
    });
    expect(leaked.slice(0, 10)).toEqual([]);
  });
});

describe('Edge funkcija stvarno koristi autoritet', () => {
  it('repair-docx razrjesava parametre kroz resolveParams, ne izravno iz meta.requests', () => {
    expect(SERVER).toContain("import { resolveParams");
    expect(SERVER).toContain('const resolved = resolveParams(profileRefForParams, ruleId, r.fixerId, clientParams);');
    expect(SERVER).toContain('params: resolved.params');
    // Stara grana koja je klijentov params gurala ravno u zahtjev vise ne smije postojati.
    expect(SERVER).not.toContain("params: (r.params && typeof r.params === 'object') ? r.params : {}");
  });

  it('odgovor nosi paramSources, da sucelje moze biti posteno o izvoru vrijednosti', () => {
    expect(SERVER).toContain('paramSources');
  });
});
