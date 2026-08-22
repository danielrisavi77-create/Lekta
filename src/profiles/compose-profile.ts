/**
 * Slaganje profila koji ANALIZA stvarno dobije, DOM-free.
 *
 * Do 2026-08-22 je ovaj lanac zivio samo unutar currentProfile() u src/ui/app.ts, izmijesan s
 * prezentacijom (naziv, biljeska, izvori, spremnost, otisak), pa se nije dao testirati bez
 * carobnjaka. Posljedica: conformance matrica je vrtjela SIROVI profil iz registra
 * (resolveProfile), a student dobiva ovaj slozeni: baseline za jedinicu bez profila, olaksani
 * baseline za lagane radove, overlay katedre po vrsti rada, mentorov override i scored/advisory
 * demotiju. Cetiri od tih pet slojeva mogu ugasiti ili promijeniti bodovanu dimenziju.
 *
 * Ovdje je samo ono sto analyzeDocx cita. Prezentacijski dio (naziv profila, izvori, biljeske,
 * readiness, fingerprint) ostaje u app.ts, jer ne ulazi u mjerenje.
 *
 * REDOSLIJED SLOJEVA JE UGOVOR, ne stil: normalizeCheckFlags gasi zastavice bez vrijednosti pa
 * MORA doci prije mentorova overridea (inace se korisnikov izricit zahtjev tiho ignorira), a
 * demotija ide zadnja jer gasi bodovanje dimenzija koje su prethodni slojevi upravo postavili.
 */
import { BASE_PROFILES, FPZG_PARTIAL } from './profile-registry';
import { normalizeCheckFlags } from './profile-baseline';
import { applyBakedAdvisory } from './profile-runtime-maps';
import { demotionProtectedBy } from './advisory-levers';
import { citationMeta } from '../citations/citation-meta';

/** Vrste rada koje bez posebnog profila idu na olaksani (light) baseline. */
export const LIGHT_BASELINE_WORK_TYPES = ['seminar', 'project', 'article'] as const;

/** Registarski profil, u mjeri u kojoj ga slaganje cita. */
export interface DefinitionInput {
  id: string;
  rules?: Record<string, unknown> | null;
}

/** Profil katedre (danas samo Pravni fakultet): vlastita pravila + overlay po vrsti rada. */
export interface DepartmentInput {
  rules?: Record<string, unknown> | null;
  rulesByWorkType?: Record<string, Record<string, unknown>> | null;
}

/** Mentorov override: korisnik izricito propisuje cetiri tehnicke dimenzije. */
export interface MentorOverrideInput {
  font: string;
  sizePt: number;
  spacing: number;
  marginCm: number;
}

export interface ComposeProfileInput {
  definition?: DefinitionInput | null;
  department?: DepartmentInput | null;
  /** Obitelj studija iz kataloga; koristi se samo kad nema definicije. */
  family?: string;
  /** unitId; 'fpzg' ima vlastiti djelomicni baseline umjesto obiteljskog. */
  unitId?: string;
  workType: string;
  /** Kljuc citatnog stila (#citationStyle); odredjuje citationMode i zadani accessDate. */
  citationStyle: string;
  override?: MentorOverrideInput | null;
}

/**
 * Duboko spajanje overlaya u cilj. Prototype-kljucevi se preskacu (prototype pollution kroz
 * podatke profila). Preseljeno iz app.ts bez promjene ponasanja.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: unknown): T {
  if (!source || typeof source !== 'object') return target;
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const current = (target as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      (target as Record<string, unknown>)[k] = deepMerge(
        current && typeof current === 'object' && !Array.isArray(current) ? (current as Record<string, unknown>) : {},
        v,
      );
    } else {
      (target as Record<string, unknown>)[k] = structuredClone(v);
    }
  }
  return target;
}

/** Je li rad bez posebnog profila lagan (seminar/projekt/clanak). */
export function isLightBaseline(definition: DefinitionInput | null | undefined, workType: string): boolean {
  return !definition && (LIGHT_BASELINE_WORK_TYPES as readonly string[]).includes(workType);
}

/**
 * Slozi pravila kakva analiza dobije za jedan odabir. Vraca NOV objekt; ulazi se ne mijenjaju.
 * Vrijednosti izvan mjerenja (naziv, izvori, status) namjerno nisu ovdje.
 */
export function composeAnalysisProfile(input: ComposeProfileInput): Record<string, unknown> {
  const { definition = null, department = null, workType, citationStyle, override = null } = input;
  const family = input.family || 'mixed';
  const unitId = input.unitId || '';

  const fallback = unitId === 'fpzg'
    ? FPZG_PARTIAL
    : ((BASE_PROFILES as unknown as Record<string, unknown>)[family] ?? (BASE_PROFILES as unknown as Record<string, unknown>).mixed);
  const base: Record<string, unknown> = structuredClone(
    (definition?.rules ?? fallback) as Record<string, unknown>,
  );

  // Lagani rad BEZ posebnog profila: opci baseline ne smije traziti Sadrzaj ni teza-strukturu.
  if (isLightBaseline(definition, workType)) base.requireToc = false;

  // Kljucevi koje je katedra izricito propisala: demotija osnovnog profila ih ne smije ugasiti
  // (specificniji sluzbeni izvor pobjedjuje, vidi demotionProtectedBy).
  const overlayKeys: string[] = [];
  if (department) {
    const overlay = deepMerge(
      structuredClone((department.rules || {}) as Record<string, unknown>),
      department.rulesByWorkType?.[workType] || {},
    );
    overlayKeys.push(...Object.keys(overlay));
    deepMerge(base, overlay);
  }

  normalizeCheckFlags(base as never);

  if (override) {
    base.font = [override.font.trim() || 'Times New Roman'];
    base.size = [Number(override.sizePt) || 12];
    base.spacing = Number(override.spacing) || 1.5;
    const m = Number(override.marginCm) || 2.5;
    base.margins = { top: m, right: m, bottom: m, left: m };
    // Sve cetiri zastavice eksplicitno: normalizeCheckFlags ih je prije mogao ugasiti profilu bez
    // vrijednosti, pa bi korisnikov izricit zahtjev inace bio tiho ignoriran.
    base.checkFont = true;
    base.checkSize = true;
    base.checkSpacing = true;
    base.checkMargins = true;
    base.checkJustify = true;
  }

  const cit = citationMeta(citationStyle);
  base.accessDate = (definition?.rules as Record<string, unknown> | undefined)?.accessDate ?? cit.accessDate;
  base.citationMode = cit.mode;

  // Scored/advisory demotija ide ZADNJA i samo bez overridea: korisnikov izricit zahtjev ne smije
  // biti demotiran u informativan. Profil bez ruleEntries ostaje netaknut (advisoryDimensions unset).
  // Dimenzije koje je katedra izricito propisala su zasticene: advisory mapa govori o izvoru
  // OSNOVNOG profila i ne moze ponistiti noviji, specificniji izvor katedre.
  if (!override && definition) applyBakedAdvisory(base, definition.id, demotionProtectedBy(overlayKeys));

  return base;
}
