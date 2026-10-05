import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocumentProxy, extractText } from 'unpdf';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (!args.length) throw new Error('Uporaba: node scripts/ocr-snapshot.mjs [--all-scanned] <snapshotPath>...');
const registry = JSON.parse(readFileSync(join(root, 'data/sources/source-registry.json'), 'utf8'));
const byPath = new Map(registry.map((s) => [s.snapshotPath, s]));
async function isScanned(path) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(resolve(root, path))));
  return (await extractText(pdf, { mergePages: true })).text.replace(/\s/g, '').length <= 200;
}
const paths = new Set(args.filter((a) => a !== '--all-scanned'));
if (args.includes('--all-scanned')) {
  for (const source of registry) if (source.snapshotPath?.toLowerCase().endsWith('.pdf') && await isScanned(source.snapshotPath)) paths.add(source.snapshotPath);
}
for (const path of paths) {
  const source = byPath.get(path);
  if (!source || !path.toLowerCase().endsWith('.pdf')) throw new Error(`Nije registrirana PDF snimka: ${path}`);
  const input = resolve(root, path);
  const hash = createHash('sha256').update(readFileSync(input)).digest('hex');
  if (hash !== source.snapshotHash) throw new Error(`Hash snimke ne odgovara registru: ${path}`);
  const tempDir = mkdtempSync(join(tmpdir(), 'lekta-ocr-'));
  try {
    const temp = join(tempDir, 'ocr.txt');
    const env = { ...process.env };
    if (!env.TESSDATA_PREFIX && env.LOCALAPPDATA) {
      const tessdata = join(env.LOCALAPPDATA, 'tessdata');
      if (existsSync(tessdata)) env.TESSDATA_PREFIX = tessdata;
    }
    const result = spawnSync('python', [join(root, 'scripts/ocr_pdf.py'), input, temp], { cwd: root, env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`OCR nije uspio: ${path}`);
    const output = input.replace(/\.pdf$/i, '.snapshot-ocr.txt');
    // Drugi redak veze tijelo uz vlastiti hash (LF), koji se nakon rucne provjere upisuje u registar kao
    // ocrTranscript.textHash. Bez toga je OCR samo pomocni tekst i ne vrijedi kao dokaz citata.
    const body = readFileSync(temp, 'utf8').replace(/\r\n/g, '\n');
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    writeFileSync(output, `# snapshotHash: ${hash}\n# ocrTextHash: ${bodyHash}\n${body}`, 'utf8');
    console.log(output);
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
}
