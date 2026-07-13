/** Run the existing Lekta DOCX engine over an internal JSONL manifest. */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { installXmlDomParser } from '../src/docx/xml-dom-install';
import { analyzeFixture } from '../src/analysis/golden-entry';

installXmlDomParser();

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Nedostaje argument ${name}`);
}

const input = arg('--input');
const output = arg('--output');
const profileId = arg('--profile');
const lines = readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const results: string[] = [];

for (const line of lines) {
  const record = JSON.parse(line);
  const docxPath = record._analysisDocxPath;
  if (!docxPath) continue;
  const bytes = readFileSync(docxPath);
  const file = new File([bytes], basename(docxPath), {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  try {
    const analysis = await analyzeFixture(file, { profileId });
    results.push(JSON.stringify({
      id: record.id,
      repository: record.repository,
      relativePath: record.relativePath,
      sourceDocumentId: record.id,
      analysis,
    }));
  } catch (error) {
    results.push(JSON.stringify({
      id: record.id,
      repository: record.repository,
      relativePath: record.relativePath,
      sourceDocumentId: record.id,
      analysisError: error instanceof Error ? error.message : String(error),
    }));
  }
}

writeFileSync(output, results.join('\n') + (results.length ? '\n' : ''));
console.log(`Analyzed ${results.length} DOCX documents with profile ${profileId}`);
