import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import { fetchRepairJobs } from '../../report/repair-history';
import { repairHistoryConfigFrom } from '../../report/repair-history-config';
import { STORAGE_KEYS, safeStorageGet } from '../../shared/browser-storage';
import { loadProductionConfig } from '../../config/production-config';
import { accountView, localWorkView, type AccountView, type LocalWorkView } from './view-model';
import '../../shared/ui-boot';
import '../../shared/page.css';

/**
 * ULAZ RUTE `/moji-radovi/`.
 *
 * Dvije polovice, namjerno neovisne: lokalni rad (IndexedDB, bez posluzitelja) i racun (popravci
 * spremljeni uz prijavu). Pad jedne NE SMIJE srusiti drugu; student koji nije prijavljen i dalje
 * mora vidjeti svoje lokalne radove.
 *
 * NE UVOZI `src/ui/app.ts` i NE DUPLICIRA PRIJAVU. Sesiju cita iz istog kljuca u koji je analizator
 * zapisuje, pa je prijava i dalje na jednom mjestu. Druga kopija toka prijave bila bi druga kopija
 * sigurnosno osjetljivog koda, dakle tocno onaj obrazac koji je danas vec jednom trebalo razrijesiti
 * kod cjenika (dva prikaza koja se razilaze).
 */

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** Poruka koja NE tvrdi nista o korisniku; koristi se kad stanje nije poznato. */
function note(text: string): string {
  return `<p class="mw-note">${esc(text)}</p>`;
}

function renderLocal(view: LocalWorkView): string {
  if (view.kind === 'unavailable') {
    // NE "nemas radova": ne znamo ima li ih. Vidi view-model.ts.
    return note(`Ne mogu pročitati lokalnu pohranu (${view.reason}). Ako je ovo privatni prozor ili su podaci stranice blokirani, radovi postoje samo dok je kartica otvorena.`);
  }
  if (view.kind === 'empty') {
    return `${note('Nemaš radova otvorenih na ovom uređaju.')}<a class="btn btn-primary" href="/">Provjeri rad</a>`;
  }
  return view.items.map((item) => `<article class="mw-item">
    <a class="mw-item-name" href="${esc(item.href)}">${esc(item.name)}</a>
    <span class="mw-item-meta">${esc(item.stageLabel)} · ${esc(item.expiryLabel)}</span>
  </article>`).join('');
}

function renderAccount(view: AccountView): string {
  switch (view.kind) {
    case 'not-configured':
      // Ponuditi prijavu koja nigdje ne vodi gore je od toga da je nema.
      return note('Prijava još nije uključena u ovoj verziji.');
    case 'signed-out':
      return `${note('Nisi prijavljen. Prijava se otvara iz alata.')}<a class="btn btn-secondary" href="/">Otvori alat</a>`;
    case 'expired':
      return `${note('Prijava je istekla. Prijavi se ponovno iz alata.')}<a class="btn btn-secondary" href="/">Otvori alat</a>`;
    case 'error':
      // NE prazan popis: dohvat je pao, pa ne znamo ima li popravaka.
      return note(`Popis popravaka nije dohvaćen (${view.message}). Pokušaj osvježiti stranicu.`);
    case 'empty':
      return note(`Prijavljen kao ${view.email}. Nemaš spremljenih popravaka.`);
    default:
      return `${note(`Prijavljen kao ${view.email}.`)}${view.items.map((job) => `<article class="mw-item">
        <span class="mw-item-name">${esc(job.label)}</span>
        <span class="mw-item-meta">${esc(job.createdLabel)} · ${esc(job.statusLabel)}</span>
        ${job.downloadable ? '' : '<span class="mw-item-meta">nije dostupno za preuzimanje</span>'}
      </article>`).join('')}`;
  }
}

function paint(id: string, html: string): void {
  const host = document.getElementById(id);
  if (!host) return;
  host.innerHTML = html;
  host.setAttribute('aria-busy', 'false');
}

async function loadLocal(now: number): Promise<void> {
  try {
    const store = new IndexedDbDocumentSessionStore({ indexedDB: globalThis.indexedDB });
    await store.deleteExpired(now);
    const summaries = await store.list(now);
    paint('localWork', renderLocal(localWorkView({ ok: true, summaries }, now)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'nepoznat razlog';
    paint('localWork', renderLocal(localWorkView({ ok: false, reason }, now)));
  }
}

async function loadAccount(now: number): Promise<void> {
  // Konfiguracija se IZVODI istom funkcijom koju koristi analizator, ne prepisuje. Dvije izvedbe
  // istog URL-a razisle bi se tiho, a pogodio bi ih tek korisnik kojem preuzimanje ne radi.
  const history = repairHistoryConfigFrom(loadProductionConfig() as Record<string, unknown>);
  const configured = history.supabaseUrl.length > 0 && history.anonKey.length > 0;
  const session = safeStorageGet(STORAGE_KEYS.session, null) as { email?: unknown; expiresAt?: unknown; accessToken?: unknown } | null;

  // Prvi prolaz BEZ mreze: ako korisnik nije prijavljen ili backend nije konfiguriran, odgovor je
  // poznat odmah i nema razloga za poziv.
  const preliminary = accountView({ configured, session, now, jobs: { ok: true, jobs: [] } });
  if (preliminary.kind !== 'empty' && preliminary.kind !== 'jobs') {
    paint('accountWork', renderAccount(preliminary));
    return;
  }

  const token = typeof session?.accessToken === 'string' ? session.accessToken : '';
  try {
    const jobs = await fetchRepairJobs(history, token);
    paint('accountWork', renderAccount(accountView({ configured, session, now, jobs: { ok: true, jobs } })));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'nepoznat razlog';
    paint('accountWork', renderAccount(accountView({ configured, session, now, jobs: { ok: false, message } })));
  }
}

function start(): void {
  const now = Date.now();
  // Namjerno bez `await` jedne za drugom: polovice su neovisne, pa spor ili pokvaren racun ne smije
  // odgoditi popis lokalnih radova, koji ne treba mrezu.
  void loadLocal(now);
  void loadAccount(now);
}

start();
