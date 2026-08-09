/**
 * ZAMRZAVANJE POZNATOG JAZA: sourced draft `value` vs bodovani `rules`.
 *
 * Za pravila `autoFixable:true` + `status:'verified'` (dakle BODOVANI, placeni put) postoje dvije
 * vrijednosti istog pravila:
 *
 *   - `data/profiles/**\/drafts/*.json`  -> `entry.value`, uz sourceId/sourcePage/doslovan `quote`
 *   - `data/profiles/verified-profiles.json` -> `rules.*`, rucno pisano
 *
 * `scripts/gen-profile-runtime-maps.mts` NAMJERNO izbacuje `value` iz pecenog `repair-map.json`
 * za takve zapise ("params i dalje dolaze iz profila"), pa `buildRepairableItems` uvijek padne na
 * `paramsForCheck(checkId, profile)`. Posljedica: LABEL koji korisnik vidi dolazi iz drafta
 * (npr. "Margine (lijeva 3,5cm)"), a PRIMIJENJENA vrijednost iz `rules` (npr. lijeva 2,5cm).
 * Komentar u `src/ui/repair-items.ts` tvrdi da se prvo uzima vrijednost pravila; pecenje to
 * onemogucuje, pa je ta grana za verified zapise mrtva.
 *
 * Ovaj test NE popravlja jaz i NE tvrdi koja je strana tocna (to je odluka verifikacije izvora,
 * vidi CLAUDE.md "Hijerarhija pravila"). On samo ZAMRZAVA zatecenih 19 slucajeva (14 profila,
 * mjereno 2026-08-08) da se skup ne siri neopazeno. Kad se slucaj rijesi, obrisi ga iz
 * `KNOWN_DIVERGENCES` - test pada i ako se pojavi NOV i ako zaostane RIJESEN.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILES_DIR = path.join(ROOT, 'data/profiles');

/**
 * `profileId :: checkId` parovi kod kojih se sourced draft i bodovani `rules` NE slazu.
 *
 * PRAZNO I MORA OSTATI PRAZNO. Zatecenih 19 slucajeva (14 profila) rijeseno je 2026-08-09 tako
 * sto je vrijednost IZ DRAFTA upisana u `rules` - u svakom od 19 draft je doslovno odgovarao
 * citatu sluzbenog izvora, a `rules` mu je proturjecio (npr. ffri-germanistika
 * "Seitenrander rechts/links 3cm, oben/unten 2cm" naspram 2,5 cm u `rules`).
 *
 * Ako ti ovaj popis zatreba, stani i pitaj se zasto: dodavanje unosa znaci da bodovana analiza
 * svjesno mjeri nesto drugo od onoga sto fakultetov izvor propisuje.
 */
const KNOWN_DIVERGENCES: ReadonlySet<string> = new Set<string>([]);

const near = (a: number, b: number, tol = 0.12) => Math.abs(a - b) <= tol;
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function draftFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) draftFiles(p, out);
    else if (e.name.endsWith('.json') && p.replace(/\\/g, '/').includes('/drafts/')) out.push(p);
  }
  return out;
}

/** Vraca opis neslaganja, ili null kad se draft i rules slazu (ili se dimenzija ne boduje). */
function divergence(checkId: string, value: any, rules: Record<string, any>): string | null {
  switch (checkId) {
    case 'margins': {
      if (!rules.margins || !value || typeof value !== 'object') return null;
      const diff = (['top', 'right', 'bottom', 'left'] as const).filter(
        (k) => value[k] != null && rules.margins[k] != null && !near(Number(value[k]), Number(rules.margins[k]), 0.05),
      );
      return diff.length ? `${JSON.stringify(value)} vs rules ${JSON.stringify(rules.margins)} (${diff.join(',')})` : null;
    }
    case 'font': {
      if (!rules.font?.length || !Array.isArray(value) || !value[0]) return null;
      return norm(value[0]) !== norm(rules.font[0]) ? `${JSON.stringify(value)} vs rules ${JSON.stringify(rules.font)}` : null;
    }
    case 'font-size': {
      if (!rules.size?.length || !Array.isArray(value) || value[0] == null) return null;
      return Number(value[0]) !== Number(rules.size[0]) ? `${JSON.stringify(value)} vs rules ${JSON.stringify(rules.size)}` : null;
    }
    case 'line-spacing': {
      if (rules.spacing == null || typeof value !== 'number') return null;
      return !near(value, Number(rules.spacing)) ? `${value} vs rules ${rules.spacing}` : null;
    }
    case 'justify': {
      if (rules.justify == null || typeof value !== 'boolean') return null;
      return value !== rules.justify ? `${value} vs rules ${rules.justify}` : null;
    }
    default:
      return null;
  }
}

describe('sourced draft value vs bodovani rules (zamrznut jaz)', () => {
  const profiles: Array<{ id: string; rules?: Record<string, any> }> = JSON.parse(
    readFileSync(path.join(PROFILES_DIR, 'verified-profiles.json'), 'utf8'),
  );
  const rulesById = new Map(profiles.map((p) => [p.id, p.rules ?? {}]));

  const found = new Map<string, string>();
  for (const file of draftFiles(PROFILES_DIR)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as any)?.ruleEntries ?? (parsed as any)?.entries ?? Object.values(parsed as object).find(Array.isArray);
    if (!Array.isArray(list)) continue;

    const profileId = path.basename(file, '.json');
    const rules = rulesById.get(profileId);
    if (!rules) continue;

    for (const e of list as any[]) {
      if (!(e?.autoFixable === true && e.status === 'verified' && e.fixerId && e.checkId)) continue;
      if (e.value === undefined) continue;
      const detail = divergence(e.checkId, e.value, rules);
      if (detail) found.set(`${profileId} :: ${e.checkId}`, `${detail}  [label: ${e.label ?? ''}]`);
    }
  }

  it('nema NOVIH neslaganja izmedju sourced drafta i bodovanih rules', () => {
    const added = [...found.entries()].filter(([k]) => !KNOWN_DIVERGENCES.has(k));
    expect(
      added.map(([k, v]) => `${k}\n    ${v}`),
      'Novo neslaganje: draft (sa sluzbenim citatom) i rules (bodovano) daju razlicitu vrijednost.\n' +
        'Korisnik vidi label iz drafta, a popravak primjenjuje vrijednost iz rules.\n' +
        'Rijesi u podacima (koja je strana po sluzbenom izvoru tocna?), ne u testu.',
    ).toEqual([]);
  });

  it('rijeseni slucajevi su uklonjeni iz KNOWN_DIVERGENCES (popis ne smije trunuti)', () => {
    const stale = [...KNOWN_DIVERGENCES].filter((k) => !found.has(k));
    expect(stale, 'Ovi vise ne divergiraju - obrisi ih iz KNOWN_DIVERGENCES.').toEqual([]);
  });
});
