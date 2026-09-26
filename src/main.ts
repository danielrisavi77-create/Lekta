// Tanki bootstrap (Vite entry). UI shell i orkestrator analyzeDocx su u src/ui/app.ts;
// framework-agnosticni engine moduli su u src/{docx,audits,citations,scoring,utils}.
import './shared/page-chrome.css';
import './shared/page-app.css';  // stil stranice; bez njega je ruta goli HTML
import './shared/ui-boot';
import './ui/app';
import './integration/katedra-entry';
import './integration/katedra-result-cta';
import './ui/hero-depth';
import './ui/korektorski';
