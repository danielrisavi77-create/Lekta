/**
 * Z7: ULAZNI EKRAN `/` PO PREDLOSKU (design/handoff/ALIGNMENT.md, odjeljak Z7).
 *
 * Papir je preslozen u OBRAZAC: zaglavlje s brojem lista, pecat stanja, veci naslov, tri koraka
 * postupka, sitni otisak u podnozju, gumb po mjeri predloska i jedan redak ispod papira. Preuzet
 * je samo RASPORED predloska; odlukom vlasnika (opcija b) ulaz zadrzava svoja DVA glasa
 * (Newsreader govori, Inter Tight oznacava), a `Instrument Serif` i `Geist Mono` se NE uvode.
 *
 * TRECI GLAS NIJE DODAN, i to je ishod pregleda. Prvi prolaz Z7 je mete koje `design/README.md`
 * drzi podatkovnima (broj lista, oznake, pecat, brojevi koraka) crtao `var(--mono)`-om i uz to na
 * ulaz dovukao IBM Plex Mono kao webfont, a gard o dva glasa prosirio na tri. Nalog to izricito
 * zabranjuje ("NE dodaj nikakav webfont"), pa su i font i token uklonjeni: mete se grade mjerom
 * (11px), razmakom slova i rezom. Gard nad ulazom ostaje `tests/entry-fonts.test.ts`.
 *
 * TRI RAZINE, ODVOJENO:
 *   1. MARKUP: postoji li svaki od sedam elemenata i nosi li DOSLOVAN tekst, s dijakritikom, te
 *      ima li papir kao gumb IZRECENO pristupacno ime. Tekst se cita iz stvarnog `index.html`
 *      kroz happy-dom, ne regexom, jer je predmet tvrdnje ono sto korisnik vidi.
 *   2. CSS: nijedna nova obitelj (samo dva tokena), nijedan lijevi rub deblji od hairlinea, pecat
 *      bez animacije i U TOKU. Mutacije: podmetnut `Instrument Serif` mora pasti u OBA zapisa
 *      (`font-family:` i kratica `font:`), a deblji rub i pod imenima `-width` i `inline-start`.
 *   3. BROJ LISTA: mjeri se IZVODJENJEM nad pohranom, u tri stanja, uz zasebnu tvrdnju o tome
 *      CIJI je to broj. Jedan sretan slucaj ne bi razlikovao ispravan izracun od konstante.
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

  it('CTA nosi MJERU predloska (14px, .02em), ali postojeci glas', () => {
    const cta = doc.querySelector('.intake-cta');
    expect(cta, 'nema CTA-a').not.toBeNull();
    expect(tekst(cta)).toBe('Odaberi .docx');
    expect(tekst(doc.querySelector('.intake-hint'))).toBe('ili ispusti dokument ovdje');
    // Isti redak: oboje su ista radnja izvedena na dva nacina.
    const akcija = doc.querySelector('.intake-akcija');
    expect(akcija, 'nema retka radnje').not.toBeNull();
    expect(akcija!.querySelector('.intake-cta')).not.toBeNull();
    expect(akcija!.querySelector('.intake-hint')).not.toBeNull();
    // GLAS JE `--ui`, NE `--mono`. Predlozak natpis crta monoom, ali nalog Z7 zabranjuje dodavanje
    // webfonta, a ulaz mono ne ucitava; `var(--mono)` bi ovdje pao na sustavni `ui-monospace`.
    // Preuzeta je mjera predloska, ne pismo.
    expect(CSS).toMatch(/\.intake-cta\{[^}]*font-family:var\(--ui\)/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*font-size:14px/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*letter-spacing:\.02em/);
    expect(CSS).toMatch(/\.intake-cta\{[^}]*border-radius:var\(--radius-btn-lg\)/);
  });

  it('ispod papira stoji JEDAN redak, s granicom uploada i s "Kako radi?"', () => {
    const meta = doc.getElementById('intakeMeta');
    expect(meta, 'nema retka ispod papira').not.toBeNull();
    expect(tekst(meta)).toBe('.docx · do dopuštene veličine · bez prijave · Kako radi?');
    // Granica uploada OSTAJE (predlozak je nije imao jer ne zna za uredajno ovisan iznos).
    expect(meta!.querySelector('[data-upload-limit]')).not.toBeNull();
    expect(meta!.querySelector('a[href="/saznaj-vise/#how"]')).not.toBeNull();
    // Dva odvojena retka spojena su u jedan: stari `.intake-links` vise ne postoji.
    expect(bezHtmlKomentara(HTML)).not.toContain('intake-links');
    expect(bezCssKomentara(CSS)).not.toContain('.intake-links');
    expect(CSS).toMatch(/\.intake-meta\{[^}]*font-family:var\(--ui\)/);
  });

  it('papir kao gumb ima IZRECENO ime, ne skupljeno iz sadrzaja', () => {
    // `role="button"` po accname racuna ime iz potomaka. Z7 je na papir dodao zaglavlje, tri pune
    // recenice koraka i podnozje, pa bi citac ekrana pri svakom fokusu izgovorio ~55 rijeci kao
    // IME JEDNOG GUMBA. `aria-label` prekida to racunanje.
    const dz = doc.getElementById('intakeDropzone');
    expect(dz, 'nema papira kao gumba').not.toBeNull();
    expect(dz!.getAttribute('role')).toBe('button');
    const ime = dz!.getAttribute('aria-label') ?? '';
    expect(ime, 'papir kao gumb nema izreceno ime').not.toBe('');
    // JEDNA RADNJA, JEDNO IME: gornja granica je mjera, ne ukus. Sadrzaj papira je ~55 rijeci, pa
    // bilo koja vrijednost ispod dvadesetak rijeci dokazuje da ime NIJE skupljeno iz njega.
    expect(ime.split(/\s+/).length, `ime gumba je predugo: "${ime}"`).toBeLessThanOrEqual(12);
    // Tekst koraka i podnozja NE smije biti dio imena.
    for (const dio of ['Ne treba prijava', 'Dokument ne odlazi', 'Provjeravamo formu']) {
      expect(ime, `ime gumba je pokupilo sadrzaj papira: ${dio}`).not.toContain(dio);
    }
    // Ime mora govoriti o radnji koja se izvodi klikom, inace je krace ali netocno.
    expect(ime.toLowerCase()).toContain('.docx');
    // KONTROLA: sadrzaj papira i dalje STOJI, samo vise nije natpis gumba.
    expect(tekst(doc.querySelector('.intake-koraci'))).toContain('Ne treba prijava');
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
  /**
   * Tokeni vrijednosti, razdvojeni razmakom IZVAN zagrada.
   *
   * Rucni obilazak, ne regex: `var(--fs-kicker)/1.3` i `color-mix(in srgb, a 10%, b)` nose i
   * razmake i kose crte unutar zagrada, a ovaj repozitorij ima izmjeren razred kvara u kojem se
   * escape izgubi pri gradnji regexa kroz alat (CLAUDE.md, gard nad `git commit`). Brojanje
   * dubine tu zamku nema.
   */
  function tokeni(vrijednost: string): string[] {
    const out: string[] = [];
    let buf = ''; let dubina = 0;
    for (const ch of vrijednost.trim()) {
      if (ch === '(') dubina += 1;
      else if (ch === ')') dubina -= 1;
      if (dubina === 0 && /\s/.test(ch)) { if (buf) { out.push(buf); buf = ''; } continue; }
      buf += ch;
    }
    if (buf) out.push(buf);
    return out;
  }

  /** Vrijednosti koje ne imenuju nijedno pismo: CSS kljucne rijeci nisu obitelj. */
  const KLJUCNE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

  /**
   * Obitelj iz KRATICE `font:`, po OBLIKU a ne po poziciji.
   *
   * Kratica je `font: [stil] [tezina] <velicina>[/<visina>] <obitelj>`, pa je obitelj sve iza
   * zadnjeg tokena koji nosi velicinu. Token velicine se prepoznaje po tome sto sadrzi kosu crtu
   * (`19px/1`, `var(--fs-kicker)/1.3`) ili je duljina, postotak, odnosno izracun.
   */
  function obiteljIzKratice(vrijednost: string): string | null {
    const t = tokeni(vrijednost);
    const jeVelicina = (x: string): boolean =>
      x.includes('/') || /^[+-]?[0-9.]+(px|rem|em|%|vw|vh|pt|ch|ex)?$/i.test(x)
      || /^(clamp|calc|min|max)\(/i.test(x);
    let zadnja = -1;
    for (let i = 0; i < t.length; i += 1) if (jeVelicina(t[i])) zadnja = i;
    const rep = t.slice(zadnja + 1).join(' ').trim();
    return rep || null;
  }

  /**
   * Svaka obitelj koju list imenuje, kroz OBA oblika zapisa.
   *
   * DO PREGLEDA Z7 JE OVDJE STAJALO SAMO `font-family:`, uz biljesku da list kraticu ne koristi.
   * Biljeska je bila netocna: `intake.css` kraticu koristi cetiri puta, a dvije od tih uporaba
   * postavljaju obitelj (`.intake-kicker`, `.intake-karta-znak`). Izmjereno podmetanjem:
   * `font:italic 500 var(--fs-kicker)/1.3 'Instrument Serif',serif` NIJE mijenjao izlaz, pa je
   * tvrdnja ostajala zelena nad listom koji uvodi odbijeno pismo. Mutacija ispod pokriva oba
   * oblika; bez nje gard cuva samo zapis koji datoteka rjedje koristi.
   */
  function obitelji(css: string): string[] {
    const cist = bezCssKomentara(css);
    const nalazi: string[] = [];
    for (const m of cist.matchAll(/(?:^|[;{\s])font-family\s*:\s*([^;}]+)/g)) nalazi.push(m[1].trim());
    for (const m of cist.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)) {
      const obitelj = obiteljIzKratice(m[1]);
      if (obitelj) nalazi.push(obitelj);
    }
    return [...new Set(nalazi.filter((v) => !KLJUCNE.has(v.toLowerCase())))].sort();
  }

  /**
   * Lijevi rubovi koji NISU hairline od 1px (design/README.md, tvrdo pravilo boje 3).
   *
   * Cetiri zapisa, ne jedan: `border-left`, `border-left-width` i logicki `border-inline-start`
   * (uz njegovu `-width` inacicu) daju isti obojeni stupac uz karticu. Pregled Z7 je pokazao da je
   * gard hvatao samo prvi, pa bi ista zabrana pala cim se napise drugim imenom.
   */
  function debeliLijeviRubovi(css: string): string[] {
    return [...bezCssKomentara(css).matchAll(/border-(?:left|inline-start)(?:-width)?\s*:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^1px\b/.test(v));
  }

  it('sve obitelji dolaze iz DVA tokena, nijedna nije upisana imenom', () => {
    // DVA, NE TRI. Prvi prolaz Z7 je mono mete papira crtao `var(--mono)`-om i uz to na ulaz
    // dovukao IBM Plex Mono kao webfont; pregled je to odbio, jer nalog kaze "NE dodaj nikakav
    // webfont". `var(--mono)` bez ucitane obitelji nije nesto izmedju nego treci kvar (sustavni
    // `ui-monospace`, na Windowsu Consolas), pa je token uklonjen zajedno s fontom.
    expect(obitelji(CSS)).toEqual(['var(--display-serif)', 'var(--ui)']);
    // Token se ne smije vratiti ni kao "samo CSS, bez fonta": ulaz cuva
    // `tests/entry-fonts.test.ts`, a ovaj gard cuva da list uopce ne imenuje treci glas.
    expect(bezCssKomentara(CSS), 'mono je natrag na ulazu, bez ucitane obitelji')
      .not.toContain('var(--mono)');
  });

  it('MUTACIJA: `Instrument Serif` pada u OBA zapisa, i kao kratica `font:`', () => {
    // BASELINE: nemutiran list je cist, inace bi "prolazio" i gard koji vristi na sve.
    expect(obitelji('.a{font-family:var(--ui)}'), 'baseline mora biti cist').toEqual(['var(--ui)']);
    const podmetnut = CSS.replace('font-family:var(--display-serif)', "font-family:'Instrument Serif',serif");
    expect(podmetnut, 'podmetanje se nije primilo; provjeri oznaku').not.toBe(CSS);
    expect(obitelji(podmetnut)).toContain("'Instrument Serif',serif");
    expect(obitelji(podmetnut)).not.toEqual(['var(--display-serif)', 'var(--ui)']);
    // KRATICA `font:` JE DRUGI ZAPIS ISTE STVARI, i do pregleda Z7 je bila rupa: gard je citao
    // samo longhand, a `.intake-kicker` obitelj postavlja bas kraticom. Podmetanje ide na STVARAN
    // redak datoteke, ne na sintetski niz, pa mutacija pada cim taj redak nestane.
    const kraticom = CSS.replace(
      'font:italic 500 var(--fs-kicker)/1.3 var(--display-serif)',
      "font:italic 500 var(--fs-kicker)/1.3 'Instrument Serif',serif",
    );
    expect(kraticom, 'podmetanje u kraticu se nije primilo; provjeri oznaku').not.toBe(CSS);
    expect(obitelji(kraticom), 'kratica `font:` prolazi neopazeno').toContain("'Instrument Serif',serif");
    // Isto vrijedi za drugu polovicu predloska (`Geist Mono`), da gard ne cuva samo jedno ime.
    expect(obitelji(CSS.replace('font-family:var(--ui)', "font-family:'Geist Mono',monospace")))
      .toContain("'Geist Mono',monospace");
    // KONTROLA SMJERA: zamjena JEDNOG tokena DRUGIM tokenom nije nalaz, pa gard ne zabranjuje
    // legitimno preslagivanje glasova; ni visina retka u kratici nije obitelj.
    expect(obitelji('.a{font-family:var(--display-serif)}.b{font-family:var(--ui)}'))
      .toEqual(['var(--display-serif)', 'var(--ui)']);
    expect(obitelji('.a{font:700 19px/1 var(--ui)}'), 'visina retka nije obitelj').toEqual(['var(--ui)']);
    expect(obitelji('.a{font:inherit;font-weight:650}'), 'kljucna rijec nije obitelj').toEqual([]);
  });

  it('nijedan lijevi rub osim hairlinea od 1px, ni pod drugim imenom', () => {
    expect(debeliLijeviRubovi(CSS)).toEqual([]);
    // MUTACIJA: obojeni rub po tonu je tocno ono sto design/README.md zabranjuje.
    expect(debeliLijeviRubovi('.a{border-left:3px solid var(--red)}'))
      .toEqual(['3px solid var(--red)']);
    // ISTA ZABRANA, DRUGA IMENA. Do pregleda Z7 je gard citao samo `border-left`, pa su oblik
    // `-width` i logicko svojstvo prolazili, iako u pregledniku crtaju isti stupac.
    expect(debeliLijeviRubovi('.a{border-left-width:3px}'), 'oblik `-width` prolazi').toEqual(['3px']);
    expect(debeliLijeviRubovi('.a{border-inline-start:3px solid var(--red)}'), 'logicko svojstvo prolazi')
      .toEqual(['3px solid var(--red)']);
    expect(debeliLijeviRubovi('.a{border-inline-start-width:2px}')).toEqual(['2px']);
    // BASELINE: hairline ostaje dopusten, u svakom od tih zapisa.
    expect(debeliLijeviRubovi('.a{border-left:1px solid var(--paper-line)}')).toEqual([]);
    expect(debeliLijeviRubovi('.a{border-inline-start:1px solid var(--paper-line)}')).toEqual([]);
    // KONTROLA: gard ne smije hvatati rubove koje list stvarno koristi (hairline gore i dolje).
    expect(debeliLijeviRubovi('.a{border-bottom:1px solid x;border-top:2px solid y}')).toEqual([]);
  });

  it('pecat je STATICAN: ne uvodi ni animaciju ni prijelaz', () => {
    const blok = bezCssKomentara(CSS).match(/\.intake-pecat\{[^}]*\}/)?.[0] ?? '';
    expect(blok, 'nema pravila za pecat').not.toBe('');
    expect(blok).not.toMatch(/animation|transition/);
    expect(blok).toContain('pointer-events:none');
    expect(blok).toContain('transform:rotate(-9deg)');
    // PECAT JE U TOKU, NE IZNAD SADRZAJA. Pregled Z7 je izracunao da apsolutno sidrenje
    // (`top:44px;right:0`) na sirokim ekranima pada preko desnog kraja naslova: na 1440px naslov
    // zauzima x 50..488 od ~538px sadrzaja papira, a pecat x 402..538. Obje mjere su elasticne i
    // rastu jedna prema drugoj, pa se sudar ne da popraviti pomakom; u toku ga raspored ucini
    // nemogucim, jer pecat dobiva vlastiti redak. Rotacija ne ulazi u raspored pa ostaje.
    expect(blok, 'pecat je opet izvan toka, sudar s naslovom je moguc').not.toContain('position:absolute');
    expect(blok).toContain('justify-self:end');
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

  /**
   * CIJI JE TO BROJ: tvrdnja koju je pregled Z7 oborio, sada izmjerena.
   *
   * Prvi prolaz je na TRI mjesta (modul, markup, poruka commita) tvrdio da je izvor "ista pohrana
   * koju cita Moji radovi". Nije: `/moji-radovi/` lokalne radove gradi iz IndexedDB sesija i
   * `lekta.history.v2` uopce ne dira. Tvrdnja koju nijedan test ne mjeri ostaje u kodu kao
   * cinjenica koju kod ne izvrsava, pa se mjeri ovdje.
   *
   * OGRANICENJE KOJE SE IMENUJE: ovo je tvrdnja nad IZVOROM (tko koji kljuc spominje), ne nad
   * ponasanjem dviju ruta u pregledniku. Dovoljna je za ono sto cuva (da se netocan pripis ne
   * vrati tiho), ali ne dokazuje sto korisnik vidi na `/moji-radovi/`.
   */
  it('izvor broja je povijest ZAVRSENIH analiza, a ne popis iz "Moji radovi"', () => {
    const mojiRadovi = read('src/routes/my-work/main.ts');
    expect(mojiRadovi, 'ruta "Moji radovi" ipak cita povijest; pripis u komentarima treba ispraviti')
      .not.toContain('STORAGE_KEYS.history');
    expect(mojiRadovi, 'lokalni popis vise ne dolazi iz IndexedDB sesija').toContain('IndexedDbDocumentSessionStore');
    // Pise ga ISKLJUCIVO zavrsena analiza na `/rad/`.
    expect(read('src/ui/app.ts')).toContain('safeStorageSet(STORAGE_KEYS.history,history)');
    // Komentar uz modul i markup ne smije vratiti oboreni pripis.
    const pripis = /ista pohrana koju cita "Moji radovi"|isti izvor kao "Moji radovi"/;
    expect(read('src/routes/intake/list-number.ts')).not.toMatch(pripis);
    expect(HTML).not.toMatch(pripis);
  });
});
