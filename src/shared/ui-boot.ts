// @ts-nocheck
// Zajednicki boot za sve stranice (index, citat, usporedba):
//  1. self-hostani akademski serif (Source Serif 4, latin + latin-ext za hrvatski),
//  2. Lucide ikone: zamjenjuje <i data-lucide="..."> jedinstvenim stroke setom.
// Bez mreze prema trecim stranama; font se bundla lokalno (unicode-range skida
// samo latin i latin-ext za hrvatski sadrzaj).
import '@fontsource-variable/source-serif-4';
import 'open-props/easings'; // samo easing krivulje (bez boja/sjena, da topla paleta ostane netaknuta)
import { createIcons, SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck } from 'lucide';

function renderIcons() {
  try {
    createIcons({
      icons: { SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck },
      attrs: { 'aria-hidden': 'true', 'stroke-width': 2 },
    });
  } catch (e) {
    // Ikona koja fali ne smije srusiti stranicu; glif fallback ostaje u markupu.
  }
}

// Dinamicki renderan sadrzaj (rezultat analize, QA konzola) ubacuje <i data-lucide>
// nakon prvog prolaza, pa app.ts poziva ovaj refresh da ih pretvori u SVG.
(window as any).__lektaIcons = renderIcons;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderIcons);
} else {
  renderIcons();
}
