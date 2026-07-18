// DOM glue za besplatni brojac kartica (kartice.html). Sva logika je u counter.ts
// (tipizirano, testabilno); ovdje samo vezanje textarea -> ispis. Bez mreze:
// i .docx uvoz se raspakirava i cita LOKALNO (ZipReader + docx-text), nista se ne salje.
import '../shared/ui-boot';
import { countText, karticeFrom, ZNAKOVA_PO_KARTICI, ZNAKOVA_PO_KARTICI_BEZ_RAZMAKA, type TextMetrics } from './counter';
import { extractDocxText } from './docx-text';
import { bindCopyButton } from './tool-ui';

const $ = (s: string): any => document.querySelector(s);
const nf = new Intl.NumberFormat('hr-HR');
const nf1 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Gornja granica unosa: brojanje radi vise punih prolaza po tekstu na svaki frame, pa ogroman
// paste (vise MB) inace kratko zamrzne karticu. HTML maxlength pokriva tipkanje/paste u polje,
// ovaj guard pokriva i programatski upisan value. 2 milijuna znakova je daleko iznad realnog rada.
const MAX_ZNAKOVA = 2_000_000;

// slice(0, MAX_ZNAKOVA) rezuci po UTF-16 code unit indeksu, ne po code pointu; ako granica
// padne unutar astralnog znaka (npr. zalijepljeni emoji), ostavlja usamljeni visoki surogat
// na kraju (mojibake). Provjeri je li znak na granici visoki surogat (0xD800-0xDBFF) i po potrebi
// rezi jedan znak kraece.
function clampToMaxChars(value: string): string {
  if (value.length <= MAX_ZNAKOVA) return value;
  let end = MAX_ZNAKOVA;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

// Glavni broj (kartice) se glatko odbrojava do nove vrijednosti (serif brojka je fokus panela).
// Cisto vizualno pobojlsanje: poestuje prefers-reduced-motion (tada se broj postavi odmah, bez
// animacije). Jedan rAF loop, retargeta se na svaki render.
const reduceMotion = typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let ktNum: any = null;
let ktRefs = false;
let dispKartice = 0;
let targetKartice = 0;
let ktAnim = 0;
function ktPaint(v: number) {
  if (ktNum) ktNum.textContent = nf2.format(v);
}
function ktTick() {
  const d = targetKartice - dispKartice;
  if (Math.abs(d) < 0.004) { dispKartice = targetKartice; ktAnim = 0; ktPaint(dispKartice); return; }
  dispKartice += d * 0.2;
  ktPaint(dispKartice);
  ktAnim = requestAnimationFrame(ktTick);
}
function animateKartice(target: number) {
  if (!ktRefs) { ktNum = $('#m-kartice'); ktRefs = true; }
  targetKartice = target;
  if (reduceMotion) { dispKartice = target; ktPaint(target); return; }
  ktPaint(dispKartice); // odmah osvjezi (i pri inicijalnom renderu)
  if (!ktAnim) ktAnim = requestAnimationFrame(ktTick);
}

const SAMPLE = `Ovo je primjer teksta koji možeš zamijeniti svojim radom. Zalijepi ovdje uvod, poglavlje ili cijeli rad pa gledaj kako se broj kartica, riječi i znakova mijenja u stvarnom vremenu.

Jedna autorska kartica u hrvatskoj lekturi i prijevodu iznosi 1800 znakova s razmacima. Cijena lekture obično se računa upravo po kartici, pa je ovaj broj koristan kad procjenjuješ trošak i opseg.`;

function readingLabel(minutes: number): string {
  if (!minutes) return '0 min';
  if (minutes < 1) return '< 1 min'; // 1-9 rijeci: iskrenije od "0 min" za neprazan tekst
  return `${nf1.format(minutes)} min`;
}

// Zadnje izracunate metrike: kontrole mjere/cilja/cijene ih recikliraju umjesto da svaka
// promjena tih polja ponovno provlaci cijeli (do 2M znakova) tekst kroz regex prolaze.
let lastMetrics: TextMetrics | null = null;

/** Kartice po trenutno odabranoj mjeri: 1800 s razmacima (zadano) ili 1500 bez razmaka. */
function displayedKartice(m: TextMetrics): number {
  return $('#kt-measure')?.value === '1500'
    ? karticeFrom(m.charsWithoutSpaces, ZNAKOVA_PO_KARTICI_BEZ_RAZMAKA)
    : m.kartice;
}

function measureLabel(): string {
  return $('#kt-measure')?.value === '1500'
    ? `${ZNAKOVA_PO_KARTICI_BEZ_RAZMAKA} znakova bez razmaka`
    : `${ZNAKOVA_PO_KARTICI} znakova s razmacima`;
}

// Cilj (broj kartica) i cijena po kartici: opcionalna polja, racun je cisto klijentski.
// Korisnik sam unosi cilj/cijenu (alat ne izmislja normu fakulteta ni cjenik lektora).
function renderGoalAndPrice(m: TextMetrics) {
  const k = displayedKartice(m);
  const goalLine = $('#kt-goal-line');
  if (goalLine) {
    const goal = parseFloat(String($('#kt-goal')?.value || '').replace(',', '.'));
    if (Number.isFinite(goal) && goal > 0) {
      const diff = Math.round((goal - k) * 100) / 100;
      goalLine.textContent = diff > 0
        ? `Do cilja od ${nf2.format(goal)} kartica nedostaje još ${nf2.format(diff)}.`
        : `Cilj od ${nf2.format(goal)} kartica je dosegnut (${nf2.format(Math.abs(diff))} preko).`;
    } else {
      goalLine.textContent = '';
    }
  }
  const priceLine = $('#kt-price-line');
  if (priceLine) {
    const price = parseFloat(String($('#kt-price')?.value || '').replace(',', '.'));
    if (Number.isFinite(price) && price > 0 && k > 0) {
      const total = Math.round(k * price * 100) / 100;
      priceLine.textContent = `Procjena troška (${nf2.format(k)} kartica × ${nf2.format(price)} EUR): ${nf2.format(total)} EUR.`;
    } else {
      priceLine.textContent = '';
    }
  }
}

function render(text: any) {
  const m = countText(text);
  lastMetrics = m;
  const set = (id: any, v: any) => { const el = $(id); if (el) el.textContent = v; };

  animateKartice(displayedKartice(m)); // glatko odbrojavanje + prsten (umjesto izravnog set)
  set('#m-words', nf.format(m.words));
  set('#m-chars', nf.format(m.charsWithSpaces));
  set('#m-chars-nospace', nf.format(m.charsWithoutSpaces));
  set('#m-sentences', nf.format(m.sentences));
  set('#m-paragraphs', nf.format(m.paragraphs));
  set('#m-pages', nf.format(m.pages));
  set('#m-reading', readingLabel(m.readingMinutes));
  renderGoalAndPrice(m);

  const copyBtn = $('#kt-copy');
  if (copyBtn) copyBtn.disabled = m.charsWithSpaces === 0;
  scheduleSrSummary(m);
  return m;
}

// Najava za citace ekrana: vizualne metrike se osvjezavaju na svaki unos, ali se izgovor
// salje u skriveni aria-live tek nakon pauze u tipkanju, da SR ne brblja na svaki znak.
// srArmed sprijecava "Nema teksta." najavu na POCETNI prazni render (init() prije bilo kakve
// korisnicke radnje) - ta promjena live regije bi citac ekrana najavio ~0.9s nakon ucitavanja
// stranice iako korisnik nista nije napravio. Postavlja se tek u stvarnim korisnickim akcijama.
let srArmed = false;
let _srTimer: any = 0;
// Hrvatsko brojno slaganje: "riječ"/"odlomak" imaju drugi oblik nominativa jednine od
// mnozinskog oblika (za razliku od "kartica"/"rečenica", slucajnih homografa u oba broja),
// pa "1 riječi"/"1 odlomaka" zvuci pogresno. n===1 -> jednina, inace ostaje trenutni oblik.
function hrCount(n: number, singular: string, other: string): string {
  return n === 1 ? singular : other;
}

function scheduleSrSummary(m: any) {
  const live = $('#kt-sr-summary');
  if (!live || !srArmed) return;
  clearTimeout(_srTimer);
  _srTimer = setTimeout(() => {
    live.textContent = m.charsWithSpaces
      ? `${nf2.format(displayedKartice(m))} kartica, ${nf.format(m.words)} ${hrCount(m.words, 'riječ', 'riječi')}, ${nf.format(m.charsWithSpaces)} znakova s razmacima, `
        + `${nf.format(m.charsWithoutSpaces)} bez razmaka, ${nf.format(m.sentences)} rečenica, `
        + `${nf.format(m.paragraphs)} ${hrCount(m.paragraphs, 'odlomak', 'odlomaka')}, ${nf.format(m.pages)} stranica, vrijeme čitanja ${readingLabel(m.readingMinutes)}`
      : 'Nema teksta.';
  }, 900);
}

function summaryText(m: any) {
  return [
    `Kartice (${measureLabel()}): ${nf2.format(displayedKartice(m))}`,
    `Riječi: ${nf.format(m.words)}`,
    `Znakovi s razmacima: ${nf.format(m.charsWithSpaces)}`,
    `Znakovi bez razmaka: ${nf.format(m.charsWithoutSpaces)}`,
    `Rečenice: ${nf.format(m.sentences)}`,
    `Odlomci: ${nf.format(m.paragraphs)}`,
    `Procjena A4 stranica: ${nf.format(m.pages)}`,
    `Procjena vremena čitanja: ${readingLabel(m.readingMinutes)}`,
  ].join('\n');
}

function init() {
  const input = $('#kt-input');
  if (!input) return;

  // Ista ograda kao 'input' listener ispod: DOM vrijednost postavljena izravno (npr. bfcache
  // vracanje sesije) zaobilazi HTML maxlength, pa prvi render mora provjeriti duljinu i sam.
  if (input.value.length > MAX_ZNAKOVA) input.value = clampToMaxChars(input.value);
  render(input.value || '');
  // rAF spajanje: kod brzog tipkanja/velikog pastea rendera se najvise jednom po frameu,
  // umjesto vise punih regex prolaza preko cijelog teksta na svaki keystroke.
  let rafId = 0;
  input.addEventListener('input', () => {
    srArmed = true;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      // Zastita od ogromnog pastea koji bi zamrznuo nit (uz HTML maxlength na polju).
      if (input.value.length > MAX_ZNAKOVA) input.value = clampToMaxChars(input.value);
      render(input.value);
    });
  });

  $('#kt-clear')?.addEventListener('click', () => {
    srArmed = true;
    input.value = '';
    render('');
    input.focus();
  });

  $('#kt-sample')?.addEventListener('click', () => {
    srArmed = true;
    input.value = SAMPLE;
    render(input.value);
    input.focus();
  });

  // Mjera/cilj/cijena: recikliraju lastMetrics (bez ponovnog brojanja cijelog teksta).
  $('#kt-measure')?.addEventListener('change', () => {
    if (!lastMetrics) return;
    srArmed = true;
    const hint = $('#kt-measure-hint');
    if (hint) hint.textContent = measureLabel();
    animateKartice(displayedKartice(lastMetrics));
    renderGoalAndPrice(lastMetrics);
    scheduleSrSummary(lastMetrics);
  });
  for (const id of ['#kt-goal', '#kt-price']) {
    $(id)?.addEventListener('input', () => { if (lastMetrics) renderGoalAndPrice(lastMetrics); });
  }

  // .docx uvoz: sve LOKALNO (isti hardening ZipReader kao analiza, lazy da pocetni chunk
  // ostane lagan; docx-text cita samo vidljivi tekst glavnog dokumenta, bez fusnota).
  const docxStatus = (msg: string, warn = false) => {
    const el = $('#kt-docx-status');
    if (el) { el.textContent = msg; el.className = warn ? 'out-hint warn' : 'out-hint ok'; }
  };
  async function importDocx(file: File | null | undefined) {
    if (!file) return;
    srArmed = true;
    if (!/\.docx$/i.test(file.name)) { docxStatus('Podržan je samo .docx (Word) format.', true); return; }
    try {
      const buffer = await file.arrayBuffer();
      const magic = new Uint8Array(buffer.slice(0, 2));
      if (magic[0] !== 0x50 || magic[1] !== 0x4b) { docxStatus('Datoteka nije valjana .docx (Word) datoteka.', true); return; }
      const { ZipReader } = await import('../docx/parser');
      const zr = new ZipReader(buffer);
      const xmlBytes = await zr.data('word/document.xml');
      if (!xmlBytes) { docxStatus('U datoteci nema glavnog dokumenta (word/document.xml).', true); return; }
      const text = extractDocxText(new TextDecoder().decode(xmlBytes));
      if (!text.trim()) { docxStatus('Iz dokumenta nije pročitan nikakav tekst.', true); return; }
      input.value = clampToMaxChars(text);
      render(input.value);
      docxStatus(`Učitano: ${file.name}. Broji se tekst glavnog dokumenta (bez fusnota i zaglavlja). Ništa nije poslano s uređaja.`);
    } catch (err: any) {
      docxStatus(err?.message || 'Čitanje .docx datoteke nije uspjelo.', true);
    }
  }
  const fileInput = $('#kt-file');
  fileInput?.addEventListener('change', () => { void importDocx(fileInput.files?.[0]); fileInput.value = ''; });
  // Drag & drop na polje za tekst: .docx se ucita umjesto da preglednik otvori datoteku.
  input.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); input.classList.add('kt-drop'); });
  input.addEventListener('dragleave', () => input.classList.remove('kt-drop'));
  input.addEventListener('drop', (e: DragEvent) => {
    const f = e.dataTransfer?.files?.[0];
    if (f && /\.docx$/i.test(f.name)) { e.preventDefault(); input.classList.remove('kt-drop'); void importDocx(f); }
    else input.classList.remove('kt-drop'); // obican tekst-drop ostavljamo pregledniku (paste ponasanje)
  });

  // Default fallback poruka ("oznaci pa Ctrl+C") pretpostavlja vidljiv blok teksta identican
  // onome sto se kopira; ovdje summaryText() ide ISKLJUCIVO u međuspremnik, brojke na stranici
  // su razbacane po zasebnim <dd> elementima. Custom poruka upucuje na stvarno dostupnu radnju.
  bindCopyButton($('#kt-copy'), () => {
    const m = countText(input.value || '');
    return m.charsWithSpaces ? summaryText(m) : '';
  }, {
    statusEl: $('#kt-copy-status'),
    okStatus: 'Sažetak kopiran u međuspremnik.',
    failLabel: 'Očitaj brojke ispod',
    failStatus: 'Kopiranje nije uspjelo. Brojke su prikazane u tablici ispod, prepiši ih ručno.',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
