// @vitest-environment node
/**
 * T53 i T54: dokument odluke o analitici i alarmima mora postojati, imati tri odjeljka, obje
 * usporedbe i preporuku, bez em i en crtica (konvencija repozitorija).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUTANJA = resolve('docs/agents/ANALITIKA_I_ALARMI.md');
const doc = readFileSync(PUTANJA, 'utf8').replace(/\r/g, '');

/** Tekst odjeljka od naslova `## <naslov>` do sljedeceg `## ` naslova. */
function odjeljak(naslov: RegExp): string {
  const linije = doc.split('\n');
  const pocetak = linije.findIndex((l) => /^## /.test(l) && naslov.test(l));
  if (pocetak < 0) return '';
  const kraj = linije.findIndex((l, i) => i > pocetak && /^## /.test(l));
  return linije.slice(pocetak, kraj < 0 ? undefined : kraj).join('\n');
}

describe('docs/agents/ANALITIKA_I_ALARMI.md', () => {
  it('ima odjeljke T53, T54 i Privatnost', () => {
    expect(odjeljak(/^## T53\b/)).not.toBe('');
    expect(odjeljak(/^## T54\b/)).not.toBe('');
    expect(odjeljak(/^## Privatnost$/)).not.toBe('');
  });

  it('T53 usporedjuje Cloudflare Web Analytics i Umami i daje preporuku', () => {
    const t53 = odjeljak(/^## T53\b/);
    expect(t53).toMatch(/Cloudflare Web Analytics/);
    expect(t53).toMatch(/Umami/);
    expect(t53).toMatch(/Preporuka/);
    expect(t53).toMatch(/public\/_headers/);
  });

  it('T54 usporedjuje mail i Telegram i daje preporuku', () => {
    const t54 = odjeljak(/^## T54\b/);
    expect(t54).toMatch(/[Mm]ail/);
    expect(t54).toMatch(/Telegram/);
    expect(t54).toMatch(/Preporuka/);
    for (const alarm of ['webhook', 'needs_manual_link', 'Edge', 'smoke', 'pg_cron']) {
      expect(t54).toContain(alarm);
    }
  });

  it('Privatnost opisuje trackEvent i DOPUSTENI_KLJUCEVI', () => {
    const p = odjeljak(/^## Privatnost$/);
    expect(p).toMatch(/trackEvent/);
    expect(p).toMatch(/DOPUSTENI_KLJUCEVI/);
  });

  it('svaki kljuc iz DOPUSTENI_KLJUCEVI je opisan u odjeljku Privatnost', () => {
    const src = readFileSync(resolve('src/ui/telemetry.ts'), 'utf8');
    const blok = /const DOPUSTENI_KLJUCEVI = \[([\s\S]*?)\];/.exec(src);
    expect(blok).not.toBeNull();
    const kljucevi = [...blok![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(kljucevi.length).toBeGreaterThan(10);
    const p = odjeljak(/^## Privatnost$/);
    const nedostaju = kljucevi.filter((k) => !p.includes(`\`${k}\``));
    expect(nedostaju).toEqual([]);
  });

  it('nema em ni en crtica', () => {
    expect(doc).not.toMatch(/[–—]/);
  });
});
