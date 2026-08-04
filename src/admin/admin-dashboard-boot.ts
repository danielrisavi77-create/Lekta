// src/admin/admin-dashboard-boot.ts
//
// Vitki boot za admin.html. Namjerno NE uvozi ../shared/ui-boot.ts: ta datoteka vuce
// marketinsku mehaniku (hero animacija, .preview-card tilt, nav dropdown, mobilni hamburger,
// scroll-reveal) koja na internom dashboardu nema metu.
//
// Control Center ima vlastiti sustav tokena (admin-dashboard.css) jer se boje mijenjaju po
// korisnikovom izboru palete (admin-theme.ts + admin-palettes.ts), pa se NE nasljeduje
// Korektorski stol iz design-system.css. Fontovi su isti kao u ostatku proizvoda.
//
// Ikone su inline SVG iz admin-charts.ts (ICONS), ne Lucide: grafovi ionako grade SVG rucno,
// pa nema razloga vuci dodatnu ovisnost samo za par glifova.

import '@fontsource-variable/inter-tight';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../shared/skip-link.css';
import '../shared/a11y.css';
import './admin-dashboard.css';
import './admin-charts.css';
import { setupSkipLink } from '../shared/skip-link';

// Tema (svijetlo/tamno) se pamti u lekta.theme; FOUC skripta u <head> je vec primijenila
// spremljenu vrijednost prije prvog paint-a. Bez spremljenog izbora prati se OS postavka,
// pa se ovdje NE forsira nijedna vrijednost.
export function bootAdminShell(): void {
  setupSkipLink();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAdminShell);
} else {
  bootAdminShell();
}
