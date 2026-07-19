// DOM glue za besplatni generator Izjave o izvornosti (izjava.html). Logika je u
// statement.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
import '../shared/ui-boot';
import { buildStatement, statementText } from './statement';
import { statementDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, bindDownloadButton, defaultSelectedIndex } from './tool-ui';
import { formatCroatianDate } from './hr-date';
import { readToolDraft, saveToolDraft } from './draft-share';

const $ = (s: string): any => document.querySelector(s);

const FIELDS = {
  heading: '#st-heading', author: '#st-author', workType: '#st-worktype',
  title: '#st-title', place: '#st-place', date: '#st-date',
  jmbag: '#st-jmbag', oib: '#st-oib',
};

const SAMPLE: any = {
  heading: 'Izjava o izvornosti',
  author: 'Ana Anić',
  workType: 'Diplomski rad',
  title: 'Uloga civilnog društva u lokalnoj samoupravi',
  place: 'Zagreb',
  date: '3. srpnja 2026.',
  jmbag: '0000000000',
  oib: '00000000000',
};
// #st-date-picker (input type=date) ocekuje ISO oblik; mora odgovarati SAMPLE.date iznad,
// inace bi 'Ubaci primjer' opet razisao picker od teksta.
const SAMPLE_DATE_ISO = '2026-07-03';

function readInput() {
  const out: any = {};
  for (const [key, sel] of Object.entries(FIELDS)) out[key] = $(sel)?.value || '';
  return out;
}

// Izjava je "spremna" za izvoz kad je unesen bar neki osobni podatak; sam predlozak
// (bez imena/naslova/mjesta/datuma) ne izvozimo (C3, uskladeno s naslovnicom).
function hasContent(input: any): boolean {
  return !!(String(input.author || '').trim() || String(input.title || '').trim()
    || String(input.place || '').trim() || String(input.date || '').trim());
}

// Gumbi ostaju disabled dok ne postoji ijedan identitetski podatak (hasContent), bez ikakvog
// vidljivog objasnjenja zasto - title daje razlog NA SAMOM gumbu (aria-describedby vec upucuje
// na #st-hint za citac ekrana), umjesto da prvi klik zavrsi tiho, bez reakcije.
const LOCKED_TITLE = 'Upiši barem ime i prezime, naslov rada, mjesto ili datum da otključaš preuzimanje i kopiranje.';

function render(): void {
  const input = readInput();
  const model = buildStatement(input);
  const locked = !hasContent(input);
  for (const id of ['#st-copy', '#st-docx', '#st-print']) {
    const b = $(id); if (!b) continue;
    b.disabled = locked;
    b.title = locked ? LOCKED_TITLE : '';
  }
  const sheet = $('#st-sheet');
  if (sheet) {
    const foot = (model.placeDate || model.signatureName)
      ? `<div class="st-foot"><div class="st-place">${escapeHtml(model.placeDate)}</div><div class="st-sign">${model.signatureName ? `<span class="st-name">${escapeHtml(model.signatureName)}</span>` : ''}${model.identifiers ? `<span class="st-ident">${escapeHtml(model.identifiers)}</span>` : ''}<span class="st-sign-cap">(vlastoručni potpis)</span></div></div>`
      : '';
    sheet.innerHTML = `<div class="st-heading">${escapeHtml(model.heading)}</div><div class="st-body">${escapeHtml(model.body)}</div>${foot}`;
  }

  scheduleHint(model.missing, locked);
}

// #st-hint je aria-live=polite: pisanje na svaki keystroke tjera citac ekrana da istu poruku
// ponavlja uz svaki utipkani znak. Debounce nakon pauze u tipkanju + changed-guard (textContent
// na istu vrijednost i dalje mijenja text node pa SR zna ponoviti najavu). Isti obrazac kao
// scheduleSrSummary u kartice-page.ts; vizualni pregled dokumenta ostaje trenutan.
// "Preporuceno" tocno opisuje stanje KAD JE VEC OTKLJUCANO (barem jedno polje popunjeno, ostala
// su doista opcionalna dopuna) - ali dok je locked (nijedno polje popunjeno), ista rijec zvuci
// opcionalno iako gumbi ostaju disabled dok se ne upise barem jedno; poruka tad mora reci da je
// rijec o uvjetu za otkljucavanje, ne o preporuci.
let _hintTimer: any = 0;
function scheduleHint(missing: string[], locked: boolean) {
  const hint = $('#st-hint');
  if (!hint) return;
  clearTimeout(_hintTimer);
  _hintTimer = setTimeout(() => {
    const cls = missing.length ? 'out-hint warn' : 'out-hint ok';
    const text = !missing.length
      ? 'Sva preporučena polja su ispunjena.'
      : locked
        ? `Upiši barem jedno da otključaš preuzimanje i kopiranje: ${missing.join(', ')}.`
        : `Preporučeno dodati: ${missing.join(', ')}.`;
    if (hint.className !== cls) hint.className = cls;
    if (hint.textContent !== text) hint.textContent = text;
  }, 600);
}

// Draft dijeljen s generatorom naslovnice (sessionStorage): puni SAMO prazna polja,
// sprema se na svaki unos (vidljivi label vrste rada, ne value kljuc).
function applySharedDraft(): void {
  const d = readToolDraft();
  const fillIfEmpty = (sel: string, v?: string) => {
    const el = $(sel);
    if (el && v && !el.value.trim()) el.value = v;
  };
  fillIfEmpty('#st-author', d.author);
  fillIfEmpty('#st-title', d.title);
  fillIfEmpty('#st-place', d.place);
  const wt = $('#st-worktype');
  if (wt && d.workTypeLabel) {
    const opt = Array.from(wt.options as any[]).find((o: any) => o.textContent?.trim() === d.workTypeLabel);
    if (opt) wt.value = opt.value || opt.textContent.trim();
  }
}

function persistSharedDraft(): void {
  saveToolDraft({
    author: $('#st-author')?.value || '',
    title: $('#st-title')?.value || '',
    workTypeLabel: $('#st-worktype')?.selectedOptions?.[0]?.textContent?.trim() || '',
    place: $('#st-place')?.value || '',
  });
}

function init() {
  if (!$('#st-sheet')) return;
  for (const sel of Object.values(FIELDS)) {
    const el = $(sel);
    if (el) el.addEventListener('input', () => { render(); persistSharedDraft(); });
  }
  $('#st-worktype')?.addEventListener('change', persistSharedDraft);
  applySharedDraft();

  // Date picker puni tekstualni datum hrvatskim oblikom (3. srpnja 2026.); tekst ostaje uredljiv.
  $('#st-date-picker')?.addEventListener('change', () => {
    const formatted = formatCroatianDate($('#st-date-picker').value || '');
    if (formatted) { $('#st-date').value = formatted; render(); }
  });

  render();

  $('#st-sample')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) { const el = $(sel); if (el) el.value = SAMPLE[key] || ''; }
    const picker = $('#st-date-picker'); if (picker) picker.value = SAMPLE_DATE_ISO;
    render();
  });

  $('#st-clear')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) {
      const el = $(sel); if (!el) continue;
      if (el.tagName === 'SELECT') el.selectedIndex = defaultSelectedIndex(el); else el.value = '';
    }
    const picker = $('#st-date-picker'); if (picker) picker.value = '';
    render();
    $('#st-author')?.focus();
  });

  bindCopyButton($('#st-copy'), () => {
    const input = readInput();
    return hasContent(input) ? statementText(buildStatement(input)) : '';
  }, { statusEl: $('#st-copy-status') });

  $('#st-print')?.addEventListener('click', () => window.print());

  // Preuzmi gotov .docx (docx-writer): formulacija je uobicajena, obvezni obrazac faksa ima prednost.
  bindDownloadButton($('#st-docx'), () => {
    const input = readInput();
    return hasContent(input) ? docxBlob(statementDoc(buildStatement(input))) : null;
  }, 'izjava-o-izvornosti.docx', {
    statusEl: $('#st-hint'),
    failStatus: 'Preuzimanje .docx nije uspjelo. Pregled i ispis su i dalje dostupni.',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
