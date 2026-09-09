/**
 * Nijedna Edge funkcija ne smije citati multipart neomedjeno (`req.formData()`).
 *
 * MOTIV (vanjski audit 2026-09-08, nalaz 5, potvrdjen na `origin/master` 2438bbd4):
 * `supabase/functions/repair-docx/index.ts` je imao `if (clen && clen > MAX)` pa `await req.formData()`.
 * Bez `Content-Length` je `clen` 0 i uvjet otpadne, pa se cijeli multipart parsirao u memoriju
 * PRIJE ijedne provjere velicine; `meta` dio nije imao granicu nikad. Cetiri druge funkcije su vec
 * koristile omedjeno citanje iz `_shared/read-body.ts`, samo ova s najvecim tijelom nije.
 *
 * Ovo je STATICKA straza (cita izvor) i dopunjuje dinamicke testove u
 * `supabase/functions/_shared/read-body.test.ts`, koji dokazuju da omedjeni citac stvarno prekida
 * stream. Staticka je zato sto grize i kad netko doda NOVU funkciju s istim oblikom, koju nijedan
 * dinamicki test jos ne poznaje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hasUnboundedFormData } from './helpers/edge-formdata';

const FUNKCIJE = resolve(process.cwd(), 'supabase', 'functions');

function edgeIndexFiles(): string[] {
  return readdirSync(FUNKCIJE)
    .filter((ime) => !ime.startsWith('_'))
    .map((ime) => join(FUNKCIJE, ime, 'index.ts'))
    .filter((p) => {
      try { return statSync(p).isFile(); } catch { return false; }
    });
}

describe('Edge funkcije: multipart samo kroz omedjeni citac', () => {
  it('skenira stvarne funkcije, ne prazan popis (inace bi prolaz bio vakuumski)', () => {
    expect(edgeIndexFiles().length).toBeGreaterThan(10);
  });

  it('nijedna funkcija ne zove req.formData() izravno', () => {
    const pale = edgeIndexFiles()
      .filter((p) => hasUnboundedFormData(readFileSync(p, 'utf8')))
      .map((p) => p.slice(FUNKCIJE.length + 1).replace(/\\/g, '/'));
    expect(pale, 'multipart ide kroz readFormDataBounded iz _shared/read-body.ts').toEqual([]);
  });

  it('gard prepoznaje neomedjen oblik i ne lovi omedjeni omotac', () => {
    expect(hasUnboundedFormData('let form: FormData; try { form = await req.formData(); }')).toBe(true);
    expect(hasUnboundedFormData('const f = await request.formData()')).toBe(true);
    expect(hasUnboundedFormData('const b = await readFormDataBounded(req, MAX);')).toBe(false);
    expect(hasUnboundedFormData('new Response(bytes, { headers }).formData()')).toBe(false);
  });
});
