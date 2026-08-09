import type { Check, Issue } from '../scoring/checks';
import { classifyFixability } from '../analysis/check-fixer-map';
import { FIXER_CAPABILITIES } from '../repair/repair-capabilities';
import type { FixerId } from '../repair/apply-fixers';

export type ResultReadinessKind = 'blocked' | 'needs-work' | 'manual-review' | 'clear';

export interface ResultReadiness {
  kind: ResultReadinessKind;
  label: string;
  description: string;
  blockers: number;
  improvements: number;
  manualReviews: number;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

/**
 * Spremnost za predaju nije isto sto i tehnicka ocjena. Ova projekcija namjerno
 * cita samo vec postojeci rezultat analize i ne mijenja bodovanje ni parser.
 */
export function resultReadiness(issues: readonly Issue[] = []): ResultReadiness {
  const blockers = issues.filter((item) => item.severity === 'error').length;
  const improvements = issues.filter((item) => item.severity === 'warning').length;
  const manualReviews = issues.filter((item) => item.severity !== 'error' && item.severity !== 'warning').length;

  if (blockers > 0) {
    return {
      kind: 'blocked',
      label: 'Nije spremno za predaju',
      description: `Pronađen je ${blockers} ${plural(blockers, 'blokator', 'blokatora', 'blokatora')}. Tehnička ocjena ne potvrđuje spremnost za predaju.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  if (improvements > 0) {
    return {
      kind: 'needs-work',
      label: 'Treba doraditi prije predaje',
      description: `Pronađeno je ${improvements} ${plural(improvements, 'dorada', 'dorade', 'dorada')}. Tehnička ocjena ne zamjenjuje završnu ručnu provjeru.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  if (manualReviews > 0) {
    return {
      kind: 'manual-review',
      label: 'Potrebna je ručna provjera',
      description: `Nema automatskih blokatora, ali ostale su ${manualReviews} ${plural(manualReviews, 'ručna provjera', 'ručne provjere', 'ručnih provjera')}.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  return {
    kind: 'clear',
    label: 'Nema automatskih blokatora',
    description: 'Automatska provjera nije pronašla otvoreni blokator. Mentorove i posebne upute i dalje imaju prednost.',
    blockers,
    improvements,
    manualReviews,
  };
}

/** Jedna bodovana provjera koju automatski popravak strukturno ne smije dirati (sadrzajna prosudba). */
export interface RepairCeilingItem {
  title: string;
  lostPoints: number;
}

export interface RepairCeiling {
  /** Ima li provjera koje ostaju otvorene JER zahtijevaju rucnu (sadrzajnu) provjeru. */
  hasManualGap: boolean;
  /** Maksimalna ocjena koju automatski popravak realno moze jamciti za ovaj dokument
   *  (100 kad nema manualnog jaza; inace manje, srazmjerno bodovima izgubljenim na manualnim
   *  provjerama). Nije profilno svojstvo - racuna se iz TRENUTNOG stanja provjera. */
  maxScore: number;
  items: RepairCeilingItem[];
}

/** Minimalan oblik ponudjene stavke; namjerno lokalno, da se izbjegne ciklus prema repair-panel. */
export interface OfferedRepairItem {
  fixerId: string;
  requiresConfirmation?: boolean;
  recommended?: boolean;
}

/** Zasto neka provjera ostaje izvan dosega automatskog popravka. */
export type BlockerReason = 'author-required' | 'not-offered';

export interface ReachableBlocker {
  id: string;
  title: string;
  /** Bodovi koji na ovoj provjeri nedostaju do maksimuma. */
  gain: number;
  reason: BlockerReason;
}

export interface ReachableCeiling {
  /** Ocjena sada. */
  current: number;
  /** Ocjena nakon popravaka koji se primjenjuju bez pitanja. */
  safeAuto: number;
  /** Ocjena nakon onih koji traze izricitu potvrdu. Jednako `maximum`. */
  confirmed: number;
  maximum: number;
  blockers: ReachableBlocker[];
}

/**
 * Rastav "koliko je bodova na stolu": sada / sigurno automatski / uz potvrdu / maksimum.
 *
 * KLJUCNO: racuna se iz STVARNO PONUDJENIH stavki, ne iz same sposobnosti fixera.
 * `FIXER_CAPABILITIES` kaze sto fixer ZNA popraviti, ali ne i hoce li se za OVAJ dokument
 * ponuditi: `element-caption-fixer` trazi profilno pravilo koje ima 3 od 368 profila,
 * `heading-style-fixer` trazi prepoznate kandidate, `toc-field-fixer` naslov "Sadrzaj" bez
 * zivog polja. Strop racunat iz same sposobnosti obecavao bi bodove koje korisnik nikad nece
 * dobiti - ista greska koju je registar sposobnosti upravo uklonio, samo u drugom smjeru.
 *
 * Zato sposobnost sluzi da se ponudjena stavka PRESLIKA na provjere koje zatvara, a odlucuje
 * ponuda. Razina dolazi iz same stavke (`requiresConfirmation`/`recommended`), jer ona zna
 * vise od registra: isti fixer zna biti bezuvjetan ili trazi potvrdu ovisno o pouzdanosti
 * kandidata (vidi heading-style).
 */
export function reachableCeiling(
  checks: readonly Check[] = [],
  offered: readonly OfferedRepairItem[] = [],
): ReachableCeiling | null {
  const scored = checks.filter((c) => c.scored && c.max > 0);
  const totalMax = scored.reduce((sum, c) => sum + c.max, 0);
  if (!totalMax) return null; // profil ne daje bodovnu ocjenu, pa nema ni stropa

  const earned = scored.reduce((sum, c) => sum + c.earned, 0);
  const pct = (points: number) => Math.round((points / totalMax) * 100);

  let safeGain = 0;
  let confirmGain = 0;
  const blockers: ReachableBlocker[] = [];

  for (const check of scored) {
    const gap = check.max - check.earned;
    if (gap <= 0) continue;

    const item = offered.find((o) => FIXER_CAPABILITIES[o.fixerId as FixerId]?.checkIds.includes(check.id));
    if (!item) {
      // Razlikujemo dva razloga jer korisniku znace posve razlicito: "alat to ne smije dirati"
      // nije isto sto i "popravak postoji, ali za ovaj dokument nije ponudjen".
      const reason: BlockerReason =
        classifyFixability(check.id || check.title).fixability === 'manual' ? 'author-required' : 'not-offered';
      blockers.push({ id: check.id, title: check.title, gain: gap, reason });
      continue;
    }
    if (item.requiresConfirmation || item.recommended) confirmGain += gap;
    else safeGain += gap;
  }

  const confirmed = pct(earned + safeGain + confirmGain);
  return {
    current: pct(earned),
    safeAuto: pct(earned + safeGain),
    confirmed,
    maximum: confirmed,
    blockers: blockers.sort((a, b) => b.gain - a.gain),
  };
}

/**
 * Zasto ocjena nakon popravka ne mora biti 100: neke bodovane provjere (npr. tocnost citata,
 * potpunost popisa literature, sadrzaj naslova tablica) zahtijevaju sadrzajnu prosudbu koju
 * alat namjerno ne smije automatski mijenjati (vidi classifyFixability - 'manual'). Ova
 * projekcija racuna koliko je to realno najvise sto automatski popravak moze jamciti, da se
 * to jasno komunicira korisniku umjesto da "97" izgleda kao nedovrsen posao.
 */
export function repairCeiling(checks: readonly Check[] = []): RepairCeiling {
  const scored = checks.filter((c) => c.scored && c.max > 0);
  const totalMax = scored.reduce((sum, c) => sum + c.max, 0);
  const manual = scored.filter((c) => c.status !== 'pass' && classifyFixability(c.id || c.title).fixability === 'manual');
  const lostPoints = manual.reduce((sum, c) => sum + (c.max - c.earned), 0);
  const maxScore = totalMax > 0 ? Math.round(((totalMax - lostPoints) / totalMax) * 100) : 100;
  return {
    hasManualGap: manual.length > 0,
    maxScore,
    items: manual.map((c) => ({ title: c.title, lostPoints: c.max - c.earned })),
  };
}
