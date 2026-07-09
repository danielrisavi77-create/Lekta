/**
 * Obavijest o pokrivenosti (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 8).
 *
 * Kad nepokriven fakultet dobije verificiran profil, ova skripta nade redove faculty_requests s
 * e-mailom koji jos nisu obavijesteni (za tu celiju/fakultet), posalje JEDNU obavijest i oznaci ih
 * (notified_at). Sve preko service role. SIGURNO PO DEFAULTU: dry-run (samo ispis) dok se ne doda
 * --send; slanje trazi RESEND_API_KEY + NOTIFY_FROM, inace ostaje dry-run.
 *
 * Primjeri:
 *   node discovery/notify-covered.mjs --faculty fpzg --worktype diplomski           # dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... NOTIFY_FROM="Lekta <no-reply@...>" \
 *     node discovery/notify-covered.mjs --faculty fpzg --send
 *   node discovery/notify-covered.mjs --faculty fpzg --from-file pending.json        # offline dry-run
 */
import { readFileSync } from 'node:fs';
import { restEnv, fetchPending, markNotified, sendResend } from './lib/rest.mjs';
import { dedupeRecipients, idsToMark, renderCoveredEmail } from './lib/notify.mjs';

function parseArgs(argv) {
  const a = { send: false, limit: 500 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--faculty') a.facultyId = argv[++i];
    else if (k === '--faculty-name') a.facultyName = argv[++i];
    else if (k === '--program') a.programId = argv[++i];
    else if (k === '--worktype') a.workType = argv[++i];
    else if (k === '--app-url') a.appUrl = argv[++i];
    else if (k === '--from-file') a.fromFile = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]) || 500;
    else if (k === '--send') a.send = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.facultyId && !args.facultyName) {
    throw new Error('Zadaj --faculty <id> ili --faculty-name <naziv> (pokrivena celija koja se javlja).');
  }
  const appUrl = args.appUrl || process.env.NOTIFY_APP_URL || '';

  let rows;
  if (args.fromFile) {
    rows = JSON.parse(readFileSync(args.fromFile, 'utf8'));
    console.log(`Offline: ${rows.length} redaka iz ${args.fromFile}`);
  } else {
    rows = await fetchPending(restEnv(), args);
    console.log(`Zivo: ${rows.length} redaka koji cekaju obavijest`);
  }

  const recipients = dedupeRecipients(rows);
  const facultyLabel = rows[0]?.faculty_name_raw || args.facultyId || args.facultyName || 'Tvoj fakultet';
  const email = renderCoveredEmail({ facultyLabel, workType: args.workType, appUrl });

  console.log(`\nPrimatelji (dedup po e-mailu): ${recipients.length}`);
  console.log(`Predmet: ${email.subject}`);
  console.log('--- tekst ---\n' + email.text + '\n-------------');

  // Slanje samo uz eksplicitni --send i konfiguriran provider; inace dry-run (nista se ne salje/oznacava).
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.NOTIFY_FROM || '';
  if (!args.send || !apiKey || !from) {
    const razlog = !args.send ? 'dry-run (dodaj --send)' : 'nema RESEND_API_KEY/NOTIFY_FROM';
    console.log(`\nDRY RUN (${razlog}): nista nije poslano ni oznaceno. ${recipients.length} bi dobilo obavijest.`);
    recipients.forEach((r) => console.log(`  - ${r.email} (${r.ids.length} zahtjev/a)`));
    return;
  }

  let sent = 0;
  const markedIds = [];
  for (const r of recipients) {
    const okSend = await sendResend({ apiKey, from, to: r.email, subject: email.subject, text: email.text, html: email.html });
    if (okSend) {
      sent += 1;
      markedIds.push(...r.ids);
    } else {
      console.error(`  ! slanje palo za ${r.email}, redovi ostaju neoznaceni (ponovi kasnije)`);
    }
  }
  if (markedIds.length) await markNotified(restEnv(), markedIds, new Date().toISOString());
  console.log(`\nPoslano: ${sent}/${recipients.length}. Oznaceno notified_at: ${markedIds.length} redaka.`);
}

main().catch((e) => {
  console.error('[notify-covered]', e.message || e);
  process.exit(1);
});
