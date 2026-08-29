import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import { BOUND_CHECK_IDS } from '../src/verification/scored-value-binding';

/**
 * BODOVANO PRAVILO IZ NACRTA MORA POSTOJATI I U ZIVOM PROFILU.
 *
 * Nacrt (`data/profiles/<unit>/drafts/*.json`) je autorski izvor istine, ali analiza cita `rules`
 * registriranog profila. Kad se pravilo u tom prijelazu tiho izgubi, danas to nitko ne vidi:
 * golden ga ne hvata (ove osi ovise o PROFILU, ne o dokumentu), revizija citata gleda samo nacrt,
 * a detektor `unapplied` iz `scored-value-binding` pokriva samo osam osi (`BOUND_CHECK_IDS`).
 *
 * KVAR NIJE HIPOTETICAN. 2026-08-24 su cetiri pravila s punom provenijencijom nestala iz zivog
 * profila u dijeljenom radnom stablu: `hks-diplomski--footnote-justify` (bilo commitano, pa
 * izbrisano necommitanim zahvatom) i `vuka-poslovni-*--heading-rules` x3 (nikad nisu usli u commit,
 * jer je tudji generator prepisao datoteku izmedju izmjene i commita). Motor je za obje osi radio i
 * bio testiran, a nijedan profil ih nije koristio.
 *
 * USPOREDBA IDE PO OSI, NE PO KLJUCU. CLAUDE.md to izricito trazi: `paper-size: "A4"` proizvodi
 * `paperSizes`, a zrcalo nosi `requireA4`. Ista odredba, drukcije zapisana; usporedba po kljucu
 * dala je 227 laznih nalaza kad je zadnji put pokusana.
 */

const ROOT = join(__dirname, '..');

/** Kljucevi kojima motor moze izraziti istu os. Bez ovoga bi alternativan zapis izgledao kao gubitak. */
const ALIASES: Record<string, string[]> = {
  'paper-size': ['paperSizes', 'requireA4'],
  'required-sections': ['requiredSections', 'requiredSectionRules'],
  'citation-style': ['recommendedCitation', 'citationStyle'],
  toc: ['requireToc', 'tocDetailed'],
  'page-numbers': ['requirePageNumbers'],
};

/**
 * RATCHET: koliko ih danas nedostaje. Smije samo PADATI.
 *
 * Izmjereno 2026-08-24 nakon vracanja cetiri izgubljena pravila: 14, sve na dvije osi koje
 * `BOUND_CHECK_IDS` ne prati (`required-sections` 7, `citation-style` 7). Nijedno od njih nije
 * nastalo u ovoj sesiji i svako trazi vlastito citanje izvora, pa se ne tvrdi nula nego se
 * zabranjuje RAST.
 */
const RATCHET = 14;

interface Loss { ruleId: string; checkId: string; keys: string[] }

function scoredDraftEntries(): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  const profilesDir = join(ROOT, 'data', 'profiles');
  for (const unit of readdirSync(profilesDir)) {
    let files: string[];
    try {
      files = readdirSync(join(profilesDir, unit, 'drafts'));
    } catch {
      continue;
    }
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(profilesDir, unit, 'drafts', file), 'utf8'));
      const walk = (node: any) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        if (node.ruleId && node.checkId && node.scored === true) out.push(node);
        Object.values(node).forEach(walk);
      };
      walk(data);
    }
  }
  return out;
}

/** Pravila iz nacrta kojima ZIVI profil ne nosi nijedan kljuc te osi. */
export function findLostRules(live: any[], entries: Array<Record<string, any>>): Loss[] {
  const byId = new Map<string, any>(live.map((p: any) => [p.id, p]));
  const losses: Loss[] = [];
  for (const entry of entries) {
    const profileId = String(entry.ruleId).split('--')[0];
    const profile = byId.get(profileId);
    if (!profile) continue; // profil nije registriran; to je zaseban razred, ne gubitak
    let produced: Record<string, unknown> = {};
    try {
      produced = compileEffectiveRules({ id: profileId, rules: {}, ruleEntries: [entry] } as any) as any;
    } catch {
      continue;
    }
    const keys = Object.keys(produced);
    if (!keys.length) continue; // checkId koji kompajler jos ne mapira: vlastiti gard u rule-compiler
    const accept = new Set([...keys, ...(ALIASES[entry.checkId] ?? [])]);
    const rules = profile.rules ?? {};
    if (![...accept].some((k) => k in rules)) losses.push({ ruleId: entry.ruleId, checkId: entry.checkId, keys });
  }
  return losses;
}

describe('bodovano pravilo iz nacrta postoji i u zivom profilu', () => {
  const live = JSON.parse(readFileSync(join(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'));
  const entries = scoredDraftEntries();

  it('ima sto mjeriti (sentinel: prazan skup bi prosao kao cisto)', () => {
    expect(entries.length).toBeGreaterThan(1000);
    expect(live.length).toBeGreaterThan(300);
  });

  it(`broj izgubljenih pravila ne raste (ratchet ${RATCHET})`, () => {
    const losses = findLostRules(live, entries);
    expect(
      losses.map((l) => `${l.ruleId} -> ${l.keys.join(',')}`),
      'novo izgubljeno bodovano pravilo: nacrt ga propisuje, zivi profil ga ne nosi',
    ).toHaveLength(Math.min(losses.length, RATCHET));
    expect(losses.length).toBeLessThanOrEqual(RATCHET);
  });

  it('cetiri pravila vracena 2026-08-24 su i dalje u zivom profilu', () => {
    // Imenovana izricito: upravo su ona jednom vec nestala, i to bez traga u ijednom commitu.
    const lost = new Set(findLostRules(live, entries).map((l) => l.ruleId));
    for (const ruleId of [
      'hks-diplomski--footnote-justify',
      'vuka-poslovni-diplomski--heading-rules',
      'vuka-poslovni-zavrsni--heading-rules',
      'vuka-poslovni-opci-akademski-rad--heading-rules',
    ]) {
      expect(lost.has(ruleId), `${ruleId} je opet izgubljen iz zivog profila`).toBe(false);
    }
  });

  it('NEGATIVNA KONTROLA: podmetnut gubitak se prijavi', () => {
    // Bez ovoga bi "prolazio" i detektor koji ne gleda nista.
    const fakeLive = [{ id: 'demo', rules: { font: ['Times New Roman'] } }];
    const fakeEntry = { ruleId: 'demo--line-spacing', checkId: 'line-spacing', value: 1.5, scored: true };
    expect(findLostRules(fakeLive, [fakeEntry])).toHaveLength(1);
  });

  it('NEGATIVNA KONTROLA: alternativan zapis iste osi NIJE gubitak', () => {
    // `paper-size: "A4"` proizvodi `paperSizes`, a profil smije nositi `requireA4`.
    const fakeLive = [{ id: 'demo', rules: { requireA4: true } }];
    const fakeEntry = { ruleId: 'demo--paper-size', checkId: 'paper-size', value: 'A4', scored: true };
    expect(findLostRules(fakeLive, [fakeEntry])).toHaveLength(0);
  });

  it('osi koje postojeci detektor unapplied vec prati su poznate i uze od ovoga', () => {
    // Dokumentira ZASTO ovaj gard postoji: `unapplied` pokriva osam osi, a gubici su izvan njih.
    expect([...BOUND_CHECK_IDS]).not.toContain('footnote-justify');
    expect([...BOUND_CHECK_IDS]).not.toContain('heading-rules');
  });
});
