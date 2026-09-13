/**
 * JEDAN SASTAVLJAC PONUDE POPRAVAKA (E2, 2026-09-12).
 *
 * Do E2 je `src/ui/app.ts` u `renderRepairSection` imao vlastiti inline sastav (dvadesetak poziva
 * `*RepairableItem` graditelja), a `tests/real-corpus/harness.ts` je zvao
 * `buildAllRepairableItems` iz `src/ui/repair-item-assembly.ts`. Komentar u harnessu tvrdio je da
 * je to "ISTI sastavljac koji koristi sucelje", a nije bio: izmjereno nad 22 golden fixture
 * (oba paywall stanja, s predloskom naslovnice i bez), inline i modul su se razlikovali u
 * redoslijedu na 9 fixtura (consistency/croatian-typography naspram table-figure-rescue/
 * section-surgery) i u clanstvu na 2 (modul vraca heading-case, inline ga je zvao zasebno).
 *
 * Ovaj gard drzi da se to ne vrati: app.ts ne smije zvati nijednog graditelja izravno, nego
 * iskljucivo modul; harness uvozi isti modul. Bez toga korpusno mjerenje opet opisuje tok koji
 * korisnik ne vidi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEPARATE_CONSENT_FIXER_IDS,
  splitSeparateConsentItems,
} from '../src/ui/repair-item-assembly';
import { headingCaseRepairableItem } from '../src/ui/repair-items';

const KORIJEN = path.resolve(__dirname, '..');
const APP = 'src/ui/app.ts';
const MODUL = 'src/ui/repair-item-assembly.ts';
const HARNESS = 'tests/real-corpus/harness.ts';

/**
 * Datoteke u `src/` koje SMIJU zvati graditelje: definicije (`repair-items.ts`), sam sastavljac,
 * i `recipe.ts`, koji za dokumentaciju nabraja SVE graditelje bez ijednog checka (to je popis
 * recepta, ne ponuda korisniku, i nije u bundleu). Testovi uz izvor (`*.test.ts`) mjere pojedine
 * graditelje izravno i to je njihov posao.
 */
const DOPUSTENI_POZIVATELJI = new Set([
  'src/ui/repair-items.ts',
  'src/ui/repair-item-assembly.ts',
  'src/repair/recipe.ts',
]);

const citaj = (rel: string): string => fs.readFileSync(path.join(KORIJEN, rel), 'utf8');

/**
 * Izravni pozivi graditelja u izvoru: identifikator koji zavrsava na `RepairableItem` ili
 * `RepairableItems` i odmah zove. `buildAllRepairableItems` je sam sastavljac, pa se izuzima.
 * Regex je doslovan (ne gradjen iz niza), da escape ne moze nestati kroz alat.
 */
export function izravniPoziviGraditelja(izvor: string): string[] {
  const nadjeno: string[] = [];
  const re = /\b([A-Za-z]+RepairableItems?)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(izvor)) !== null) {
    if (m[1] !== 'buildAllRepairableItems') nadjeno.push(m[1]);
  }
  return nadjeno;
}

function sveSrcDatoteke(): string[] {
  const out: string[] = [];
  const hodaj = (dir: string) => {
    for (const ime of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ime.name);
      if (ime.isDirectory()) hodaj(p);
      else if (ime.name.endsWith('.ts')) out.push(path.relative(KORIJEN, p).split(path.sep).join('/'));
    }
  };
  hodaj(path.join(KORIJEN, 'src'));
  return out;
}

describe('jedan sastavljac ponude popravaka', () => {
  /**
   * SENTINEL: detektor mora u modulu naci sve graditelje koje modul zove. Bez ovoga bi prazan
   * rezultat nad app.ts mogao znaciti i da regex nista ne prepoznaje. Broj je IZMJEREN (26
   * razlicitih graditelja u sastavljacu na dan uvodjenja) i smije samo rasti.
   */
  it('detektor prepoznaje graditelje u samom sastavljacu (sentinel)', () => {
    const pozivi = izravniPoziviGraditelja(citaj(MODUL));
    const razliciti = new Set(pozivi);
    expect(razliciti.size, `u ${MODUL} nadjeno ${razliciti.size} graditelja; izmjereno je 26`).toBeGreaterThanOrEqual(26);
    expect(razliciti.has('headingCaseRepairableItem')).toBe(true);
    expect(razliciti.has('buildRepairableItems')).toBe(true);
  });

  it('app.ts ne zove nijednog graditelja izravno i uvozi sastavljac', () => {
    const izvor = citaj(APP);
    const pozivi = izravniPoziviGraditelja(izvor);
    expect(pozivi, `app.ts izravno zove: ${pozivi.join(', ')}; ponudu slaze samo ${MODUL}`).toEqual([]);
    expect(izvor).toMatch(/import \{[^}]*\bbuildAllRepairableItems\b[^}]*\} from '\.\/repair-item-assembly'/);
    expect(izvor).toMatch(/import \{[^}]*\bsplitSeparateConsentItems\b[^}]*\} from '\.\/repair-item-assembly'/);
  });

  it('harness uvozi ISTI modul kao sucelje', () => {
    const izvor = citaj(HARNESS);
    expect(izvor).toMatch(/import \{[^}]*\bbuildAllRepairableItems\b[^}]*\} from '\.\.\/\.\.\/src\/ui\/repair-item-assembly'/);
    expect(izravniPoziviGraditelja(izvor)).toEqual([]);
  });

  it('u src/ nema drugog mjesta koje slaze ponudu', () => {
    const datoteke = sveSrcDatoteke();
    expect(datoteke.length, 'sentinel: src/ nije prazan').toBeGreaterThan(50);
    expect(datoteke).toContain(APP);
    const prekrsitelji = datoteke
      .filter((rel) => !rel.endsWith('.test.ts') && !DOPUSTENI_POZIVATELJI.has(rel))
      .map((rel) => [rel, izravniPoziviGraditelja(citaj(rel))] as const)
      .filter(([, pozivi]) => pozivi.length > 0)
      .map(([rel, pozivi]) => `${rel}: ${[...new Set(pozivi)].join(', ')}`);
    expect(prekrsitelji, 'graditelje smiju zvati samo definicije, sastavljac i recipe.ts').toEqual([]);
  });

  /**
   * MUTACIJA: podmetnut jedan izravni poziv u kopiju izvora app.ts. Detektor ga mora prijaviti;
   * inace gard iznad prolazi vakuumski.
   */
  it('mutacija: vraceni izravni poziv u app.ts se prijavi', () => {
    const cist = citaj(APP);
    expect(izravniPoziviGraditelja(cist), 'baseline mora biti cist').toEqual([]);
    const mutiran = cist + '\nconst _x = headingStructureRepairableItem(r, analyzedProfile);\n';
    expect(izravniPoziviGraditelja(mutiran)).toEqual(['headingStructureRepairableItem']);
    const mutiranSpread = cist + '\nconst items = [...buildRepairableItems(r.checks, p, entries)];\n';
    expect(izravniPoziviGraditelja(mutiranSpread)).toEqual(['buildRepairableItems']);
  });
});

describe('splitSeparateConsentItems: zahvat u tekst ostaje izvan "Popravi sve"', () => {
  it('skup fixera sa zasebnom privolom nije prazan (sentinel)', () => {
    expect(SEPARATE_CONSENT_FIXER_IDS.size).toBeGreaterThan(0);
  });

  /**
   * Skup je vezan uz STVARNI fixerId graditelja, ne uz prepisan niz: da se `heading-case-fixer`
   * ikad preimenuje, stavka bi tiho usla u glavni panel i u zadani odabir, a to je jedini
   * popravak koji dira sadrzaj rada.
   */
  it('heading-case iz pravog graditelja zavrsava medju textItems', () => {
    const profil = { headingRules: { maxLevel: 2, levels: { '1': { uppercase: true } } } };
    const stavke = headingCaseRepairableItem([], profil);
    expect(stavke.length, 'sentinel: graditelj mora nesto vratiti').toBe(1);
    const { items, textItems } = splitSeparateConsentItems([
      { fixerId: 'font-fixer', ruleId: 'a' },
      ...stavke,
      { fixerId: 'margins-fixer', ruleId: 'b' },
    ]);
    expect(textItems.map((i) => i.fixerId)).toEqual(['heading-case-fixer']);
    expect(items.map((i) => i.fixerId)).toEqual(['font-fixer', 'margins-fixer']);
  });

  it('redoslijed unutar obje polovice je ulazni redoslijed', () => {
    const ulaz = [
      { fixerId: 'a', ruleId: '1' },
      { fixerId: 'heading-case-fixer', ruleId: '2' },
      { fixerId: 'b', ruleId: '3' },
      { fixerId: 'heading-case-fixer', ruleId: '4' },
      { fixerId: 'c', ruleId: '5' },
    ];
    const { items, textItems } = splitSeparateConsentItems(ulaz);
    expect(items.map((i) => i.ruleId)).toEqual(['1', '3', '5']);
    expect(textItems.map((i) => i.ruleId)).toEqual(['2', '4']);
    expect(items.length + textItems.length).toBe(ulaz.length);
  });

  it('mutacija: stavka koja nije u skupu ostaje u glavnom panelu', () => {
    const { items, textItems } = splitSeparateConsentItems([{ fixerId: 'heading-case-fixer-x', ruleId: '1' }]);
    expect(textItems).toEqual([]);
    expect(items.length).toBe(1);
  });
});
