/**
 * Ekran 6 "Spremno za predaju": sekundarna sekcija ispod primarne akcije. Prikazuje se SAMO ako
 * korisnik vec ima referral_codes redak (znaci: izvrsio prvu kupnju; kod generira trigger u 0013).
 *
 * BEZ supabase-js (repo ga nema): citanje ide cistim `fetch` na PostgREST, isto kao
 * src/catalog/products-catalog.ts. RLS `select_own` (0013) vraca samo korisnikove retke, pa treba
 * KORISNIKOV JWT u Authorization (ne anon). Injektabilan `fetch` radi testabilnost.
 */

export interface ReferralShareContext {
  supabaseUrl: string;
  anonKey: string;
  /** Korisnikov pristupni token (JWT); bez njega RLS select_own ne vraca redak. */
  accessToken: string;
  appBaseUrl: string; // npr. https://lekta.hr
  mountEl: HTMLElement;
  fetchImpl?: typeof fetch;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c]);
}

export async function renderReferralShareSection(ctx: ReferralShareContext): Promise<void> {
  if (!ctx.supabaseUrl || !ctx.anonKey || !ctx.accessToken || !ctx.mountEl) return;
  const base = ctx.supabaseUrl.replace(/\/+$/, '') + '/rest/v1';
  const headers = { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.accessToken}` };
  const f = ctx.fetchImpl ?? fetch;

  let code: string | null = null;
  let total = 0;
  let rewarded = 0;
  try {
    const codeRes = await f(`${base}/referral_codes?select=code&limit=1`, { headers });
    const codeRows = codeRes.ok ? await codeRes.json() : [];
    code = Array.isArray(codeRows) && codeRows[0]?.code ? String(codeRows[0].code) : null;
    if (!code) return; // nema koda jos, nema prve kupnje

    const sRes = await f(`${base}/referral_signups?select=status`, { headers });
    const signups = sRes.ok ? await sRes.json() : [];
    if (Array.isArray(signups)) {
      total = signups.length;
      rewarded = signups.filter((r: { status?: string }) => r.status === 'rewarded').length;
    }
  } catch {
    return; // referral prikaz nije kriticni put
  }

  const link = `${ctx.appBaseUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
  const section = document.createElement('div');
  section.className = 'lekta-referral-share';
  section.innerHTML = `
    <strong class="lekta-referral-share__title">Pomogni kolegi, dobiva prvu provjeru besplatno</strong>
    <div class="lekta-referral-share__link-row">
      <input type="text" readonly value="${esc(link)}" class="lekta-referral-share__input" />
      <button type="button" class="lekta-referral-share__copy">Kopiraj link</button>
    </div>
    ${total > 0 ? `<p class="lekta-referral-share__status">${total} prijatelja se prijavilo, ${rewarded} nagradeno</p>` : ''}
  `;

  const copyBtn = section.querySelector('.lekta-referral-share__copy') as HTMLButtonElement;
  const input = section.querySelector('.lekta-referral-share__input') as HTMLInputElement;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Kopirano!';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 2000);
    } catch {
      input.select();
    }
  });

  ctx.mountEl.appendChild(section);
}
