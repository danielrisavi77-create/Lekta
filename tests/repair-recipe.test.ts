/**
 * Drift guard za pisani recept popravka (docs/REPAIR_RECIPE.md, docs/generated/repair-recipe.json).
 *
 * Recept je GENERIRAN iz profila i iz stvarnih funkcija koje se izvrsavaju (src/ui/repair-items.ts).
 * Bez ovog testa bi prvo uredjivanje profila ostavilo dokumentaciju koja tvrdi staru vrijednost, a
 * dokumentacija koja laze o tome sto radimo gora je od nikakve. Kad padne: `npm run repair-recipe`
 * pa commitaj regenerirani izlaz.
 *
 * Uz drift se provjerava i ono sto recept mora biti ISTINIT o sebi: da vrijednosti dolaze iz profila
 * (a ne iz koda) i da nijedna stavka ne dira sadrzaj rada bez izricite privole.
 */
import { describe, it, expect } from 'vitest';
import baked from '../docs/generated/repair-recipe.json';
import { buildRecipe, hasProfileRules, type RecipeProfile } from '../src/repair/recipe';
import { resolveProfile } from '../src/analysis/golden-entry';

const fresh = buildRecipe();

describe('recept popravka je u koraku s profilima', () => {
  it('commitani izlaz je bit-identican svjezem izracunu (inace: npm run repair-recipe)', () => {
    expect(fresh).toEqual(baked as unknown as RecipeProfile[]);
  });

  it('pokriva sve profile i nije prazan (sanity)', () => {
    expect(fresh.length).toBeGreaterThan(300);
    expect(fresh.filter(hasProfileRules).length).toBeGreaterThan(100);
  });
});

describe('recept govori istinu o tome sto popravak radi', () => {
  it('svaka stavka ima poznat fixer i citljivu ciljanu vrijednost', () => {
    for (const p of fresh) {
      for (const it of p.items) {
        expect(it.fixerId, `${p.id}/${it.ruleId}`).toBeTruthy();
        expect(it.target, `${p.id}/${it.ruleId}`).toBeTruthy();
        expect(['profil', 'opce']).toContain(it.scope);
      }
    }
  });

  // Jezgra Option A: ciljane vrijednosti dolaze IZ PROFILA, nikad iz koda. Uzorak dokazuje da se
  // objavljena brojka poklapa s profilom, pa recept ne moze tvrditi vrijednost koju engine ne koristi.
  // Preporucene (advisory) stavke su izuzete: njihova vrijednost dolazi iz ruleEntry.value
  // (paramsFromValue), ne iz profil.rules kao za obavezne stavke - vidi src/ui/repair-items.ts.
  it('ciljane vrijednosti se poklapaju s profilom (uzorak: font, prored, margine)', () => {
    let checked = 0;
    for (const p of fresh) {
      const profile: any = resolveProfile(p.id);
      for (const it of p.items) {
        if (it.recommended) continue;
        if (it.fixerId === 'line-spacing-fixer' && it.params.multiplier != null) {
          expect(it.params.multiplier, p.id).toBe(profile.spacing);
          checked++;
        }
        if (it.fixerId === 'font-fixer' && it.params.fontName) {
          expect(it.params.fontName, p.id).toBe(profile.font?.[0]);
          checked++;
        }
        if (it.fixerId === 'margins-fixer' && it.params.top != null) {
          expect(it.params.top, p.id).toBe(profile.margins?.top);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100); // dokaz nevakuoznosti
  });

  // RE-nacelo: jedini popravak koji dira AUTOROV TEKST (velika slova naslova) nikad ne smije
  // izgledati kao bezuvjetan. U receptu to znaci da uz njega uvijek stoji uvjet privole.
  it('stavka koja mijenja tekst rada uvijek nosi uvjet privole', () => {
    const textItems = fresh.flatMap((p) => p.items.filter((i) => i.fixerId === 'heading-case-fixer'));
    expect(textItems.length).toBeGreaterThan(0);
    for (const it of textItems) expect(it.condition ?? '').toMatch(/privol/i);
  });

  // Provenijencija se ne izmislja (CLAUDE.md): pravilo bez potvrdjenog izvora ostaje bez izvora.
  it('gdje izvor postoji, ima naslov i URL; gdje ne postoji, polje je prazno a ne nagadjano', () => {
    const withSource = fresh.flatMap((p) => p.items).filter((i) => i.source);
    expect(withSource.length).toBeGreaterThan(100);
    for (const it of withSource) {
      expect(it.source!.title).toBeTruthy();
      expect(it.source!.url).toMatch(/^https?:\/\//);
    }
  });
});
