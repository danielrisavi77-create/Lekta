/**
 * Cista provjera nad IZVOROM `supabase/functions/webhook-mor/handler.ts` (Stripe).
 *
 * Porijeklo: master je 2026-09-22/23 (31b802ad, 81a89f2f, daf5f53a) ovaj gard uveo nad izvorom
 * handlera prijasnjeg pruzatelja. Pri spajanju mastera u design/pack3 (2026-09-26) prenesen je na
 * Stripe handler; tvrdnje su iste po smislu:
 *  - odluku sto je placeno, sto je povrat i sto se ignorira ne donosi handler nego
 *    `classifyStripeEvent` iz src/report/webhook.ts;
 *  - refund grana se otvara po IMENU dogadjaja (`decision.kind === 'refund'`, dakle
 *    `charge.refunded`), nikad po zastavici `ev.refunded`, koju parser postavlja i za Refund
 *    objekt pod drugim imenom (`refund.created`, isRefundBearing);
 *  - nijedna grana koja vraca 200 bez knjizenja (`ignored`) nije tiha: ima log redak;
 *  - nedostajuci user_id ne odbija dogadjaj s 400 prije inboxa (placena kupnja bi nestala);
 *  - potvrdjena naplata bez user_id (`needs_manual_link`) ima vlastiti ishod i ERROR redak, ne
 *    WARN uz `ignored` (masterov ishod iz 31b802ad i 81a89f2f);
 *  - odbijeno porijeklo (`event_refused`) je ERROR, a vrstu dogadjaja ne filtrira gate nego
 *    klasifikator (inace grana za povrat pod drugim imenom nije dohvatljiva).
 *
 * Handler se na pack3 i IZVRSAVA u testu (tests/webhook-mor-handler.test.ts), pa je ovo drugi,
 * staticki sloj: jeftin za mutacije u tests/gate-mutations.test.ts.
 */
export function webhookHandlerProblems(src: string): string[] {
  const problems: string[] = [];
  if (/!ev\.orderId\s*\|\|\s*!ev\.userId/.test(src)) {
    problems.push('400 jos odbija dogadjaj zbog nedostajuceg user_id (placena kupnja bi nestala)');
  }
  if (!src.includes('classifyStripeEvent(ev)')) {
    problems.push('handler ne zove classifyStripeEvent (odluka je opet u Edge funkciji)');
  }
  for (const kind of ['ignored', 'refund'] as const) {
    if (!src.includes(`decision.kind === '${kind}'`)) problems.push(`handler ne grana na kind '${kind}'`);
  }
  if (/if\s*\(\s*ev\.refunded\s*\)/.test(src)) {
    problems.push('refund grana se otvara po zastavici ev.refunded, ne po imenu charge.refunded');
  }
  if (!src.includes("settle('ignored'")) problems.push('ignoriran dogadjaj se ne biljezi u inbox');
  // Grana `ignored` mora ostaviti trag i u LOGU, ne samo u inboxu (nalaz pregleda na masteru
  // 2026-09-23). Odluka pociva na obliku tudjeg objekta (`status`, `amount_received`); kad bi ta
  // pretpostavka pukla, SVAKA kupnja bi postala `ignored` + 200 bez retryja.
  const ignoredBranch = (() => {
    const start = src.indexOf("decision.kind === 'ignored'");
    if (start < 0) return '';
    const end = src.indexOf("settle('ignored'", start);
    return end > start ? src.slice(start, end) : '';
  })();
  if (!/console\.(error|warn)\(/.test(ignoredBranch)) {
    problems.push("grana 'ignored' nema log retka (200 bez retryja i bez traga u logu)");
  }
  // Odbijeno porijeklo (testni nacin, tudji racun) je ERROR: kriva konfiguracija ili pokusaj.
  if (!/console\.error\(\s*'webhook-mor event_refused'/.test(src)) {
    problems.push('odbijeno porijeklo (event_refused) nema log retka na ERROR razini');
  }
  // Gate koji opet filtrira VRSTU prije klasifikatora cini granu povrata pod drugim imenom
  // nedohvatljivom (nalaz pregleda kruga 2, 2026-09-26): `refund.created` bi postao WARN sum.
  if (/'event_ignored'/.test(src)) {
    problems.push('gate opet odbija vrstu dogadjaja (event_ignored) prije klasifikatora');
  }
  // Potvrdjena naplata bez korisnika: vlastita grana, vlastiti ishod, ERROR razina.
  const manualBranch = (() => {
    const start = src.indexOf("decision.kind === 'needs_manual_link'");
    if (start < 0) return '';
    const end = src.indexOf("settle('needs_manual_link'", start);
    return end > start ? src.slice(start, end) : '';
  })();
  if (!manualBranch) {
    problems.push("handler nema granu 'needs_manual_link' s ishodom needs_manual_link (placena uplata bez korisnika)");
  } else if (!/console\.error\(\s*'webhook-mor needs_manual_link'/.test(manualBranch)) {
    problems.push("grana 'needs_manual_link' nema ERROR redak (placena uplata bez korisnika bi utonula u WARN)");
  }
  if (/settle\(\s*'ignored',\s*'missing_user_metadata'/.test(src)) {
    problems.push('placena uplata bez korisnika opet zavrsava kao ignored/missing_user_metadata');
  }
  // Redoslijed: porijeklo prije klasifikacije, klasifikacija prije ikakvog knjizenja.
  const gate = src.indexOf('acceptEvent(ev, {');
  const classify = src.indexOf('classifyStripeEvent(ev)');
  const refund = src.indexOf("decision.kind === 'refund'");
  const insert = src.indexOf('buildEntitlementInsert(');
  if (gate >= 0 && classify >= 0 && !(gate < classify)) {
    problems.push('klasifikacija ide prije provjere porijekla (acceptEvent)');
  }
  if (classify >= 0 && insert >= 0 && !(classify < insert)) {
    problems.push('entitlement se upisuje prije klasifikacije');
  }
  if (classify >= 0 && refund >= 0 && !(classify < refund)) {
    problems.push('refund grana ide prije klasifikacije');
  }
  problems.push(...ownerDecisionProblems(src));
  problems.push(...refundWindowProblems(src));
  problems.push(...responseLeakProblems(src, 'webhook-mor'));
  return problems;
}

/**
 * Cetiri popravka naplate koje je vlasnik odobrio 2026-09-27, kao staticke tvrdnje nad izvorom.
 * Izvrseni handler ih mjeri u tests/webhook-mor-handler.test.ts; ovo je jeftin sloj za mutacije.
 *  1. uplata ispod kataloga (ili u valuti koja nije EUR) NE daje pravo: `needs_manual_review`,
 *     ERROR redak i izlaz PRIJE rucne narudzbe i PRIJE upisa entitlementa;
 *  2. puni povrat zatvara rucnu narudzbu i povlaci pass kupon, i to TEK nakon izlaza za
 *     djelomicni povrat, a prije izlaza `refund_without_entitlement` (rucna narudzba nema pravo);
 *     Grana rucne narudzbe pise pa cita oznaku povrata (povrat prije uplate ne ostavlja narudzbu).
 *  3. 23505 se ne tumaci kao "vec obradjeno" dok se ne usporedi vlasnik postojeceg retka, i to
 *     prije citanja oznake povrata i prije ikakvog bonusa;
 *  4. (responseLeakProblems) nijedan odgovor ne nosi tekst greske baze.
 */
function ownerDecisionProblems(raw: string): string[] {
  // CR se normalizira: ista tvrdnja mora vrijediti u CRLF i LF checkoutu (CLAUDE.md).
  const src = raw.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  const at = (needle: string, from = 0): number => src.indexOf(needle, from);

  // 1. iznos ispod kataloga
  const verdict = at('chargedAmountVerdict(ev,');
  const review = at("if (iznos.kind === 'needs_manual_review')");
  const manual = at('if (product.manualFulfillment)');
  const insert = at('buildEntitlementInsert(');
  if (verdict < 0 || review < 0) {
    problems.push('handler ne odlucuje o iznosu kroz chargedAmountVerdict (uplata ispod kataloga bi dobila pravo)');
  } else {
    // Trazi se SAMO u grani obicne uplate (od odluke o iznosu do rucne narudzbe): grana nadogradnje
    // (bookUpgradePayment, Monetizacija V1) ima vlastiti izlaz istog oblika i ne smije maskirati ovaj.
    const reviewRegion = manual > review ? src.slice(review, manual) : src.slice(review);
    if (!/settle\(\s*'needs_manual_review',[^;]*\);\s*return json\(\{ ok: true, action: 'needs_manual_review'/.test(reviewRegion)) {
      problems.push('grana needs_manual_review ne izlazi odmah nakon zapisa (uplata ispod kataloga bi nastavila do prava)');
    }
    const branch = src.slice(review, at("settle('needs_manual_review'", review));
    if (!/console\.error\(\s*'webhook-mor needs_manual_review'/.test(branch)) {
      problems.push('grana needs_manual_review nema ERROR redak');
    }
    if ((manual >= 0 && !(review < manual)) || (insert >= 0 && !(review < insert))) {
      problems.push('provjera iznosa ide nakon rucne narudzbe ili upisa entitlementa (pravo bi nastalo prije odluke)');
    }
  }

  // 2. posljedice punog povrata
  const refundBranch = at("decision.kind === 'refund'");
  const partial = at("settle('processed', 'partial_refund_noted')");
  // Poziv se trazi SAMO unutar refund grane (do citanja kataloga): grana rucne narudzbe zove istu
  // funkciju (2b), pa bi globalna pretraga maskirala refund granu koja je prestala zatvarati posljedice.
  const refundEnd = refundBranch >= 0 ? at("from('products')", refundBranch) : -1;
  const callAny = refundBranch >= 0 ? at('await closeRefundConsequences(admin, ev.orderId', refundBranch) : -1;
  const call = callAny >= 0 && (refundEnd < 0 || callAny < refundEnd) ? callAny : -1;
  const withoutEnt = at("settle('processed', 'refund_without_entitlement')");
  if (call < 0) {
    problems.push('puni povrat ne zove closeRefundConsequences (rucna narudzba i pass kupon ostaju aktivni)');
  } else {
    if (partial < 0 || !(call > partial) || !(call > refundBranch)) {
      problems.push('closeRefundConsequences se zove prije izlaza za djelomicni povrat (djelomicni povrat bi otkazao narudzbu)');
    }
    if (withoutEnt >= 0 && !(call < withoutEnt)) {
      problems.push('closeRefundConsequences ide nakon izlaza refund_without_entitlement (rucna narudzba bez prava ostaje otvorena)');
    }
  }
  const fnStart = at('async function closeRefundConsequences(');
  const fnBody = fnStart >= 0 ? src.slice(fnStart, at('\n}\n', fnStart) >= 0 ? at('\n}\n', fnStart) : undefined) : '';
  if (!/from\('manual_orders'\)[\s\S]*update\(\{ status: 'refunded' \}\)/.test(fnBody)) {
    problems.push('closeRefundConsequences ne otkazuje manual_orders (status refunded)');
  }
  if (!/from\('coupon_grants'\)[\s\S]*\.eq\('reason', 'pass_bonus'\)/.test(fnBody)) {
    problems.push('closeRefundConsequences ne povlaci pass kupon (coupon_grants, reason pass_bonus)');
  }

  // 2b. rucna narudzba i povrat koji je stigao PRIJE (ili istodobno s) uplatom (nalaz pregleda
  // kruga 2). Grana premium_human mora, kao i grana entitlementa, PRVO upisati narudzbu, pa TEK
  // ONDA procitati oznaku punog povrata i zatvoriti narudzbu. Bez toga je povrat obradjen prije
  // retryja uplate nalazio praznu manual_orders, a retry je otvarao `pending` narudzbu za vracen novac.
  const workType = at('if (!product.workType)', manual);
  const manualBranchSrc = manual >= 0 && workType > manual ? src.slice(manual, workType) : '';
  const moInsert = manualBranchSrc.search(/from\('manual_orders'\)\s*\.insert\(/);
  const moMarker = manualBranchSrc.indexOf(".in('outcome_detail', REFUND_MARKERS)");
  const moClose = manualBranchSrc.indexOf('await closeRefundConsequences(admin, ev.orderId');
  const moExits = ["settle('processed', 'manual_order_created')", "settle('processed', 'manual_order_duplicate')"]
    .map((n) => manualBranchSrc.indexOf(n));
  if (!manualBranchSrc || moInsert < 0 || moMarker < 0 || moClose < 0) {
    problems.push('rucna narudzba ne cita oznaku punog povrata nakon upisa (povrat prije uplate ostavlja pending narudzbu)');
  } else if (!(moInsert < moMarker && moMarker < moClose) || moExits.some((e) => e < 0 || !(moClose < e))) {
    problems.push('rucna narudzba cita oznaku povrata prije upisa ili nakon izlaza created/duplicate (utrka s povratom)');
  }

  // 3. 23505 uz provjeru vlasnika
  const conflict = at("'conflict_other_user'");
  const duplicate = at("settle('processed', 'entitlement_duplicate')");
  // Citanje oznake povrata u GRANI ENTITLEMENTA (rucna narudzba ima vlastito, gore, 2b).
  const markerRead = insert >= 0 ? at(".in('outcome_detail', REFUND_MARKERS)", insert) : -1;
  const region = insert >= 0 && duplicate > insert ? src.slice(insert, duplicate) : '';
  if (!/postojece\.user_id[^)]*\)\s*!==\s*ev\.userId/.test(region) || conflict < 0) {
    problems.push('23505 se tumaci kao vec obradjeno bez usporedbe vlasnika postojeceg retka (conflict_other_user)');
  } else {
    if (!/console\.error\(\s*'webhook-mor conflict_other_user'/.test(region)) {
      problems.push('conflict_other_user nema ERROR redak');
    }
    if ((markerRead >= 0 && !(conflict < markerRead)) || !(conflict < duplicate)) {
      problems.push('provjera vlasnika ide nakon citanja oznake povrata ili nakon bonusa za duplikat');
    }
  }
  return problems;
}

/**
 * Nalazi pregleda nakon spajanja design/naplata-4 u design/pack3 (2026-09-27), kao staticke tvrdnje
 * nad izvorom. Izvrseni handler ih mjeri u tests/webhook-mor-handler.test.ts; ovo je jeftin sloj
 * za mutacije u tests/gate-mutations.test.ts.
 *  a. neupotrebljiva kataloska cijena (null, 0, neaktivan proizvod) ne daje pravo:
 *     `catalog_price_unusable`, odluka o iznosu tek uz upotrebljivu cijenu;
 *  b. ponovljena dostava vec proknjizene uplate istog korisnika ne ide na rucni pregled;
 *  c. nakon upisa bonusa oznaka povrata se cita PONOVNO i izdano se opoziva;
 *  d. refund grana gasi pravo PRIJE sporednih posljedica, a pad posljedica ostavlja oznaku punog
 *     povrata (clan REFUND_MARKERS);
 *  h. closeRefundConsequences i citanje koda greske bez `any`.
 */
export function refundWindowProblems(raw: string): string[] {
  const src = raw.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  const at = (needle: string, from = 0): number => src.indexOf(needle, from);

  // a. kataloska cijena
  const usable = /const cijenaUpotrebljiva = ([^;]*);/.exec(src)?.[1] ?? '';
  if (!/\bproduct\.active\b/.test(usable) || !/ocekivanoCenti > 0\b/.test(usable)) {
    problems.push('neupotrebljiva kataloska cijena (null, 0 ili neaktivan proizvod) ne ide na rucni pregled (catalog_price_unusable)');
  } else if (!/cijenaUpotrebljiva\s*\?\s*chargedAmountVerdict\(ev, ocekivanoCenti\)/.test(src)
    || !src.includes("reason: 'catalog_price_unusable',")) {
    problems.push('odluka o iznosu ne ovisi o upotrebljivoj cijeni (catalog_price_unusable)');
  }

  // b. ponovljena dostava
  if (!/if \(iznos\.kind === 'needs_manual_review' && !vecProknjizeno\)/.test(src)) {
    problems.push('ponovljena dostava vec proknjizene uplate zavrsi na rucnom pregledu (izlaz ne gleda vecProknjizeno)');
  }
  if (!/vecProknjizeno = redak !== null && String\(redak\.user_id \?\? ''\) === ev\.userId;/.test(src)) {
    problems.push('ponovljena dostava ne usporedjuje korisnika postojeceg zapisa (tudji zapis bi preskocio rucni pregled)');
  }

  // c. drugo citanje oznake nakon bonusa
  const insert = at('buildEntitlementInsert(');
  const grant = insert >= 0 ? at('tryGrantReferrerReward)(admin', insert) : -1;
  const kupon = insert >= 0 ? at("from('coupon_grants').upsert(", insert) : -1;
  const recheck = kupon >= 0 ? at(".in('outcome_detail', REFUND_MARKERS)", kupon) : -1;
  const opoziv = recheck >= 0 ? at('await closePaymentAfterRefund(admin, ev, product.id', recheck) : -1;
  const kraj = at("iznos.kind === 'above_catalog' ? `entitlement_created");
  if (grant < 0 || kupon < 0 || recheck < 0 || opoziv < 0 || kraj < 0 || !(grant < recheck && opoziv < kraj)) {
    problems.push('nakon upisa kupona i nagrade preporucitelju oznaka povrata se ne cita ponovno (povrat u prozoru ostavlja aktivan kupon)');
  }
  const helperStart = at('async function closePaymentAfterRefund(');
  const helperEnd = helperStart >= 0 ? at('\n}\n', helperStart) : -1;
  const helper = helperStart >= 0 && helperEnd > helperStart ? src.slice(helperStart, helperEnd) : '';
  if (!/await pullReferralSignupReward\(admin, ev\.orderId\);/.test(helper)
    || !/await closeRefundConsequences\(admin, ev\.orderId/.test(helper)) {
    problems.push('closePaymentAfterRefund ne opoziva nagradu preporucitelju ili pass kupon');
  }

  // d. pravo prije sporednih posljedica
  const refundBranch = at("decision.kind === 'refund'");
  const refundEnd = refundBranch >= 0 ? at("from('products')", refundBranch) : -1;
  const branch = refundBranch >= 0 && refundEnd > refundBranch ? src.slice(refundBranch, refundEnd) : '';
  const ugasi = branch.search(/from\('entitlements'\)\s*\.update\(\{ status: 'refunded' \}\)/);
  const posljedice = branch.indexOf('await closeRefundConsequences(admin, ev.orderId');
  if (ugasi < 0 || posljedice < 0 || !(ugasi < posljedice)) {
    problems.push('refund grana zatvara sporedne posljedice prije gasenja prava (pad manual_orders ili coupon_grants ostavlja aktivno pravo)');
  }
  const markers = /const REFUND_MARKERS\s*=\s*\[([^\]]*)\]/.exec(src)?.[1] ?? '';
  // Treci argument (`outcome_note`, F21 stavka 2) je dopusten: oznaka ostaje drugi argument.
  const padPosljedica = posljedice >= 0 ? /settle\('failed', '([a-z_]+)'[,)]/.exec(branch.slice(posljedice))?.[1] ?? '' : '';
  if (!padPosljedica || !markers.includes(`'${padPosljedica}'`)) {
    problems.push('pad sporednih posljedica povrata ne ostavlja oznaku punog povrata iz REFUND_MARKERS (uplata u medjuvremenu ne bi vidjela povrat)');
  }
  // F21 stavka 2: korak i greska sporednog pada moraju u inbox (outcome_note), ne samo u log.
  if (posljedice >= 0 && !/settle\('failed', 'refund_consequences_failed', `\$\{posljedice\.step\}: \$\{posljedice\.error\}`\)/.test(branch.slice(posljedice))) {
    problems.push('pad sporednih posljedica povrata ne zapisuje korak i gresku u inbox (outcome_note), samo u log');
  }

  // F21 stavka 1: puni povrat otkazuje obvezu iz bonus_outbox koja jos ceka.
  const posljediceFn = (() => {
    const start = at('async function closeRefundConsequences(');
    const end = start >= 0 ? at('\n}\n', start) : -1;
    return start >= 0 && end > start ? src.slice(start, end) : '';
  })();
  if (!/from\('bonus_outbox'\)\s*\.update\(\{ status: 'cancelled'/.test(posljediceFn) || !/\.eq\('status', 'pending'\)/.test(posljediceFn)) {
    problems.push('puni povrat ne otkazuje obvezu iz bonus_outbox koja jos ceka (radnik bi isplatio nagradu za vracen novac)');
  }

  // F21 stavka 3: closePaymentAfterRefund bez any.
  if (/async function closePaymentAfterRefund\(\s*admin: any\b/.test(src)) {
    problems.push('closePaymentAfterRefund prima admin: any');
  }

  // h. bez any
  const fnStart = at('async function closeRefundConsequences(');
  const fnEnd = fnStart >= 0 ? at('\n}\n', fnStart) : -1;
  const fnBody = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
  if (!fnBody || /\bany\b/.test(fnBody)) {
    problems.push('closeRefundConsequences koristi any (retci i klijent nisu tipizirani)');
  }
  if (/as any\)\.code/.test(src)) {
    problems.push('kod greske baze se cita kroz (x as any).code umjesto tipiziranog dbErrorCode');
  }
  return problems;
}

/** Kraj poziva koji pocinje na `open` (indeks otvorene zagrade), uz preskakanje stringova. */
function callEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

/**
 * TEKST GRESKE BAZE U ODGOVORU (odluka vlasnika 2026-09-27). Svaki `json(...)` odgovor u izvoru
 * Edge funkcije mora biti bez `.message`, `String(e...)` i polja `detail`: poruka greske baze
 * otkriva shemu i ogranicenja, a klijentu ne pomaze. Detalj ide u log i u inbox.
 */
export function responseLeakProblems(raw: string, name: string): string[] {
  const src = raw.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  for (const m of src.matchAll(/\bjson\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = src.slice(open, callEnd(src, open) + 1);
    if (/\.message\b|String\(\s*e\b|\bdetail\s*:/.test(args)) {
      problems.push(`${name}: odgovor nosi tekst greske: ${args.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }
  return problems;
}

type AmountVerdictFn = (
  ev: { totalCents: number | null; currency: string },
  expectedCents: number,
) => { kind: string };

/**
 * Nalazi o ODLUCI O IZNOSU (cista funkcija, isti obrazac kao paidClassificationProblems). Generator
 * pokriva sve klase ulaza koje odluka razlikuje: ispod, jedan cent ispod, tocno, iznad, nepoznat
 * iznos i tudja valuta uz tocan iznos.
 */
export function chargedAmountProblems(fn: AmountVerdictFn): string[] {
  const problems: string[] = [];
  const kind = (totalCents: number | null, currency = 'EUR') => fn({ totalCents, currency }, 999).kind;
  if (kind(500) !== 'needs_manual_review') problems.push('iznos ispod kataloga daje pravo (ocekivan needs_manual_review)');
  if (kind(998) !== 'needs_manual_review') problems.push('jedan cent ispod kataloga daje pravo');
  if (kind(null) !== 'needs_manual_review') problems.push('nepoznat naplaceni iznos daje pravo');
  if (kind(999, 'USD') !== 'needs_manual_review') problems.push('valuta koja nije EUR daje pravo');
  if (kind(999, '') !== 'needs_manual_review') problems.push('nepoznata valuta daje pravo');
  if (kind(999) !== 'ok') problems.push('tocno kataloski iznos ne daje pravo');
  if (kind(1200) !== 'above_catalog') problems.push('iznos iznad kataloga ne daje pravo uz trag (above_catalog)');
  return problems;
}
