// supabase/functions/send-reminders/index.ts
//
// Pokrece se dnevno preko pg_cron (vidi napomenu u migraciji 0012). Salje dvije
// vrste podsjetnika: (1) akademski rok, opt-in, 5 razina (30d/14d/7d/72h/dan predaje,
// vidi 0036_deadline_reminder_tiers.sql); (2) istek slota, 2 dana prije, opt-out.
// Vidi docs/ROKOVI_PODSJETNICI.md.
//
// Env varijable (Supabase -> Edge Functions -> Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//   REMINDER_FROM_EMAIL (npr. "Lekta <podsjetnici@lekta.hr>"),
//   REMINDER_UNSUB_SECRET (odvojena tajna od IP_HASH_SALT),
//   REMINDER_CRON_SECRET (dedicirana tajna za cron okidanje, NIJE service role),
//   APP_BASE_URL (npr. https://lekta.hr, za linkove u e-mailu)
//
// Autorizacija: funkcija je deployana s verify_jwt=false, pa se sama stiti cron
// tajnom. pg_cron mora slati `Authorization: Bearer <REMINDER_CRON_SECRET>`.
// Bez ispravne tajne handler vraca 401 i ne dira bazu ni Resend (fail-closed).
//
// Deploy: supabase functions deploy send-reminders

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { signUnsubscribeToken } from '../_shared/reminder-token.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { shouldSendSlotReminder } from '../_shared/slot-reminder.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL')!;
const UNSUB_SECRET = Deno.env.get('REMINDER_UNSUB_SECRET')!;
const CRON_SECRET = Deno.env.get('REMINDER_CRON_SECRET');
const APP_BASE_URL = Deno.env.get('APP_BASE_URL')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

function daysBetween(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// 5 razina (marketinski plan, tocka 24/25), ne-preklapajuci dnevni prozori. reminder_1d_sent_at
// je zadrzano ime kolone iz 0012, ali sad znaci "dan predaje" (daysLeft<=0) - vidi komentar
// na koloni u 0036_deadline_reminder_tiers.sql.
async function processDeadlineReminders(): Promise<{ sent30d: number; sent14d: number; sent7d: number; sent72h: number; sent1d: number }> {
  const { data: subs, error } = await supabase
    .from('deadline_subscriptions')
    .select('*')
    .is('unsubscribed_at', null)
    .or('reminder_30d_sent_at.is.null,reminder_14d_sent_at.is.null,reminder_7d_sent_at.is.null,reminder_72h_sent_at.is.null,reminder_1d_sent_at.is.null');

  if (error || !subs) return { sent30d: 0, sent14d: 0, sent7d: 0, sent72h: 0, sent1d: 0 };

  const now = new Date();
  let sent30d = 0;
  let sent14d = 0;
  let sent7d = 0;
  let sent72h = 0;
  let sent1d = 0;

  for (const sub of subs) {
    const deadline = new Date(sub.deadline_date as string);
    const daysLeft = daysBetween(deadline, now);

    const { data: userData } = await supabase.auth.admin.getUserById(sub.user_id as string);
    const email = userData?.user?.email;
    if (!email) continue;

    const unsubToken = () => signUnsubscribeToken(
      { type: 'deadline_subscription', subscriptionId: sub.id as string },
      UNSUB_SECRET,
    );

    if (daysLeft <= 30 && daysLeft > 14 && !sub.reminder_30d_sent_at) {
      const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(await unsubToken())}`;
      const ok = await sendEmail(
        email,
        `30 dana do roka predaje (${sub.work_type}, ${sub.faculty_id})`,
        `<p>Rok za predaju (${sub.work_type}, ${sub.faculty_id}) je ${sub.deadline_date}, za 30-ak dana.</p>
         <p>Dobar trenutak za prvu tehničku provjeru rada, dok ima vremena za ispravke: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
         <p><a href="${unsubUrl}">Odjavi ove podsjetnike</a></p>`,
      );
      if (ok) {
        await supabase.from('deadline_subscriptions').update({ reminder_30d_sent_at: now.toISOString() }).eq('id', sub.id);
        sent30d++;
      }
    }

    if (daysLeft <= 14 && daysLeft > 7 && !sub.reminder_14d_sent_at) {
      const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(await unsubToken())}`;
      const ok = await sendEmail(
        email,
        `14 dana do roka: vrijeme za prvi full check`,
        `<p>Rok za predaju (${sub.work_type}, ${sub.faculty_id}) je ${sub.deadline_date}.</p>
         <p>Vrijeme za prvi full check: provjeri je li rad tehnički ispravan prije nego ga pošalješ mentoru na komentare: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
         <p><a href="${unsubUrl}">Odjavi ove podsjetnike</a></p>`,
      );
      if (ok) {
        await supabase.from('deadline_subscriptions').update({ reminder_14d_sent_at: now.toISOString() }).eq('id', sub.id);
        sent14d++;
      }
    }

    if (daysLeft <= 7 && daysLeft > 3 && !sub.reminder_7d_sent_at) {
      const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(await unsubToken())}`;
      const ok = await sendEmail(
        email,
        `Rok za predaju za ${daysLeft} dana`,
        `<p>Tvoj rok za predaju (${sub.work_type}, ${sub.faculty_id}) je ${sub.deadline_date}.</p>
         <p>Ponovno provjeri rad, pogotovo ako si u međuvremenu unio mentorove komentare: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
         <p><a href="${unsubUrl}">Odjavi ove podsjetnike</a></p>`,
      );
      if (ok) {
        await supabase.from('deadline_subscriptions').update({ reminder_7d_sent_at: now.toISOString() }).eq('id', sub.id);
        sent7d++;
      }
    }

    if (daysLeft <= 3 && daysLeft > 0 && !sub.reminder_72h_sent_at) {
      const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(await unsubToken())}`;
      const ok = await sendEmail(
        email,
        `Final check: rok za predaju za ${daysLeft} dana`,
        `<p>Tvoj rok za predaju (${sub.work_type}, ${sub.faculty_id}) je ${sub.deadline_date}.</p>
         <p>Zadnja prilika za temeljitu provjeru prije predaje: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
         <p><a href="${unsubUrl}">Odjavi ove podsjetnike</a></p>`,
      );
      if (ok) {
        await supabase.from('deadline_subscriptions').update({ reminder_72h_sent_at: now.toISOString() }).eq('id', sub.id);
        sent72h++;
      }
    }

    if (daysLeft <= 0 && !sub.reminder_1d_sent_at) {
      const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(await unsubToken())}`;
      const ok = await sendEmail(
        email,
        `Rok za predaju je danas`,
        `<p>Tvoj rok za predaju (${sub.work_type}, ${sub.faculty_id}) je ${sub.deadline_date}.</p>
         <p>Ne šalji .docx prije nego provjeriš ovo posljednji put: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
         <p><a href="${unsubUrl}">Odjavi ove podsjetnike</a></p>`,
      );
      if (ok) {
        await supabase.from('deadline_subscriptions').update({ reminder_1d_sent_at: now.toISOString() }).eq('id', sub.id);
        sent1d++;
      }
    }
  }

  return { sent30d, sent14d, sent7d, sent72h, sent1d };
}

async function processSlotExpiryReminders(): Promise<{ sent: number }> {
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();

  // Marker (slot_expiry_reminder_sent_at is null) izbacuje slotove kojima je
  // podsjetnik vec poslan pa ponovljeni cron poziv ne salje isti slot dvaput.
  const { data: slots, error } = await supabase
    .from('document_slots')
    .select('*')
    .is('slot_expiry_reminder_sent_at', null)
    .gte('slot_expires_at', oneDayFromNow)
    .lte('slot_expires_at', twoDaysFromNow);

  if (error || !slots) return { sent: 0 };

  let sent = 0;

  for (const slot of slots) {
    // Preferenca (default ukljuceno) i nedavna aktivnost (zadnja 24h).
    const { data: pref } = await supabase
      .from('user_notification_preferences')
      .select('slot_expiry_reminders_enabled')
      .eq('user_id', slot.user_id)
      .maybeSingle();

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('report_generations')
      .select('id', { count: 'exact', head: true })
      .eq('slot_id', slot.id)
      .gte('created_at', dayAgo);

    // Jedinstvena odluka (cista fn, testirana u _shared/slot-reminder.test.ts).
    const send = shouldSendSlotReminder({
      alreadySentAt: slot.slot_expiry_reminder_sent_at as string | null,
      remindersEnabled: !(pref && pref.slot_expiry_reminders_enabled === false),
      recentGenerationCount: count ?? 0,
    });
    if (!send) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(slot.user_id as string);
    const email = userData?.user?.email;
    if (!email) continue;

    const token = await signUnsubscribeToken(
      { type: 'slot_expiry_pref', userId: slot.user_id as string },
      UNSUB_SECRET,
    );
    const unsubUrl = `${APP_BASE_URL}/odjava-podsjetnika?token=${encodeURIComponent(token)}`;

    const ok = await sendEmail(
      email,
      `Tvoj ${slot.work_type} rad istjece za 2 dana`,
      `<p>Prozor za besplatan re-check tvog ${slot.work_type} rada istjece uskoro.</p>
       <p>Provjeri ga jos jednom: <a href="${APP_BASE_URL}">${APP_BASE_URL}</a></p>
       <p><a href="${unsubUrl}">Ugasi ove obavijesti</a></p>`,
    );
    if (ok) {
      // Upisi marker da sljedeci cron poziv ne posalje isti slot ponovno.
      await supabase
        .from('document_slots')
        .update({ slot_expiry_reminder_sent_at: new Date().toISOString() })
        .eq('id', slot.id);
      sent++;
    }
  }

  return { sent };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false }), { status: 405 });
  }

  // Autorizacija PRIJE ikakvog rada: bez ispravne cron tajne ne diramo bazu ni
  // Resend. Fail-closed ako REMINDER_CRON_SECRET nije postavljen (security-01).
  if (!isCronAuthorized(req, CRON_SECRET)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const deadlineResult = await processDeadlineReminders();
  const slotResult = await processSlotExpiryReminders();

  return new Response(
    JSON.stringify({ ok: true, deadlineResult, slotResult }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
