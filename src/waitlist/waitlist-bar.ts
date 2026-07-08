/**
 * Montiranje waitlist trake u DOM (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 4).
 *
 * Sav DOM glue trake je ovdje s INJEKTIRANIM ovisnostima (config, storage, token, fetch), pa je
 * ponasanje (prikaz, dedup, zatvaranje, slanje/vezanje e-maila) jedinicno testabilno u happy-dom.
 * app.ts je tanak: izracuna detekciju i preda elementre. Anoniman signal se salje pri prikazu
 * (jednom po celiji po sesiji); e-mail se veze na taj isti red, uz fallback na novi upis.
 */

import { waitlistCopy, type WaitlistCopy } from './waitlist-copy';
import {
  buildFacultyRequestBody, submitFacultyRequest, attachEmailToRequest, isLikelyEmail,
  type WaitlistConfig,
} from './waitlist-client';
import type { WaitlistDetection } from './waitlist-detect';
import { escapeHtml } from '../utils/helpers';
import { WORK_TYPE_LABELS } from '../config/config-loader';

export interface WaitlistEntry {
  s: 'sent' | 'closed' | 'submitted';
  id?: string | null;
}

export interface WaitlistBarDeps {
  config: WaitlistConfig;
  getEntry: (key: string) => WaitlistEntry | null;
  setEntry: (key: string, val: WaitlistEntry) => void;
  resolveToken: () => Promise<string | null>;
  /** Injektabilan fetch za testove; app izostavlja (globalni fetch). */
  fetchImpl?: typeof fetch;
}

function workTypeLabel(wt: string): string {
  return (WORK_TYPE_LABELS as Record<string, string>)[wt] || wt;
}

/** innerHTML trake iz tekstova (escape je ovdje; pozivatelj ne escapea dvaput). Cisto/testabilno. */
export function waitlistBarHtml(copy: WaitlistCopy): string {
  return `<button type="button" class="wl-close" aria-label="${escapeHtml(copy.closeLabel)}">×</button>`
    + `<div class="wl-title">${escapeHtml(copy.title)}</div>`
    + `<div class="wl-body">${escapeHtml(copy.body)}</div>`
    + `<form class="wl-form" novalidate><label class="wl-label" for="wlEmail">E-mail</label>`
    + `<input id="wlEmail" class="wl-email" type="email" inputmode="email" autocomplete="email" placeholder="${escapeHtml(copy.placeholder)}">`
    + `<button type="submit" class="btn btn-primary btn-sm wl-cta">${escapeHtml(copy.cta)}</button></form>`
    + `<div class="wl-note">${escapeHtml(copy.note)}</div>`
    + `<div class="wl-msg" aria-live="polite"></div>`;
}

async function fireSignal(detection: WaitlistDetection, deps: WaitlistBarDeps): Promise<void> {
  const key = detection.dedupeKey;
  deps.setEntry(key, { s: 'sent', id: null }); // optimisticno oznaci prije mreze (dedup po sesiji)
  try {
    const token = await deps.resolveToken();
    const body = buildFacultyRequestBody(detection.cell, { source: 'upload_flow' });
    const out = await submitFacultyRequest(deps.config, body, token || '', deps.fetchImpl);
    if (out.kind === 'ok') deps.setEntry(key, { s: 'sent', id: out.requestId });
  } catch { /* fire-and-forget: neuspjeh signala ne smeta korisniku */ }
}

/**
 * Montiraj traku u `el`. Prikaz samo za nepokrivenu celiju, konfiguriran endpoint i ako nije
 * zatvorena/predana u ovoj sesiji. Vraca true ako je traka prikazana.
 */
export function mountWaitlistBar(
  el: any,
  detection: WaitlistDetection | null,
  deps: WaitlistBarDeps,
): boolean {
  if (!el) return false;
  const key = detection ? detection.dedupeKey : null;
  const entry = key ? deps.getEntry(key) : null;
  if (!detection || !detection.uncovered || !deps.config.endpoint
      || (entry && (entry.s === 'closed' || entry.s === 'submitted'))) {
    el.hidden = true;
    el.innerHTML = '';
    return false;
  }
  const copy = waitlistCopy(detection, { workTypeLabel: workTypeLabel(detection.cell.workType) });
  el.classList.remove('wl-done');
  el.innerHTML = waitlistBarHtml(copy);
  el.hidden = false;
  if (!entry) void fireSignal(detection, deps);

  const close = el.querySelector('.wl-close');
  const form = el.querySelector('.wl-form');
  const input = el.querySelector('.wl-email');
  const msg = el.querySelector('.wl-msg');

  if (close) close.onclick = () => {
    deps.setEntry(detection.dedupeKey, { s: 'closed' });
    el.hidden = true;
    el.innerHTML = '';
  };

  if (form) form.onsubmit = async (ev: any) => {
    ev.preventDefault();
    const email = String((input && input.value) || '').trim();
    if (!isLikelyEmail(email)) { if (msg) msg.textContent = copy.emailInvalid; return; }
    const cta = el.querySelector('.wl-cta');
    if (cta) cta.disabled = true;
    try {
      const token = await deps.resolveToken();
      const cur = deps.getEntry(detection.dedupeKey) || { s: 'sent' as const };
      let ok = false;
      if (cur.id) {
        const r = await attachEmailToRequest(deps.config, cur.id, email, token || '', deps.fetchImpl);
        ok = r.kind === 'ok' && r.attached === true;
      }
      if (!ok) {
        // nema id-a (anon upis odbijen rate limitom) ili vezanje nije uspjelo: salji novi upis s e-mailom
        const s = await submitFacultyRequest(deps.config, buildFacultyRequestBody(detection.cell, { email }), token || '', deps.fetchImpl);
        ok = s.kind === 'ok';
      }
      if (ok) {
        deps.setEntry(detection.dedupeKey, { s: 'submitted' });
        el.classList.add('wl-done');
        el.innerHTML = `<div class="wl-title">${escapeHtml(copy.success)}</div>`;
      } else {
        if (msg) msg.textContent = copy.networkError;
        if (cta) cta.disabled = false;
      }
    } catch {
      if (msg) msg.textContent = copy.networkError;
      const c2 = el.querySelector('.wl-cta');
      if (c2) c2.disabled = false;
    }
  };

  return true;
}
