/**
 * Ciste funkcije za obavijest o pokrivenosti (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 8).
 *
 * Kad nepokriven fakultet dobije verificiran profil, redovi s e-mailom koji jos nisu obavijesteni
 * dobivaju JEDNU obavijest, pa se oznace (notified_at). Ovdje je samo priprema primatelja i teksta,
 * bez mreze i bez I/O, pa je testabilno.
 */

export const WORK_TYPE_LABELS = {
  seminarski: 'seminarski rad',
  zavrsni: 'zavrsni rad',
  diplomski: 'diplomski rad',
  doktorski: 'doktorski rad',
};

/** Dedup po e-mailu (mala slova): ista osoba dobiva jednu obavijest, ali oznacimo SVE njene redove. */
export function dedupeRecipients(rows) {
  const byEmail = new Map();
  for (const r of rows) {
    const email = String(r.email || '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    const rec = byEmail.get(key) || { email, ids: [] };
    if (r.id != null) rec.ids.push(r.id);
    byEmail.set(key, rec);
  }
  return [...byEmail.values()];
}

/** Svi id-jevi redova koji ce se oznaciti kao obavijesteni (i bez e-maila ih ne diramo). */
export function idsToMark(recipients) {
  return recipients.flatMap((r) => r.ids);
}

/**
 * Tekst obavijesti (hrvatski, bez crtica). Vodi pozitivom: fakultet je sada podrzan; ako je
 * appUrl zadan, dodaje poziv na akciju. E-mail se koristi samo za ovu jednu obavijest.
 */
export function renderCoveredEmail({ facultyLabel, workType, appUrl } = {}) {
  const fakultet = String(facultyLabel || 'Tvoj fakultet').trim();
  const vrsta = WORK_TYPE_LABELS[workType] || (workType ? String(workType) : null);
  const vrstaSuffix = vrsta ? ` (${vrsta})` : '';
  const subject = `Lekta: ${fakultet} je sada podrzan`;
  const cta = appUrl ? `\n\nProvjeri svoj rad: ${appUrl}` : '';
  const text =
    `Bok,\n\nJavljamo se jer si ostavio e-mail na Lekti dok ${fakultet} jos nije bio na popisu. ` +
    `Sada su dostupne sluzbene tehnicke provjere za ${fakultet}${vrstaSuffix}.${cta}\n\n` +
    `Ovo je jednokratna obavijest povodom tvog upita; e-mail ne koristimo ni za sto drugo.\n\nLekta`;
  const link = appUrl
    ? `<p><a href="${escapeHtml(appUrl)}">Provjeri svoj rad na Lekti</a></p>`
    : '';
  const html =
    `<p>Bok,</p><p>Javljamo se jer si ostavio e-mail na Lekti dok <strong>${escapeHtml(fakultet)}</strong> ` +
    `jos nije bio na popisu. Sada su dostupne sluzbene tehnicke provjere za ` +
    `${escapeHtml(fakultet)}${escapeHtml(vrstaSuffix)}.</p>${link}` +
    `<p style="color:#666;font-size:13px">Ovo je jednokratna obavijest povodom tvog upita; e-mail ne koristimo ni za sto drugo.</p><p>Lekta</p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
