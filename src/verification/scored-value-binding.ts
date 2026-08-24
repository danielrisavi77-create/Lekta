import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';
import { compileEffectiveRules, type EffectiveRules } from '../profiles/rule-compiler';
import { computePublishedRules } from './published-rules';
import { CHECK_FLAG_HAS_VALUE } from '../profiles/profile-baseline';

/**
 * Vezanje BODOVANE VRIJEDNOSTI na verificiranu tvrdnju.
 *
 * Zasto postoji: lanac dokaza (izvor + snapshot + stranica + doslovan citat + potpis) zivi u
 * `ruleEntries` (staging draftovi), a zivi motor boduje iz naslijedjenog `profile.rules`
 * (`composeAnalysisProfile` klonira `definition.rules`, nikad `ruleEntries`). Ta dva nikad se nisu
 * usporedjivala. `advisory-map.json` odgovara samo na pitanje BODUJE LI SE dimenzija, nikad na
 * pitanje JE LI BODOVANA VRIJEDNOST ona koju izvor propisuje.
 *
 * Izmjereno na zatecenim podacima: 43 raskoraka kroz 26 profila. Najostriji su oni gdje motor
 * kaznjava rad koji tocno slijedi svoju uputu: `unizd-pomorski-*` (izvor propisuje Merriweather
 * 10 pt, motor trazi Times New Roman/Arial/Calibri 11-12 pt) i `fpzpu-*` (izvor Arial, motor TNR).
 *
 * NAMJERNO NE KONZULTIRA demotiju za `drift` i `unapplied`. Drift hrani demotiju, pa bi provjera
 * koja preskace vec demotirane osi sama sebe pobrisala u sljedecem krugu: demotirana os prestane
 * biti nalaz, popis se isprazni, demotija nestane i kvar se vrati. Zato se drift racuna iskljucivo
 * iz tvrdnji i `rules`, bez ijednog ulaza koji o njemu ovisi. Samo `unbacked` trazi demotiju, i
 * ondje kruga nema: os s raskorakom po definiciji IMA tvrdnju pa ne moze biti `unbacked`.
 *
 * Usporedba ide po OSI, ne po kljucu `rules`. Motor vecinu dimenzija cita kroz par
 * (zastavica, vrijednost): `justify` boduje samo uz `checkJustify !== false`, a format stranice
 * cita `paperSizes` ako je neprazan, inace `requireA4`. Usporedba po kljucu daje lazne nalaze
 * tocno ondje: tvrdnja `paper-size: "A4"` proizvodi `paperSizes`, a zrcalo nosi `requireA4`, sto je
 * ista odredba zapisana drukcije. Izmjereno: usporedba po kljucu dala je 227 laznih `unbacked`.
 */

export type ScoredValueFindingKind =
  /** Tvrdnja kaze X, motor boduje Y. Rad sukladan izvoru moze izgubiti bodove. */
  | 'drift'
  /** Motor boduje dimenziju, a nijedna verificirana tvrdnja je ne pokriva. */
  | 'unbacked'
  /** Verificirana tvrdnja postoji, a motor tu dimenziju uopce ne provjerava. */
  | 'unapplied';

/** Dimenzije koje motor tvrdo boduje. Isti skup kao DEMOTABLE_CHECK_IDS u advisory-levers.ts. */
export const BOUND_CHECK_IDS = [
  'font',
  'font-size',
  'line-spacing',
  'margins',
  'justify',
  'paper-size',
  'toc',
  'page-numbers',
] as const;

export type BoundCheckId = (typeof BOUND_CHECK_IDS)[number];

export interface ScoredValueFinding {
  profileId: string;
  ruleId: string | null;
  checkId: BoundCheckId;
  kind: ScoredValueFindingKind;
  /** Vrijednost iz verificirane tvrdnje, u kanonskom obliku (undefined za `unbacked`). */
  claimValue?: unknown;
  /** Vrijednost koju motor stvarno boduje, u kanonskom obliku (undefined za `unapplied`). */
  scoredValue?: unknown;
  /** Izvor tvrdnje, da nalaz vodi ravno na dokaz. */
  sourceId?: string | null;
  sourcePage?: string | null;
}

/**
 * Kanonsko citanje jedne dimenzije iz spljostenih pravila, tocno onako kako je motor cita.
 * `undefined` znaci "motor tu dimenziju ne boduje".
 */
/**
 * Vrijednost koju motor STVARNO boduje. Razlikuje se od sirovog citanja u jednoj stvari:
 * `normalizeCheckFlags` gasi provjeru kojoj profil nema vrijednost (prazan popis fontova,
 * nepotpune margine), pa bi bez toga usporedba prijavila raskorak ili `unbacked` nad dimenzijom
 * koju motor uopce ne gleda. Uvjet se NE prepisuje nego dijeli (`CHECK_FLAG_HAS_VALUE`).
 *
 * VRIJEDI SAMO ZA MOTOR. Strana TVRDNJE ide kroz sirovi `readAxis`, jer tvrdnja legitimno nosi
 * oblike koje profil nikad nema: `font-size` zna biti raspon `{min,max}` (`fbf-specijalisticki`),
 * a to nije "prazna vrijednost" nego drukcije zapisana. Kad je ovaj uvjet nakratko vrijedio i za
 * tvrdnje, taj se raspon tiho ISPUSTIO iz usporedbe i jedan raskorak je "nestao" a da nitko nista
 * nije presudio: tocno lazno zeleno protiv kojeg cijeli ovaj modul postoji.
 */
const ENGINE_FLAG: Partial<Record<BoundCheckId, keyof typeof CHECK_FLAG_HAS_VALUE>> = {
  'font': 'checkFont',
  'font-size': 'checkSize',
  'line-spacing': 'checkSpacing',
  'margins': 'checkMargins',
};

function engineAxisValue(rules: EffectiveRules, checkId: BoundCheckId): unknown {
  const flag = ENGINE_FLAG[checkId];
  if (flag && !CHECK_FLAG_HAS_VALUE[flag]!(rules)) return undefined;
  return readAxis(rules, checkId);
}

function readAxis(rules: EffectiveRules, checkId: BoundCheckId): unknown {
  switch (checkId) {
    case 'font':
      return rules.checkFont === false ? undefined : (rules.font ?? undefined);
    case 'font-size':
      return rules.checkSize === false ? undefined : (rules.size ?? undefined);
    case 'line-spacing':
      return rules.checkSpacing === false ? undefined : (rules.spacing ?? undefined);
    case 'margins': {
      // `marginsMinimum` MIJENJA ZNACENJE iste brojke: uz njega motor trazi "najmanje 2,5 cm", bez
      // njega "tocno 2,5 cm uz toleranciju". Zato je dio kanonske vrijednosti, ne sporedan podatak.
      //
      // Bilo je ostavljeno kao slijepi kut dok se zastavica ne pojavi u podacima. POJAVILA SE
      // (`forenzika-diplomski`, uz `minimum: true` u tvrdnji i `marginsMinimum` u zrcalu), pa je
      // ukljucena. Da je ostala izvan usporedbe, ispadanje zastavice iz zrcala vratilo bi rad s
      // 3 cm sa svih strana na 0/6 bodova, a gard bi sutio: tocno kvar zbog kojeg je uvedena.
      if (rules.checkMargins === false) return undefined;
      const sides = rules.margins;
      if (sides == null) return undefined;
      return { ...(sides as Record<string, unknown>), minimum: rules.marginsMinimum === true };
    }
    case 'justify':
      // analyze-docx: boduje se samo uz `checkJustify !== false && profile.justify`.
      return rules.checkJustify === false || !rules.justify ? undefined : true;
    case 'paper-size': {
      // analyze-docx: `paperSizes` ima prednost ako je neprazan, inace grana `requireA4`.
      const sizes = rules.paperSizes;
      if (Array.isArray(sizes) && sizes.length) return sizes;
      return rules.requireA4 ? ['A4'] : undefined;
    }
    case 'toc':
      return rules.requireToc ? true : undefined;
    case 'page-numbers':
      return rules.requirePageNumbers ? true : undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Usporedba vrijednosti pravila, uz normalizaciju koja je NUZNA, ne kozmeticka.
 *
 * Bez nje prvo mjerenje daje 183 nalaza umjesto 43 stvarna, jer draft pise `value: 12` a zrcalo
 * `size: [12]`; motor te dvije stvari cita isto (`profile.size.some(...)`). Isto vrijedi za
 * redoslijed u popisu dopustenih fontova, gdje je usporedba clanstvo u skupu, ne niz.
 */
export function sameRuleValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameRuleValue(a[k], b[k])) return false;
    return true;
  }
  // Objekt naspram ne-objekta nije ista vrijednost ma kako se serijalizirao.
  if (isPlainObject(a) !== isPlainObject(b)) return false;
  const listA = Array.isArray(a) ? a : [a];
  const listB = Array.isArray(b) ? b : [b];
  if (listA.length !== listB.length) return false;
  const norm = (v: unknown) => (typeof v === 'number' ? String(v) : String(v).trim());
  const sortedA = listA.map(norm).sort();
  const sortedB = listB.map(norm).sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** Kanonska vrijednost koju JEDNA tvrdnja propisuje za svoju os, ili undefined. */
function claimAxisValue(entry: RuleEntry, checkId: BoundCheckId): unknown {
  const eff = compileEffectiveRules({ id: '_', rules: {}, ruleEntries: [entry] } as ThesisProfile);
  return readAxis(eff, checkId);
}

/**
 * Raskoraci izmedju verificiranih tvrdnji i vrijednosti koje motor boduje, za jedan profil.
 * `demotedCheckIds` je nuzan samo za `unbacked` (demotirana os ne boduje, pa joj izostanak tvrdnje
 * nije kvar); bez njega se `unbacked` uopce ne racuna.
 */
export function findScoredValueFindings(
  profile: ThesisProfile,
  sources: SourceEntry[],
  options: { demotedCheckIds?: ReadonlySet<string> } = {},
): ScoredValueFinding[] {
  const findings: ScoredValueFinding[] = [];
  const rules = (profile.rules ?? {}) as EffectiveRules;
  const { scored } = computePublishedRules(profile, sources);

  const claimByAxis = new Map<BoundCheckId, RuleEntry>();
  for (const entry of scored) {
    const checkId = entry.checkId as BoundCheckId | null;
    if (checkId && (BOUND_CHECK_IDS as readonly string[]).includes(checkId)) {
      // Prvi zapis po osi; dva zapisa za istu os su zaseban kvar (profile-validator).
      if (!claimByAxis.has(checkId)) claimByAxis.set(checkId, entry);
    }
  }

  for (const checkId of BOUND_CHECK_IDS) {
    const entry = claimByAxis.get(checkId);
    const scoredValue = engineAxisValue(rules, checkId);

    if (entry) {
      const claimValue = claimAxisValue(entry, checkId);
      if (claimValue === undefined) continue; // tvrdnja za tu os ne propisuje nista mjerljivo
      const base = {
        profileId: profile.id,
        ruleId: entry.ruleId ?? null,
        checkId,
        sourceId: entry.sourceId ?? null,
        sourcePage: entry.sourcePage ?? null,
      };
      if (scoredValue === undefined) findings.push({ ...base, kind: 'unapplied', claimValue });
      else if (!sameRuleValue(claimValue, scoredValue)) {
        findings.push({ ...base, kind: 'drift', claimValue, scoredValue });
      }
      continue;
    }

    if (!options.demotedCheckIds) continue;
    if (scoredValue === undefined) continue;
    if (options.demotedCheckIds.has(checkId)) continue;
    findings.push({ profileId: profile.id, ruleId: null, checkId, kind: 'unbacked', scoredValue });
  }

  return findings;
}

/** Isto, nad popisom profila. Redoslijed je stabilan (profil, pa os) da je izlaz difabilan. */
export function collectScoredValueFindings(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
  demotedByProfile?: Readonly<Record<string, readonly string[]>>,
): ScoredValueFinding[] {
  const out: ScoredValueFinding[] = [];
  for (const profile of profiles) {
    const demoted = demotedByProfile?.[profile.id];
    out.push(
      ...findScoredValueFindings(profile, sources, {
        demotedCheckIds: demoted ? new Set(demoted) : undefined,
      }),
    );
  }
  return out;
}

/** Stabilan kljuc nalaza za ratchet: raskorak je svojstvo trojke (profil, os, vrsta). */
export function findingKey(f: ScoredValueFinding): string {
  return `${f.profileId}::${f.checkId}::${f.kind}`;
}
