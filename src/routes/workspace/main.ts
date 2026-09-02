import { initAnalyzerApp } from '../../ui/app';
import { openWorkspace, type StorageAvailability } from './bootstrap';
import { IndexedDbDocumentSessionStore } from '../../session/indexeddb-document-session-store';
import '../../shared/ui-boot';

/**
 * ULAZ RUTE `/rad/`. Tanak namjerno: sve odluke su u `bootstrap.ts`, koji je cist i testabilan
 * bez preglednika. Ovdje ostaje samo dodir DOM-a i montaza.
 */

function detectStorage(): StorageAvailability {
  // `indexedDB` moze POSTOJATI a bacati pri otvaranju (privatni prozor, blokirani podaci
  // stranice). Sama prisutnost objekta zato nije dokaz dostupnosti; stvarni kvar hvata
  // `openWorkspace`, koji svaki poziv pohrane drzi u `try`.
  try {
    const factory = globalThis.indexedDB;
    if (!factory) return { kind: 'unavailable', reason: 'indexedDB nije dostupan' };
    return { kind: 'available', store: new IndexedDbDocumentSessionStore({ indexedDB: factory }) };
  } catch (error) {
    return { kind: 'unavailable', reason: String((error as Error)?.message || error) };
  }
}

function showStatus(text: string | null): void {
  const el = document.getElementById('workspace-status');
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = text;
  el.hidden = false;
}

async function start(): Promise<void> {
  // Montaza ide PRVA: radna povrsina mora biti upotrebljiva i kad pohrana zakaze. Vezanje
  // upotrebljivosti uz pohranu bilo bi tocno obrnuto od ugovora o degradaciji.
  initAnalyzerApp(document);

  const outcome = await openWorkspace(location.hash, detectStorage());
  showStatus(outcome.notice);
  document.documentElement.dataset.workspaceState = outcome.context.state;
}

void start();
