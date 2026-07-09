// src/ui/deadline-reminder-toggle.ts
//
// Za ekran "Spremno za predaju" (UX_PRINCIPLES.md). Prikazuje se SAMO kad
// findConfirmedDeadline vrati potvrden unos I kad je korisnik prijavljen (insert
// trazi user_id = auth.uid()). Bez supabase-js u bundleu: upis ide preko
// subscribeToDeadline (cisti REST + JWT), isti kroj kao waitlist-bar/-client.
// Tanak DOM glue s injektiranim deps (config/token/fetch) -> testabilno.

import { findConfirmedDeadline } from '../submission/deadline-registry';
import { subscribeToDeadline, type DeadlineConfig } from '../submission/deadline-client';
import type { AcademicDeadlineEntry } from '../submission/types';

export interface DeadlineReminderContext {
  facultyId: string | null;
  programId?: string | null;
  workType: string;
  deadlineRegistry: AcademicDeadlineEntry[];
  config: DeadlineConfig;
  /** Valjan korisnicki JWT; prazno = nije prijavljen (toggle se ne prikazuje). */
  accessToken: string;
  /** Prijavljeni korisnik (auth.uid()); prazno = nije prijavljen. */
  userId: string;
  mountEl: HTMLElement | null;
  fetchImpl?: typeof fetch;
}

export function renderDeadlineReminderToggleIfAvailable(ctx: DeadlineReminderContext): void {
  if (!ctx.mountEl) return;

  const entry = findConfirmedDeadline(
    { facultyId: ctx.facultyId, programId: ctx.programId, workType: ctx.workType },
    ctx.deadlineRegistry,
  );

  if (!entry) return; // nema potvrdenog roka, ne prikazuj nista (nikad ne nagadaj datum)
  if (!ctx.accessToken || !ctx.userId) return; // insert trazi prijavu; bez nje ne nudi toggle

  const wrapper = document.createElement('label');
  wrapper.className = 'lekta-deadline-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'lekta-deadline-toggle__checkbox';
  const span = document.createElement('span');
  span.textContent = `Podsjeti me e-mailom 7 dana i 1 dan prije roka (${formatDate(entry.deadlineDate)})`;
  wrapper.append(checkbox, span);

  checkbox.addEventListener('change', async () => {
    if (!checkbox.checked) return; // nema "un-check da otkaze prije spremanja" tijeka u v1

    checkbox.disabled = true;

    const outcome = await subscribeToDeadline(ctx.config, ctx.accessToken, ctx.userId, entry, ctx.fetchImpl);

    if (outcome.kind !== 'ok') {
      // fail-safe: ne blokiraj ekran, samo vrati checkbox i tiho zabiljezi
      checkbox.checked = false;
      checkbox.disabled = false;
      console.error('Neuspjelo spremanje podsjetnika', outcome);
      return;
    }

    wrapper.textContent = 'Javit cemo ti se prije roka.';
  });

  ctx.mountEl.appendChild(wrapper);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' });
}
