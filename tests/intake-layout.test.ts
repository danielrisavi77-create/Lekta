/**
 * Z7: ULAZNI EKRAN `/` PO PREDLOSKU (design/handoff/ALIGNMENT.md, odjeljak Z7).
 *
 * Papir je preslozen u OBRAZAC: zaglavlje s brojem lista, pecat stanja, veci naslov, tri koraka
 * postupka, sitni otisak u podnozju, mono gumb i jedan mono redak ispod papira. Preuzet je samo
 * RASPORED predloska; odlukom vlasnika (opcija b) obitelji ostaju Newsreader / Inter Tight /
 * IBM Plex Mono, a `Instrument Serif` i `Geist Mono` iz predloska se NE uvode.
 *
 * TRI RAZINE, ODVOJENO:
 *   1. MARKUP: postoji li svaki od sedam elemenata i nosi li DOSLOVAN tekst, s dijakritikom.
 *      Tekst se cita iz stvarnog `index.html` kroz happy-dom, ne regexom, jer je predmet tvrdnje
 *      ono sto korisnik vidi, a ne kako je zapisano.
 *   2. CSS: nijedna nova obitelj (samo tri tokena), nijedan `border-left` deblji od hairlinea,
 *      pecat bez animacije. Mutacija: podmetnut `Instrument Serif` mora pasti.
 *   3. BROJ LISTA: mjeri se IZVODJENJEM nad pohranom, u tri stanja. Jedan sretan slucaj ne bi
 *      razlikovao ispravan izracun od konstante.
 *
 * Citanje s diska normalizira CR: repo ima `core.autocrlf` (CLAUDE.md), pa ista datoteka iz istog
 * commita ima dvije velicine ovisno o tome kako je stablo materijalizirano.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ulazniListBroj, prikaziUlazniListBroj } from '../src/routes/intake/list-number';
import { STORAGE_KEYS } from '../src/shared/browser-storage';

const ROOT = resolve(__dirname, '..');
const read = (f: string): string => readFileSync(resolve(ROOT, f), 'utf8').replace(/\r/g, '');

const HTML = read('index.html');
const CSS = read('src/routes/intake/intake.css');

/**
 * KOMENTARI NISU KOD, i to je u ovom repozitoriju vec izmjereno (gard nad UX specovima prijavljivao
 * je FANTOM zbog biljeske koja opisuje samo pravilo; isto za graf modula, gdje su uvozi u
 * komentarima davali 17 ciklusa kojih je stvarnih bilo nula). Tvrdnje o ODSUTNOSTI stare oznake
 * zato gledaju markup i stil BEZ komentara: obrazlozenje smije imenovati ono sto je uklonjeno.
 */
const bezHtmlKomentara = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, ' ');
const bezCssKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Stvarni markup ulaza u happy-dom-u, bez `<script>` oznaka (module loader ih odbija). */
function ulaz(): Document {
  const tijelo = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>'));
  const markup = tijelo.slice(tijelo.indexOf('>') + 1).replace(/<script[\s\S]*?<\/script>/g, '');
  const doc = document.implementation.createHTMLDocument('ulaz');
  doc.body.innerHTML = markup;
  return doc;
}

/** Vidljivi tekst elementa, s razmacima svedenim na jedan: prijelomi retka nisu ugovor. */
const tekst = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Z7 papir ulaza: sedam elemenata predloska', () => {
  const doc = ulaz();

  it('zaglavlje obrasca nosi knjigu lijevo, broj i stanje desno', () => {
    const zaglavlje = doc.querySelector('.intake-zaglavlje');
    expect(zaglavlje, 'nema zaglavlja obrasca').not.toBeNull();
    const polja = [...zaglavlje!.children].map((el) => tekst(el));
    expect(polja).toEqual(['Lekta · Ulazni list', 'Nº 0001 · Nepregledano']);
    // Pocetna vrijednost je u HTML-u, pa stranica bez JS-a nije prazna niti trzne redak.
    expect(tekst(doc.querySelector('[data-intake-list-broj]'))).toBe('0001');
  });

  it('pecat je DEKORATIVAN: aria-hidden, bez uloge i bez fokusa', () => {
    const pecat = doc.querySelector('.intake-pecat');
    expect(pecat, 'nema pecata').not.toBeNull();
    expect(tekst(pecat)).toBe('Čeka provjeru');
    // Tekst je u markupu pisan malim slovima, a velika slova radi CSS (`text-transform`), kao u
    // predlosku. Gard mjeri oboje, da se ne izgubi ni tekst ni njegov izgled.
    expect(CSS).toMatch(/\.intake-pecat\{[^}]*text-transform:uppercase/);
    expect(pecat!.getAttribute('aria-hidden')).toBe('true');
    expect(pecat!.hasAttribute('role')).toBe(false);
    expect(pecat!.hasAttribute('tabindex')).toBe(false);
    // Znacenje "jos nije pregledano" vec nosi zaglavlje, pa citac ekrana ne gubi nista.
    expect(tekst(doc.querySelector('.intake-zaglavlje'))).toContain('Nepregledano');
  });

  it('naslov je i dalje jedan H1, s lokalnim Z7 predefiniranjem velicine', () => {
    const naslovi = [...doc.querySelectorAll('h1')];
    expect(naslovi).toHaveLength(1);
    expect(tekst(naslovi[0])).toBe('Ubaci rad.');
    expect(naslovi[0].id).toBe('intakeTitle');
    expect(CSS).toMatch(/\.intake-title\{[^}]*font-size:clamp\(40px,7vw,120px\)/);
    expect(CSS).toMatch(/\.intake-title\{[^}]*line-height:\.92/);
    expect(CSS).toMatch(/\.intake-title\{[^}]*letter-spacing:-\.02em/);
    // Z5 token se NE dira: mijenjao bi svaku drugu rutu.
    expect(CSS, 'ljestvica se ne smije redefinirati u pilot listu').not.toMatch(/--fs-display\s*:/);
  });

  it('tri koraka nose DOSLOVNE tekstove predloska, redom 01/02/03', () => {
    const stavke = [...doc.querySelectorAll('.intake-koraci li')];
    expect(stavke).toHaveLength(3);
    expect(stavke.map((li) => tekst(li.querySelector('.intake-korak-br')))).toEqual(['01', '02', '03']);
    expect(stavke.map((li) => tekst(li.querySelector('.intake-korak-t')))).toEqual([
      'Ubaciš .docx. Ne treba prijava.',
      'Provjera radi u tvom pregledniku. Dokument ne odlazi.',
      'Dobiješ ocjenu i popis što popraviti prije predaje.',
    ]);
    // Koraci su NA papiru (unutar poziva), ne ispod njega: obecanje "dokument ne odlazi" vrijedi
    // samo ako ga korisnik procita prije nego klikne.
    expect(doc.querySelector('.intake-poziv .intake-koraci'), 'koraci su ispali s papira').not.toBeNull();
  });

  it('podnozje papira ZAMJENJUJE bravu, s obje polovice obecanja', () => {
    const foot = doc.querySelector('[data-intake-foot]');
    expect(foot, 'nema podnozja papira').not.toBeNull();
    expect([...foot!.children].map((el) => tekst(el)))
      .toEqual(['Dokument ostaje na uređaju', 'Provjeravamo formu, ne sadržaj']);
    // Stari oblik mora NESTATI, i iz markupa i iz stila; inace se vrati kao "bezopasan ostatak".
    expect(bezHtmlKomentara(HTML), '.intake-brava je ostala u markupu').not.toContain('intake-brava');
    expect(bezCssKomentara(CSS), '.intake-brava je ostala u stilu').not.toContain('.intake-brava');
    // BASELINE: gard mjeri markup, ne datoteku; obrazlozenje uz uklanjanje smije spomenuti ime.
    expect(HTML, 'obrazlozenje uklanjanja je nestalo iz markupa').toContain('intake-brava');
  });

  it('CTA je mono, na papirnatom gumbu, uz uputu za ispustanje u istom retku', () => {
    const cta = doc.querySelector('.intake-cta');
    expect(cta, 'nema CTA-a').not.toBeNull();
    expect(tekst(cta)).toBe('Odaberi .docx');
    expect(tekst(doc.querySelector('.intake-hint'))).toBe('ili ispusti dokument ovdje');
    // Isti redak: oboje su ista radnja izvedena na dva nacina.
    const akcija = doc.querySelector('.intake-akcija');
    expect(akcija, 'nema retka radnje').not.toBeNull();
    expect(akcija!.querySelector('.intake-cta')).not.toBeNull();
    expect(akcija!.querySelector('.intake-hint')).not.toBeNull();
    expect(CSS).toMatch(/\.intake-cta\{[^}]*font-family:var\(--mono\)/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*font-size:14px/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*letter-spacing:\.02em/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*border-radius:var\(--radius-btn-lg\)/);
  });

  it('ispod papira stoji JEDAN mono redak, s granicom uploada i s "Kako radi?"', () => {
    const meta = doc.getElementById('intakeMeta');
    expect(meta, 'nema retka ispod papira').not.toBeNull();
    expect(tekst(meta)).toBe('.docx · do dopuštene veličine · bez prijave · Kako radi?');
    // Granica uploada OSTAJE (predlozak je nije imao jer ne zna za uredajno ovisan iznos).
    expect(meta!.querySelector('[data-upload-limit]')).not.toBeNull();
    expect(meta!.querySelector('a[href="/saznaj-vise/#how"]')).not.toBeNull();
    // Dva odvojena retka spojena su u jedan: stari `.intake-links` vise ne postoji.
    expect(bezHtmlKomentara(HTML)).not.toContain('intake-links');
    expect(bezCssKomentara(CSS)).not.toContain('.intake-links');
    expect(CSS).toMatch(/\.intake-meta\{[^}]*font-family:var\(--mono\)/);
  });
});

/**
 * TIPOGRAFIJA I OBLIK: gard nad ODSUTNOSCU.
 *
 * Odluka vlasnika za Z7 je opcija (b): predlozak se preuzima kao raspored, pisma ostaju. Novo ime
 * obitelji je tiho (CSS ne prijavljuje ni nepostojeci token ni obitelj bez `@font-face`), pa se
 * mjeri popis SVIH `font-family` vrijednosti u listu, a ne prisutnost jednog imena.
 */
describe('Z7 intake.css: nijedna nova obitelj, nijedan obojeni rub', () => {
  /** Svaka `font-family` vrijednost u listu, normalizirana. `font:` kraticu ovaj list ne koristi. */
  function obitelji(css: string): string[] {
    const nalazi = [...bezCssKomentara(css).matchAll(/font-family\s*:\s*([^;}]+)/g)]
      .map((m) => m[1].trim());
    return [...new Set(nalazi)].sort();
  }

  /** `border-left` deklaracije koje NISU hairline od 1px (design/README.md, tvrdo pravilo boje 3). */
  function debeliLijeviRubovi(css: string): string[] {
    return [...bezCssKomentara(css).matchAll(/border-left\s*:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^1px\b/.test(v));
  }

  it('sve obitelji dolaze iz tri tokena, nijedna nije upisana imenom', () => {
    expect(obitelji(CSS)).toEqual(['var(--display-serif)', 'var(--mono)', 'var(--ui)']);
  });

  it('MUTACIJA: podmetnut `Instrument Serif` pada, a zamjena tokena prolazi', () => {
    // BASELINE: nemutiran list je cist, inace bi "prolazio" i gard koji vristi na sve.
    expect(obitelji('.a{font-family:var(--ui)}'), 'baseline mora biti cist').toEqual(['var(--ui)']);
    const podmetnut = CSS.replace('font-family:var(--display-serif)', "font-family:'Instrument Serif',serif");
    expect(podmetnut, 'podmetanje se nije primilo; provjeri oznaku').not.toBe(CSS);
    expect(obitelji(podmetnut)).toContain("'Instrument Serif',serif");
    expect(obitelji(podmetnut)).not.toEqual(['var(--display-serif)', 'var(--mono)', 'var(--ui)']);
    // Isto vrijedi za drugu polovicu predloska (`Geist Mono`), da gard ne cuva samo jedno ime.
    expect(obitelji(CSS.replace('font-family:var(--mono)', "font-family:'Geist Mono',monospace")))
      .toContain("'Geist Mono',monospace");
    // KONTROLA SMJERA: zamjena JEDNOG tokena DRUGIM tokenom nije nalaz, pa gard ne zabranjuje
    // legitimno preslagivanje glasova.
    expect(obitelji('.a{font-family:var(--mono)}.b{font-family:var(--ui)}'))
      .toEqual(['var(--mono)', 'var(--ui)']);
  });

  it('nijedan `border-left` osim hairlinea od 1px', () => {
    expect(debeliLijeviRubovi(CSS)).toEqual([]);
    // MUTACIJA: obojeni rub po tonu je tocno ono sto design/README.md zabranjuje.
    expect(debeliLijeviRubovi('.a{border-left:3px solid var(--red)}'))
      .toEqual(['3px solid var(--red)']);
    // BASELINE: hairline ostaje dopusten.
    expect(debeliLijeviRubovi('.a{border-left:1px solid var(--paper-line)}')).toEqual([]);
  });

  it('pecat je STATICAN: ne uvodi ni animaciju ni prijelaz', () => {
    const blok = bezCssKomentara(CSS).match(/\.intake-pecat\{[^}]*\}/)?.[0] ?? '';
    expect(blok, 'nema pravila za pecat').not.toBe('');
    expect(blok).not.toMatch(/animation|transition/);
    expect(blok).toContain('pointer-events:none');
    expect(blok).toContain('transform:rotate(-9deg)');
    expect(blok).toContain('border:2.5px solid var(--red)');
    expect(blok).toContain('border-radius:2px');
    // Tekst pecata ide na tamniji par (kontrast >= 4,5), okvir smije ostati na brand crvenoj.
    expect(blok).toContain('color:var(--red-on-soft)');
  });
});

/**
 * BROJ LISTA SE MJERI NAD POHRANOM, U TRI STANJA.
 *
 * Jedan sretan slucaj ne razlikuje izracun od konstante: prazna pohrana i pokvaren zapis daju ISTI
 * ishod ("0001"), pa tek treci slucaj (dvanaest zapisa) dokazuje da se uopce broji.
 */
describe('Z7 broj ulaznog lista', () => {
  beforeEach(() => { localStorage.clear(); });

  it('prazna pohrana daje 0001', () => {
    expect(ulazniListBroj()).toBe('0001');
  });

  it('dvanaest zapisa daje 0013', () => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: i }))));
    expect(ulazniListBroj()).toBe('0013');
  });

  it('pokvaren JSON ne baca nego daje 0001', () => {
    localStorage.setItem(STORAGE_KEYS.history, '{ovo nije json');
    expect(() => ulazniListBroj()).not.toThrow();
    expect(ulazniListBroj()).toBe('0001');
  });

  it('zapis koji NIJE polje takodjer daje 0001', () => {
    // Pohrana je tudji prostor: stari ili rucno izmijenjen zapis ne smije srusiti ulaz.
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify({ nije: 'polje' }));
    expect(ulazniListBroj()).toBe('0001');
  });

  it('upisuje se u zaglavlje stvarnog markupa, i to samo ondje', () => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: i }))));
    const doc = ulaz();
    expect(tekst(doc.querySelector('[data-intake-list-broj]')), 'baseline: HTML nosi 0001').toBe('0001');
    prikaziUlazniListBroj(doc);
    expect(tekst(doc.querySelector('[data-intake-list-broj]'))).toBe('0013');
    // Ostatak zaglavlja se NE dira: mijenja se broj, ne natpis.
    expect(tekst(doc.querySelector('.intake-zaglavlje'))).toBe('Lekta · Ulazni list Nº 0013 · Nepregledano');
  });

  it('markup bez polja za broj ne baca (stranica bez zaglavlja i dalje radi)', () => {
    const prazan = document.implementation.createHTMLDocument('prazno');
    expect(() => prikaziUlazniListBroj(prazan)).not.toThrow();
  });
});
