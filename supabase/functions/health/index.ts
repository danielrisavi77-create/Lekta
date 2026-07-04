// Lekta Edge Function: health (Deno, Supabase).
// Lagana provjera zivosti serverskih putova za vanjski uptime monitor (pre-launch checklist
// P1 8-3). Ne dira bazu ni tajne; vraca 200 + status. Monitor gada ovu rutu; za dublju provjeru
// (auth 401 grana) monitor moze gadati i create-checkout bez tokena i ocekivati 401.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return new Response(
    JSON.stringify({ status: 'ok', service: 'lekta', time: new Date().toISOString() }),
    { status: 200, headers: { ...CORS, 'content-type': 'application/json' } },
  );
});
