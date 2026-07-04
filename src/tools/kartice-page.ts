// DOM glue za besplatni brojac kartica (kartice.html). Sva logika je u counter.ts
// (tipizirano, testabilno); ovdje samo vezanje textarea -> ispis. Bez mreze.
import '../shared/ui-boot';
import { countText, ZNAKOVA_PO_KARTICI } from './counter';
import { bindCopyButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);
const nf = new Intl.NumberFormat('hr-HR');
const nf1 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const SAMPLE = `Ovo je primjer teksta koji možeš zamijeniti svojim radom. Zalijepi ovdje uvod, poglavlje ili cijeli rad pa gledaj kako se broj kartica, riječi i znakova mijenja u stvarnom vremenu.

Jedna autorska kartica u hrvatskoj lekturi i prijevodu iznosi 1800 znakova s razmacima. Cijena lekture obično se računa upravo po kartici, pa je ovaj broj koristan kad procjenjuješ trošak i opseg.`;

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
  set('#m-reading', m.readingMinutes ? `${nf1.format(m.readingMinutes)} min` : '0 min');

  const copyBtn = $('#kt-copy');
  if (copyBtn) copyBtn.disabled = m.charsWithSpaces === 0;
  return m;
}

function summaryText(m: any) {
  return [
    `Kartice (${ZNAKOVA_PO_KARTICI} znakova): ${nf2.format(m.kartice)}`,
    `Riječi: ${nf.format(m.words)}`,
    `Znakovi s razmacima: ${nf.format(m.charsWithSpaces)}`,
    `Znakovi bez razmaka: ${nf.format(m.charsWithoutSpaces)}`,
    `Rečenice: ${nf.format(m.sentences)}`,
    `Odlomci: ${nf.format(m.paragraphs)}`,
    `Procijenjene stranice: ${nf.format(m.pages)}`,
    `Vrijeme čitanja: ${m.readingMinutes ? `${nf1.format(m.readingMinutes)} min` : '0 min'}`,
  ].join('\n');
}

function init() {
  const input = $('#kt-input');
  if (!input) return;

  render(input.value || '');
  input.addEventListener('input', () => render(input.value));

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
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
