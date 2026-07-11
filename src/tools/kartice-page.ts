// DOM glue za besplatni brojac kartica (kartice.html). Sva logika je u counter.ts
// (tipizirano, testabilno); ovdje samo vezanje textarea -> ispis. Bez mreze.
import '../shared/ui-boot';
import { countText, ZNAKOVA_PO_KARTICI } from './counter';
import { bindCopyButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);
const nf = new Intl.NumberFormat('hr-HR');
const nf1 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Gornja granica unosa: brojanje radi vise punih prolaza po tekstu na svaki frame, pa ogroman
// paste (vise MB) inace kratko zamrzne karticu. HTML maxlength pokriva tipkanje/paste u polje,
// ovaj guard pokriva i programatski upisan value. 2 milijuna znakova je daleko iznad realnog rada.
const MAX_ZNAKOVA = 2_000_000;

const SAMPLE = `Ovo je primjer teksta koji možeš zamijeniti svojim radom. Zalijepi ovdje uvod, poglavlje ili cijeli rad pa gledaj kako se broj kartica, riječi i znakova mijenja u stvarnom vremenu.

Jedna autorska kartica u hrvatskoj lekturi i prijevodu iznosi 1800 znakova s razmacima. Cijena lekture obično se računa upravo po kartici, pa je ovaj broj koristan kad procjenjuješ trošak i opseg.`;

function readingLabel(minutes: number): string {
  if (!minutes) return '0 min';
  if (minutes < 1) return '< 1 min'; // 1-9 rijeci: iskrenije od "0 min" za neprazan tekst
  return `${nf1.format(minutes)} min`;
}

function render(text: any) {
  const m = countText(text);
  const set = (id: any, v: any) => { const el = $(id); if (el) el.textContent = v; };

  set('#m-kartice', nf2.format(m.kartice));
  set('#m-words', nf.format(m.words));
  set('#m-chars', nf.format(m.charsWithSpaces));
  set('#m-chars-nospace', nf.format(m.charsWithoutSpaces));
  set('#m-sentences', nf.format(m.sentences));
  set('#m-paragraphs', nf.format(m.paragraphs));
  set('#m-pages', nf.format(m.pages));
  set('#m-reading', readingLabel(m.readingMinutes));

  const copyBtn = $('#kt-copy');
  if (copyBtn) copyBtn.disabled = m.charsWithSpaces === 0;
  scheduleSrSummary(m);
  return m;
}

// Najava za citace ekrana: vizualne metrike se osvjezavaju na svaki unos, ali se izgovor
// salje u skriveni aria-live tek nakon pauze u tipkanju, da SR ne brblja na svaki znak.
let _srTimer: any = 0;
function scheduleSrSummary(m: any) {
  const live = $('#kt-sr-summary');
  if (!live) return;
  clearTimeout(_srTimer);
  _srTimer = setTimeout(() => {
    live.textContent = m.charsWithSpaces
      ? `${nf2.format(m.kartice)} kartica, ${nf.format(m.words)} riječi, ${nf.format(m.charsWithSpaces)} znakova s razmacima, `
        + `${nf.format(m.charsWithoutSpaces)} bez razmaka, ${nf.format(m.sentences)} rečenica, `
        + `${nf.format(m.paragraphs)} odlomaka, ${nf.format(m.pages)} stranica, vrijeme čitanja ${readingLabel(m.readingMinutes)}`
      : 'Nema teksta.';
  }, 900);
}

function summaryText(m: any) {
  return [
    `Kartice (${ZNAKOVA_PO_KARTICI} znakova): ${nf2.format(m.kartice)}`,
    `Riječi: ${nf.format(m.words)}`,
    `Znakovi s razmacima: ${nf.format(m.charsWithSpaces)}`,
    `Znakovi bez razmaka: ${nf.format(m.charsWithoutSpaces)}`,
    `Rečenice: ${nf.format(m.sentences)}`,
    `Odlomci: ${nf.format(m.paragraphs)}`,
    `Procjena A4 stranica: ${nf.format(m.pages)}`,
    `Vrijeme čitanja: ${readingLabel(m.readingMinutes)}`,
  ].join('\n');
}

function init() {
  const input = $('#kt-input');
  if (!input) return;

  render(input.value || '');
  // rAF spajanje: kod brzog tipkanja/velikog pastea rendera se najvise jednom po frameu,
  // umjesto vise punih regex prolaza preko cijelog teksta na svaki keystroke.
  let rafId = 0;
  input.addEventListener('input', () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      // Zastita od ogromnog pastea koji bi zamrznuo nit (uz HTML maxlength na polju).
      if (input.value.length > MAX_ZNAKOVA) input.value = input.value.slice(0, MAX_ZNAKOVA);
      render(input.value);
    });
  });

  $('#kt-clear')?.addEventListener('click', () => {
    input.value = '';
    render('');
    input.focus();
  });

  $('#kt-sample')?.addEventListener('click', () => {
    input.value = SAMPLE;
    render(input.value);
    input.focus();
  });

  bindCopyButton($('#kt-copy'), () => {
    const m = countText(input.value || '');
    return m.charsWithSpaces ? summaryText(m) : '';
  }, { statusEl: $('#kt-copy-status') });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
