/**
 * Ekran 6 "Spremno za predaju": sekundarna sekcija ispod primarne akcije. Prikazuje se SAMO ako
 * korisnik vec ima referral_codes redak (znaci: izvrsio prvu kupnju; kod generira trigger u 0013).
 *
 * BEZ supabase-js (repo ga nema): citanje ide cistim `fetch` na PostgREST, isto kao
 * src/catalog/products-catalog.ts. RLS `select_own` (0013) vraca samo korisnikove retke, pa treba
 * KORISNIKOV JWT u Authorization (ne anon). Injektabilan `fetch` radi testabilnost.
 */

import { findUpcomingDeadline } from '../submission/deadline-registry';
import type { AcademicDeadlineEntry } from '../submission/types';
import { tierFor } from '../report/pricing';

export interface ReferralShareContext {
  supabaseUrl: string;
  anonKey: string;
  /** Korisnikov pristupni token (JWT); bez njega RLS select_own ne vraca redak. */
  accessToken: string;
  appBaseUrl: string; // npr. https://lekta.hr
  mountEl: HTMLElement;
  fetchImpl?: typeof fetch;
  /**
   * Korisnikov trenutni fakultet/vrsta rada (isti oblik kao DeadlineReminderContext) i registar
   * potvrdjenih rokova (ACADEMIC_DEADLINES). Kad postoji nadolazeci potvrdjen rok za TU jedinicu,
   * poziv na dijeljenje postaje konkretan ("kolege s tvog studija predaju u isto vrijeme") umjesto
   * generickog - cohort virality, ne nagadjanje: bez podudaranja se poziv jednostavno ne prikazuje.
   */
  facultyId?: string | null;
  workType?: string | null;
  deadlineRegistry?: AcademicDeadlineEntry[];
  /** Poziva se nakon uspjesnog kopiranja linka (npr. trackEvent('referral_shared')); injektirano da modul ostane bez ovisnosti o app.ts. */
  onShare?: () => void;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<string, string>)[c]);
}

function formatDateHr(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Cijeli dani do (ISO) datuma; oba datuma se usporedjuju kao ponoc (bez utjecaja doba dana). */
function daysUntil(iso: string, now: Date): number {
  const todayIso = now.toISOString().slice(0, 10);
  return Math.round((Date.parse(iso) - Date.parse(todayIso)) / 86400000);
}

function deadlineNoteHtml(entry: AcademicDeadlineEntry | null): string {
  if (!entry) return '';
  const days = daysUntil(entry.deadlineDate, new Date());
  const when = days <= 0 ? 'danas' : days === 1 ? 'sutra' : `za ${days} dana`;
  const workLabel = tierFor(entry.workType)?.label ?? entry.workType;
  return `<p class="lekta-referral-share__deadline">Rok za predaju (${esc(workLabel)}) je ${when}, ${esc(formatDateHr(entry.deadlineDate))}. Kolege s tvog studija vjerojatno predaju u isto vrijeme — pošalji im link.</p>`;
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

  const deadlineEntry = ctx.facultyId && ctx.workType && ctx.deadlineRegistry
    ? findUpcomingDeadline({ facultyId: ctx.facultyId, workType: ctx.workType }, ctx.deadlineRegistry)
    : null;

  const link = `${ctx.appBaseUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(code)}`;
  const section = document.createElement('div');
  section.className = 'lekta-referral-share';
  section.innerHTML = `
    ${deadlineNoteHtml(deadlineEntry)}
    <strong class="lekta-referral-share__title">Pomogni kolegi, dobiva prvu provjeru besplatno</strong>
    <p class="lekta-referral-share__reward">Ti dobivaš besplatan seminarski slot čim prijatelj kupi svoju prvu provjeru.</p>
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
      ctx.onShare?.();
    } catch {
      input.select();
    }
  });

  ctx.mountEl.appendChild(section);
}
