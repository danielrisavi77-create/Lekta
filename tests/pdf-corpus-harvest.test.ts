/**
 * Lokalni korpus za razinu A-pdf (scripts/pdf-corpus/harvest_pdf_corpus.py). Mreza i pdf2docx ovdje se ne
 * koriste: `--selftest` pokriva odabir, sidecar, preskakanje i pad pretvorbe nad laznim dohvatom, a stvarna
 * skripta mora odbiti izlaznu mapu unutar repozitorija prije ikakvog preuzimanja.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SKRIPTA = resolve(__dirname, '..', 'scripts', 'pdf-corpus', 'harvest_pdf_corpus.py');

describe('PDF korpus za razinu A-pdf', () => {
  it('samoprovjera prolazi bez mreze i bez pdf2docx', () => {
    const r = spawnSync('python3', [SKRIPTA, '--selftest'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('selftest: ok');
  });

  it('odbija izlaznu mapu unutar repozitorija prije preuzimanja', () => {
    const r = spawnSync('python3', [SKRIPTA, '--pids-file', 'nepostojece.json', '--out-dir', resolve(__dirname, '..', 'tmp-pdf-korpus')], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unutar repozitorija/);
  });
});
