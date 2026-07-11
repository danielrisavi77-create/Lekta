import { fingerprintMatch, type DocumentFingerprint } from '../fingerprint/fingerprint';

/**
 * Napredak spremnosti kroz revizije (Faza 2, co-pilot putovanje).
 *
 * Lokalna povijest (app.ts, localStorage) je ravna lista zadnjih provjera. Ovaj modul je
 * grupira po DOKUMENTU i racuna putanju score-a: prva, zadnja, najbolja, delta i smjer. To
 * je retencijska kuka "score raste" (progres-dopamin) iz strateskog plana i VISION.md
 * (re-check petlja je srce proizvoda).
 *
 * Grupiranje koristi ISTI labavi otisak kao slot-match (fingerprintMatch): identitet rada
 * gradi se iz signala koji prezive uredivanje (naslov, autor, sekvenca naslova), ne iz hasha
 * datoteke. Zato re-checkovi istog rada kroz draftove zavrsuju u istoj grupi, a spremanje pod
 * drugim imenom ne razbija putanju.
 *
 * Cisto, DOM-free i bez mreze. Radi nad vec spremljenom lokalnom poviscu, nista ne salje;
 * perzistencija ostaje u pregledniku (dokument ne napusta uredaj).
 */

/** Jedan zapis lokalne povijesti (DOM-free podskup onoga sto app.ts sprema). */
export interface HistoryEntry {
  id: string;
  /** ISO timestamp provjere. */
  generatedAt: string;
  fileName: string;
  score: number;
  issueCount?: number;
  errors?: number;
  warnings?: number;
  profile?: string;
  /** Otisak DOKUMENTA (ne profila): grupira re-checkove istog rada. Null = ne grupira se. */
  docFingerprint?: DocumentFingerprint | null;
}

/** Putanja score-a jednog dokumenta kroz revizije. */
export interface DocumentProgress {
  /** Naziv iz najnovije provjere. */
  fileName: string;
  profile?: string;
  /** Broj provjera istog rada. */
  revisions: number;
  /** Score prve (najstarije) provjere u grupi. */
  firstScore: number;
  /** Score najnovije provjere. */
  latestScore: number;
  /** Najbolji score ikad u grupi. */
  bestScore: number;
  /** latestScore - firstScore. */
  delta: number;
  trend: 'up' | 'down' | 'flat';
  firstAt: string;
  latestAt: string;
  /** Id-jevi zapisa, najnoviji prvi. */
  entryIds: string[];
}

function ts(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function finite(score: number): number {
  const n = Number(score);
  return Number.isFinite(n) ? n : 0;
}

/** Najnoviji zapis prvi (stabilno po generatedAt). */
export function sortByRecency(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => ts(b.generatedAt) - ts(a.generatedAt));
}

/**
 * Grupira zapise po dokumentu. Iterira najnoviji-prvi; svaki zapis ide u prvu grupu ciji se
 * najnoviji clan labavo podudara s njim, inace otvara novu grupu. Zapisi bez otiska ne mogu
 * se pouzdano grupirati pa svaki cini svoju grupu. Svaka vracena grupa je najnoviji-prvi.
 */
export function groupByDocument(entries: HistoryEntry[]): HistoryEntry[][] {
  const sorted = sortByRecency(entries);
  const groups: HistoryEntry[][] = [];
  for (const e of sorted) {
    const fp = e.docFingerprint;
    let placed = false;
    if (fp) {
      for (const g of groups) {
        const rep = g[0].docFingerprint; // najnoviji clan grupe
        if (rep && fingerprintMatch(rep, fp)) {
          g.push(e);
          placed = true;
          break;
        }
      }
    }
    if (!placed) groups.push([e]);
  }
  return groups;
}

/** Putanja score-a jedne grupe. Pretpostavlja neprazan niz, najnoviji-prvi. */
export function documentProgress(group: HistoryEntry[]): DocumentProgress {
  const newest = group[0];
  const oldest = group[group.length - 1];
  const latestScore = finite(newest.score);
  const firstScore = finite(oldest.score);
  const bestScore = Math.max(...group.map((g) => finite(g.score)));
  const delta = latestScore - firstScore;
  return {
    fileName: newest.fileName,
    profile: newest.profile,
    revisions: group.length,
    firstScore,
    latestScore,
    bestScore,
    delta,
    trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    firstAt: oldest.generatedAt,
    latestAt: newest.generatedAt,
    entryIds: group.map((g) => g.id),
  };
}

/** Napredak svih dokumenata, najnovija aktivnost prva. */
export function summarizeProgress(entries: HistoryEntry[]): DocumentProgress[] {
  return groupByDocument(entries)
    .map(documentProgress)
    .sort((a, b) => ts(b.latestAt) - ts(a.latestAt));
}

/** Napredak najnovije provjeravanog dokumenta (za istaknuti prikaz), ili null. */
export function activeDocumentProgress(entries: HistoryEntry[]): DocumentProgress | null {
  return summarizeProgress(entries)[0] ?? null;
}

/**
 * Kratak hrvatski opis napretka. Jedna provjera: "1. provjera, 74". Vise provjera dodaje
 * deltu od prve: "3. provjera, 88 (+26 od prve provjere)".
 */
export function describeProgress(p: DocumentProgress): string {
  const nth = `${p.revisions}. provjera`;
  if (p.revisions < 2) return `${nth}, ${p.latestScore}`;
  if (p.delta === 0) return `${nth}, ${p.latestScore} (bez promjene od prve provjere)`;
  const sign = p.delta > 0 ? `+${p.delta}` : `${p.delta}`;
  return `${nth}, ${p.latestScore} (${sign} od prve provjere)`;
}
