/**
 * Cross-institution port, batch 1: zagrebacka privatna sveucilista (ZSEM, Libertas).
 * PRVI port izvan unizg institucije - koristi generalizirani reducer (spec.institution).
 * Pravila su iz sluzbenih Pravilnika (institucija-wide), citana izravno (ai-1pass-batch).
 * Pise fanout draftove + 2 port-speca (po instituciji). Hash se racuna iz snapshot datoteke.
 *
 * Pokretanje: node scripts/gen-private-batch1.mjs
 *   pa: node scripts/port-faculty.mjs discovery/port-specs/zsem.json discovery/port-specs/libertas.json
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const NOW = '2026-07-02';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const SRC = {
  'zsem-pravilnik-zavrsni-2023': 'data/sources/zsem/zsem-pravilnik-zavrsni-2023.pdf',
  'zsem-pravilnik-diplomski-2023': 'data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf',
  'libertas-pravilnik-zavrsni-2024': 'data/sources/libertas/libertas-pravilnik-zavrsni-2024.pdf',
  'libertas-pravilnik-diplomski-2024': 'data/sources/libertas/libertas-pravilnik-diplomski-2024.pdf',
};
const HASH = Object.fromEntries(Object.entries(SRC).map(([id, p]) => [id, sha(p)]));

const Q_ZSEM_ZAV = 'Zavrsni rad treba biti napisan na racunalu u formatu A4 u pravilu na ne manje od 30 stranica sadrzaja. Prilikom pisanja koristi se font Times New Roman, size 12, obostrano poravnavanje teksta, razmak izmeu redova 1,5pt, uvlaka za prvi red odlomka 1,27pt, razmak izmeu pojedinog odlomka 6pt.';
const Q_ZSEM_DIP_FMT = 'Tehnicko ureenje rada. Pismo: Times New Roman. Font: 12. Poravnanje teksta: obostrano. Razmak izmeu redova: 1,5.';
const Q_ZSEM_DIP_HEAD = 'Naslovi poglavlja i potpoglavlja moraju biti kratki i jasni, te redom numerirani arapskim brojevima, najvise do tri (3) razine, ali ne vise od toga (Primjer 1., 1.1., 1.1.1.).';
const Q_LIB_ZAV = 'Zavrsni rad pise se na racunalu na papiru velicine A4. Velicina slova je font 12, s proredom 1,5, a stil u kojem se pise je Times New Roman.';
const Q_LIB_DIP = 'Rad se pise na racunalu na papiru velicine A4, velicina slova font 12, stil kojim se pise Times New Roman s proredom 1,5 a margine stranica su 2,5 cm sa svih strana.';

const mk = (pid, src, page, checkId, value, category, label, quote, { mc = true, status = 'verified' } = {}) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: src, sourcePage: page, quote,
  status, ...(status === 'verified' ? { scored: true } : {}), verifiedHash: HASH[src],
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null, confirmedVia: 'ai-1pass-batch',
});

// --- definicije profila ---
const DEFS = {
  zsem: {
    institution: 'zsem', unitId: 'zsem', instName: 'Zagrebacka skola ekonomije i managementa',
    sources: [
      { id: 'zsem-pravilnik-zavrsni-2023', title: 'Pravilnik o izradi i obrani zavrsnog rada na prijediplomskim strucnim studijima (ZSEM, 2023)', url: 'https://zsem.hr/wp-content/uploads/2024/11/Pravilnik-o-izradi-i-obrani-zavrsnog-rada-na-prijediplomskim-strucnim-studijima-2023.docx.pdf', path: SRC['zsem-pravilnik-zavrsni-2023'] },
      { id: 'zsem-pravilnik-diplomski-2023', title: 'Pravilnik o diplomskom radu (ZSEM, svibanj 2023)', url: 'https://zsem.hr/wp-content/uploads/2024/11/PRAVILNIK-O-DIPLOMSKOM-RADU-svibanj-2023-1.pdf', path: SRC['zsem-pravilnik-diplomski-2023'] },
    ],
    profiles: [
      { pid: 'zsem-zavrsni', workType: 'final', program: 'Prijediplomski strucni studiji ZSEM (zavrsni rad)', label: 'ZSEM, zavrsni rad',
        src: 'zsem-pravilnik-zavrsni-2023', page: 'poglavlje Tehnicko uredenje zavrsnog rada (str. 3)',
        entries: (pid, s, pg) => [
          mk(pid, s, pg, 'paper-size', 'A4', 'format', 'Format papira', Q_ZSEM_ZAV),
          mk(pid, s, pg, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_ZSEM_ZAV),
          mk(pid, s, pg, 'font-size', 12, 'format', 'Velicina slova', Q_ZSEM_ZAV),
          mk(pid, s, pg, 'line-spacing', 1.5, 'format', 'Prored', Q_ZSEM_ZAV),
          mk(pid, s, pg, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZSEM_ZAV),
          mk(pid, s, pg, 'page-count', { min: 30 }, 'scope', 'Opseg (najmanje 30 str.)', Q_ZSEM_ZAV),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, requireA4: true } },
      { pid: 'zsem-diplomski', workType: 'graduate', program: 'Diplomski studiji ZSEM', label: 'ZSEM, diplomski rad',
        src: 'zsem-pravilnik-diplomski-2023', page: 'Clanak 28. (Tehnicko uredenje rada)',
        entries: (pid, s, pg) => [
          mk(pid, s, pg, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_ZSEM_DIP_FMT),
          mk(pid, s, pg, 'font-size', 12, 'format', 'Velicina slova', Q_ZSEM_DIP_FMT),
          mk(pid, s, pg, 'line-spacing', 1.5, 'format', 'Prored', Q_ZSEM_DIP_FMT),
          mk(pid, s, pg, 'justify', true, 'format', 'Obostrano poravnanje', Q_ZSEM_DIP_FMT),
          mk(pid, s, pg, 'heading-rules', { numberRequired: true, romanLevelOneAllowed: false, maxLevel: 3, trailingDot: true, levels: { 1: { uppercase: true }, 2: { uppercase: true }, 3: {} } }, 'structure', 'Oblikovanje naslova po razinama', Q_ZSEM_DIP_HEAD),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, justify: true, headingRules: { numberRequired: true, romanLevelOneAllowed: false, maxLevel: 3, trailingDot: true, levels: { 1: { uppercase: true }, 2: { uppercase: true }, 3: {} } } } },
    ],
  },
  libertas: {
    institution: 'libertas', unitId: 'libertas', instName: 'Sveuciliste Libertas',
    sources: [
      { id: 'libertas-pravilnik-zavrsni-2024', title: 'Pravilnik o zavrsnom radu (Libertas, srpanj 2024)', url: 'https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-zavrsnom-radu.pdf', path: SRC['libertas-pravilnik-zavrsni-2024'] },
      { id: 'libertas-pravilnik-diplomski-2024', title: 'Pravilnik o diplomskom radu (Libertas, srpanj 2024)', url: 'https://www.libertas.hr/wp-content/uploads/2025/01/Pravilnik-o-diplomskom-radu.pdf', path: SRC['libertas-pravilnik-diplomski-2024'] },
    ],
    profiles: [
      { pid: 'libertas-zavrsni', workType: 'final', program: 'Prijediplomski studiji Libertas (zavrsni rad)', label: 'Libertas, zavrsni rad',
        src: 'libertas-pravilnik-zavrsni-2024', page: 'clanak o oblikovanju zavrsnog rada',
        entries: (pid, s, pg) => [
          mk(pid, s, pg, 'paper-size', 'A4', 'format', 'Format papira', Q_LIB_ZAV),
          mk(pid, s, pg, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_LIB_ZAV),
          mk(pid, s, pg, 'font-size', 12, 'format', 'Velicina slova', Q_LIB_ZAV),
          mk(pid, s, pg, 'line-spacing', 1.5, 'format', 'Prored', Q_LIB_ZAV),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, requireA4: true } },
      { pid: 'libertas-diplomski', workType: 'graduate', program: 'Diplomski studiji Libertas', label: 'Libertas, diplomski rad',
        src: 'libertas-pravilnik-diplomski-2024', page: 'clanak o oblikovanju diplomskog rada',
        entries: (pid, s, pg) => [
          mk(pid, s, pg, 'paper-size', 'A4', 'format', 'Format papira', Q_LIB_DIP),
          mk(pid, s, pg, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_LIB_DIP),
          mk(pid, s, pg, 'font-size', 12, 'format', 'Velicina slova', Q_LIB_DIP),
          mk(pid, s, pg, 'line-spacing', 1.5, 'format', 'Prored', Q_LIB_DIP),
          mk(pid, s, pg, 'margins', { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, 'format', 'Margine', Q_LIB_DIP),
        ],
        rules: { font: ['Times New Roman'], size: [12], spacing: 1.5, margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, requireA4: true } },
    ],
  },
};

for (const [key, def] of Object.entries(DEFS)) {
  mkdirSync(`data/profiles/${def.unitId}/drafts`, { recursive: true });
  const profiles = [], ledger = [], catalogPrograms = [];
  const sources = def.sources.map((s) => ({
    id: s.id, kind: 'regulation', title: s.title, url: s.url,
    publisher: def.instName, fetchedAt: NOW, snapshotPath: s.path, snapshotHash: HASH[s.id],
    validityClass: 'stable', lastChecked: NOW,
    note: 'Institucija-wide Pravilnik; tehnicko uredenje rada citano izravno iz PDF-a.',
  }));
  for (const pr of def.profiles) {
    const es = pr.entries(pr.pid, pr.src, pr.page);
    writeFileSync(`data/profiles/${def.unitId}/drafts/${pr.pid}.json`,
      JSON.stringify({ profileId: pr.pid, entries: es, generatedAt: NOW }, null, 2) + '\n');
    catalogPrograms.push(pr.program);
    profiles.push({
      id: pr.pid, unitId: def.unitId, programs: [pr.program], workTypes: [pr.workType], status: 'partial',
      profileLabel: pr.label, verifiedAt: NOW, documentDate: null, rules: pr.rules, facts: [],
      note: `Tehnicko uredenje rada iz sluzbenog Pravilnika (${def.instName}), citano izravno.`,
      sources: def.sources.map((s) => ({ title: s.title, url: s.url })),
      sourceHierarchy: def.sources.map((s) => s.title),
      ruleAuthority: 'official-program-guidelines',
      normativeScope: es.filter((e) => e.status === 'verified').map((e) => e.label),
      advisoryScope: es.filter((e) => e.status !== 'verified').map((e) => e.label),
    });
    for (const e of es) {
      if (e.status !== 'verified') continue;
      ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pr.pid, action: 'verified',
        actor: 'owner-bulk-approval', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
        note: `Cross-institution port (${def.instName}): direktno citanje Pravilnika.` });
    }
  }
  const spec = { faculty: def.unitId, institution: def.institution,
    catalogPrograms, sources, profiles, ledger };
  writeFileSync(`discovery/port-specs/${def.unitId}.json`, JSON.stringify(spec, null, 2) + '\n');
  console.log(`${def.unitId}: ${profiles.length} profila, ${ledger.length} ledger, ${sources.length} izvora.`);
}
