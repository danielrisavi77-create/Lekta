/**
 * Pravni tekstovi (src/legal/legal-content.ts) su jedini izvor istine za modal I javne
 * stranice, a TERMS_VERSION se trajno biljezi uz kupnju (checkout_consents). Ovaj test
 * cuva: GDPR minimum u privacy, garancijske kljucne tocke, zabranu em/en crtica i
 * placeholder stringova, te determinizam (modal === stranica po konstrukciji).
 */
import { describe, it, expect } from 'vitest';
import { BETA_FOOTER_NOTE, legalDocuments, TERMS_VERSION, type LegalDocKind } from '../src/legal/legal-content';
import { findLegalPlaceholders } from '../scripts/lib/legal-placeholders.mjs';

const KINDS: LegalDocKind[] = ['privacy', 'terms', 'disclaimer', 'purchase', 'processing', 'cookies', 'guarantee'];

describe('legal-content', () => {
  const docs = legalDocuments();

  it('svih 7 dokumenata postoji s naslovom, slugom, opisom i verzijom', () => {
    for (const kind of KINDS) {
      const d = docs[kind];
      expect(d.title.length, kind).toBeGreaterThan(3);
      expect(d.slug, kind).toMatch(/^[a-z-]+$/);
      expect(d.description.length, kind).toBeGreaterThan(20);
      expect(d.html, kind).toContain(TERMS_VERSION);
    }
  });

  it('nema em/en crtica ni placeholder oznaka ni u jednom dokumentu', () => {
    for (const kind of KINDS) {
      const d = docs[kind];
      const text = d.title + d.description + d.html;
      expect(text.includes('—'), `${kind}: em crtica`).toBe(false);
      expect(text.includes('–'), `${kind}: en crtica`).toBe(false);
      expect(text.includes('[PLACEHOLDER'), `${kind}: placeholder`).toBe(false);
    }
  });

  // K5: provjera izvora u korpusu je nova svrha obrade uz placeni popravak. Dvije stvari moraju
  // ostati napisane: da nikakav podatak ne izlazi iz Lekte (korpus je nasa baza, ne vanjski servis)
  // i da promasaj NIJE dokaz nepostojanja. Bez drugoga bi pravni tekst obecavao vise nego alat moze.
  it('K5: privacy i processing opisuju provjeru izvora bez slanja trecim stranama', () => {
    for (const kind of ['privacy', 'processing'] as LegalDocKind[]) {
      const html = docs[kind].html;
      expect(html, kind).toMatch(/korpus/i);
      expect(html, kind).toContain('hrvatskih repozitorija');
      expect(html, kind).toMatch(/ne šalju izvan Lekte|ne šalje vanjskim servisima/);
      expect(html, kind).toContain('ne znači da');
    }
  });

  it('K5: nijedan dokument ne tvrdi da korpus moze dokazati nepostojanje izvora', () => {
    // Rijec "izmisljen" smije se pojaviti SAMO u nijekanoj recenici. Zato se gleda svaka recenica
    // u kojoj stoji: ako ijedna nema nijek, tekst optuzuje korisnika za nesto sto alat ne moze znati.
    for (const kind of KINDS) {
      for (const rec of docs[kind].html.toLowerCase().split(/[.;]/)) {
        if (!rec.includes('izmišljen')) continue;
        expect(/\bne\b|\bnije\b|\bnisu\b/.test(rec), `${kind}: „${rec.trim()}”`).toBe(true);
      }
    }
    expect(docs.disclaimer.html).toContain('ne može dokazati suprotno');
  });

  it('privacy sadrzi GDPR minimum: pravnu osnovu, izvrsitelje, AZOP i obje retencije', () => {
    const html = docs.privacy.html;
    expect(html).toContain('čl. 6');
    expect(html).toContain('Supabase');
    expect(html).toContain('Netlify');
    expect(html).toContain('AZOP');
    expect(html).toContain('30 dana');
    expect(html).toContain('90 dana');
    expect(html).toContain('Voditelj obrade');
  });

  it('T89: privacy objavljuje Cloudflare Turnstile (tko, sto, cime ne, pravna osnova, poveznica)', () => {
    const html = docs.privacy.html;
    const odlomak = html.slice(html.indexOf('<h4>1d. Zaštita od zlouporabe (captcha)</h4>'), html.indexOf('<h4>2. Ručna usluga</h4>'));
    expect(odlomak.length).toBeGreaterThan(100);
    expect(odlomak).toContain('Cloudflare, Inc.');
    // Svaka tvrdnja ima izvor (provjera 28. 9. 2026.): Turnstile Privacy Addendum (18. 6. 2025.),
    // Cloudflare Privacy Policy odj. 7 i 11, Cloudflare DPA 6.4 (v6.4).
    expect(odlomak).toContain('tehničke signale kao što su IP adresa, TLS otisak, User-Agent zaglavlje te site key i domena Lekte');
    expect(odlomak).toContain('ne dobiva korisnikove dokumente ni rezultate analize');
    expect(odlomak).toContain('Za samu provjeru Cloudflare djeluje kao izvršitelj obrade u ime Lekte');
    expect(odlomak).toContain('prava u vezi s tom obradom ostvaruju se kod Lekte');
    expect(odlomak).toContain('kao samostalni voditelj, na temelju vlastitog legitimnog interesa');
    expect(odlomak).toContain('dpo@cloudflare.com');
    expect(odlomak).toContain('Prijenos u SAD temelji se na certifikatu Cloudflare, Inc. u EU-U.S. Data Privacy Frameworku; ako certifikat prestane vrijediti, Cloudflare se oslanja na standardne ugovorne klauzule');
    expect(odlomak).toContain('ne navodi fiksan rok čuvanja, nego ih čuva koliko to zahtijeva svrha obrade; Lekta ih ne prima ni ne pohranjuje');
    expect(odlomak).toContain('legitimni interes (čl. 6. st. 1. t. f)');
    expect(odlomak).toContain('href="https://www.cloudflare.com/turnstile-privacy-policy/"');
    expect(odlomak).toContain('href="https://www.cloudflare.com/privacypolicy/"');
    expect(odlomak).toContain('Od dana uključivanja');
    // Tvrdnje bez izvora ne smiju se vratiti.
    for (const bezIzvora of ['kolačić', 'unosima u obrasce', 'Ugovoru o obradi podataka', 'npr. vrstu preglednika']) {
      expect(odlomak).not.toContain(bezIzvora);
    }
    // Izvrsitelj za samu provjeru mora biti i u popisu izvrsitelja (odjeljak 5).
    const izvrsitelji = html.slice(html.indexOf('<h4>5. Izvršitelji obrade</h4>'), html.indexOf('<h4>6. Rok čuvanja</h4>'));
    expect(izvrsitelji).toContain('<strong>Cloudflare, Inc.</strong> (Turnstile, zaštita od zlouporabe pri prijavi; obrada i u Sjedinjenim Američkim Državama)');
  });

  it('WS-6: privacy i processing objavljuju server-side popravak s pohranom-do-brisanja i pravom brisanja', () => {
    for (const kind of ['privacy', 'processing'] as const) {
      const html = docs[kind].html;
      expect(html, `${kind}: automatski popravak`).toContain('automatski popravak');
      expect(html, `${kind}: pohrana`).toMatch(/pohranjuj|pohran/);
      expect(html, `${kind}: retencija do brisanja`).toContain('dok ih');
      expect(html, `${kind}: Moji popravci (right to erasure)`).toContain('Moji popravci');
    }
    // privacy mora imenovati pravnu osnovu pohrane (privola) i izvrsitelja pohrane (Supabase Storage)
    expect(docs.privacy.html).toContain('Supabase Storage');
    // purchase mora navesti popravak kao placeni digitalni proizvod (per vrsta rada)
    expect(docs.purchase.html).toContain('automatski popravak');
  });

  it('lokalni WordReplica popravak ima potpun i ogranicen javni opis obrade', () => {
    for (const kind of ['privacy', 'processing'] as const) {
      const html = docs[kind].html;
      expect(html, `${kind}: lokalni program`).toMatch(/lokalni|prijenosni/i);
      expect(html, `${kind}: WordReplica`).toContain('WordReplica');
      expect(html, `${kind}: novi DOCX`).toMatch(/novi DOCX/i);
      expect(html, `${kind}: izvornik`).toMatch(/izvornik.{0,80}nepromijenjen/i);
      expect(html, `${kind}: bez Worda`).toContain('Microsoft Word nije potreban');
      expect(html, `${kind}: povratni podaci`).toMatch(/potpisan.{0,40}status/i);
      expect(html, `${kind}: samo sažeci`).toMatch(/kriptografsk.{0,40}sažet/i);
      expect(html, `${kind}: izlaz se ne šalje`).toMatch(/novi DOCX.{0,120}ne šalje/i);
      expect(html, `${kind}: ograniceno ciscenje`).toMatch(/uklanja.{0,100}koje je sam stvorio/i);
      expect(html, `${kind}: OS tragovi`).toMatch(/Windows.{0,100}preglednik.{0,100}trag/i);
    }
  });

  it('uvjeti kupnje opisuju jednokratni runner i nastavak bez novog placenog slota', () => {
    for (const kind of ['terms', 'purchase'] as const) {
      const html = docs[kind].html;
      expect(html, `${kind}: isti placeni popravak`).toMatch(/isti plaćeni popravak/i);
      expect(html, `${kind}: vezani portable program`).toMatch(/portable|prijenosni/i);
      expect(html, `${kind}: retry`).toMatch(/ponovno pokren/i);
      expect(html, `${kind}: bez drugog slota`).toMatch(/ne troši.{0,50}(novi|drugi).{0,30}(popravak|slot)/i);
    }
  });

  it('guarantee definira svih 9 tocaka: rokove, dokaz, odluku, lijek i iskljucenja', () => {
    const html = docs.guarantee.html;
    expect(html).toContain('30 dana');            // rok podnosenja
    expect(html).toContain('5 radnih dana');      // SLA odgovora
    expect(html).toContain('vezivanja');          // snapshot na dan vezivanja
    expect(html).toContain('verificiran');        // definicija pokrica
    expect(html).toContain('povrat');             // lijek
    expect(html).toContain('ručni popravak');     // lijek
    expect(html).toContain('odlučuje čovjek');    // tko odlucuje
    expect(html.toLowerCase()).toContain('mentor'); // iskljucenje mentorskih zahtjeva
  });

  /**
   * Odluka vlasnika 2026-09-27 ("Jamstvo za sve profile"): naslov garancijske stranice
   * ne smije vezati garanciju samo za T2/T3, jer tocka 10 (jamstvo za popravak) vrijedi
   * za SVAKI placeni automatski popravak, ne samo za verificirane profile. Tocka 9 mora
   * to izricito razdvojiti, a iskljucenje T0/T1 u tocki 8 mora jasno reci da se odnosi
   * samo na garanciju tocnosti izvjestaja (tocke 1 do 9), ne na tocku 10.
   */
  it('naslov garancijske stranice ne vezuje jamstvo samo za T2/T3', () => {
    expect(docs.guarantee.title).toBe('Garancijski uvjeti');
    expect(docs.guarantee.title).not.toContain('(T2/T3)');
  });

  it('guarantee tocka 9 razdvaja opseg: tocke 1-9 za T2/T3, tocka 10 za svaki popravak', () => {
    const html = docs.guarantee.html;
    const od9 = html.indexOf('<h4>9. Pokriveni fakulteti</h4>');
    const od10 = html.indexOf('<h4>10. Jamstvo za automatski popravak</h4>');
    expect(od9).toBeGreaterThan(-1);
    expect(od10).toBeGreaterThan(od9);
    const tocka9 = html.slice(od9, od10);
    expect(tocka9).toContain(
      'Točke 1 do 9 vrijede za profile razine T2 i T3; točka 10 vrijedi za svaki plaćeni automatski popravak.'
    );
  });

  it('guarantee tocka 8 oznacava iskljucenje T0/T1 kao ograniceno na tocke 1 do 9', () => {
    const html = docs.guarantee.html;
    const od8 = html.indexOf('<h4>8. Što je isključeno</h4>');
    const od9 = html.indexOf('<h4>9. Pokriveni fakulteti</h4>');
    expect(od8).toBeGreaterThan(-1);
    const tocka8 = html.slice(od8, od9);
    expect(tocka8).toContain('profile koji nisu verificirani (razine T0 i T1, za točke 1 do 9)');
  });

  /**
   * Tocka 10 (odobrio vlasnik 2026-09-27, uvjeti 2026-09-27): jamstvo za PLACENI automatski
   * popravak. Cuva se doslovno jer je to obecanje povrata novca: rok, uvjet da vrijedi tek nakon
   * besplatne bete, dokaz bez dopisa referade, ljudska odluka u 5 radnih dana i iskljucenja.
   * Tvrdnje se provjeravaju UNUTAR odjeljka tocke 10, ne bilo gdje na stranici, jer tocke 3 i 6
   * vec sadrze "30 dana" i "5 radnih dana" pa bi provjera cijele stranice bila vakuumski zelena.
   */
  it('guarantee tocka 10: jamstvo za automatski popravak, 30 dana, tek nakon besplatne bete', () => {
    const d = docs.guarantee;
    expect(d.slug).toBe('garancija');
    expect(d.description).toContain('jamstva za automatski popravak');
    const naslov = '<h4>10. Jamstvo za automatski popravak</h4>';
    const od = d.html.indexOf(naslov);
    expect(od, 'tocka 10 postoji').toBeGreaterThan(-1);
    // tocka 10 dolazi poslije tocke 9 i zadnja je na stranici
    expect(od).toBeGreaterThan(d.html.indexOf('<h4>9. Pokriveni fakulteti</h4>'));
    const t10 = d.html.slice(od);
    expect(t10.indexOf('<h4>', naslov.length), 'nema tocke iza 10').toBe(-1);
    expect(t10).toContain('<p>Vrijedi za plaćeni automatski popravak, nakon završetka besplatne bete.</p>');
    expect(t10).toContain('<p><strong>Rok.</strong> Zahtjev se podnosi u roku od 30 dana od popravka, kroz obrazac u aplikaciji.</p>');
    expect(t10).toContain('vraćamo cijeli iznos plaćen za taj popravak');
    expect(t10).toContain('kako je preuzeta iz Lekte');
    expect(t10).toContain('dopis referade nije potreban');
    expect(t10).toContain('najkasnije u 5 radnih dana, s obrazloženjem');
    expect(t10).toContain('nalazi označeni "Ovo radiš sam"');
    expect(t10).toContain('zahtjevi mentora te izmjene pravilnika nakon popravka');
    expect(t10).toContain('<p>Ponovna provjera je uvijek besplatna jer se analiza radi u pregledniku.</p>');
    const uvodi = [...t10.matchAll(/<p><strong>([^<]+)<[/]strong>/g)].map((m) => m[1]);
    expect(uvodi).toEqual(['Što pokriva.', 'Nad kojom datotekom.', 'Rok.', 'Dokaz.', 'Tko odlučuje.', 'Isključeno.']);
  });

  it('purchase referencira garancijske uvjete dual-mode linkom (modal + stranica)', () => {
    expect(docs.purchase.html).toContain('data-legal="guarantee"');
    expect(docs.purchase.html).toContain('href="/garancija.html"');
  });

  it('dok registracijski podaci nisu upisani, dokumenti nose napomenu o dopuni', () => {
    // provider.json ima prazan oib -> privacy mora reci da podaci slijede (posteno prema korisniku)
    expect(docs.privacy.html).toContain('registracij');
    // a cim se oib upise, napomena nestaje i OIB se renderira
    const withOib = legalDocuments({ oib: '12345678901' });
    expect(withOib.privacy.html).toContain('OIB');
    expect(withOib.privacy.html.includes('bit će objavljeni')).toBe(false);
  });

  /**
   * LEG-02: Zakon o zastiti potrosaca medju predugovornim informacijama trazi i TELEFONSKI
   * broj trgovca, ne samo e-mail. Polje je prazno dok subjekt nije registriran, pa se redak
   * tada ne smije renderirati (prazan "Telefon:" bio bi gori od izostanka).
   */
  it('telefon se renderira samo kad postoji', () => {
    expect(legalDocuments().privacy.html.includes('Telefon:')).toBe(false);
    expect(legalDocuments({ phone: '+385 1 2345 678' }).privacy.html).toContain('Telefon:');
    expect(legalDocuments({ phone: '+385 1 2345 678' }).privacy.html).toContain('+385 1 2345 678');
  });

  /**
   * A26-01: dok registracijski podaci nisu upisani, "Lekta" je naziv usluge a ne pravni
   * subjekt. Napomena to mora IZRICITO reci, jer bi inace redak "Voditelj obrade: Lekta"
   * citatelju izgledao kao da voditelj obrade postoji i identificiran je.
   */
  it('bez OIB-a napomena izricito kaze da subjekt nije registriran i da se ne naplacuje', () => {
    const html = legalDocuments().privacy.html;
    expect(html).toContain('a ne registrirani pravni subjekt');
    expect(html).toContain('ne naplaćuje');
  });

  /**
   * T86: otvorene oznake su TOCNO ove dvije. Popis smije samo padati: vlasnik upisuje Z36, a
   * mehanizam prijenosa za Resend se provjerava u DPA. Nova oznaka mora se ovdje imenovati;
   * deploy ih sve odbija (`scripts/verify-deploy-dist.mjs`, gard 3a).
   */
  it('T86: pravni tekst nema neobjavljivih oznaka (ni uz ukljucen Google)', () => {
    for (const d of [docs, legalDocuments({ googleSignIn: true })]) {
      expect(KINDS.flatMap((kind) => findLegalPlaceholders(d[kind].html))).toEqual([]);
    }
  });

  it('T86: uvjeti imaju odjeljak besplatne bete (bez naknade, nije ocjena sadrzaja, prekid, brisanje)', () => {
    const html = docs.terms.html;
    expect(html).toContain('<h4>8. Besplatna beta</h4>');
    expect(html).toContain('Tijekom besplatne bete ništa se ne naplaćuje, a odjeljci');
    expect(html).toContain('ništa se ne naplaćuje unatrag');
    expect(html).toContain('Formalna provjera nije ocjena sadržaja');
    expect(html).toContain('nije procjena kvalitete rada ni predviđanje ocjene');
    expect(html).toContain('betu završiti u bilo kojem trenutku');
    expect(html).toContain('<strong>Brisanje podataka.</strong>');
    // Z36: bez jamstva rezultata, ali bez iskljucenja namjere i krajnje nepaznje (ZOO cl. 345)
    // ni prisilnih prava potrosaca; garancije placenih usluga ne vrijede za betu.
    expect(html).toContain('<strong>Bez jamstva rezultata.</strong>');
    expect(html).toContain('osim za štetu prouzročenu namjerno ili krajnjom nepažnjom');
    expect(html).toContain('propise o zaštiti potrošača');
    expect(html).toContain('ne vrijede za besplatnu betu');
  });

  it('T86: privacy objavljuje anonimni racun i Resend, bez slanja dokumenta', () => {
    const html = docs.privacy.html;
    expect(html).toContain('<h4>1e. Anonimni račun</h4>');
    expect(html).toContain('bez e-maila, imena i lozinke');
    expect(html).toContain('<h4>1f. E-pošta (Resend)</h4>');
    expect(html).toContain('nikad dokument, tekst rada ni rezultati analize');
    expect(html).toContain('<strong>Resend</strong> (Plus Five Five, Inc.');
    expect(html).toContain('standardnim ugovornim klauzulama');
    expect(html).toContain('poveznicu za odjavu');
    // Supabase ostaje imenovan izvrsitelj.
    expect(html).toContain('<li><strong>Supabase</strong>');
    expect(html).toContain('Tijekom besplatne bete ništa se ne naplaćuje i podaci o plaćanju se ne obrađuju');
  });

  it('T86/T102: Google se spominje samo kad je prijava Googleom ukljucena', () => {
    expect(docs.privacy.html.includes('Google')).toBe(false);
    const sGooglom = legalDocuments({ googleSignIn: true }).privacy.html;
    expect(sGooglom).toContain('<h4>1g. Prijava Google računom</h4>');
    expect(sGooglom).toContain('samostalni voditelj obrade');
    expect(sGooglom).toContain('nikad se ne šalju Googleu');
    expect(sGooglom).toContain('e-mail adresu, ime i identifikator Google računa');
  });

  it('T86: recenica bete za podnozja nosi trazenu formulaciju', () => {
    expect(BETA_FOOTER_NOTE).toContain('ijekom besplatne bete');
    expect(findLegalPlaceholders(BETA_FOOTER_NOTE)).toEqual([]);
  });

  it('deterministicki: dva poziva daju identican sadrzaj (modal === stranica)', () => {
    const a = legalDocuments();
    const b = legalDocuments();
    for (const kind of KINDS) expect(a[kind].html).toBe(b[kind].html);
  });
});
