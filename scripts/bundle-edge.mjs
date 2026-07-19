#!/usr/bin/env node
// scripts/bundle-edge.mjs
//
// Bundla Supabase Edge Function (Deno) + sve LOKALNE ovisnosti (supabase/functions/_shared/** i src/**)
// u JEDNU samostalnu datoteku, radi deploya preko Supabase MCP `deploy_edge_function` (koji trazi sve
// relativne ovisnosti u `files`; nas import-graf je prevelik za rucno nabrajanje). Remote (https://esm.sh,
// jsr:, npm:, node:) ostaju EXTERNAL jer ih Deno runtime rjesava sam, kao i u nebundlanoj funkciji.
//
// Pokretanje: node scripts/bundle-edge.mjs <ulaz index.ts> <izlaz bundle.ts>

import esbuild from 'esbuild';

const [, , entry, outfile] = process.argv;
if (!entry || !outfile) {
  console.error('uporaba: node scripts/bundle-edge.mjs <ulaz index.ts> <izlaz bundle.ts>');
  process.exit(1);
}

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',       // Deno globali (Deno.serve/env) ostaju netaknuti
  target: 'es2022',
  outfile,
  // Ne diramo ono sto Deno runtime sam dohvaca: esm.sh/jsr/npm/node ostaju kao importi u bundleu.
  external: ['https://*', 'http://*', 'jsr:*', 'npm:*', 'node:*'],
  legalComments: 'none',
  logLevel: 'info',
});

console.log(`[bundle-edge] ${entry} -> ${outfile}`);
