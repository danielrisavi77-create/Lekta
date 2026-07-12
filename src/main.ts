// Tanki bootstrap (Vite entry). UI shell i orkestrator analyzeDocx su u src/ui/app.ts;
// framework-agnosticni engine moduli su u src/{docx,audits,citations,scoring,utils}.
// Caveat (rukopisne korekture) treba samo landing, pa se uvozi ovdje, ne u ui-boot.
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import './shared/ui-boot';
import './ui/app';
import './ui/hero-demo';
import './ui/korektorski';
