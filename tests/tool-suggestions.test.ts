import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestTool } from '../src/ui/tool-suggestions';

describe('suggestTool: utkivanje alata u tok ispravaka', () => {
  it('naslovnica se prepoznaje iz naslova', () => {
    expect(suggestTool({ title: 'Nedostaje naslovnica' })?.href).toBe('naslovnica.html');
  });
  it('izjava o izvornosti vodi na izjava alat', () => {
    expect(suggestTool({ detail: 'Izjava o izvornosti nije priložena' })?.href).toBe('izjava.html');
  });
  it('literatura ima prednost pred opcim citatnim', () => {
    expect(suggestTool({ category: 'citations', title: 'Popis literature nije uredan' })?.href).toBe('literatura.html');
  });
  it('opći citatni problem vodi na citat generator', () => {
    expect(suggestTool({ category: 'citations', title: 'Provjeri navod u tekstu' })?.href).toBe('citat.html');
  });
  it('opseg/kartice se prepoznaju', () => {
    expect(suggestTool({ title: 'Opseg rada je premali', detail: 'broj riječi ispod minimuma' })?.href).toBe('kartice.html');
  });
  it('nepovezan problem vraca null (bez lazne ponude)', () => {
    expect(suggestTool({ title: 'Font nije Times New Roman', category: 'formatting' })).toBeNull();
  });
});

describe('suggestTool s kontekstom selekcije: naslovnica nosi ?fakultet/razina/smjer', () => {
  const issue = { title: 'Nedostaje naslovnica' };

  it('puni kontekst daje parametrizirani href (konzumira ga applyUrlParams u naslovnica-page)', () => {
    const s = suggestTool(issue, { unitId: 'fpzg', workType: 'graduate', program: 'Politologija' });
    expect(s?.href).toBe('naslovnica.html?fakultet=fpzg&razina=diplomski&smjer=Politologija');
  });

  it('bez unitId (generic profil) ostaje goli href; nepoznat workType ne proizvodi razina=undefined', () => {
    expect(suggestTool(issue, {})?.href).toBe('naslovnica.html');
    expect(suggestTool(issue)?.href).toBe('naslovnica.html');
    const s = suggestTool(issue, { unitId: 'fpzg', workType: 'nesto-nepoznato' });
    expect(s?.href).toBe('naslovnica.html?fakultet=fpzg');
    expect(s?.href).not.toContain('undefined');
  });

  it('ostali alati ne dobivaju parametre (nemaju param ugovor)', () => {
    const s = suggestTool({ detail: 'Izjava o izvornosti nije priložena' }, { unitId: 'fpzg' });
    expect(s?.href).toBe('izjava.html');
  });
});

describe('findingCardHtml wiring u finding-view-model.ts (source tripwire)', () => {
  // Nekad zivjelo u app.ts (renderActionPlan), koja je uklonjena kao mrtav kod: pisala je u
  // #actionPlan unutar #tab-action, taba koji renderPhaseTwoResultViews trajno skriva, pa je
  // suggestTool CTA bio nedohvatljiv i prije uklanjanja. Sad je dio findingCardHtml (jedini
  // zivi prikaz nalaza), izvorni tripwire i dalje cuva ista dva ugovora: (1) .action-tool
  // otvara u NOVOM tabu (klik ne smije ugasiti upravo dovrsenu analizu, currentResult zivi
  // samo u memoriji), (2) suggestTool dobiva kontekst selekcije.
  const fvmSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'finding-view-model.ts'), 'utf8',
  );

  it('.action-tool link ima target="_blank" rel="noopener"', () => {
    expect(fvmSrc).toMatch(/class="action-tool"[^>]*target="_blank" rel="noopener"/);
  });

  it('suggestTool se poziva s kontekstom selekcije', () => {
    expect(fvmSrc).toMatch(/suggestTool\(issue,\s*sctx\)/);
  });
});

describe('applyUnitFromUrl wiring u app.ts (source tripwire, nevezano uz renderActionPlan)', () => {
  const appSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'app.ts'), 'utf8',
  );

  it('?unit= boot param postoji i poziva applySelectionIds putanju', () => {
    expect(appSrc).toMatch(/function applyUnitFromUrl\(\)/);
    expect(appSrc).toMatch(/applyUnitFromUrl\(\)/);
  });
});
