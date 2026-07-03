import { describe, it, expect } from 'vitest';
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
