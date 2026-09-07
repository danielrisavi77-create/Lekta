// scripts/master-ci-core.mjs
//
// Cista prosudba "je li grana zelena na CI-u", odvojena od dohvata, da se moze testirati bez mreze.
//
// DVIJE ISPRAVKE ZBOG KOJIH POSTOJI, obje izmjerene 2026-09-05/06:
//
// 1. GLEDA SE SVAKI WORKFLOW, NE SAMO `check.yml`. Prva izvedba je pitala samo `check`, pa je
//    `browser-matrix` bio nevidljiv. Tocno on je te noci bio crven dva commita zaredom (firefox i
//    webkit), dok je `check` bio zelen; alat bi javio ZELENO nad granom koja to nije. Rupa nije
//    teoretska: zbog nje se crveni `browser-matrix` otkrio tek rucnim gledanjem GitHuba.
//
// 2. `cancelled` NIJE PAD. GitHub prekida runove u tijeku kad na granu stigne noviji commit, pa
//    superseded run zavrsi kao `cancelled`. Brojenje svega sto nije `success` kao pada dalo je te
//    noci lazan nalaz "CRVENO (3)", a dva od ta tri bila su prekinuta tudjim pushom. Zastavica
//    umjesto razlucivanja je isti razred greske koji ovaj repozitorij vec ima zapisan.
//
// Prosudba je PO COMMITU, ne po runu: commit je zelen samo ako mu nijedan dovrsen run nije pao.
// Niz se broji u COMMITIMA, jer "cetiri uzastopna pada" mora znaciti cetiri commita, a ne cetiri
// runa istog commita.

/** Zakljucci koji znace pad. Sve ostalo je uspjeh ili neodlucno. */
const PAD = new Set(['failure', 'timed_out', 'startup_failure']);
/** Zakljucci koji ne govore nista: run je prekinut ili ceka covjeka. */
const NEODLUCNO = new Set(['cancelled', 'action_required', 'stale']);

/**
 * @param {Array<{head_sha?: string, status?: string, conclusion?: string|null, name?: string,
 *                created_at?: string, html_url?: string}>} runovi
 *   Runovi kakve vraca GitHub API (`/actions/runs`), najnoviji prvi.
 * @returns {{ishod: 'zeleno'|'crveno'|'ne-znam', razlog?: string, sha?: string, kada?: string,
 *            niz?: number, pali?: Array<{name: string, url: string}>, uTijeku?: number}}
 */
/**
 * Dogadjaji koji mjere KOD ovog commita. `schedule` mjeri ZIVU INSTALACIJU i ne govori o kodu:
 * `post-deploy-smoke` se vrti po cronu nad produkcijom, pa bi njegov pad inace proglasio kod
 * crvenim iako je ispravan. Izmjereno 2026-09-06: bio je crven 8 uzastopnih commita jer produkcija
 * jos servira staru stranicu (`/rad/` vraca 404, Netlify je na rucnoj objavi). To je stvaran nalaz,
 * ali o DEPLOYU, ne o kodu, pa se prijavljuje odvojeno umjesto da se stopi u presudu.
 */
const KOD_DOGADJAJI = new Set(['push', 'pull_request', 'merge_group', 'workflow_dispatch', undefined, null, '']);

export function ocijeniRunove(sviRunovi) {
  if (!Array.isArray(sviRunovi) || sviRunovi.length === 0) {
    return { ishod: 'ne-znam', razlog: 'nema nijednog runa na grani' };
  }

  const zakazani = sviRunovi.filter((r) => String(r?.event || '') === 'schedule');
  const runovi = sviRunovi.filter((r) => KOD_DOGADJAJI.has(r?.event));
  const produkcija = (() => {
    const dovrseni = zakazani.filter((r) => r.status === 'completed' && r.conclusion);
    const pali = dovrseni.filter((r) => PAD.has(String(r.conclusion)));
    if (!pali.length) return null;
    return { pali: pali.map((r) => ({ name: String(r.name || '(bez imena)'), url: String(r.html_url || '') })) };
  })();

  if (runovi.length === 0) {
    return { ishod: 'ne-znam', razlog: 'nema nijednog runa vezanog uz kod (samo zakazani)', produkcija };
  }

  // Grupiranje po commitu uz OCUVAN redoslijed (API vraca najnovije prvo).
  const poCommitu = new Map();
  for (const r of runovi) {
    const sha = String(r?.head_sha || '');
    if (!sha) continue;
    if (!poCommitu.has(sha)) poCommitu.set(sha, []);
    poCommitu.get(sha).push(r);
  }
  if (poCommitu.size === 0) {
    return { ishod: 'ne-znam', razlog: 'nijedan run nema head_sha', produkcija };
  }

  const prosudba = (skup) => {
    const dovrseni = skup.filter((r) => r.status === 'completed' && r.conclusion);
    const uTijeku = skup.length - dovrseni.length;
    const pali = dovrseni.filter((r) => PAD.has(String(r.conclusion)));
    const odlucni = dovrseni.filter((r) => !NEODLUCNO.has(String(r.conclusion)));
    if (pali.length > 0) return { stanje: 'crveno', pali, uTijeku };
    if (odlucni.length === 0) return { stanje: 'ne-znam', uTijeku };
    return { stanje: 'zeleno', uTijeku };
  };

  const redom = [...poCommitu.entries()];
  const [vrhSha, vrhRunovi] = redom[0];
  const vrh = prosudba(vrhRunovi);
  const kada = String(vrhRunovi[0]?.created_at || '').replace('T', ' ').replace('Z', ' UTC');

  if (vrh.stanje === 'ne-znam') {
    return {
      ishod: 'ne-znam',
      razlog: vrh.uTijeku > 0
        ? `nijedan run na ${vrhSha.slice(0, 8)} jos nije dao odgovor (u tijeku: ${vrh.uTijeku})`
        : `svi runovi na ${vrhSha.slice(0, 8)} su prekinuti ili cekaju covjeka`,
      sha: vrhSha, uTijeku: vrh.uTijeku, produkcija,
    };
  }

  if (vrh.stanje === 'zeleno') {
    return { ishod: 'zeleno', sha: vrhSha, kada, uTijeku: vrh.uTijeku, produkcija };
  }

  // Niz uzastopnih CRVENIH COMMITA. Neodlucan commit prekida brojanje, jer nagadjanje o njemu
  // nije mjerenje; zeleni ga naravno prekida.
  let niz = 0;
  for (const [, skup] of redom) {
    const p = prosudba(skup);
    if (p.stanje !== 'crveno') break;
    niz += 1;
  }

  return {
    ishod: 'crveno', sha: vrhSha, kada, niz, uTijeku: vrh.uTijeku, produkcija,
    pali: vrh.pali.map((r) => ({ name: String(r.name || '(bez imena)'), url: String(r.html_url || '') })),
  };
}

/** Redci za ispis; odvojeno od prosudbe da test moze tvrditi i tekst. */
export function formatOcjenu(o, grana) {
  const red = [];
  // Zakazani smoke nad zivom instalacijom ide UVIJEK, i uz zeleno: kod moze biti ispravan a
  // produkcija stara. Tisina o tome je razlog zbog kojeg je 8 commita proslo neprimijeceno.
  const repProd = () => {
    if (!o.produkcija) return;
    const pali = o.produkcija.pali;
    const koliko = pali.length > 1 ? `${pali.length} uzastopnih` : '1';
    red.push(`PRODUKCIJA: zakazani smoke nad zivom instalacijom PADA (${koliko}). Ovo NE govori o kodu`);
    red.push('ovog commita nego o tome sto je ZIVO. Najnoviji:');
    red.push(`  ${pali[0].name}  ${pali[0].url}`);
  };
  if (o.ishod === 'ne-znam') {
    red.push(`NE ZNAM: ${o.razlog}`);
    red.push(`Ovo NIJE zeleno. Provjeri ponovno prije nego se osloni na ${grana}.`);
    repProd();
    return red;
  }
  if (o.ishod === 'zeleno') {
    red.push(`ZELENO: ${grana} ${o.sha.slice(0, 8)} je prosao CI u SVIM workflowima (${o.kada}).`);
    if (o.uTijeku > 0) red.push(`Napomena: ${o.uTijeku} run(ova) jos traje; ocjena vrijedi za dovrsene.`);
    repProd();
    return red;
  }
  red.push(`CRVENO: ${grana} ${o.sha.slice(0, 8)} je pao na CI-u (${o.kada}).`);
  for (const p of o.pali) red.push(`  pao workflow: ${p.name}  ${p.url}`);
  if (o.niz > 1) red.push(`Uzastopnih crvenih COMMITA na vrhu: ${o.niz}. Grana je crvena duze, ne tek od zadnjeg.`);
  repProd();
  return red;
}
