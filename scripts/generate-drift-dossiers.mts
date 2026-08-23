/**
 * Dosjei za raskorak izmedju verificirane tvrdnje i vrijednosti koju motor boduje.
 *
 * Pokreni:  npm run drift-adjudicate  pa  npm run drift-dossiers
 * (redoslijed je bitan: dosje uvozi `docs/generated/drift-adjudication.json`, presudu o tome sto
 *  o svakoj od dvije vrijednosti kaze sam izvor.)
 *
 * Zasto postoji: demotija (advisory-demotion.ts) je PRIVREMENA mjera koja zaustavlja krivo
 * bodovanje, ali ne rjesava nijedan slucaj. Presudu donosi covjek, a presuda trazi dokaz pred
 * sobom: izvor, lokator, doslovan citat i obje vrijednosti jedna do druge.
 *
 * Skripta NISTA ne proglasava. Cita samo `data/verification/scored-value-drift.json` i draftove.
 * Isti ugovor kao `scripts/verification-worklist.mts`.
 *
 * Sto covjek odlucuje po slucaju:
 *  A) tvrdnja je tocna -> prenesi njezinu vrijednost u `rules` sva tri registra i makni demotiju;
 *  B) tvrdnja je preseljena (krivo pripisan opseg ili odsjecki izvor) -> ispravi tvrdnju;
 *  C) oboje su obranjivi (dva izvora, razlicita snaga) -> odluka o hijerarhiji izvora, zapisi je.
 * Obrazac B nije rijedak: opovrgavajuci prolaz 2026-08-21 nasao ga je na 12 od 20 tvrdnji.
 */
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import artifact from '../data/verification/scored-value-drift.json';
import adjudication from '../docs/generated/drift-adjudication.json';
import type { SourceEntry } from '../src/profiles/profile-schema';
import type { ScoredValueFinding } from '../src/verification/scored-value-binding';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data', 'verification', 'drift-dossiers');
const SOURCES = new Map((SOURCE_REGISTRY as SourceEntry[]).map((s) => [s.id, s]));

const KIND_LABEL: Record<string, string> = {
  drift: 'RASKORAK: tvrdnja i motor kazu razlicito (demotirano dok se ne presudi)',
  unapplied: 'NEPRIMIJENJENO: tvrdnja postoji, motor tu dimenziju ne provjerava',
  unbacked: 'BEZ TVRDNJE: motor boduje dimenziju koju nijedan izvor ne pokriva',
};

const findings = (artifact as { findings: ScoredValueFinding[] }).findings;

/**
 * Presuda iz `scripts/adjudicate_drift.py`: sto o OBJE vrijednosti kaze sam izvor. Bez toga dosje
 * pokazuje dva broja i ostavlja covjeku da otvara PDF; s njom je vecina slucajeva jedno pitanje.
 */
type Adjudication = {
  ruleId: string;
  verdict: string;
  claimQuoteInSource: boolean | null;
  evidence: string[];
  engineAtomsMissingFromSource: string[];
  claimAtomsMissingFromSource: string[];
};
const VERDICT_LABEL: Record<string, string> = {
  'claim-supported': 'IZVOR NOSI VRIJEDNOST TVRDNJE, ne onu koju motor boduje -> zrcalo je krivo',
  'engine-supported': 'IZVOR NOSI VRIJEDNOST MOTORA, ne onu iz tvrdnje -> TVRDNJA je kriva',
  'both-present': 'izvor nosi OBJE vrijednosti -> pitanje opsega ili hijerarhije, trazi citanje',
  neither: 'izvor ne nosi NIJEDNU -> pravilo ide na reverifikaciju',
  unreadable: 'snapshot nije strojno citljiv (nije PDF ili nema tekstualni sloj)',
};
const adjByRule = new Map<string, Adjudication>(
  ((adjudication as { rows: Adjudication[] }).rows ?? []).map((r) => [r.ruleId, r]),
);
const byProfile = new Map<string, ScoredValueFinding[]>();
for (const f of findings) {
  const list = byProfile.get(f.profileId) ?? [];
  list.push(f);
  byProfile.set(f.profileId, list);
}

function fmt(value: unknown): string {
  return `\`${JSON.stringify(value)}\``;
}

function section(profileId: string, rows: ScoredValueFinding[]): string {
  const entries = draftRuleEntriesFor(profileId);
  const lines: string[] = [`# Dosje raskoraka: ${profileId}`, ''];
  lines.push(
    'Presudjuje COVJEK. Otvori snapshot na lokatoru, procitaj citat u kontekstu i odluci je li tocna',
    'tvrdnja ili vrijednost koju motor boduje. Pazi na tri obrasca koja su se vec ponavljala:',
    'odsjecki dokument predstavljen kao fakultetski, citat odsjecen prije iznimke u istoj recenici,',
    'i naslovnica kao tiha druga vrijednost.',
    '',
  );
  for (const kind of ['drift', 'unapplied', 'unbacked'] as const) {
    const group = rows.filter((r) => r.kind === kind);
    if (!group.length) continue;
    lines.push(`## ${KIND_LABEL[kind]} (${group.length})`, '');
    for (const row of group) {
      const entry = entries.find((e) => e.ruleId === row.ruleId);
      const src = row.sourceId ? SOURCES.get(row.sourceId) : undefined;
      lines.push(`### ${row.checkId}${entry?.label ? ` - ${entry.label}` : ''}`);
      if (row.claimValue !== undefined) lines.push(`- Tvrdnja (izvor): ${fmt(row.claimValue)}`);
      if (row.scoredValue !== undefined) lines.push(`- Motor boduje: ${fmt(row.scoredValue)}`);
      if (row.ruleId) lines.push(`- ruleId: \`${row.ruleId}\``);
      if (row.sourceId) lines.push(`- Izvor: ${row.sourceId}${src?.title ? ` - ${src.title}` : ''}`);
      if (row.sourcePage) lines.push(`- Lokator: ${row.sourcePage}`);
      if (src?.snapshotPath) lines.push(`- Snapshot: \`${src.snapshotPath}\``);
      if (entry?.quote) lines.push(`- Citat: "${entry.quote}"`);
      if (entry?.authority) lines.push(`- Autoritet: ${entry.authority}`);
      if (entry?.lastVerified) lines.push(`- Zadnja provjera: ${entry.lastVerified} (${entry.verifiedBy ?? 'bez potpisa'})`);
      const adj = row.ruleId ? adjByRule.get(row.ruleId) : undefined;
      if (adj) {
        lines.push('', `**Sto kaze sam izvor:** ${VERDICT_LABEL[adj.verdict] ?? adj.verdict}`);
        if (adj.claimQuoteInSource === false) {
          lines.push(
            '- **CITAT SE NE NALAZI U DOKUMENTU KOJI CITIRA.** To je najtezi oblik nalaza: pravilo je',
            '  `verified` i ljudski potpisano, a njegovo uporiste u navedenom izvoru ne postoji.',
          );
        }
        if (adj.engineAtomsMissingFromSource.length) {
          lines.push(`- U izvoru NEMA vrijednosti motora: ${adj.engineAtomsMissingFromSource.join('; ')}`);
        }
        if (adj.claimAtomsMissingFromSource.length) {
          lines.push(`- U izvoru NEMA vrijednosti tvrdnje: ${adj.claimAtomsMissingFromSource.join('; ')}`);
        }
        for (const ev of adj.evidence.slice(0, 2)) lines.push(`- Iz izvora: "...${ev.slice(0, 200)}..."`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

mkdirSync(outDir, { recursive: true });
// Ustajali dosje je gori od nikakvog: slucaj koji je rijesen ne smije i dalje stajati na disku.
for (const file of readdirSync(outDir)) {
  if (file.endsWith('.md')) rmSync(join(outDir, file));
}

const index: string[] = [
  '# Raskoraci izmedju tvrdnje i bodovanja',
  '',
  'GENERIRANO (`npm run drift-dossiers`) iz `data/verification/scored-value-drift.json`. Ne uredjuj rucno.',
  '',
];
const counts = (artifact as { counts: Record<string, number> }).counts;
index.push(
  `Raskorak: ${counts.drift ?? 0}. Neprimijenjeno: ${counts.unapplied ?? 0}. Bez tvrdnje: ${counts.unbacked ?? 0}.`,
  `Profila s demotijom zbog raskoraka: ${counts.profilesDemoted ?? 0}.`,
  '',
);
for (const [profileId, rows] of [...byProfile].sort()) {
  writeFileSync(join(outDir, `${profileId}.md`), `${section(profileId, rows)}\n`, 'utf8');
  const kinds = [...new Set(rows.map((r) => r.kind))].sort().join(', ');
  index.push(`- [${profileId}](${profileId}.md) - ${rows.length} (${kinds})`);
}
writeFileSync(join(outDir, 'INDEX.md'), `${index.join('\n')}\n`, 'utf8');
console.log(`[drift-dossiers] ${byProfile.size} dosjea u ${outDir}`);
