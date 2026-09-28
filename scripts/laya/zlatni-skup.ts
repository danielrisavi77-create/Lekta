/**
 * Laya zlatni skup D1 (EVALUATION_PROTOCOL.md): od analiziranih lokalnih radova do oznacenog
 * GoldSeta, bez modela. Ulaz je scripts/laya-zlatni-skup.mts; ovaj modul nema I/O ni ovisnost o src/.
 *
 *  1. `pripremiKandidate`: rezultat analize -> snapshotFromAnalysis -> buildLayaCandidates. Isti put
 *     kojim runner gradi caseove, pa zlatni skup mjeri tocno ono sto bi Laya dobila u proizvodu.
 *  2. `listZaOznacavanje`: CSV za Excel (UTF-8 s BOM-om, `;`). Covjek upisuje oznaku; model je ne vidi.
 *  3. `sastaviZlatniSkup`: spaja oznake preko `br` i kontrole iz inputDigesta, pa dijeli na
 *     calibration i test po povezanim grupama dokumenta, izvora i predloska (nijedna grupa u oba).
 *
 * Nista od ovoga ne ide u Git: kandidati i oznake sadrze tekst zapisa i ostaju u .artifacts/laya/.
 */
import { VERDICTS, sha256Hex } from './contracts-v2.ts';
import type { LayaDecisionCaseV2, LayaLanguage, LayaProvenance, LayaVerdict } from './contracts-v2.ts';
import { buildLayaCandidates } from './candidate-builder.ts';
import { snapshotFromAnalysis } from './snapshot-from-analysis.ts';
import { loadGoldSet } from './eval-run.ts';
import type { GoldSet } from './eval-run.ts';

export interface DokumentZaKandidate {
  /** Lokalno ime datoteke; ide samo u list za oznacavanje, nikad u case. */
  naziv: string;
  /** SHA-256 bajtova dokumenta. */
  sha256: string;
  profileId: string;
  /** SHA-256 razrijesenog profila kojim je analiza radila. */
  profileRevision: string;
  language: LayaLanguage;
  /** Oznaka zajednickog izvora (npr. isti autor ili narucitelj); null znaci da je dokument sam svoja grupa. */
  sourceGroup: string | null;
  /** Oznaka zajednickog predloska; null znaci da je dokument sam svoja grupa. */
  templateFamily: string | null;
  analysis: Parameters<typeof snapshotFromAnalysis>[0];
}

interface KandidatStavka { br: number; dokument: string; case: LayaDecisionCaseV2 }
export interface Kandidati {
  schemaVersion: 1;
  kind: 'lekta-laya-kandidati';
  engineRevision: string;
  items: KandidatStavka[];
  /** Broj preskocenih zapisa po razlogu (builder ili duplikat dokumenta); bez teksta. */
  preskoceno: Record<string, number>;
}

/** Deterministicki UUID v4 oblika iz hasha: ugovor trazi v4 oblik, a isti ulaz mora dati isti ID. */
function uuidIz(prostor: string, vrijednost: string): string {
  const h = sha256Hex(`lekta:laya:${prostor}:${vrijednost}`);
  const varijanta = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${varijanta}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function pripremiKandidate(
  dokumenti: readonly DokumentZaKandidate[],
  opts: { engineRevision: string; origin: LayaProvenance['origin']; permissionRef: string },
): Kandidati {
  const items: KandidatStavka[] = [];
  const preskoceno: Record<string, number> = {};
  const vidjeni = new Set<string>();
  for (const d of dokumenti) {
    if (!/^[0-9a-f]{64}$/.test(d.sha256)) throw new Error('Dokument nema valjan SHA-256.');
    // Isti dokument dvaput bi u split mogao uci kao dvije grupe; drugi primjerak se ne broji.
    if (vidjeni.has(d.sha256)) { preskoceno.duplikat_dokumenta = (preskoceno.duplikat_dokumenta ?? 0) + 1; continue; }
    vidjeni.add(d.sha256);
    const provenance: LayaProvenance = {
      origin: opts.origin, permissionRef: opts.permissionRef,
      localInferenceAllowed: true, trainingAllowed: false, externalInferenceAllowed: false,
      documentGroupId: uuidIz('dokument', d.sha256),
      sourceGroupId: uuidIz('izvor', d.sourceGroup ?? `dokument:${d.sha256}`),
      templateFamilyId: uuidIz('predlozak', d.templateFamily ?? `dokument:${d.sha256}`),
    };
    const snapshot = snapshotFromAnalysis(d.analysis, {
      documentRevisionId: uuidIz('revizija', d.sha256),
      profile: { id: d.profileId, revision: d.profileRevision },
      engineRevision: opts.engineRevision, provenance, language: d.language,
    });
    const batch = buildLayaCandidates(snapshot);
    for (const s of batch.skipped) preskoceno[s.reason] = (preskoceno[s.reason] ?? 0) + 1;
    for (const c of batch.cases) items.push({ br: items.length + 1, dokument: d.naziv, case: c });
  }
  return { schemaVersion: 1, kind: 'lekta-laya-kandidati', engineRevision: opts.engineRevision, items, preskoceno };
}

// Kontrola ima slovni prefiks da je Excel ne pretvori u broj (vodece nule, 1e5 oblik).
const kontrola = (c: LayaDecisionCaseV2) => `k-${c.inputDigest.slice(0, 10)}`;

const OZNAKE: Readonly<Record<string, LayaVerdict>> = {
  S: 'finding_supported', L: 'possible_false_positive', E: 'extraction_uncertain', N: 'insufficient_evidence',
};
const ZAGLAVLJE = ['br', 'kontrola', 'dokument', 'zapis', 'oznaka', 'napomena'] as const;

function csvPolje(v: string): string {
  // Excel celiju koja pocinje s = + - @ tumaci kao formulu; apostrof je samo prikaz, spajanje ide po `br`.
  const siguran = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(siguran) ? `"${siguran.replace(/"/g, '""')}"` : siguran;
}

/** CSV za rucno oznacavanje. Stupac `oznaka`: S, L, E ili N; prazno znaci neoznaceno. */
export function listZaOznacavanje(k: Kandidati): string {
  const redovi = [[...ZAGLAVLJE], ...k.items.map((i) => [String(i.br), kontrola(i.case), i.dokument, i.case.modelInput.text, '', ''])];
  return `﻿${redovi.map((r) => r.map(csvPolje).join(';')).join('\r\n')}\r\n`;
}

/** RFC 4180 s odabranim razdjelnikom; Excel ovisno o lokalizaciji sprema `;`, `,` ili tab. */
function parseCsv(tekst: string): string[][] {
  const t = tekst.replace(/^﻿/, '');
  const prvi = t.slice(0, t.search(/\r?\n|$/));
  const razdjelnik = [';', '\t', ','].find((z) => prvi.includes(z)) ?? ';';
  const redovi: string[][] = [];
  let red: string[] = [];
  let polje = '';
  let navodnici = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (navodnici) {
      if (ch === '"' && t[i + 1] === '"') { polje += '"'; i++; } else if (ch === '"') navodnici = false; else polje += ch;
    } else if (ch === '"' && polje === '') navodnici = true;
    else if (ch === razdjelnik) { red.push(polje); polje = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      red.push(polje); redovi.push(red); red = []; polje = '';
    } else polje += ch;
  }
  if (navodnici) throw new Error('Oznake: CSV ima nezatvorene navodnike.');
  if (polje !== '' || red.length) { red.push(polje); redovi.push(red); }
  return redovi.filter((r) => r.some((p) => p.trim() !== ''));
}

type Brojac = Record<LayaVerdict, number>;
interface Statistika { oznaceno: number; neoznaceno: number; grupa: number; calibration: Brojac; test: Brojac }

function brojac(items: GoldSet['items']): Brojac {
  const b = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Brojac;
  for (const i of items) b[i.gold]++;
  return b;
}

export function sastaviZlatniSkup(
  kandidati: Kandidati,
  csv: string,
  opts: { datasetId: string; testUdio: number },
): { calibration: GoldSet; test: GoldSet; statistika: Statistika } {
  if (kandidati?.kind !== 'lekta-laya-kandidati' || kandidati.schemaVersion !== 1 || !Array.isArray(kandidati.items)) {
    throw new Error('Kandidati nisu datoteka iz koraka kandidati.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(opts.datasetId)) throw new Error('datasetId: mala slova, brojke, . _ -');
  if (!(opts.testUdio > 0 && opts.testUdio < 1)) throw new Error('Udio testa mora biti izmedju 0 i 1.');

  const [zaglavlje, ...redovi] = parseCsv(csv);
  const stupac = (ime: string) => (zaglavlje ?? []).findIndex((p) => p.trim().toLowerCase() === ime);
  const [iBr, iKontrola, iOznaka] = [stupac('br'), stupac('kontrola'), stupac('oznaka')];
  if (iBr < 0 || iKontrola < 0 || iOznaka < 0) throw new Error('Oznake: CSV nema stupce br, kontrola i oznaka.');

  const poBr = new Map(kandidati.items.map((i) => [i.br, i]));
  const oznake = new Map<number, LayaVerdict>();
  const vidjeni = new Set<number>();
  redovi.forEach((r, n) => {
    const redak = n + 2; // 1 je zaglavlje, a Excel broji od 1
    const br = Number((r[iBr] ?? '').trim());
    const item = poBr.get(br);
    if (!Number.isInteger(br) || !item) throw new Error(`Oznake, redak ${redak}: br ne postoji u kandidatima.`);
    if (vidjeni.has(br)) throw new Error(`Oznake, redak ${redak}: br se ponavlja.`);
    vidjeni.add(br);
    if ((r[iKontrola] ?? '').trim().replace(/^'/, '') !== kontrola(item.case)) {
      throw new Error(`Oznake, redak ${redak}: kontrola ne odgovara kandidatu (drugi list ili pomaknuti redovi).`);
    }
    const kod = (r[iOznaka] ?? '').trim().toUpperCase();
    if (!kod) return;
    const verdict = OZNAKE[kod];
    if (!verdict) throw new Error(`Oznake, redak ${redak}: oznaka mora biti S, L, E, N ili prazno.`);
    oznake.set(br, verdict);
  });

  const oznaceni = kandidati.items.filter((i) => oznake.has(i.br));
  // Povezane grupe: dva zapisa su u istoj grupi ako dijele dokument, izvor ili predlozak.
  const roditelj = oznaceni.map((_, i) => i);
  const korijen = (i: number): number => (roditelj[i] === i ? i : (roditelj[i] = korijen(roditelj[i])));
  const prviZa = new Map<string, number>();
  oznaceni.forEach((item, i) => {
    const p = item.case.provenance;
    for (const kljuc of [`d:${p.documentGroupId}`, `s:${p.sourceGroupId}`, `t:${p.templateFamilyId}`]) {
      const j = prviZa.get(kljuc);
      if (j === undefined) prviZa.set(kljuc, i); else roditelj[korijen(i)] = korijen(j);
    }
  });
  const grupe = new Map<number, number[]>();
  oznaceni.forEach((_, i) => { const k = korijen(i); grupe.set(k, [...(grupe.get(k) ?? []), i]); });
  if (grupe.size < 2) throw new Error('Nije moguce razdvojiti calibration i test: svi oznaceni zapisi dijele dokument, izvor ili predlozak.');

  // Redoslijed grupa je pseudoslucajan ali ponovljiv: hash datasetId-a i caseId-eva grupe.
  const poredane = [...grupe.values()]
    .map((clanovi) => ({ clanovi, kljuc: sha256Hex([opts.datasetId, ...clanovi.map((i) => oznaceni[i].case.caseId).sort()].join('|')) }))
    .sort((a, b) => (a.kljuc < b.kljuc ? -1 : 1));
  const cilj = Math.ceil(opts.testUdio * oznaceni.length);
  const uTestu = new Set<number>();
  for (const g of poredane) if (uTestu.size < cilj) g.clanovi.forEach((i) => uTestu.add(i));
  if (uTestu.size === oznaceni.length) throw new Error('Nije moguce razdvojiti: jedna grupa nosi gotovo sve zapise; smanji udio testa ili dodaj radove.');

  const skup = (split: GoldSet['split'], uzmi: boolean) => loadGoldSet({
    schemaVersion: 1, datasetId: opts.datasetId, split,
    items: oznaceni.filter((_, i) => uTestu.has(i) === uzmi).map((item) => ({ case: item.case, gold: oznake.get(item.br) })),
  });
  const calibration = skup('calibration', false);
  const test = skup('test', true);

  // Neovisna provjera curenja: nijedan ID grupe ne smije biti u oba splita.
  const idjevi = (g: GoldSet) => new Set(g.items.flatMap((i) => [i.case.provenance.documentGroupId, i.case.provenance.sourceGroupId, i.case.provenance.templateFamilyId]));
  const cal = idjevi(calibration);
  if ([...idjevi(test)].some((id) => cal.has(id))) throw new Error('Split curi: ista grupa je u calibration i test.');

  return {
    calibration, test,
    statistika: { oznaceno: oznaceni.length, neoznaceno: kandidati.items.length - oznaceni.length, grupa: grupe.size,
      calibration: brojac(calibration.items), test: brojac(test.items) },
  };
}
