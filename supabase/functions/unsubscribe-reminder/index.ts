// supabase/functions/unsubscribe-reminder/index.ts
//
// Javno dostupna (bez auth headera), poziva se iz linka u e-mailu. Token nosi
// potpisan payload (vidi _shared/reminder-token.ts), pa se ne oslanja na login.
//
// Env varijable: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REMINDER_UNSUB_SECRET
//
// Deploy: supabase functions deploy unsubscribe-reminder --no-verify-jwt
// (--no-verify-jwt je nuzan jer korisnik nije prijavljen kad klikne link)
//
// PREPISANO 2026-08-17 (audit UX-13, UX-14, OPS-16).
//
// Prije je GET ODMAH mijenjao bazu. E-mail sigurnosni skener, link-preview bot ili antivirus
// koji samo dohvati URL time je odjavljivao korisnika bez njegove namjere, a korisnik za to
// nikad ne bi saznao. Osim toga, neuspjeh upisa se ignorirao pa je stranica tvrdila da je
// odjava provedena i kad nije.
//
// Sada: GET samo PRIKAZUJE potvrdu, promjenu radi POST. Bot koji dohvati URL ne mijenja nista.
// Nakon odjave nudi se povrat (UX-14), a greska upisa se prijavljuje posteno (OPS-16).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { verifyUnsubscribeToken } from '../_shared/reminder-token.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UNSUB_SECRET = Deno.env.get('REMINDER_UNSUB_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/** Token ide u HTML atribut, pa mora biti escapiran i kad je potpisan i naizgled bezopasan. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(bodyHtml: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="hr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>Podsjetnici</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:0 auto;padding:2rem;line-height:1.6">` +
      bodyHtml +
      `</body></html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  );
}

/** Obrazac koji salje POST na istu rutu. Token je u TIJELU, ne u URL-u (OPS-17). */
function form(token: string, action: 'unsubscribe' | 'resubscribe', label: string): string {
  return (
    `<form method="POST" style="margin-top:1.25rem">` +
    `<input type="hidden" name="token" value="${esc(token)}">` +
    `<input type="hidden" name="action" value="${action}">` +
    `<button type="submit" style="font:inherit;padding:.6rem 1.1rem;border-radius:.5rem;` +
    `border:1px solid #1D3FBF;background:#1D3FBF;color:#fff;cursor:pointer">${esc(label)}</button>` +
    `</form>`
  );
}

/** Naslov onoga od cega se korisnik odjavljuje, da potvrda ne bude apstraktna. */
function describe(type: string): string {
  if (type === 'deadline_subscription') return 'podsjetnika za tvoj rok predaje';
  if (type === 'slot_expiry_pref') return 'obavijesti o isteku prozora za ponovnu provjeru';
  return 'ovih obavijesti';
}

async function applyChange(
  payload: { type: string; subscriptionId?: string; userId?: string },
  action: 'unsubscribe' | 'resubscribe',
): Promise<{ ok: boolean; detail?: string }> {
  if (payload.type === 'deadline_subscription') {
    const { error } = await supabase
      .from('deadline_subscriptions')
      .update({ unsubscribed_at: action === 'unsubscribe' ? new Date().toISOString() : null })
      .eq('id', payload.subscriptionId);
    return error ? { ok: false, detail: error.message } : { ok: true };
  }

  if (payload.type === 'slot_expiry_pref') {
    const { error } = await supabase.from('user_notification_preferences').upsert({
      user_id: payload.userId,
      slot_expiry_reminders_enabled: action === 'resubscribe',
      updated_at: new Date().toISOString(),
    });
    return error ? { ok: false, detail: error.message } : { ok: true };
  }

  return { ok: false, detail: 'unknown_type' };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return page('<p>Metoda nije podrzana.</p>', 405);
  }

  // GET: token iz URL-a (dolazi iz e-maila). POST: token iz tijela obrasca.
  let token = '';
  let action: 'unsubscribe' | 'resubscribe' = 'unsubscribe';
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token') ?? '';
  } else {
    const body = await req.formData();
    token = String(body.get('token') ?? '');
    action = body.get('action') === 'resubscribe' ? 'resubscribe' : 'unsubscribe';
  }

  if (!token) return page('<p>Nedostaje token za odjavu.</p>', 400);

  const payload = await verifyUnsubscribeToken(token, UNSUB_SECRET);
  if (!payload) return page('<p>Link za odjavu nije valjan ili je istekao.</p>', 400);

  const what = describe(payload.type);

  // GET NE MIJENJA NISTA: samo pita. Ovo je cijela poanta izmjene, jer automatski dohvat URL-a
  // (skener, preview bot, antivirus) ne smije odjaviti korisnika umjesto njega.
  if (req.method === 'GET') {
    return page(
      `<h1 style="font-size:1.3rem">Odjava ${esc(what)}</h1>` +
        `<p>Zelis li se stvarno odjaviti? Nista se jos nije promijenilo.</p>` +
        form(token, 'unsubscribe', 'Da, odjavi me'),
      200,
    );
  }

  const result = await applyChange(payload, action);

  // Neuspjeh se PRIJAVLJUJE. Prije se greska upisa tiho progutala pa je stranica tvrdila da je
  // odjava provedena i kad nije, a korisnik bi nastavio dobivati poruke uvjeren da nece.
  if (!result.ok) {
    console.error('[unsubscribe-reminder] update failed', { type: payload.type, action, detail: result.detail });
    return page(
      `<h1 style="font-size:1.3rem">Nismo uspjeli spremiti promjenu</h1>` +
        `<p>Postavka NIJE promijenjena. Pokusaj ponovno; ako se ponovi, javi nam se e-mailom.</p>` +
        form(token, action, 'Pokusaj ponovno'),
      500,
    );
  }

  if (action === 'resubscribe') {
    return page(
      `<h1 style="font-size:1.3rem">Ponovno si prijavljen</h1>` +
        `<p>Opet ces primati ${esc(what)}.</p>` +
        form(token, 'unsubscribe', 'Ipak me odjavi'),
      200,
    );
  }

  return page(
    `<h1 style="font-size:1.3rem">Odjavljen si</h1>` +
      `<p>Vise neces primati ${esc(what)}.</p>` +
      `<p style="color:#555;font-size:.95rem">Predomislio si se?</p>` +
      form(token, 'resubscribe', 'Vrati mi obavijesti'),
    200,
  );
});
