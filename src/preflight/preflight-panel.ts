/**
 * Stateful DOM renderer za Provjeru prije predaje. Kalup: repair-panel.ts
 * (cist, testabilan, bez app.ts ovisnosti). Sve ovisnosti (config, token,
 * fetch, openAuth, dohvat bajtova) dolaze kroz PreflightPanelDeps, pa se panel
 * jedinicno testira u happy-domu bez mreze.
 *
 * Stanja unutar mountEl: idle (opt-in + privola) -> progress (fazne poruke +
 * protekli sat, 15-90 s) -> result (kartice po modulu) / error. Gating i
 * dostupnost sekcije odlucuje app.ts (preflightConfigured, paywallGateActive).
 */
import { escapeHtml } from '../utils/helpers';
import {
  buildPreflightConsent, buildStartMeta, estimatePreflightSeconds, pollResult,
  sha256Hex, startPreflight, uploadFile,
  type PreflightConfig, type PreflightReport,
} from './preflight-client';
import { copyForCode, moduleLabel, MODULE_ORDER } from './preflight-copy';
import type { PreflightFinding } from './tier-filter';

export interface PreflightPanelDeps {
  config: PreflightConfig;
  /** Supabase JWT ili null (auth nije spojen). */
  resolveToken: () => Promise<string | null>;
  /** Otvori auth modal pa pozovi callback nakon prijave (za 401). */
  openAuth: (afterSignIn: () => void) => void;
  /** Lijeni dohvat originalnih .docx bajtova (ne drzi kopiju po re-renderu). */
  getFile: () => Promise<Blob | null>;
  /** Za copy procjenu trajanja i pošteni pre-check stila. */
  referenceCount: number;
  /** 'vancouver' | 'author-year' | 'unknown' iz lokalne analize. */
  citationStyle: string;
  workType: string;
  lang: string;
  termsVersion: string;
  /** Serverski cap veličine (MB) za pre-check i copy; 0 = nepoznato. */
  maxUploadMb: number;
  fetchImpl?: typeof fetch;
  /** Injektabilni sat i tajmeri (test). */
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

type Phase =
  | { k: 'idle' }
  | { k: 'progress'; started: number; jobId: string; label: string }
  | { k: 'result'; report: PreflightReport; depth: 'teaser' | 'full' }
  | { k: 'error'; message: string; retryable: boolean };

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 5 * 60 * 1000;

const PROGRESS_STEPS = [
  'Šaljem dokument šifriranim kanalom...',
  'Provjeravam metapodatke, skrivene elemente i stilove...',
  'Provjeravam citate i popis literature...',
  'Provjeravam postojanje referenci u javnim bazama (Crossref, OpenAlex, PubMed)... ovo je najdulji korak',
  'Sastavljam nalaz...',
];

export class PreflightPanel {
  private phase: Phase = { k: 'idle' };
  private consentChecked = false;
  private abort: AbortController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly setT: typeof setTimeout;
  private readonly clearT: typeof clearTimeout;

  constructor(private mount: HTMLElement, private deps: PreflightPanelDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => Date.now());
    this.setT = deps.setTimeoutImpl ?? setTimeout;
    this.clearT = deps.clearTimeoutImpl ?? clearTimeout;
  }

  /** Poziva se iz renderResult (svaki put); ako je run u tijeku, ne rusi ga. */
  render(): void {
    if (this.phase.k === 'progress') return; // ne diraj aktivni run pri re-renderu
    this.paint();
  }

  dispose(): void {
    this.abort?.abort();
    if (this.pollTimer) this.clearT(this.pollTimer);
    this.pollTimer = null;
  }

  // -------------------------------------------------------------------- //
  private paint(): void {
    switch (this.phase.k) {
      case 'idle': this.paintIdle(); break;
      case 'progress': this.paintProgress(); break;
      case 'result': this.paintResult(this.phase.report, this.phase.depth); break;
      case 'error': this.paintError(this.phase.message, this.phase.retryable); break;
    }
  }

  private paintIdle(): void {
    const styleUnsupported = this.deps.citationStyle === 'author-year';
    const est = estimatePreflightSeconds(this.deps.referenceCount);
    const estMin = Math.max(1, Math.round(est / 60));
    const refLine = this.deps.referenceCount > 0 && !styleUnsupported
      ? `Tvoj rad ima ${this.deps.referenceCount} referenci; provjera obično traje oko ${estMin} min.`
      : 'Provjera obično traje 1 do 2 minute jer se svaka referenca provjerava u javnim bazama.';
    const styleNote = styleUnsupported
      ? '<p class="pf-note">Rad koristi autor-godina stil citiranja. Provjera postojanja '
        + 'referenci u bazama zasad radi za numerirani (Vancouver) popis, pa taj korak za '
        + 'ovaj rad neće dati rezultat; provjeravaju se skriveni sadržaj, metapodaci, '
        + 'stilovi i usklađenost citata.</p>'
      : '';
    this.mount.innerHTML = `
      <div class="pf-card">
        <div class="pf-head">
          <span class="pf-kicker">Formalna čistoća dokumenta i referenci</span>
          <h3>Provjera prije predaje</h3>
        </div>
        <p class="pf-lead">Ovo su provjere koje fakultetski sustavi i povjerenstva rade nad
          tvojim dokumentom. Bolje da ih vidiš prvi. Ovo su signali za tvoju provjeru, ne
          presuda o radu.</p>
        <ul class="pf-list">
          <li>citati u tekstu bez izvora u popisu literature (mogući fantomski citati)</li>
          <li>postoje li reference u javnim bazama Crossref, OpenAlex i PubMed</li>
          <li>skriveni i nevidljivi tekst, neuobičajeni znakovi i zamjene slova</li>
          <li>zaostale evidentirane izmjene, komentari i nered u stilovima</li>
          <li>metapodaci dokumenta (autor, tvrtka, predlošci)</li>
        </ul>
        ${styleNote}
        <label class="pf-consent">
          <input type="checkbox" id="pfConsentCheck" ${this.consentChecked ? 'checked' : ''} />
          <span id="pfConsentText"></span>
        </label>
        <div class="pf-actions">
          <button class="btn btn-primary btn-sm" id="pfRunBtn" ${this.consentChecked ? '' : 'disabled'}>
            Pošalji na provjeru</button>
          <span class="pf-est">${escapeHtml(refLine)}</span>
        </div>
      </div>`;
    // Tekst privole se postavlja kroz textContent (ne innerHTML): nema HTML-a u
    // pravnom tekstu, izbjegava se svaka interpolacija.
    const consentText = buildPreflightConsent({
      timestamp: new Date(this.now()).toISOString(),
      termsVersion: this.deps.termsVersion,
    }).text;
    const span = this.mount.querySelector('#pfConsentText');
    if (span) span.textContent = consentText;

    const check = this.mount.querySelector<HTMLInputElement>('#pfConsentCheck');
    const btn = this.mount.querySelector<HTMLButtonElement>('#pfRunBtn');
    check?.addEventListener('change', () => {
      this.consentChecked = !!check.checked;
      if (btn) btn.disabled = !this.consentChecked;
    });
    btn?.addEventListener('click', () => { void this.start(); });
  }

  private paintProgress(): void {
    if (this.phase.k !== 'progress') return;
    const elapsed = Math.floor((this.now() - this.phase.started) / 1000);
    const est = estimatePreflightSeconds(this.deps.referenceCount);
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.mount.innerHTML = `
      <div class="pf-card pf-progress" role="status" aria-live="polite">
        <div class="pf-spinner" aria-hidden="true"></div>
        <p class="pf-phase">${escapeHtml(this.phase.label)}</p>
        <p class="pf-timer">Traje ${mmss(elapsed)} / procjena ~${mmss(est)}</p>
        <p class="pf-hint">Ne zatvaraj ovu karticu dok provjera traje.</p>
        <button class="btn btn-ghost btn-sm" id="pfCancelBtn">Prekini</button>
      </div>`;
    this.mount.querySelector('#pfCancelBtn')?.addEventListener('click', () => this.cancel());
  }

  private paintResult(report: PreflightReport, depth: 'teaser' | 'full'): void {
    const counts = report.severity_counts || {};
    const positives = report.modules.flatMap((m) => m.findings.filter((f) => f.positive));
    const chip = (label: string, n: number, cls: string) =>
      n > 0 ? `<span class="pf-chip ${cls}">${escapeHtml(label)}: ${n}</span>` : '';
    const chips = [
      chip('Kritično', counts.CRITICAL || 0, 'pf-bad'),
      chip('Važno', counts.HIGH || 0, 'pf-bad'),
      chip('Provjeri', counts.MEDIUM || 0, 'pf-warn'),
      chip('Napomene', (counts.LOW || 0) + (counts.INFO || 0), 'pf-neutral'),
      positives.length ? `<span class="pf-chip pf-good">Prošlo: ${positives.length}</span>` : '',
    ].join('');

    const groups = this.orderedModules(report).map((mod) => {
      const cards = mod.findings.map((f) => this.card(f)).join('');
      const body = mod.skipped
        ? `<p class="pf-skip">${escapeHtml(mod.skip_reason || 'Preskočeno.')}</p>`
        : (cards || '<p class="pf-skip">Nema nalaza u ovoj skupini.</p>');
      return `<section class="pf-group"><h4>${escapeHtml(moduleLabel(mod.module_id))}</h4>${body}</section>`;
    }).join('');

    const teaserNote = depth === 'teaser' && report.teaser_hidden_findings
      ? `<div class="pf-lock">Još ${report.teaser_hidden_findings} nalaza s dokazima i uputama
         za ispravak dostupno je u punom pregledu.</div>`
      : '';

    this.mount.innerHTML = `
      <div class="pf-card pf-result">
        <div class="pf-principle">Ovo su signali za tvoju provjeru, ne presuda o radu.
          Svaki nalaz provjeri u dokumentu prije nego što išta mijenjaš.</div>
        <div class="pf-chips">${chips || '<span class="pf-chip pf-good">Nema nalaza</span>'}</div>
        ${teaserNote}
        ${groups}
        <div class="pf-actions">
          <button class="btn btn-secondary btn-sm" id="pfAgainBtn">Ponovi provjeru</button>
        </div>
      </div>`;
    this.mount.querySelector('#pfAgainBtn')?.addEventListener('click', () => {
      this.consentChecked = false;
      this.phase = { k: 'idle' };
      this.paint();
    });
    this.deps && (globalThis as { __lektaIcons?: () => void }).__lektaIcons?.();
  }

  private card(f: PreflightFinding): string {
    const copy = copyForCode(f.code);
    const title = copy?.title ?? f.title;
    const body = copy?.body ?? '';
    const tone = f.positive ? 'good' : (copy?.tone ?? this.severityTone(f.severity));
    const evidence = f.evidence.length
      ? `<ul class="pf-evidence">${f.evidence.slice(0, 5).map((e) =>
          `<li>${escapeHtml(e)}</li>`).join('')}${f.evidence.length > 5
          ? `<li class="pf-more">i još ${f.evidence.length - 5}</li>` : ''}</ul>`
      : '';
    return `<article class="pf-finding pf-${tone}">
      <h5>${escapeHtml(title)}</h5>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
      ${evidence}
    </article>`;
  }

  private severityTone(sev: string): string {
    if (sev === 'CRITICAL' || sev === 'HIGH') return 'bad';
    if (sev === 'MEDIUM') return 'warn';
    return 'neutral';
  }

  private orderedModules(report: PreflightReport) {
    const order = new Map(MODULE_ORDER.map((id, i) => [id, i]));
    return [...report.modules].sort((a, b) =>
      (order.get(a.module_id) ?? 99) - (order.get(b.module_id) ?? 99));
  }

  private paintError(message: string, retryable: boolean): void {
    this.mount.innerHTML = `
      <div class="pf-card pf-error">
        <p>${escapeHtml(message)}</p>
        ${retryable ? '<button class="btn btn-secondary btn-sm" id="pfRetryBtn">Pokušaj ponovno</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="pfBackBtn">Natrag</button>
      </div>`;
    this.mount.querySelector('#pfRetryBtn')?.addEventListener('click', () => { void this.start(); });
    this.mount.querySelector('#pfBackBtn')?.addEventListener('click', () => {
      this.phase = { k: 'idle' };
      this.paint();
    });
  }

  // -------------------------------------------------------------------- //
  private fail(message: string, retryable = true): void {
    this.phase = { k: 'error', message, retryable };
    this.paint();
  }

  private cancel(): void {
    this.abort?.abort();
    if (this.pollTimer) this.clearT(this.pollTimer);
    this.pollTimer = null;
    this.phase = { k: 'error', message:
      'Provjera je prekinuta. Poslana kopija se briše odmah, i pri prekidu.', retryable: true };
    this.paint();
  }

  private async start(): Promise<void> {
    if (!this.consentChecked) return;
    const file = await this.deps.getFile();
    if (!file) {
      this.fail('Za provjeru ponovno učitaj .docx datoteku (dokument više nije u memoriji).', false);
      return;
    }
    if (this.deps.maxUploadMb && file.size > this.deps.maxUploadMb * 1024 * 1024) {
      this.fail(`Datoteka premašuje ograničenje poslužitelja (${this.deps.maxUploadMb} MB). `
        + 'Smanji slike ili priloge pa pokušaj ponovno.', false);
      return;
    }
    const token = await this.deps.resolveToken();
    if (!token) {
      this.deps.openAuth(() => { void this.start(); });
      return;
    }

    this.phase = { k: 'progress', started: this.now(), jobId: '', label: PROGRESS_STEPS[0] };
    this.paint();

    const consent = buildPreflightConsent({
      timestamp: new Date(this.now()).toISOString(),
      termsVersion: this.deps.termsVersion,
    });
    let sha: string;
    try {
      sha = await sha256Hex(file);
    } catch {
      this.fail('Nije moguće pripremiti datoteku za slanje. Pokušaj ponovno.');
      return;
    }
    const meta = buildStartMeta(file, sha, this.deps.workType, this.deps.lang, consent);
    const start = await startPreflight(this.deps.config, token, meta, this.fetchImpl);

    if (start.kind === 'unauthorized') {
      this.deps.openAuth(() => { void this.start(); });
      return;
    }
    if (start.kind === 'rate_limited') {
      this.fail('Dnevni broj besplatnih provjera je iskorišten. Pokušaj ponovno sutra.', false);
      return;
    }
    if (start.kind === 'too_large') {
      this.fail('Datoteka premašuje ograničenje poslužitelja. Smanji slike ili priloge.', false);
      return;
    }
    if (start.kind === 'job_active') {
      this.fail('Prethodna provjera još je u tijeku. Pričekaj da završi pa pokušaj ponovno.', true);
      return;
    }
    if (start.kind === 'disabled') {
      this.fail('Provjera prije predaje trenutačno nije dostupna. Pokušaj kasnije.', true);
      return;
    }
    if (start.kind === 'error') {
      this.fail('Provjera trenutačno nije dostupna. Dokument nije analiziran ni pohranjen. '
        + 'Pokušaj ponovno za nekoliko minuta.');
      return;
    }
    if (start.kind === 'dedup') {
      this.poll(token, start.jobId);
      return;
    }
    // start.kind === 'ok': upload izravno na Python servis
    this.setLabel(PROGRESS_STEPS[1]);
    this.abort = new AbortController();
    const up = await uploadFile(start.uploadUrl, start.uploadToken, file,
      this.fetchImpl, this.abort.signal);
    if (up.kind === 'too_large') {
      this.fail('Datoteka premašuje ograničenje poslužitelja. Smanji slike ili priloge.', false);
      return;
    }
    if (up.kind === 'rejected') {
      this.fail(up.code === 'not_a_docx'
        ? 'Ovo nije .docx datoteka. Ako je stari .doc format, spremi ga kao .docx pa pokušaj ponovno.'
        : 'Datoteku nije moguće pročitati (oštećena ili nije ispravan .docx).', false);
      return;
    }
    if (up.kind === 'busy') {
      this.fail('Poslužitelj je trenutačno zauzet. Pokušaj ponovno za koju minutu.', true);
      return;
    }
    if (up.kind === 'bad_ticket' || up.kind === 'error') {
      this.fail('Slanje nije uspjelo. Dokument nije analiziran ni pohranjen. Pokušaj ponovno.');
      return;
    }
    // accepted: rezultat je (ili ce biti) u bazi; poll kroz Edge
    this.poll(token, start.jobId);
  }

  private setLabel(label: string): void {
    if (this.phase.k === 'progress') {
      this.phase = { ...this.phase, label };
      this.paint();
    }
  }

  private poll(token: string, jobId: string): void {
    if (this.phase.k !== 'progress') {
      this.phase = { k: 'progress', started: this.now(), jobId, label: PROGRESS_STEPS[2] };
    } else {
      this.phase = { ...this.phase, jobId };
    }
    const startedAt = this.phase.started;
    const tick = async () => {
      const out = await pollResult(this.deps.config, token, jobId, this.fetchImpl);
      if (this.phase.k !== 'progress') return; // prekinuto
      switch (out.kind) {
        case 'pending':
          this.setLabel(PROGRESS_STEPS[1]); break;
        case 'running':
          this.setLabel(PROGRESS_STEPS[3]); break;
        case 'done':
          this.phase = { k: 'result', report: out.report, depth: out.depth };
          this.paint();
          return;
        case 'expired':
          this.fail('Nalaz više nije dostupan. Pokreni provjeru ponovno.', true);
          return;
        case 'failed':
          this.fail(this.errorForCode(out.code), true);
          return;
        case 'unauthorized':
          this.deps.openAuth(() => { void this.start(); });
          return;
        case 'error':
          // prolazna greska pri pollu: nastavi dok ne istekne budzet
          break;
      }
      if (this.now() - startedAt > POLL_MAX_MS) {
        this.fail('Provjera predugo traje. Dokument je poslan, ali nalaz nije stigao na vrijeme. '
          + 'Pokušaj ponovno za nekoliko minuta.', true);
        return;
      }
      this.pollTimer = this.setT(() => { void tick(); }, POLL_INTERVAL_MS);
    };
    this.pollTimer = this.setT(() => { void tick(); }, POLL_INTERVAL_MS);
  }

  private errorForCode(code: string): string {
    switch (code) {
      case 'docx_too_complex':
        return 'Dokument je pretežak za obradu (previše sadržaja ili slika). '
          + 'Provjeri veličinu datoteke pa pokušaj ponovno.';
      case 'invalid_docx':
      case 'not_a_docx':
        return 'Datoteku nije moguće pročitati kao ispravan .docx.';
      case 'deadline_exceeded':
        return 'Provjera je predugo trajala. Pokušaj ponovno za nekoliko minuta.';
      default:
        return 'Provjera nije uspjela. Dokument nije pohranjen. Pokušaj ponovno.';
    }
  }
}
