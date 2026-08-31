import { identifyFindings } from '../../integration/finding-identity';
import type { RuleEntry } from '../../profiles/profile-schema';
import type { Check, Issue } from '../../scoring/checks';
import type { VisualExactEvidenceInput } from './visual-result-model';

/**
 * DOKAZNA LUPA: veze nalaz na DOSLOVAN navod iz sluzbene upute.
 *
 * Do sada je `exactEvidence` bio tip bez proizvodjaca: `app.ts` je prosljedjivao
 * `exactEvidence: false` i nikad nije punio mapu, pa kartica nalaza nije mogla pokazati
 * odakle pravilo dolazi. Nije bio propust nego posljedica: `ruleEntry.sourceId` je pokazivao
 * na registar izvora, a profilni `sources` niz nosi samo `{title, url}` bez identiteta, pa se
 * to dvoje nije dalo spojiti. Otkad serveni artefakt prikacuje razrijesen `source`, moze.
 *
 * TRI PRAVILA, i sva tri postoje da se dokaz ne izmislja:
 *
 * 1. NEPOTPUN DOKAZ SE ODBACUJE, ne krpa. `acceptedEvidence` u modelu trazi sve od
 *    `sourceId`, `title`, `url` i `quote`; nalaz bez ijednog od njih jednostavno nema
 *    `<details>`. Bolje nista nego navod bez atribucije.
 *
 * 2. STRANICA SE NAVODI KAKO JU IZVOR PISE. `sourcePage` je slobodan tekst
 *    ("str. 9 (odjeljak 2.4 Quellenangaben im Text, tocke 1 i 2)"), ne broj. Parsiranje u
 *    cijeli broj izgubilo bi odjeljak, a `page` je u modelu strogo numericko polje, pa se
 *    doslovna formulacija nosi kroz `pageLabel`, a `page` ostaje `null`.
 *
 * 3. KLJUC JE STABILAN IDENTITET NALAZA (`issueKey` iz `identifyFindings`), ne redni broj.
 *    Redoslijed nalaza se mijenja s profilom i dokumentom; issueKey ne.
 */

/** Podskup razrijesenog izvora koji ova mapa cita. */
interface ResolvedSource {
  title?: unknown;
  url?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Slozi mapu `issueKey -> dokaz` iz pravila profila.
 *
 * Vraca praznu mapu kad pravila nisu ucitana ili nijedno nema doslovan citat; pozivatelj tada
 * proslijedi `exactEvidence: false` i sucelje se ponasa kao prije.
 */
export function buildExactEvidence(
  checks: Check[] | undefined,
  issues: Issue[] | undefined,
  ruleEntries: RuleEntry[] | undefined,
): Record<string, VisualExactEvidenceInput> {
  const out: Record<string, VisualExactEvidenceInput> = {};
  const entries = Array.isArray(ruleEntries) ? ruleEntries : [];
  if (!entries.length) return out;

  const byRuleId = new Map<string, RuleEntry>();
  for (const entry of entries) {
    const ruleId = text(entry?.ruleId);
    // Prvi unos po ruleId-u vrijedi: mapa je vec deduplicirana pri pecenju, a tiho
    // prepisivanje kasnijim unosom skrivalo bi nesklad umjesto da ga ostavi vidljivim.
    if (ruleId && !byRuleId.has(ruleId)) byRuleId.set(ruleId, entry);
  }

  const identities = identifyFindings(
    Array.isArray(checks) ? checks : [],
    Array.isArray(issues) ? issues : [],
    entries,
  );

  for (const identity of identities) {
    const ruleId = text(identity.ruleId);
    if (!ruleId) continue;
    const entry = byRuleId.get(ruleId);
    if (!entry) continue;

    const quote = text((entry as { quote?: unknown }).quote);
    if (!quote) continue;

    const source = (entry as { source?: ResolvedSource | null }).source;
    const title = text(source?.title);
    const url = text(source?.url);
    const sourceId = text(entry.sourceId);
    // Bez razrijesenog izvora nema dokaza: citat bez atribucije tvrdi vise nego sto zna.
    if (!title || !url || !sourceId) continue;

    out[identity.issueKey] = {
      verified: true,
      sourceId,
      title,
      url,
      quote,
      // Broj stranice se NE izvodi iz slobodnog teksta; nosi se doslovna formulacija.
      page: null,
      pageLabel: text(entry.sourcePage) || null,
    };
  }

  return out;
}
