// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ensureFacultySpecsLoaded } from '../src/citations/faculty-styles';

// ui-boot uvlaci fontove/ikone/motion (nebitno za logiku) - mockaj da test ostane cist.
vi.mock('../src/shared/ui-boot', () => ({}));
vi.mock('../src/tools/tool-analytics', () => ({ trackToolEvent: async () => false }));

const TYPES = ['knjiga', 'poglavlje', 'clanak', 'mrezni', 'zavrsni', 'propis'];
const FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

function buildDom(): void {
  document.body.innerHTML = `
    <select id="f-faculty"><option value="">Bez fakulteta</option></select>
    <p id="f-style-info" hidden></p>
    <button id="tab-single" class="active"></button>
    <button id="tab-bulk"></button>
    <div id="panel-single">
      <select id="f-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
      <select id="f-style"><option value="autor-godina">Autor-godina</option><option value="fusnota">Fusnota</option></select>
      ${FIELDS.map((k) => `<div data-field="${k}"><input id="f-${k}"></div>`).join('')}
      <p id="f-authors-preview" hidden></p>
      <div id="out" class="empty"></div>
      <div id="out-hint"></div>
      <button id="copyBtn"></button>
      <p id="c-success-cta"></p>
      <a id="c-success-cta-link" href="index.html#analyzer"></a>
      <div id="out-intext" hidden><span id="intextValue"></span></div>
      <button id="copyIntextBtn"></button>
      <button id="c-add-to-bulk" disabled></button>
      <button id="c-sample"></button>
      <button id="c-clear"></button>
    </div>
    <div id="panel-bulk" hidden>
      <select id="bulk-style"><option value="auto">Auto</option><option value="apa">APA</option><option value="vancouver">Vancouver</option><option value="ieee">IEEE</option><option value="chicago">Chicago</option></select>
      <textarea id="bulk-input"></textarea>
      <button id="bulk-parse"></button>
      <div id="bulk-entries"></div>
      <button id="bulk-generate" hidden></button>
      <div id="bulk-output"></div>
      <button id="bulk-copy" hidden></button>
    </div>`;
}

const $ = (s: string): any => document.querySelector(s);
function setVal(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function fireChange(id: string, v: string) { const el = $(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }

describe('citat-page: izbornik fakulteta + bulk (DOM)', () => {
  beforeAll(async () => {
    buildDom();
    await import('../src/tools/citat-page'); // init() se okine na import (readyState !== loading)
    // Puni specovi (custom-spec formatFromSpec) su lijeno ucitani (perf split); eksplicitno
    // pricekaj umjesto oslanjanja na mikrotaskove izmedju testova (isti obrazac kao
    // naslovnica-page.dom.test.ts + ensureTemplatesHeavy).
    await ensureFacultySpecsLoaded();
  });

  it('izbornik fakulteta se napuni (grupe + fakulteti)', () => {
    const fac = $('#f-faculty');
    expect(fac.querySelectorAll('optgroup').length).toBeGreaterThan(10);
    expect(fac.querySelectorAll('option[value]:not([value=""])').length).toBeGreaterThanOrEqual(55);
    expect(fac.querySelector('option[value="efos"]')).toBeTruthy();
  });

  it('odabir fakulteta ucita njegov stil u #f-style + prikaze provenijenciju', () => {
    fireChange('#f-faculty', 'efos');
    expect($('#f-style').querySelector('option[value="0"]')).toBeTruthy();
    expect($('#f-style-info').hidden).toBe(false);
    expect($('#f-style-info').textContent).toMatch(/sluzbenim uputama|službenim uputama/i);
  });

  it('render koristi vjeran fakultetski format (efos knjiga)', () => {
    setVal('#f-type', 'knjiga');
    setVal('#f-authors', 'Milas, G.');
    setVal('#f-title', 'Istraživačke metode u psihologiji');
    setVal('#f-year', '2009');
    setVal('#f-place', 'Zagreb');
    setVal('#f-publisher', 'Naklada Slap');
    expect($('#out').textContent).toContain('Milas, G. (2009)');
    expect($('#out').textContent).toContain('Naklada Slap');
  });

  it('B4: success-cta se pokaze uz gotov citat i nosi ?unit= odabranog fakulteta', () => {
    expect($('#c-success-cta').classList.contains('is-visible')).toBe(true);
    // Fakultet je 'efos' iz prethodnog testa ("odabir fakulteta ucita njegov stil").
    expect($('#c-success-cta-link').getAttribute('href')).toBe('index.html?unit=efos#analyzer');
  });

  it('B4: prazan unos sakrije success-cta', () => {
    // EFOS-format (aktivan od prethodnog testa) na SAM prazan tekst zna ispisati fiksnu
    // interpunkciju umjesto praznog stringa; vrati na genericki mod (isto sto "Bez fakulteta"
    // test dalje dolje ionako radi) da prazna polja stvarno daju prazan citat.
    fireChange('#f-faculty', '');
    setVal('#f-authors', '');
    setVal('#f-title', '');
    setVal('#f-year', '');
    setVal('#f-place', '');
    setVal('#f-publisher', '');
    expect($('#c-success-cta').classList.contains('is-visible')).toBe(false);
  });

  it('BUG: "Mrezni izvor" prikazuje polje za godinu (SOURCE_TYPE_FIELDS.mrezni ukljucuje year)', () => {
    // Regresija: godina je bila izostavljena iz popisa polja za mrezni tip, pa se
    // #f-year red skrivao i autor-godina stil je tiho ispisivao "(n.d.)"/"(bez dat.)"
    // iako je korisnik znao tocan datum.
    fireChange('#f-type', 'mrezni');
    const row = document.querySelector('[data-field="year"]') as HTMLElement;
    expect(row.style.display).not.toBe('none');
    fireChange('#f-type', 'knjiga'); // ne ostavljaj tip promijenjen za naredne testove
  });

  it('povratak na "Bez fakulteta" vrati genericki izbor stila', () => {
    fireChange('#f-faculty', '');
    expect($('#f-style').querySelector('option[value="autor-godina"]')).toBeTruthy();
    // #f-style-info OSTAJE vidljiv i u generickom modu: to je jedini indikator koji stil
    // se stvarno koristi, i vrijedi za oba taba (#f-style zivi samo unutar panel-single,
    // skrivenog na bulk tabu).
    expect($('#f-style-info').hidden).toBe(false);
    expect($('#f-style-info').textContent).toMatch(/Autor-godina/i);
  });

  it('tab prebacuje na "Cijela literatura"', () => {
    $('#tab-bulk').click();
    expect($('#panel-bulk').hidden).toBe(false);
    expect($('#panel-single').hidden).toBe(true);
  });

  it('stil ostaje vidljiv i na bulk tabu (isti stil formatira bulk izlaz)', () => {
    expect($('#panel-bulk').hidden).toBe(false);
    expect($('#f-style-info').hidden).toBe(false);
  });

  it('bulk: zalijepi -> prepoznaj -> editabilne kartice po referenci', () => {
    $('#bulk-input').value = 'Kovačić, I. (2020). Naslov knjige. Zagreb: Naklada.\n\nHorvat, A. (2019). Drugi naslov. Zagreb: Druga naklada.';
    $('#bulk-parse').click();
    const cards = $('#bulk-entries').querySelectorAll('.bulk-card');
    expect(cards.length).toBe(2);
    // svaka kartica ima <select vrste> + bar jedno polje
    expect(cards[0].querySelector('.card-type')).toBeTruthy();
    expect(cards[0].querySelectorAll('input[data-key]').length).toBeGreaterThan(0);
    expect($('#bulk-generate').hidden).toBe(false);
  });

  it('bulk: generiraj -> sortirana literatura (2 retka) + copy vidljiv', () => {
    $('#bulk-generate').click();
    const result = $('#bulk-result');
    expect(result).toBeTruthy();
    const lines = result.value.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect($('#bulk-copy').hidden).toBe(false);
  });

  it('bulk: ručni izbor stila (IEEE) prepoznaje inicijale-prije-prezimena', () => {
    fireChange('#bulk-style', 'ieee');
    $('#bulk-input').value = 'J. Smith and A. Jones, "Deep learning," IEEE Trans. Med. Imag., vol. 39, no. 5, pp. 12-20, 2020.';
    $('#bulk-parse').click();
    const card = $('#bulk-entries').querySelector('.bulk-card');
    expect(card).toBeTruthy();
    const authors = card.querySelector('input[data-key="authors"]');
    expect(authors.value).toContain('Smith, J.');
    expect(authors.value).toContain('Jones, A.');
  });

  it('ziva linija ispod Autor(i) pokazuje kako je unos rasclanjen (parseAuthors uvid)', () => {
    $('#tab-single').click();
    setVal('#f-authors', 'Ivić, Ivan; Horvat, Ana');
    const line = $('#f-authors-preview');
    expect(line.hidden).toBe(false);
    expect(line.textContent).toContain('Prepoznato (2)');
    expect(line.textContent).toContain('Ivić, Ivan');
    expect(line.textContent).toContain('Horvat, Ana');
    setVal('#f-authors', '');
    expect(line.hidden).toBe(true);
  });

  it('most single->bulk: "+ Dodaj u popis" gura trenutni unos kao novu bulk karticu', () => {
    // Ocisti bulk stanje od prethodnih testova pa dodaj iz jednog izvora.
    $('#bulk-input').value = '';
    $('#bulk-parse').click();
    expect($('#bulk-entries').querySelectorAll('.bulk-card').length).toBe(0);

    setVal('#f-type', 'knjiga');
    setVal('#f-authors', 'Kovačić, Iva');
    setVal('#f-title', 'Naslov iz jednog izvora');
    setVal('#f-year', '2021');
    expect($('#c-add-to-bulk').disabled).toBe(false);
    $('#c-add-to-bulk').click();

    const cards = $('#bulk-entries').querySelectorAll('.bulk-card');
    expect(cards.length).toBe(1);
    const title = cards[0].querySelector('input[data-key="title"]');
    expect(title.value).toBe('Naslov iz jednog izvora');
    expect($('#bulk-generate').hidden).toBe(false);
    expect($('#tab-bulk').textContent).toContain('(1)');

    // Dodana kartica prolazi kroz postojeci generateBulk mehanizam.
    $('#bulk-generate').click();
    expect($('#bulk-result').value).toContain('Kovačić');
  });

  it('prazan unos onemogucuje "+ Dodaj u popis" (kao i copy)', () => {
    $('#c-clear').click();
    expect($('#c-add-to-bulk').disabled).toBe(true);
  });
});

describe('citat-page: migracija lekta.citat-faculty -> lekta.faculty-context (B2)', () => {
  // Odvojen describe (zadnji u datoteci): treba SVJEZ modul (vi.resetModules) uz
  // pred-postavljen stari kljuc PRIJE importa, isti razlog zasto kartice-page-guard.dom.test.ts
  // ne dijeli beforeAll s ostatkom - init() cita storage samo jednom, pri ucitavanju.
  it('stari kljuc pred-popuni #f-faculty na init() i migrira se na novi kljuc', async () => {
    localStorage.clear();
    localStorage.setItem('lekta.citat-faculty', 'efos');
    vi.resetModules();
    buildDom();

    await import('../src/tools/citat-page');
    await ensureFacultySpecsLoaded();

    expect($('#f-faculty').value).toBe('efos');
    expect(localStorage.getItem('lekta.citat-faculty')).toBeNull();
    expect(JSON.parse(localStorage.getItem('lekta.faculty-context')!)).toEqual({ unitId: 'efos' });
  });
});
