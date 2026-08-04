/**
 * Lekta Control Center: entry point za admin.html (jedini <script type="module"> na stranici).
 * Boot (fontovi/CSS/tema/ikone/skip-link) je bočni učinak importa boot modula; ovdje se samo
 * pokreće orkestracija (prijava pa dohvat/render) nakon što je DOM spreman.
 */

import './admin-dashboard-boot';
import { bootAdminDashboard } from './admin-shell';

function init(): void {
  bootAdminDashboard(document.body);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
