// WS-3 Deno smoke test (RUCNO, ne deploya se). Potvrdjuje da repair engine i entitlement-susjedni
// moduli rade u Deno runtimeu (proxy za Supabase Edge), sto npm run check (Node/vitest) NE dokazuje.
//
// Pokreni iz korijena repozitorija:
//   deno run --allow-read supabase/functions/repair-docx/_deno-smoke.ts
//
// Ocekivano: sve 4 provjere PASS. Ako "estimator import" padne -> work-type-estimate.ts JSON uvoz
// treba `with { type: 'json' }` za Deno (WS-3 deploy TODO). Ako "deflate-raw" padne -> Supabase Deno
// verzija je prestara (malo vjerojatno; Deno >= 1.37 podrzava).

const FIXTURE = new URL('../../../tests/fixtures/docx/mef-doktorski-disertacija.docx', import.meta.url);
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// 1) deflate-raw round-trip (jedini novi Web-API koji engine trazi, a generate-report ne koristi)
try {
  const data = new TextEncoder().encode('lekta '.repeat(2000));
  const comp = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const back = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  check('deflate-raw round-trip', back.length === data.length && comp.length < data.length, `in=${data.length} comp=${comp.length}`);
} catch (e) {
  check('deflate-raw round-trip', false, String(e));
}

// 2) estimator import (hvata Deno JSON-import-attribute problem u work-type-estimate.ts)
try {
  const mod = await import('../../../src/report/work-type-estimate.ts');
  const blocks = mod.unambiguousMismatch('seminarski', { words: 40000 }) === true; // ocito prevelik
  check('estimator import + unambiguousMismatch', typeof mod.unambiguousMismatch === 'function' && blocks);
} catch (e) {
  check('estimator import + unambiguousMismatch', false, 'JSON-import? -> ' + String(e));
}

// 3) zip-codec round-trip na pravom fixtureu
try {
  const { readZip, writeZip } = await import('../../../src/repair/zip-codec.ts');
  const bytes = await Deno.readFile(FIXTURE);
  const entries = await readZip(bytes);
  const rezip = await writeZip(entries);
  const again = await readZip(rezip);
  check('zip-codec read/write/read', entries.length > 0 && again.length === entries.length, `entries=${entries.length}`);
} catch (e) {
  check('zip-codec read/write/read', false, String(e));
}

// 4) applyFixers end-to-end (isti engine kao klijent), izlaz je valjan docx
try {
  const { applyFixers } = await import('../../../src/repair/apply-fixers.ts');
  const { readZip } = await import('../../../src/repair/zip-codec.ts');
  const bytes = await Deno.readFile(FIXTURE);
  const out = await applyFixers(bytes, [
    { ruleId: 'font', fixerId: 'font-fixer', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
    { ruleId: 'margine', fixerId: 'margins-fixer', params: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 } },
  ]);
  const outEntries = await readZip(out.docxBytes);
  const validDocx = outEntries.some((e) => e.name === 'word/document.xml');
  check('applyFixers -> valjan docx', validDocx && out.docxBytes.length > 0, `changelog=${out.changelog.length} skipped=${out.skipped.length}`);
} catch (e) {
  check('applyFixers -> valjan docx', false, String(e));
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) Deno.exit(1);
