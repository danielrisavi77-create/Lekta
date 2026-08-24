/**
 * Registar profila iz tipiziranog data/** (CLAUDE.md backlog 1 i 3). Hidrira
 * verificirane profile, pravne katedre, meta statusa/autoriteta i skupna pravila
 * po obitelji studija. Tanak prolaz: import + tipiziranje, bez logike. Rewiring
 * src/main.ts da cita odavde je zaseban korak (uz faithfulness test).
 */
import rawIndex from '../../data/profiles/verified-profiles-index.json';
import { primeRepairEntries } from './profile-runtime-maps';
import rawLegal from '../../data/profiles/legal-departments.json';
import rawAuthority from '../../data/profiles/profile-authority.json';
import rawBase from '../../data/profiles/base-profiles.json';
import rawFpzgPartial from '../../data/profiles/fpzg-partial.json';
import rawLawDrafts from '../../data/profiles/pravo/drafts/law-drafts.json';
import type {
  VerifiedProfile,
  LegalDepartment,
  ProfileAuthorityMeta,
  RuleAuthorityKey,
  BaseProfiles,
  DraftsStagingFile,
} from './profile-schema';

/**
 * VERIFIED_PROFILE_REGISTRY je LAGANI indeks (perf: skini ~90 KB gzip s glavnog chunka). Nosi samo
 * polja koja picker/hero citaju PRIJE odabira profila (id, unitId, programs, workTypes, status,
 * variant + fieldValidation.sample + rules.recommendedCitation/citationLocked). Teska polja (puna
 * rules, fieldValidation, sources, facts, scopes...) dolaze PO PROFILU preko ensureProfileRules(id)
 * i injektiranog providera (mrezni profile-rules endpoint u produkciji, lokalni heavy chunk u devu;
 * vidi blok nize), spojena U ISTE objekte registryja (mutacija in place, pa vec dohvaceni
 * `definition` referenci vide pravila). Izvor: scripts/gen-verified-split.mjs;
 * drift hvata tests/verified-split.test.ts.
 */
export const VERIFIED_PROFILE_REGISTRY = rawIndex as unknown as VerifiedProfile[];

/**
 * Rules-on-demand (faza B plana zastite baze pravila): teska pravila se vise ne
 * dohvacaju kao bulk chunk svih 407 profila nego PO PROFILU, preko injektiranog
 * providera (mrezni profile-rules endpoint u produkciji, lokalni heavy chunk u
 * dev okruzenju bez backenda; wiring radi src/ui/app.ts init).
 *
 * Ugovor mutacije je sacuvan: uspjesan dohvat radi Object.assign(entry, profile)
 * U ISTE objekte registryja, pa vec dohvaceni `definition` referenti odmah vide
 * puna pravila. Uz to se za profil PRIME-aju i repair unosi (profile-runtime-maps),
 * pa repair panel ne treba bulk repair-map.
 *
 * STANJA po profilu: undefined (nikad pokusano) -> 'pending' -> 'loaded' | 'failed'.
 * 'failed' NIJE konacan: sljedeci ensure poziv pokusava ponovno (gumb ili promjena
 * odabira je prirodni retry). ZAMKA LIGHT STUBA: light indeks nosi djelomican
 * `rules` objekt (recommendedCitation...), pa bi compose bez ucitanog heavyja TIHO
 * bodovao po 2-4 kljuca; zato currentProfile (app.ts) BACA kad definicija postoji
 * a stanje nije 'loaded', a na 'failed' se POSTENO degradira na opcu provjeru.
 */
export type ProfileRulesProviderResult =
  | { kind: 'ok'; profile: Record<string, unknown>; repairEntries: unknown[] }
  | { kind: 'failed'; reason: string };
export type ProfileRulesProvider = (profileId: string) => Promise<ProfileRulesProviderResult>;

type ProfileRulesState = 'pending' | 'loaded' | 'failed';

let _provider: ProfileRulesProvider | null = null;
let _providerResolve: (() => void) | null = null;
let _providerReady: Promise<void> = new Promise((res) => { _providerResolve = res; });
const _states = new Map<string, ProfileRulesState>();
const _inflight = new Map<string, Promise<void>>();

/** Koliko ensure ceka da init registrira provider prije nego proglasi kvar (ms). */
const PROVIDER_WAIT_MS = 8000;

export function setProfileRulesProvider(fn: ProfileRulesProvider): void {
  _provider = fn;
  _providerResolve?.();
}

/** Jesu li pravila profila ucitana (jedino stanje u kojem compose smije bodovati). */
export function profileRulesLoaded(profileId: string): boolean {
  return _states.get(profileId) === 'loaded';
}

/** Je li zadnji pokusaj dohvata za profil propao (UI tada posteno degradira). */
export function profileRulesFailed(profileId: string): boolean {
  return _states.get(profileId) === 'failed';
}

/** Test helper: pocisti stanja i provider (vitest izolira module po datoteci, ali eksplicitno je jasnije). */
export function resetProfileRulesForTests(): void {
  _states.clear();
  _inflight.clear();
  _provider = null;
  _providerReady = new Promise((res) => { _providerResolve = res; });
}

/**
 * Ucitaj pravila JEDNOG profila u registry (i prime-aj njegove repair unose).
 * `null` (genericki/baseline odabir bez definicije) rjesava odmah. Nikad ne baca
 * zbog mreze: kvar zavrsi kao stanje 'failed' koje pozivatelj cita kroz
 * profileRulesFailed i posteno degradira.
 */
export function ensureProfileRules(profileId: string | null | undefined): Promise<void> {
  const id = profileId ?? null;
  if (id === null) return Promise.resolve();
  if (_states.get(id) === 'loaded') return Promise.resolve();
  const running = _inflight.get(id);
  if (running) return running;

  const job = (async () => {
    if (!_provider) {
      // Pricekaj wiring iz inita; bez providera nakon roka stanje je posten kvar,
      // ne vjecno visenje (analiza tada ide degradirano, korisnik nije blokiran).
      await Promise.race([
        _providerReady,
        new Promise<void>((res) => setTimeout(res, PROVIDER_WAIT_MS)),
      ]);
    }
    if (!_provider) {
      _states.set(id, 'failed');
      return;
    }
    try {
      const res = await _provider(id);
      if (res.kind === 'ok') {
        const entry = findVerifiedProfile(id);
        if (entry) Object.assign(entry, res.profile);
        primeRepairEntries(id, res.repairEntries);
        _states.set(id, 'loaded');
      } else {
        _states.set(id, 'failed');
      }
    } catch {
      _states.set(id, 'failed');
    }
  })().finally(() => { _inflight.delete(id); });

  _states.set(id, 'pending');
  _inflight.set(id, job);
  return job;
}

export const LEGAL_DEPARTMENT_REGISTRY = rawLegal as unknown as LegalDepartment[];

/**
 * Staging nacrti pravnih profila (data/profiles/pravo/drafts/law-drafts.json). Jedan dom
 * za ruleEntries; zivi engine ih ne cita (cita rules/effectiveRules). Verifikacijski
 * moduli koriste WITH_DRAFTS poglede ispod. Registri iznad ostaju vjeran prolaz kroz JSON.
 */
export const LAW_DRAFTS = rawLawDrafts as unknown as DraftsStagingFile;

/**
 * NAPOMENA (audit performance-01/02): eager glob svih ~169 draft datoteka, `draftRuleEntriesFor`
 * i `VERIFIED/LEGAL_..._WITH_DRAFTS` PRESELILI su u `./drafts-runtime`. Time taj 1,3 MB podatkovni
 * sloj ispada iz glavnog entry chunka: javni app.ts vise ne cita drafts (advisory + repair citaju
 * PECENE mape iz `./profile-runtime-maps`), a drafts-runtime se uvozi samo iz internih putanja
 * (verification-console) i testova. Uvezi iz `./drafts-runtime` ako ti trebaju sirovi ruleEntries.
 */

export { PROFILE_STATUS } from './profile-status-loader';

export const PROFILE_AUTHORITY =
  rawAuthority as unknown as Record<RuleAuthorityKey, ProfileAuthorityMeta>;

export const BASE_PROFILES = rawBase as unknown as BaseProfiles;

export const FPZG_PARTIAL = rawFpzgPartial as unknown as Record<string, unknown>;

/** Verificirani profil po id-u, ili undefined. */
export function findVerifiedProfile(id: string): VerifiedProfile | undefined {
  return VERIFIED_PROFILE_REGISTRY.find((profile) => profile.id === id);
}
