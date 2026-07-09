/**
 * Smoke generator: sintetski .docx -> analyzeDocx, da se vidi kako motor reagira.
 *
 * Radi u obicnom Node/CI okruzenju (nema preglednika): instalira @xmldom/xmldom kao globalni
 * DOMParser (isto kao Web Worker, src/docx/xml-dom-install.ts), sagradi dva uzorka rada
 * (uskladjen i namjerno neuskladjen: kriv font/velicina/prored/margine) preko golden buildera,
 * pa svaki analizira DOM-free adapterom (src/analysis/golden-entry.ts). Ovo NIJE pravi studentski
 * rad ni izvor pravila; sluzi da CI pokaze reakciju motora (score, provjere, nalazi).
 *
 * Izlaz: artifacts/{uzorak-*.docx, analiza-*.json, IZVJESTAJ.md}.
 * Pokretanje: npx vite-node scripts/docx-smoke.mts [--profile <id>] [--out <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { installXmlDomParser } from '../src/docx/xml-dom-install';
import { buildDocx, type DocSpec, type ParaSpec } from '../tests/helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';

installXmlDomParser(); // globalni DOMParser (@xmldom/xmldom) za Node/CI, identicno worker putanji

function parseArgs(argv: string[]) {
  const a: { profile?: string; out: string } = { out: 'artifacts' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') a.profile = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

/** Uzorak diplomskog rada. clean=true postuje ceste norme; clean=false ih krsi (font/velicina/prored/margine). */
function sampleSpec(clean: boolean): DocSpec {
  const font = clean ? 'Times New Roman' : 'Arial';
  const sizePt = clean ? 12 : 11;
  const spacing15 = clean; // uskladjen => prored 1,5; neuskladjen => jednostruki
  const body = (text: string, extra: Partial<ParaSpec> = {}): ParaSpec => ({
    text,
    font,
    sizePt,
    spacing15,
    jc: 'both',
    ...extra,
  });
  const heading = (text: string): ParaSpec => ({ text, font, sizePt, bold: true, styleId: 'Heading1' });

  const loremus =
    'Ovaj odlomak sluzi kao ispuna teksta kako bi dokument imao dovoljan opseg za procjenu ' +
    'broja kartica i strukture. Sadrzaj je sintetski i ne predstavlja stvaran akademski rad. ';

  const paragraphs: ParaSpec[] = [
    { text: 'Sveuciliste u Zagrebu', font, sizePt, jc: 'center' },
    { text: 'Fakultet politickih znanosti', font, sizePt, jc: 'center' },
    { text: 'Analiza medijske pismenosti mladih', font, sizePt: sizePt + 4, bold: true, jc: 'center' },
    { text: 'Diplomski rad', font, sizePt, jc: 'center' },
    { text: 'Student: Ivan Horvat', font, sizePt, jc: 'center' },
    { text: 'Mentor: prof. dr. sc. Ana Kovac', font, sizePt, jc: 'center' },
    { text: 'Zagreb, 2026.', font, sizePt, jc: 'center' },
    heading('Sazetak'),
    body('Rad istrazuje medijsku pismenost mladih. ' + loremus),
    heading('1. Uvod'),
    body('Uvodno poglavlje postavlja istrazivacko pitanje i cilj rada. ' + loremus + loremus),
    heading('2. Teorijski okvir'),
    body('Pregled literature o medijskoj pismenosti i digitalnim kompetencijama. ' + loremus + loremus),
    body('Nastavak teorijske razrade s definicijama kljucnih pojmova. ' + loremus),
    heading('3. Metodologija'),
    body('Istrazivanje koristi anketu na uzorku srednjoskolaca. ' + loremus),
    heading('4. Rezultati i rasprava'),
    body('Rezultati pokazuju umjerenu razinu medijske pismenosti. ' + loremus + loremus),
    heading('5. Zakljucak'),
    body('Zakljucno, rad potvrduje potrebu za sustavnim obrazovanjem. ' + loremus),
    heading('Literatura'),
    body('Kovac, A. (2020). Medijska pismenost. Zagreb: Naklada.', { jc: 'left' }),
    body('Horvat, I. (2019). Digitalne kompetencije mladih. Rijeka: Izdavac.', { jc: 'left' }),
  ];

  return {
    paragraphs,
    marginsCm: clean ? { top: 2.5, right: 2.5, bottom: 2.5, left: 3.0 } : { top: 2, right: 2, bottom: 2, left: 2 },
    footnotes: ['Napomena uz metodologiju.', 'Izvor podataka je anonimiziran.'],
  };
}

/** Defenzivan sazetak rezultata (oblik iz tests/helpers/golden-normalize.ts). */
function summarize(r: any) {
  const checks = Array.isArray(r?.checks) ? r.checks : [];
  const issues = Array.isArray(r?.issues) ? r.issues : [];
  const byStatus: Record<string, number> = {};
  for (const c of checks) byStatus[String(c?.status ?? 'nepoznato')] = (byStatus[String(c?.status ?? 'nepoznato')] || 0) + 1;
  return {
    score: r?.score ?? null,
    profile: r?.profile ?? null,
    profileStatus: r?.profileStatus ?? null,
    checksTotal: checks.length,
    checksByStatus: byStatus,
    issues: issues.map((i: any) => ({ severity: i?.severity ?? null, title: i?.title ?? null, detail: i?.detail ?? null })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileId = args.profile || VERIFIED_PROFILE_REGISTRY[0].id;
  const profileEntry = VERIFIED_PROFILE_REGISTRY.find((p) => p.id === profileId);
  if (!profileEntry) throw new Error(`Nepoznat profileId: ${profileId}. Dostupni npr.: ${VERIFIED_PROFILE_REGISTRY.slice(0, 5).map((p) => p.id).join(', ')}`);

  mkdirSync(args.out, { recursive: true });
  console.log(`Profil: ${profileEntry.profileLabel} (${profileId}), status ${profileEntry.status}\n`);

  const md: string[] = ['# Smoke izvjestaj: reakcija motora na uzorak .docx', '', `Profil: ${profileEntry.profileLabel} (${profileId})`, ''];
  const variants = [
    { key: 'uskladjen', clean: true, label: 'Uskladjen (TNR 12, prored 1,5, margine 2,5/3 cm)' },
    { key: 'neuskladjen', clean: false, label: 'Neuskladjen (Arial 11, jednostruki prored, margine 2 cm)' },
  ];

  for (const v of variants) {
    const spec = sampleSpec(v.clean);
    const bytes = buildDocx(spec);
    const docxPath = `${args.out}/uzorak-${v.key}.docx`;
    writeFileSync(docxPath, bytes);
    const file = new File([bytes], `uzorak-${v.key}.docx`, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await analyzeFixture(file, { profileId });
    writeFileSync(`${args.out}/analiza-${v.key}.json`, JSON.stringify(result, null, 2) + '\n');

    const s = summarize(result);
    console.log(`### ${v.label}`);
    console.log(`  docx: ${docxPath} (${bytes.length} B)`);
    console.log(`  score: ${s.score}`);
    console.log(`  provjere: ${s.checksTotal} (${Object.entries(s.checksByStatus).map(([k, n]) => `${k}:${n}`).join(', ') || '-'})`);
    console.log(`  nalaza: ${s.issues.length}`);
    s.issues.slice(0, 6).forEach((i) => console.log(`    - [${i.severity}] ${i.title}`));
    console.log('');

    md.push(`## ${v.label}`, '', `- Datoteka: \`uzorak-${v.key}.docx\` (${bytes.length} B)`, `- Score: **${s.score}**`, `- Provjere: ${s.checksTotal} (${Object.entries(s.checksByStatus).map(([k, n]) => `${k}: ${n}`).join(', ') || '-'})`, `- Nalaza: ${s.issues.length}`, '');
    if (s.issues.length) {
      s.issues.slice(0, 12).forEach((i) => md.push(`  - [${i.severity}] ${i.title}${i.detail ? ` — ${i.detail}` : ''}`));
      md.push('');
    }
  }

  writeFileSync(`${args.out}/IZVJESTAJ.md`, md.join('\n') + '\n');
  console.log(`Gotovo. Artefakti u ${args.out}/ (uzorci .docx, analiza-*.json, IZVJESTAJ.md).`);
}

main().catch((e) => {
  console.error('[docx-smoke]', e?.stack || e?.message || e);
  process.exit(1);
});
