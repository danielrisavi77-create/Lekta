/**
 * Margine kao NAJMANJA dopustena vrijednost, a ne kao ciljana.
 *
 * Nadjeno revizijom bodovanih pravila 2026-08-22 na `forenzika-diplomski`. Izvor glasi "rubovi na
 * obje strane, gore i dolje, moraju biti siroki NAJMANJE 2,5 cm", profil je nosio 2,5 kao ciljanu
 * vrijednost, a engine ju je usporedjivao s `near(..., strict*3)`, dakle uz toleranciju 0,36 cm.
 * Posljedica: rad s 3 cm sa svih strana, potpuno uskladjen s uputom, dobivao je `fail 0/6`.
 *
 * Ovo NIJE izmisljeno pravilo (CLAUDE.md): izmisljeno je bilo tumacenje "najmanje" kao "tocno".
 * Zastavica postoji da se izvor moze zapisati onako kako glasi.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';

const PROFILE = 'forenzika-diplomski';
const TITLE = 'Margine dokumenta';

function body(): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  return Array.from({ length: 10 }, () => ({ text: sentence.repeat(6), sizePt: 12, font: 'Times New Roman', jc: 'both' as const, spacingLine: 360 }));
}

async function marginCheck(cm: number, minimum: boolean) {
  const base: any = resolveProfile(PROFILE);
  const profile = minimum ? { ...base, marginsMinimum: true } : base;
  const file = buildDocxFile({ paragraphs: body(), marginsCm: { top: cm, right: cm, bottom: cm, left: cm } }, `margine-${cm}.docx`);
  const result: any = await analyzeFixture(file, { profileId: PROFILE, profile });
  const check = (result.checks || []).find((c: any) => c.title === TITLE);
  expect(check, `provjera "${TITLE}" mora postojati`).toBeTruthy();
  return check;
}

describe('margine: profil smije propisati NAJMANJU vrijednost', () => {
  it('polazno stanje: profil trazi tocno 2,5 cm', () => {
    expect(resolveProfile(PROFILE).margins).toEqual({ top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 });
  });

  it('bez zastavice 3 cm PADA (zateceno ponasanje ostaje netaknuto)', async () => {
    const c = await marginCheck(3, false);
    expect(c.status, c.detail).toBe('fail');
  }, 30000);

  it('sa zastavicom 3 cm prolazi s punim bodovima', async () => {
    const c = await marginCheck(3, true);
    expect(c.status, c.detail).toBe('pass');
    expect(c.earned).toBe(c.max);
  }, 30000);

  it('sa zastavicom tocno 2,5 cm prolazi', async () => {
    const c = await marginCheck(2.5, true);
    expect(c.status, c.detail).toBe('pass');
    expect(c.earned).toBe(c.max);
  }, 30000);

  it('sa zastavicom 2 cm i dalje PADA: uze od najmanjeg nije dopusteno', async () => {
    const c = await marginCheck(2, true);
    expect(c.status, c.detail).toBe('fail');
    expect(c.earned).toBeLessThan(c.max);
  }, 30000);

  it('kompajler odvaja `minimum` od strana, jer normalizeCheckFlags trazi cetiri broja', () => {
    const eff: any = compileEffectiveRules({
      id: 'test', rules: {},
      ruleEntries: [{ ruleId: 'test--margins', checkId: 'margins', value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5, minimum: true }, status: 'verified' }],
    } as never);
    expect(eff.margins).toEqual({ top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 });
    expect(eff.marginsMinimum).toBe(true);
  });
});
