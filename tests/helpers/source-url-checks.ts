/**
 * Provjere javnih adresa izvora, ODVOJENE od test datoteke, tako da ih
 * `tests/profile-source-links.test.ts` (baseline) i `tests/gate-mutations.test.ts` (mutacija)
 * dijele. CLAUDE.md: "svaki novi gard ima cisti baseline i mutaciju".
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicSourceUrl } from '../../src/shared/source-url.mjs';

export type UrlValidator = (raw: unknown) => string | null;

/** Adrese koje nijedan validator ne smije pretvoriti u poveznicu; svaka gadja jednu provjeru. */
export const NEVALJANE_ADRESE = [
  'https://x.hr/upute.pdf (opis dokumenta)', // proza uz adresu: provjera razmaka
  'javascript:alert(1)', // izvrsiva shema: provjera protokola
  'ftp://x.hr/upute.pdf', // ne-web shema: provjera protokola
  '/lokalno.pdf', // relativna putanja nije javna adresa
  'https://u:p@x.hr/upute.pdf', // vjerodajnice u adresi
] as const;

/** Nevaljane adrese koje validator ipak propusti; ispravan validator vraca []. */
export function acceptedInvalidUrls(validate: UrlValidator = publicSourceUrl): string[] {
  return NEVALJANE_ADRESE.filter((url) => validate(url) !== null);
}

/**
 * Gole domene koje su vec bile u podacima prije ovog garda (master 2026-10-04). Stvarna adresa
 * dokumenta za njih nije poznata, a pogadjati se ne smije, pa ostaju imenovana iznimka dok ih netko
 * ne zamijeni provjerenom adresom. Popis smije samo padati: nova gola domena obara gard.
 */
export const POZNATE_GOLE_DOMENE: ReadonlySet<string> = new Set([
  'https://fdmri.uniri.hr/', // fdmri-naputak-zavrsni-2024, fdmri-naputak-diplomski-2025
  'https://logri.uniri.hr/', // logri-smjernice-radovi
]);

export interface SourceAddress { label: string; url?: string }

/**
 * Imenovani problemi: adresa koja nije javna adresa dokumenta, ili gola domena (putanja `/` bez
 * upita) koja ne vodi na dokument. Izvor bez `url` je dopusten (naslov bez javne adrese).
 */
export function findSourceUrlProblems(sources: readonly SourceAddress[], validate: UrlValidator = publicSourceUrl): string[] {
  const problems: string[] = [];
  for (const { label, url } of sources) {
    if (url === undefined) continue;
    if (validate(url) === null) {
      problems.push(`${label}: nije javna adresa dokumenta (${url})`);
      continue;
    }
    const parsed = new URL(url);
    if ((parsed.pathname === '/' || parsed.pathname === '') && !parsed.search && !POZNATE_GOLE_DOMENE.has(url)) {
      problems.push(`${label}: gola domena bez dokumenta (${url})`);
    }
  }
  return problems;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

interface ProfileLike { id: string; sources?: { title: string; url?: string }[] }

function profileSources(profiles: Iterable<ProfileLike>, file: string): SourceAddress[] {
  const out: SourceAddress[] = [];
  for (const profile of profiles) {
    for (const source of profile.sources ?? []) out.push({ label: `${file} ${profile.id}: ${source.title}`, url: source.url });
  }
  return out;
}

/** Sve javne adrese izvora po datoteci: laki i teski profili te registar izvora. */
export function committedSourceAddresses(): Record<string, SourceAddress[]> {
  const light = readJson('data/profiles/verified-profiles.json') as ProfileLike[];
  const heavy = Object.values(readJson('data/profiles/verified-profiles-heavy.json') as Record<string, ProfileLike>);
  const registry = readJson('data/sources/source-registry.json') as { id: string; url: string }[];
  return {
    'verified-profiles.json': profileSources(light, 'verified-profiles.json'),
    'verified-profiles-heavy.json': profileSources(heavy, 'verified-profiles-heavy.json'),
    'source-registry.json': registry.map((entry) => ({ label: `source-registry.json ${entry.id}`, url: entry.url })),
  };
}
