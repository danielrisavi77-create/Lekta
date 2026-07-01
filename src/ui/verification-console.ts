/**
 * Verifikacijska konzola (interni admin view, VERIFICATION_PIPELINE.md sekcija 9).
 *
 * Tanki DOM nad cistim prijelazima iz verification-actions.ts. Popisuje pravila u
 * statusu draft i needs-recheck po celiji, prikazuje predlozeni citat i izvor, i nudi
 * potvrdu (verified), advisory ili retire. Covjek je jedini koji proglasava verified.
 *
 * Klijent nema backend (to je Faza E), pa konzola ne pise na disk: skuplja potvrde u
 * sesiji i nudi preuzimanje ledger dodatka i zakrpa pravila koje covjek commita u
 * data/profiles/pravo/drafts i data/verification/ledger.json. Zato je odvojena stranica
 * (verification.html) i ne dira glavni app ni golden put.
 */
import { escapeHtml } from '../utils/helpers';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../profiles/profile-registry';
import { SOURCE_REGISTRY, findSource } from '../verification/verification-registry';
import {
  pendingRules,
  confirmVerification,
  makeAdvisory,
  retireRule,
  type PendingRule,
} from '../verification/verification-actions';
import type {
  ThesisProfile,
  RuleEntry,
  VerificationLedgerEntry,
} from '../profiles/profile-schema';

interface AppliedAction {
  profileId: string;
  ruleId: string;
  entry: RuleEntry;
  ledger: VerificationLedgerEntry;
}

// Snapshot PDF-ovi po putanji (za pregled izvora uz pravilo, spec sekcija 9). Vite servira
// kao asset URL preko ?url; kljuc normaliziran na "data/sources/..." da odgovara snapshotPath.
const snapshotUrls: Record<string, string> = {};
for (const [key, url] of Object.entries(
  import.meta.glob('../../data/sources/**/*.pdf', { eager: true, query: '?url', import: 'default' }) as Record<
    string,
    string
  >,
)) {
  snapshotUrls[key.replace(/^\.\.\/\.\.\//, '')] = url;
}

function snapshotUrlForSourceId(sourceId: string | null | undefined): string | null {
  if (!sourceId) return null;
  const src = findSource(sourceId);
  if (!src?.snapshotPath) return null;
  return snapshotUrls[src.snapshotPath] ?? null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function allProfiles(): ThesisProfile[] {
  return [
    ...VERIFIED_PROFILES_WITH_DRAFTS,
    ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
  ] as unknown as ThesisProfile[];
}

function profileLabels(): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of VERIFIED_PROFILES_WITH_DRAFTS) map.set(p.id, p.profileLabel || p.id);
  for (const d of LEGAL_DEPARTMENTS_WITH_DRAFTS) map.set(d.id, d.name || d.id);
  return map;
}

function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function initVerificationConsole(root: HTMLElement): void {
  const applied = new Map<string, AppliedAction>(); // po ruleId
  const labels = profileLabels();

  function render(): void {
    const pend = pendingRules(allProfiles());
    const byProfile = new Map<string, PendingRule[]>();
    for (const item of pend) {
      const list = byProfile.get(item.profileId) ?? [];
      list.push(item);
      byProfile.set(item.profileId, list);
    }

    const groups = [...byProfile.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([profileId, rules]) => {
        const rows = rules.map((r) => ruleRow(profileId, r.entry)).join('');
        return `<section class="vc-group"><h2>${escapeHtml(labels.get(profileId) ?? profileId)}</h2>
          <p class="vc-meta">${escapeHtml(profileId)} &middot; ${rules.length} na cekanju</p>${rows}</section>`;
      })
      .join('');

    root.innerHTML = `
      <header class="vc-head">
        <h1>Verifikacijska konzola</h1>
        <p>Covjek je jedini koji proglasava <strong>verified</strong>. Potvrde se skupljaju u sesiji; preuzmi i primijeni (npm run apply-verification).</p>
        <div class="vc-actions">
          <button data-act="download-ledger">Preuzmi ledger dodatak (${applied.size})</button>
          <button data-act="download-patches">Preuzmi zakrpe pravila</button>
        </div>
      </header>
      <div class="vc-source-pane hidden" id="vcSourcePane">
        <div class="vc-source-cap"></div>
        <iframe class="vc-source-frame" title="Snapshot izvora"></iframe>
      </div>
      ${groups || '<p class="vc-empty">Nema pravila na cekanju.</p>'}`;
  }

  function ruleRow(profileId: string, entry: RuleEntry): string {
    const done = applied.get(entry.ruleId);
    const src = entry.sourceId ? findSource(entry.sourceId) : undefined;
    const snapshotted = !!src && src.snapshotPath != null && src.snapshotHash != null;
    const pdfUrl = snapshotUrlForSourceId(entry.sourceId);
    const binding = entry.authority === 'binding';
    const valStr = escapeHtml(JSON.stringify(entry.value));
    if (done) {
      return `<article class="vc-rule vc-applied" data-rule="${escapeHtml(entry.ruleId)}">
        <div class="vc-rule-head"><code>${escapeHtml(entry.checkId ?? '')}</code>
          <span class="vc-badge vc-${escapeHtml(done.entry.status ?? '')}">${escapeHtml(done.entry.status ?? '')}</span></div>
        <p>${escapeHtml(entry.label ?? entry.ruleId)} &rarr; ${valStr}</p>
        <button data-act="undo" data-rule="${escapeHtml(entry.ruleId)}">Ponisti</button>
      </article>`;
    }
    return `<article class="vc-rule" data-rule="${escapeHtml(entry.ruleId)}" data-profile="${escapeHtml(profileId)}">
      <div class="vc-rule-head"><code>${escapeHtml(entry.checkId ?? '')}</code>
        <span class="vc-badge vc-${escapeHtml(entry.status ?? '')}">${escapeHtml(entry.status ?? '')}</span>
        <span class="vc-auth">${escapeHtml(entry.authority ?? 'bez autoriteta')}</span></div>
      <p>${escapeHtml(entry.label ?? entry.ruleId)} &rarr; ${valStr}</p>
      <p class="vc-meta">Izvor: ${escapeHtml(entry.sourceId ?? 'nepoznat')} ${
        snapshotted ? '' : '<strong>(bez snapshota: ne moze se bodovati)</strong>'
      }</p>
      <div class="vc-form">
        <label>sourcePage<input data-f="sourcePage" value="${escapeHtml(entry.sourcePage ?? '')}" placeholder="odjeljak ili stranica"></label>
        <label>quote<input data-f="quote" value="${escapeHtml(entry.quote ?? '')}" placeholder="doslovni citat ili lokator"></label>
        <label>verifiedBy<input data-f="verifiedBy" placeholder="ime"></label>
        ${binding ? '<label>reviewedBy<input data-f="reviewedBy" placeholder="drugi par ociju"></label>' : ''}
      </div>
      <div class="vc-rule-actions">
        <button data-act="confirm" data-rule="${escapeHtml(entry.ruleId)}">Potvrdi (verified)</button>
        <button data-act="advisory" data-rule="${escapeHtml(entry.ruleId)}">Advisory</button>
        <button data-act="retire" data-rule="${escapeHtml(entry.ruleId)}">Povuci</button>
        ${
          pdfUrl
            ? `<button data-act="show-source" data-pdf="${escapeHtml(pdfUrl)}" data-page="${escapeHtml(entry.sourcePage ?? '')}">Prikazi izvor (PDF)</button>`
            : ''
        }
      </div>
      <p class="vc-error" data-error="${escapeHtml(entry.ruleId)}"></p>
    </article>`;
  }

  function findEntry(ruleId: string): { profileId: string; entry: RuleEntry } | null {
    for (const p of allProfiles()) {
      for (const e of p.ruleEntries ?? []) {
        if (e.ruleId === ruleId) return { profileId: p.id, entry: e };
      }
    }
    return null;
  }

  function fieldValue(ruleId: string, field: string): string {
    const el = root.querySelector<HTMLInputElement>(
      `article[data-rule="${CSS.escape(ruleId)}"] input[data-f="${field}"]`,
    );
    return el?.value ?? '';
  }

  function showError(ruleId: string, message: string): void {
    const el = root.querySelector<HTMLElement>(`p[data-error="${CSS.escape(ruleId)}"]`);
    if (el) el.textContent = message;
  }

  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement)?.closest('button');
    if (!target) return;
    const act = target.getAttribute('data-act');
    const ruleId = target.getAttribute('data-rule') ?? '';

    if (act === 'download-ledger') {
      downloadJson('ledger-additions.json', [...applied.values()].map((a) => a.ledger));
      return;
    }
    if (act === 'download-patches') {
      downloadJson(
        'rule-patches.json',
        [...applied.values()].map((a) => ({ profileId: a.profileId, ruleId: a.ruleId, entry: a.entry })),
      );
      return;
    }
    if (act === 'undo') {
      applied.delete(ruleId);
      render();
      return;
    }
    if (act === 'show-source') {
      const pane = root.querySelector<HTMLElement>('#vcSourcePane');
      const frame = pane?.querySelector<HTMLIFrameElement>('.vc-source-frame');
      const cap = pane?.querySelector<HTMLElement>('.vc-source-cap');
      const pdf = target.getAttribute('data-pdf') ?? '';
      const page = target.getAttribute('data-page') ?? '';
      if (pane && frame) {
        frame.src = pdf;
        if (cap) cap.textContent = page ? `Snapshot izvora. Lokator: ${page}` : 'Snapshot izvora.';
        pane.classList.remove('hidden');
        pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const found = findEntry(ruleId);
    if (!found) return;
    const { profileId, entry } = found;
    const now = today();

    if (act === 'confirm') {
      const res = confirmVerification(profileId, entry, entry.sourceId ? findSource(entry.sourceId) : undefined, {
        sourcePage: fieldValue(ruleId, 'sourcePage'),
        quote: fieldValue(ruleId, 'quote'),
        verifiedBy: fieldValue(ruleId, 'verifiedBy'),
        reviewedBy: fieldValue(ruleId, 'reviewedBy'),
        now,
      });
      if (!res.ok) {
        showError(ruleId, res.errors.join(' '));
        return;
      }
      applied.set(ruleId, { profileId, ruleId, entry: res.entry, ledger: res.ledger });
      render();
      return;
    }
    if (act === 'advisory') {
      const res = makeAdvisory(profileId, entry, {
        actor: fieldValue(ruleId, 'verifiedBy') || 'admin',
        now,
      });
      if (res.ok) applied.set(ruleId, { profileId, ruleId, entry: res.entry, ledger: res.ledger });
      render();
      return;
    }
    if (act === 'retire') {
      const res = retireRule(profileId, entry, {
        actor: fieldValue(ruleId, 'verifiedBy') || 'admin',
        now,
      });
      if (res.ok) applied.set(ruleId, { profileId, ruleId, entry: res.entry, ledger: res.ledger });
      render();
      return;
    }
  });

  render();
}

// Auto-mount na vlastitoj admin stranici (verification.html); inertno drugdje.
const mount = typeof document !== 'undefined' ? document.getElementById('lekta-verification-console') : null;
if (mount) initVerificationConsole(mount);

// Drzi SOURCE_REGISTRY referenciranim za buduce filtriranje po izvoru (i tree-shake guard).
export const CONSOLE_SOURCE_COUNT = SOURCE_REGISTRY.length;
