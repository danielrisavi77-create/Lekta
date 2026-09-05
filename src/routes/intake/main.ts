import { uploadCapBytes } from '../../repair/docx-budget';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import { createLocalDocumentSession, sessionFragment } from '../../session/local-document-session';
import { mountIntakeController } from './intake-controller';
import { playIntakeEntry } from './intake-motion';
import SITE_STATS from '../../../data/coverage/site-stats.json';
import '../../shared/ui-boot';
import '../../shared/page-chrome.css';  // ulaz NE uvozi radnu povrsinu: vidi mjerenje u tom listu
import './intake.css';
// Prazan stol pod lampom: postojeci sloj dubine (snop, prasina, sjene) BEZ demo dokumenta i bez
// sekvence. Papir za ucitavanje je jedini predmet na stolu.
import '../../ui/hero-depth';

/**
 * ULAZ RUTE `/`: samo ucitavanje dokumenta.
 *
 * Nakon sto dokument prodje lokalni intake gate i spremi se u IndexedDB, preglednik ide na
 * `/rad/#session=<uuid>`. Sve ostalo (profil, analiza, nalaz, popravak, narudzba, prijava) zivi na
 * `/rad/`. Ova stranica NE UVOZI `src/ui/app.ts` i to je cijela poanta: analizator nosi pola
 * megabajta grafa, a ulazu treba jedna zona i jedan zapis.
 *
 * Intake gate se uvozi LIJENO, tek na prvi odabir: prije toga stranici ne treba nista sto cita
 * ZIP. Isti ugovor je imala grana `feature/intake-first-live`, ciji je ovo port.
 */

interface NavigatorWithDeviceMemory extends Navigator { readonly deviceMemory?: number }

function uploadLimitForCurrentDevice(): number {
  const deviceMemory = (navigator as NavigatorWithDeviceMemory).deviceMemory;
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return uploadCapBytes({ deviceMemory, coarsePointer });
}

function showUploadLimit(doc: Document, maxUploadBytes: number): void {
  const limit = Math.round(maxUploadBytes / (1024 * 1024));
  doc.querySelectorAll<HTMLElement>('[data-upload-limit]').forEach((element) => { element.textContent = `${limit} MB`; });
}

function openStore(): IndexedDbDocumentSessionStore | null {
  try {
    const factory = globalThis.indexedDB;
    return factory ? new IndexedDbDocumentSessionStore({ indexedDB: factory }) : null;
  } catch {
    return null;
  }
}

/** Pohrana koja ne postoji odbija zapis kao `unavailable`; kontroler tada nudi rad bez sesije. */
const refusingStore = {
  async put(): Promise<void> { throw Object.assign(new Error('IndexedDB nije dostupan'), { code: 'unavailable' }); },
  async delete(): Promise<void> { /* nema sto brisati */ },
};

/**
 * TIHA POVEZNICA "NASTAVI" za povratnika: `/` uvijek prikazuje upload, a ispod stoji jedna recenica
 * s imenom nedovrsenog rada. Korisnik bira; nista se ne preusmjerava samo od sebe.
 */
async function offerContinuation(doc: Document, store: IndexedDbDocumentSessionStore | null): Promise<void> {
  const host = doc.getElementById('intakeContinue');
  if (!host || !store) return;
  try {
    await store.deleteExpired();
    const [latest] = await store.list();
    if (!latest) return;
    const link = doc.createElement('a');
    link.href = `/rad/${sessionFragment(latest.id)}`;
    link.textContent = 'nastavi';
    const name = doc.createElement('strong');
    name.textContent = latest.name;
    host.replaceChildren('Imaš nedovršen rad: ', name, ' · ', link);
    host.hidden = false;
  } catch {
    // Nedostupna pohrana ovdje nije greska korisnika; poveznica se jednostavno ne nudi.
  }
}

/** Hrvatska mnozina: 1 profil, 2 profila, 5 profila, 21 profil, 101 profil ... */
function hrPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (b === 1 && a !== 11) return one;
  if (b >= 2 && b <= 4 && (a < 12 || a > 14)) return few;
  return many;
}

/**
 * TRAKA S BROJKAMA: signal povjerenja, iz PECENOG JSON-a. Brojke su iste koje je naslovnica do reza
 * racunala zivo iz registra profila (194 KB) i kataloga; ulaz ih ne smije vuci, pa ih pece
 * `npm run gen-site-stats`, a `tests/site-stats.test.ts` cuva da ne zaostanu.
 */
function renderStats(doc: Document): void {
  const host = doc.getElementById('intakeStats');
  if (!host) return;
  const fmt = (n: number): string => n.toLocaleString('hr-HR');
  const items: Array<[number, string, string, string]> = [
    [SITE_STATS.profiles, 'studijski profil', 'studijska profila', 'studijskih profila'],
    [SITE_STATS.institutions, 'ustanova', 'ustanove', 'ustanova'],
    [SITE_STATS.works, 'javni rad', 'javna rada', 'javnih radova'],
  ];
  host.replaceChildren(...items.map(([n, one, few, many]) => {
    const cell = doc.createElement('span');
    const strong = doc.createElement('b');
    strong.textContent = fmt(n);
    cell.append(strong, ` ${hrPlural(n, one, few, many)}`);
    return cell;
  }));
  const note = doc.createElement('span');
  note.className = 'intake-stats-note';
  note.textContent = 'pravila iz službenih izvora';
  host.append(note);
}

function start(): void {
  const maxUploadBytes = uploadLimitForCurrentDevice();
  showUploadLimit(document, maxUploadBytes);
  renderStats(document);
  // Sekvenca ide POSLIJE punjenja brojki, da se ne animira prazan element, i PRIJE montaze
  // kontrolera samo po redoslijedu poziva: papir je klikabilan od prvog kadra jer se animiraju
  // iskljucivo `opacity` i `transform`.
  playIntakeEntry(document);
  const store = openStore();

  mountIntakeController(document, {
    maxUploadBytes,
    async inspectFile(file) {
      const { inspectDocxIntake } = await import('../../docx/intake-gate');
      return inspectDocxIntake(file);
    },
    createSession: createLocalDocumentSession,
    persistentStore: store ?? refusingStore,
    navigate(path) { window.location.assign(path); },
  });

  void offerContinuation(document, store);
}

start();
