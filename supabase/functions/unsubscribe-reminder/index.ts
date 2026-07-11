// supabase/functions/unsubscribe-reminder/index.ts
//
// Javno dostupna (bez auth headera), poziva se iz linka u e-mailu. Token nosi
// potpisan payload (vidi _shared/reminder-token.ts), pa se ne oslanja na login.
//
// Env varijable: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REMINDER_UNSUB_SECRET
//
// Deploy: supabase functions deploy unsubscribe-reminder --no-verify-jwt
// (--no-verify-jwt je nuzan jer korisnik nije prijavljen kad klikne link)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { verifyUnsubscribeToken } from '../_shared/reminder-token.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UNSUB_SECRET = Deno.env.get('REMINDER_UNSUB_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function htmlResponse(message: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="hr"><body style="font-family:sans-serif;padding:2rem;">
      <p>${message}</p>
    </body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return htmlResponse('Nedostaje token za odjavu.', 400);
  }

  const payload = await verifyUnsubscribeToken(token, UNSUB_SECRET);
  if (!payload) {
    return htmlResponse('Link za odjavu nije valjan ili je istekao.', 400);
  }

  if (payload.type === 'deadline_subscription') {
    await supabase
      .from('deadline_subscriptions')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', payload.subscriptionId)
      .is('unsubscribed_at', null);

    return htmlResponse('Odjavljen si od podsjetnika za ovaj rok.', 200);
  }

  if (payload.type === 'slot_expiry_pref') {
    await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: payload.userId,
        slot_expiry_reminders_enabled: false,
        updated_at: new Date().toISOString(),
      });

    return htmlResponse('Iskljucene su obavijesti o isteku slota.', 200);
  }

  return htmlResponse('Nepoznat tip odjave.', 400);
});
