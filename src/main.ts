// Tanki bootstrap (Vite entry). UI shell i orkestrator analyzeDocx su u src/ui/app.ts;
// framework-agnosticni engine moduli su u src/{docx,audits,citations,scoring,utils}.
// Caveat (rukopisne korekture) treba samo landing, pa se uvozi ovdje, ne u ui-boot.
import './shared/page-chrome.css';
import './shared/page-app.css';  // stil stranice; bez njega je ruta goli HTML
import './shared/fonts-document'; // podatkovni glasovi (Source Serif 4 za dokument-preglede, IBM Plex Mono za brojke)
import './shared/ui-boot';
import './ui/app';
import './integration/katedra-entry';
import './integration/katedra-result-cta';
import './ui/hero-demo';
import './ui/hero-depth';
import './ui/korektorski';
