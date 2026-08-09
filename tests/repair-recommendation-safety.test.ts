/**
 * TRIPWIRE: nijedan PONUDJENI popravak ne smije oboriti bodovani check koji prolazi.
 *
 * Zasto ovo postoji. Ciljana vrijednost popravka i bodovana vrijednost analize dolaze iz DVA
 * odvojena izvora koja nista ne sinkronizira:
 *
 *   - popravak : `ruleEntry.value` iz `data/profiles/**\/drafts/*.json`, peceno u
 *                `data/profiles/repair-map.json` (`repairEntriesFor` -> `buildRepairableItems`)
 *   - analiza  : `rules.*` iz `data/profiles/verified-profiles.json` (`currentProfile` -> `analyzeDocx`)
 *
 * `scripts/approve-profile.mjs` mijenja samo STATUSE draftova; nikad ne upisuje vrijednost u
 * `rules`. Zato se dvije strane mogu tiho razici, a posljedica je najgori mogusi ishod za
 * korisnika: primijeni ponudjeni popravak i ocjena mu PADNE.
 *
 * Sweep nad stvarnim podacima (2026-08-08, 368 profila / 1844 zapisa) nasao je tocno jedan takav
 * slucaj: `unizd-povijest-zavrsni` prored 2 naspram bodovanih 1.5. `recommendationBreaksScoredRule`
 * ga od sada ne nudi; ovaj test cuva da novi ne nastanu neopazeno.
 *
 * Test NE tvrdi koja je strana tocna. Kad padne, odluka je autorska (verifikacija izvora), ne
 * programerska: ili se ispravi `rules` u profilu, ili `value` u draftu, ili pravilo prestaje biti
 * bodovano. Vidi CLAUDE.md, "Hijerarhija pravila i uloga repozitorija".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepairableItems, type AnalyzedCheck } from '../src/ui/repair-items';
import type { RuleEntry } from '../src/profiles/profile-schema';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

const profiles: Array<{ id: string; rules?: Record<string, any> }> = read('data/profiles/verified-profiles.json');
const repairMap: Record<string, RuleEntry[]> = read('data/profiles/repair-map.json');
const rulesById = new Map(profiles.map((p) => [p.id, p.rules ?? {}]));

const near = (a: number, b: number, tol = 0.12) => Math.abs(a - b) <= tol;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Bi li dokument, nakon sto fixer primijeni `params`, i dalje padao na bodovanom checku?
 * Ogledalo bodovnih grana u `analyzeDocx` (font/size/spacing/justify/margins/paper-size).
 * `null` = dimenzija se za ovaj profil ne boduje, pa nema sto pasti.
 */
function repairStillFailsScoredCheck(
  checkId: string,
  params: Record<string, unknown>,
  rules: Record<string, any>,
): boolean | null {
  switch (checkId) {
    case 'font': {
      if (rules.checkFont === false || !rules.font?.length) return null;
      return !rules.font.some((x: unknown) => norm(x) === norm(params.fontName));
    }
    case 'font-size': {
      if (rules.checkSize === false || !rules.size?.length) return null;
      return !rules.size.some((x: unknown) => Number(x) === Number(params.fontSizePt));
    }
    case 'line-spacing': {
      if (rules.checkSpacing === false || rules.spacing == null) return null;
      return !near(Number(params.multiplier), Number(rules.spacing));
    }
    case 'justify': {
      if (rules.checkJustify === false || rules.justify == null) return null;
      return (params.val === 'both') !== (rules.justify === true);
    }
    case 'margins': {
      if (rules.checkMargins === false || !rules.margins) return null;
      return (['top', 'right', 'bottom', 'left'] as const).some(
        (k) => rules.margins[k] != null && params[k] != null && !near(Number(params[k]), Number(rules.margins[k]), 0.05),
      );
    }
    case 'paper-size': {
      const allowed: string[] | null = rules.paperSizes || (rules.requireA4 ? ['A4'] : null);
      if (!allowed) return null;
      const A: Record<string, [number, number]> = { A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1], A0: [84.1, 118.8] };
      return !allowed.some((n) => A[n] && near(A[n][0], Number(params.w), 0.05) && near(A[n][1], Number(params.h), 0.05));
    }
    default:
      return null;
  }
}

/** checkId -> naslov, samo za citljivu poruku greske. */
const CHECK_ID_BY_ENTRY: Record<string, string> = {
  font: 'Dominantni font',
  'font-size': 'Veličina osnovnog teksta',
  'line-spacing': 'Prored osnovnog teksta',
  margins: 'Margine dokumenta',
  justify: 'Poravnanje osnovnog teksta',
  'paper-size': 'Format stranice',
};

describe('ponudjeni popravak nikad ne obara bodovani check', () => {
  it('pokriva stvarne podatke (sanity: mapa nije prazna)', () => {
    expect(Object.keys(repairMap).length).toBeGreaterThan(300);
    expect(profiles.length).toBeGreaterThan(300);
  });

  it('nijedna ponudjena stavka ne ostavlja svoj bodovani check palim, ni za jedan profil', () => {
    const offenders: string[] = [];

    for (const [profileId, entries] of Object.entries(repairMap)) {
      const rules = rulesById.get(profileId);
      if (!rules) continue; // profil nije u verified setu (npr. povucen); nije predmet ovog testa

      // Sve dimenzije tretiramo kao PREKRSENE, pa buildRepairableItems vrati i required i
      // recommended stavke: zanima nas SVE sto se korisniku moze ponuditi.
      const checks: AnalyzedCheck[] = Object.values(CHECK_ID_BY_ENTRY).map((title) => ({ title, status: 'fail', max: 5 }));
      const items = buildRepairableItems(checks, rules, entries, { includeNonViolated: true });

      for (const item of items) {
        const entry = entries.find((e) => e.ruleId === item.ruleId);
        const checkId = entry?.checkId;
        if (!checkId) continue;
        const verdict = repairStillFailsScoredCheck(checkId, item.params as Record<string, unknown>, rules);
        if (verdict === true) {
          offenders.push(
            `${profileId} :: ${checkId} (${item.ruleId})\n` +
              `    popravak cilja : ${JSON.stringify(item.params)}\n` +
              `    profil boduje  : ${JSON.stringify(pickScored(checkId, rules))}\n` +
              `    -> "${CHECK_ID_BY_ENTRY[checkId] ?? checkId}" bi ostao pao nakon popravka`,
          );
        }
      }
    }

    expect(offenders, `Popravak koji obara bodovani check (${offenders.length}):\n${offenders.join('\n')}`).toEqual([]);
  });
});

function pickScored(checkId: string, rules: Record<string, any>): unknown {
  switch (checkId) {
    case 'font': return rules.font;
    case 'font-size': return rules.size;
    case 'line-spacing': return rules.spacing;
    case 'margins': return rules.margins;
    case 'justify': return rules.justify;
    case 'paper-size': return rules.paperSizes ?? (rules.requireA4 ? ['A4'] : null);
    default: return null;
  }
}

/**
 * a/b/c oznake: popravak ih dodaje SAMO u literaturu i to mora reci.
 *
 * Kad autor ima dva rada istog autora i godine, `(Horvat, 2022)` u tekstu je bas ona
 * dvosmislenost zbog koje oznake postoje. Lekta ne moze znati na koji se rad tvrdnja odnosi, pa
 * ih u tijelu NE dira (vidi `suffixes` u bibliography-repair-fixer.ts). Posljedica je da
 * literatura dobije 2022a/2022b dok citatnice ostanu bez oznake, a bodovana provjera
 * "Isti autor i godina (a/b/c)" pritom prijedje u 'pass' jer gleda samo zapise literature.
 * Zato potvrda mora izricito reci sto ostaje na korisniku.
 */
describe('a/b/c oznake ne obecavaju vise nego sto popravak radi', () => {
  it('parametri prema fixeru NE nose nikakav trag citatnica u tijelu', async () => {
    const src = readFileSync(path.join(ROOT, 'src/repair/bibliography-repair-fixer.ts'), 'utf8');
    // Polje je obrisano i ne smije se vratiti: njegovo popunjavanje znacilo bi da Lekta bira
    // kojem izvoru pripada tvrdnja u tekstu.
    expect(src).not.toMatch(/citationParagraphIndices\s*[?:]/);
  });

  it('potvrda uz odabrane oznake kaze da citatnice u tekstu ostaju na korisniku', async () => {
    const { bibliographyRepairableItem } = await import('../src/ui/repair-items');
    const profile = {
      ruleEntries: [{
        checkId: 'bibliography-rules', status: 'verified', sourceId: 's', sourcePage: 'p', quote: 'q',
        value: { authorYearSuffixes: true },
      }],
    };
    const result = {
      details: {
        bibliographyStructure: {
          entries: [{ id: 'e1', rawText: 'Horvat, I. (2022). Prvi rad.' }, { id: 'e2', rawText: 'Horvat, I. (2022). Drugi rad.' }],
          authorYearGroups: [{ authorYearKey: 'horvat|2022', entryIds: ['e1', 'e2'], suffixes: ['a', 'b'] }],
          summary: { total: 2 },
        },
      },
    };
    const [item] = bibliographyRepairableItem(result, profile);
    expect(item, 'stavka se mora ponuditi').toBeTruthy();
    expect(item.confirmationText).toContain('SAMO u popis literature');
    expect(item.confirmationText).toContain('moraš sam dopuniti');
  });
});
