/**
 * Regresija za automatski odabir vrste rada (feature 2) i citatnog stila (feature 3).
 * Testira cistu logiku iz src/ui/work-selection.ts protiv STVARNOG registra profila,
 * cime se zakljucava ponasanje koje app.ts (autoSelectWorkType/syncProfileContext)
 * vec provodi u UI-u.
 */
import { describe, it, expect } from 'vitest';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import {
  workTypesForSelection,
  pickWorkType,
  defaultWorkTypeForProgram,
  isWorkTypeLocked,
  citationForDefinition,
  isCitationLocked,
  languageForDefinition,
  isLanguageLocked,
  WORK_TYPE_PRIORITY,
  type WorkType,
} from '../src/ui/work-selection';

const REG = VERIFIED_PROFILE_REGISTRY as unknown as {
  id: string;
  unitId: string;
  programs: string[];
  workTypes?: string[];
  rules?: any;
}[];

const defFor = (id: string) => REG.find((d) => d.id === id) || null;

describe('feature 2: automatski odabir vrste rada iz studija', () => {
  it('studij s jednom vrstom rada -> ta vrsta i zakljucano (alu doktorski)', () => {
    const exact = workTypesForSelection(REG, 'alu', 'Doktorski studij Akademije likovnih umjetnosti');
    expect([...exact]).toEqual(['doctoral']);
    expect(isWorkTypeLocked(exact)).toBe(true);
    // cak i ako je trenutni izbor drugaciji, bira se jedina podrzana vrsta
    expect(pickWorkType(exact, 'graduate')).toBe('doctoral');
  });

  it('fpzg diplomski politologija: dijeli program s opcim radom pa nije zakljucan, ali prioritet bira graduate', () => {
    // Program 'Diplomski studij Politologija' imaju i fpzg-politologija-diplomski (graduate)
    // i fpzg-opci-akademski-rad (seminar/project/article), pa skup nije jednoclanan.
    const exact = workTypesForSelection(REG, 'fpzg', 'Diplomski studij Politologija');
    expect(exact.has('graduate')).toBe(true);
    expect(isWorkTypeLocked(exact)).toBe(false);
    // trenutni izbor izvan skupa -> najvisi po prioritetu je graduate
    expect(pickWorkType(exact, 'x')).toBe('graduate');
    // podrzani trenutni izbor ostaje
    expect(pickWorkType(exact, 'seminar')).toBe('seminar');
  });

  it('studij s vise vrsta -> nije zakljucan, bira najvisu po prioritetu', () => {
    const exact = workTypesForSelection(REG, 'fpzg', 'Prijediplomski studij Politologija');
    expect(exact.size).toBeGreaterThan(1);
    expect(isWorkTypeLocked(exact)).toBe(false);
    // {final, seminar, project, article} -> 'final' je najvisi prisutni u prioritetu
    expect(pickWorkType(exact, 'graduate')).toBe('final');
  });

  it('korisnikov izbor koji je podrzan ostaje netaknut', () => {
    const exact = new Set<WorkType>(['final', 'seminar', 'project', 'article']);
    expect(pickWorkType(exact, 'seminar')).toBe('seminar');
  });

  it('nepoznat studij (prazan skup) -> zadrzava trenutnu vrstu (opca provjera)', () => {
    const exact = workTypesForSelection(REG, 'nepostojeci', 'Nepostojeci program');
    expect(exact.size).toBe(0);
    expect(pickWorkType(exact, 'graduate')).toBe('graduate');
  });

  it('prioritet postuje akademsku razinu (doctoral > graduate > final > seminar)', () => {
    expect(pickWorkType(new Set(['seminar', 'doctoral', 'graduate'] as WorkType[]), 'x')).toBe('doctoral');
    expect(pickWorkType(new Set(['seminar', 'graduate'] as WorkType[]), 'x')).toBe('graduate');
    expect(WORK_TYPE_PRIORITY[0]).toBe('doctoral');
  });
});

describe('feature 2b: zadana vrsta rada prema razini studija (defaultWorkTypeForProgram)', () => {
  const any = new Set<WorkType>(['final', 'seminar', 'project', 'article']);
  it('preddiplomski/prijediplomski -> seminar (ne teza)', () => {
    expect(defaultWorkTypeForProgram('Prijediplomski studij Politologija', any, 'graduate')).toBe('seminar');
    expect(defaultWorkTypeForProgram('Preddiplomski sveučilišni studij X', any, 'graduate')).toBe('seminar');
  });
  it('diplomski -> graduate; integrirani (prijediplomski i diplomski) -> graduate', () => {
    expect(defaultWorkTypeForProgram('Diplomski studij Politologija', any, 'x')).toBe('graduate');
    expect(defaultWorkTypeForProgram('Sveučilišni integrirani prijediplomski i diplomski studij Pravo', any, 'x')).toBe('graduate');
  });
  it('doktorski -> doctoral, specijalisticki -> specialist', () => {
    expect(defaultWorkTypeForProgram('Doktorski studij Politologija', any, 'x')).toBe('doctoral');
    expect(defaultWorkTypeForProgram('Sveučilišni specijalistički studij Odnosi s javnošću', any, 'x')).toBe('specialist');
  });
  it('bez prepoznate razine -> fallback na prioritetski odabir (pickWorkType)', () => {
    // 'Master of European Studies' nema hrvatsku razinsku rijec -> prioritet: current podrzan ostaje
    expect(defaultWorkTypeForProgram('Master of European Studies', any, 'seminar')).toBe('seminar');
    // current izvan skupa -> najvisi po prioritetu (final)
    expect(defaultWorkTypeForProgram('Master of European Studies', any, 'x')).toBe('final');
  });
});

describe('feature 3: automatski odabir citatnog stila iz profila', () => {
  it('profil s recommendedCitation vraca taj stil', () => {
    const grf = defFor('grf-diplomski');
    expect(grf?.rules?.recommendedCitation).toBeTruthy();
    expect(citationForDefinition(grf)).toBe(grf!.rules.recommendedCitation);
  });

  it('fpzg profil preporuca autor-godina (fpzg) stil', () => {
    const def = defFor('fpzg-politologija-diplomski');
    expect(citationForDefinition(def)).toBe('fpzg');
  });

  it('null/prazan profil -> nema preporuke, nije zakljucano', () => {
    expect(citationForDefinition(null)).toBeNull();
    expect(citationForDefinition({ rules: {} })).toBeNull();
    expect(isCitationLocked(null)).toBe(false);
    expect(isCitationLocked({ rules: { citationLocked: true } })).toBe(true);
  });

  it('svaki profil koji ima recommendedCitation vrati ne-null (konzistentnost registra)', () => {
    const withCit = REG.filter((d) => d.rules?.recommendedCitation);
    expect(withCit.length).toBeGreaterThan(0);
    for (const d of withCit) expect(citationForDefinition(d)).toBe(d.rules.recommendedCitation);
  });
});

describe('jezik rada iz profila', () => {
  it('profil bez jezicnog pravila ne predlaze nista i ne zakljucava (izbor ostaje korisniku)', () => {
    expect(languageForDefinition(null)).toBeNull();
    expect(languageForDefinition({ rules: {} })).toBeNull();
    expect(isLanguageLocked(null)).toBe(false);
    expect(isLanguageLocked({ rules: {} })).toBe(false);
  });

  it('profil s propisanim jezikom vrati kod, a zakljucava se samo uz languageLocked', () => {
    expect(languageForDefinition({ rules: { documentLanguage: 'en' } })).toBe('en');
    expect(isLanguageLocked({ rules: { documentLanguage: 'en' } })).toBe(false);
    expect(isLanguageLocked({ rules: { documentLanguage: 'en', languageLocked: true } })).toBe(true);
  });

  it('registar: jezik je uvijek kljuc #docLanguage, a zakljucan je samo uz propisan jezik', () => {
    const withLang = REG.filter((d: any) => d.rules?.documentLanguage);
    expect(withLang.length, 'ocekivan barem jedan profil s propisanim jezikom').toBeGreaterThan(0);
    for (const d of withLang as any[]) {
      expect(['hr', 'en', 'other'], `${d.id}: nepoznat jezik`).toContain(d.rules.documentLanguage);
    }
    // Zakljucan jezik bez vrijednosti bio bi mrtav lokot: UI bi onemogucio izbor, a nista ne bi postavio.
    for (const d of REG as any[]) {
      if (d.rules?.languageLocked) {
        expect(languageForDefinition(d), `${d.id}: languageLocked bez documentLanguage`).not.toBeNull();
      }
    }
  });
});
