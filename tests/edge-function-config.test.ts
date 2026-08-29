/**
 * Deny-by-default gard nad autorizacijom Edge funkcija.
 *
 * Funkcija BEZ `[functions.<slug>]` bloka u `supabase/config.toml` dobiva CLI default
 * `verify_jwt = true`. To znaci da izostanak bloka NIJE neutralan: prvi sljedeci
 * `supabase functions deploy` tiho zatvori javni endpoint, funkcija pocne vracati 401 na gatewayu
 * i nikad ne dodje do vlastite obrane.
 *
 * Kvar je bio stvaran, ne teorijski (izmjereno 2026-08-29 protiv zive produkcije
 * `zrrjttizjyfcxmcpgzml`): `analytics-event` i `record-completion-check` rade s `verify_jwt=false`,
 * a nisu imale blok. `analytics-event` po vlastitom zaglavlju "nema 401 granu", pa bi telemetrija
 * tiho presusila; `record-completion-check` autorizira kratkotrajnom capability-jem umjesto JWT-om,
 * pa bi handoff pukao. Nista to ne bi prijavilo: `npm run deploy-drift` usporeduje POSTOJANJE
 * funkcija, ne njihovu konfiguraciju.
 *
 * Zato ovdje: svaka funkcija mora IZRICITO reci svoj `verify_jwt`, i nijedan blok ne smije imenovati
 * funkciju koja ne postoji. Isto nacelo kao klasifikacijski manifest: neklasificirano = crveno.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');

/** Direktoriji funkcija; `_shared` je knjiznica, ne funkcija, pa se ne deploya zasebno. */
const functionDirs = readdirSync(resolve(ROOT, 'supabase/functions'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name)
  .sort();

/** `[functions.<slug>]` blokovi i njihov `verify_jwt`, citani iz TOML-a bez ovisnosti. */
const configured = new Map<string, boolean>();
for (const m of CONFIG.matchAll(/^\[functions\.([a-z0-9-]+)\]\s*\n(?:[^\[]*?^verify_jwt\s*=\s*(true|false))?/gm)) {
  if (m[2] !== undefined) configured.set(m[1], m[2] === 'true');
}

describe('supabase/config.toml: autorizacija svake Edge funkcije je izricita', () => {
  it('mjerenje je netrivijalno (prazan popis ne smije "proci")', () => {
    expect(functionDirs.length).toBeGreaterThanOrEqual(20);
    expect(configured.size).toBeGreaterThanOrEqual(20);
  });

  it('svaka funkcija ima izricit verify_jwt (bez bloka CLI tiho namece true)', () => {
    const missing = functionDirs.filter((slug) => !configured.has(slug));
    expect(
      missing,
      `funkcije bez [functions.*] bloka; deploy bi im tiho namjestio verify_jwt=true: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('nijedan blok ne imenuje nepostojecu funkciju (mrtva konfiguracija)', () => {
    const stray = [...configured.keys()].filter((slug) => !functionDirs.includes(slug));
    expect(stray, `blokovi bez funkcije u repou: ${stray.join(', ')}`).toEqual([]);
  });

  /**
   * Prikovane presude za javne endpointe. Ovo NIJE ponavljanje gornjeg testa: gornji trazi da
   * vrijednost postoji, ovaj da se ne preokrene. Svaka od ovih funkcija nema 401 granu ili
   * autorizira drukcije (potpis, cron tajna, capability), pa bi `true` bio tihi ispad iz rada.
   */
  it('javne funkcije ostaju javne (preokret je ispad iz rada, ne pooštrenje)', () => {
    for (const slug of [
      'analytics-event',
      'record-completion-check',
      'webhook-mor',
      'faculty-request',
      'health',
      'cleanup-orphan-repairs',
      'profile-rules',
      'send-reminders',
      'unsubscribe-reminder',
    ]) {
      expect(configured.get(slug), `${slug} mora ostati verify_jwt=false`).toBe(false);
    }
  });

  it('funkcije koje diraju studentov dokument ili novac traze JWT', () => {
    for (const slug of ['repair-docx', 'source-check', 'create-checkout', 'delete-repair-job', 'admin-stats']) {
      expect(configured.get(slug), `${slug} mora traziti JWT`).toBe(true);
    }
  });
});
