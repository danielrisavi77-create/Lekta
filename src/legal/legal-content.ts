// Jedini izvor istine za pravne tekstove: modal na indexu (src/ui/app.ts) i statične javne
// stranice (scripts/generate-legal-pages.mjs) čitaju ISTU funkciju, pa ne mogu divergirati.
// TERMS_VERSION se trajno bilježi uz svaku kupnju (checkout_consents.terms_version, migracija
// 0008); bump verzije radi se ovdje i SAMO kad se sadržaj materijalno mijenja.
//
// Identitet voditelja obrade: dok su oib/address u data/legal/provider.json prazni, dokumenti
// nose napomenu da registracijski podaci slijede; NE izmišljati ih (živi footer je povijesno
// prikazivao OIB kojeg nema u izvoru, uskladiti tek uz potvrdu vlasnika).
//
// Sav copy: hrvatski, bez em i en crtica (CLAUDE.md), bez vanjskih ovisnosti (modul bundla
// i Vite za browser i esbuild za Node generator).

import providerDefaults from '../../data/legal/provider.json';

export const TERMS_VERSION = '2026-07-10';

export interface LegalProviderConfig {
  org: string;        // naziv pružatelja (brand ili pravni subjekt)
  contact: string;    // kontakt e-mail
  controller: string; // voditelj obrade (pada na org dok subjekt nije registriran)
  days: number;       // retencija podataka narudžbe i dokumenta (dana)
  logDays: number;    // retencija serverskih logova izvještaja (dana, migracija 0009)
  oib: string;        // prazno = redak se ne renderira, dokument nosi napomenu o dopuni
  address: string;    // prazno = redak se ne renderira
}

export interface LegalDoc {
  slug: string;
  title: string;
  description: string;
  html: string;
}

export type LegalDocKind = 'privacy' | 'terms' | 'disclaimer' | 'purchase' | 'processing' | 'cookies' | 'guarantee';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveConfig(cfg?: Partial<LegalProviderConfig>): LegalProviderConfig {
  const org = cfg?.org || providerDefaults.businessName || 'Lekta';
  return {
    org,
    contact: cfg?.contact || providerDefaults.contactEmail || 'kontakt nije konfiguriran',
    controller: cfg?.controller || providerDefaults.privacyController || org,
    days: Number(cfg?.days) || providerDefaults.retentionDaysOrders || 30,
    logDays: Number(cfg?.logDays) || providerDefaults.retentionDaysLogs || 90,
    oib: cfg?.oib ?? providerDefaults.oib ?? '',
    address: cfg?.address ?? providerDefaults.address ?? '',
  };
}

/** Redak identiteta u legal-meta: OIB i adresa se renderiraju samo kad postoje. */
function identityMeta(c: LegalProviderConfig): string {
  const bits = [`<strong>Voditelj obrade:</strong> ${esc(c.controller)}`];
  if (c.oib) bits.push(`<strong>OIB:</strong> ${esc(c.oib)}`);
  if (c.address) bits.push(`<strong>Adresa:</strong> ${esc(c.address)}`);
  bits.push(`<strong>Kontakt:</strong> ${esc(c.contact)}`);
  return bits.join(' · ');
}

/** Napomena o registraciji: prikazuje se dok registracijski podaci (OIB) nisu upisani. */
function registrationNote(c: LegalProviderConfig): string {
  if (c.oib) return '';
  return `<p class="legal-note">Puni registracijski podaci pružatelja (naziv subjekta, OIB, adresa) bit će objavljeni na ovoj stranici po dovršetku registracije subjekta. Do tada se za sva pitanja i zahtjeve koristi navedeni kontakt e-mail.</p>`;
}

export function legalDocuments(cfg?: Partial<LegalProviderConfig>): Record<LegalDocKind, LegalDoc> {
  const c = resolveConfig(cfg);
  const org = c.org, contact = c.contact, days = c.days, logDays = c.logDays;
  const meta = (extra = '') => `<div class="legal-meta"><strong>Verzija:</strong> ${TERMS_VERSION}${extra ? ' · ' + extra : ''}</div>`;

  return {
    privacy: {
      slug: 'privatnost',
      title: 'Obavijest o privatnosti',
      description: 'Kako Lekta obrađuje osobne podatke: lokalna analiza, ručna usluga, pravna osnova, izvršitelji, rokovi čuvanja i prava korisnika.',
      html: `${meta(identityMeta(c))}${registrationNote(c)}<h4>1. Lokalna automatska analiza</h4><p>Besplatna automatska provjera odvija se u pregledniku. Tekst dokumenta, sama datoteka i pronađeni problemi tada se ne šalju na poslužitelj. Lokalna povijest, ako je dostupna, sadrži samo naziv datoteke, rezultat i odabrani profil.</p><p>Ako korisnik nakon prijave e-mailom izričito zatraži <strong>puni izvještaj</strong>, na poslužitelj se šalju podaci izvedeni iz dokumenta nužni za njegovu izradu: naslov i autor rada, struktura naslova te pronađene stavke provjere. Sam tekst rada i datoteka i tada ostaju u pregledniku. Poslužitelj donosi odluku o pristupu, a te podatke koristi isključivo za izradu naručenog izvještaja.</p><h4>2. Ručna usluga</h4><p>Kada korisnik izričito pošalje narudžbu, obrađuju se ime, e-mail, rok, napomena, odabrani paket, profil analize i dokument koji je korisnik odabrao. Svrha je komunikacija, ponuda, naplata i izvršenje naručene usluge.</p><h4>3. Pravna osnova obrade</h4><p>Obrada se temelji na sljedećim osnovama iz čl. 6. st. 1. Opće uredbe o zaštiti podataka (GDPR):</p><ul><li><strong>izvršenje ugovora (čl. 6. st. 1. t. b):</strong> podaci narudžbe, prijava e-mailom, izrada punog izvještaja i ručna usluga;</li><li><strong>privola (čl. 6. st. 1. t. a):</strong> anonimna analitika korištenja i eventualne marketinške obavijesti; privola se može povući u svakom trenutku;</li><li><strong>legitimni interes (čl. 6. st. 1. t. f):</strong> sigurnosni logovi (hashirana IP adresa), sprječavanje zlouporabe i ograničenje broja zahtjeva.</li></ul><h4>4. Plaćanje i pružatelji usluga</h4><p>Podaci o kartici ne obrađuju se u Lekta sučelju, nego na hostiranoj stranici konfiguriranog payment providera. Hosting, obrazac i payment provider mogu djelovati kao izvršitelji obrade prema vlastitim uvjetima.</p><h4>5. Izvršitelji obrade</h4><p>U pružanju usluge koriste se sljedeći izvršitelji obrade:</p><ul><li><strong>Supabase</strong> (baza podataka, prijava e-mailom, izrada punih izvještaja; poslužitelji u EU regiji);</li><li><strong>Netlify</strong> (hosting stranice i zaprimanje obrazaca narudžbe);</li><li><strong>payment provider (Merchant of Record)</strong> za naplatu i izdavanje računa, kada je naplata aktivna.</li></ul><p>IP adresa se u logovima pohranjuje isključivo u hashiranom obliku.</p><h4>6. Rok čuvanja</h4><p>Podaci narudžbe i radni dokument čuvaju se najdulje ${days} dana nakon dovršetka usluge, osim kada zakon, računovodstvene obveze ili spor zahtijevaju dulje čuvanje. Datoteke se zatim brišu ili anonimiziraju. Serverski logovi izrade izvještaja (bez teksta rada, s hashiranom IP adresom) čuvaju se najdulje ${logDays} dana radi sigurnosti i sprječavanja zlouporabe.</p><h4>7. Analitika</h4><p>Aplikacija ne učitava marketinške trackere. Opcionalni anonimni događaji korištenja šalju se samo uz privolu i samo kada je konfiguriran poseban event endpoint. Netlifyjeva poslužiteljska analitika može se zasebno uključiti na razini hostinga.</p><h4>8. Prava korisnika</h4><p>Za pristup, ispravak, brisanje, ograničenje ili prigovor obrati se na ${esc(contact)}. Voditelj obrade osobnih podataka je ${esc(c.controller)}. Zahtjev za brisanjem izvršava se uklanjanjem računa, entitlementa, slotova i vezanih logova.</p><p>Korisnik ima pravo podnijeti pritužbu nadzornom tijelu: Agencija za zaštitu osobnih podataka (AZOP), Selska cesta 136, Zagreb, azop.hr.</p>`,
    },
    terms: {
      slug: 'uvjeti-koristenja',
      title: 'Uvjeti korištenja i narudžbe',
      description: 'Uvjeti korištenja Lekta provjere i naručivanja ručne usluge: predmet, odgovornosti, narudžba, rokovi i zabranjena uporaba.',
      html: `${meta(`<strong>Pružatelj:</strong> ${esc(org)} · <strong>Kontakt:</strong> ${esc(contact)}`)}<h4>1. Predmet usluge</h4><p>Lekta pruža tehnički audit akademskog dokumenta i, kada je naručeno, ručno formatiranje ili pregled citatne i strukturne konzistentnosti. Usluga provjerava oblikovanje, strukturu, opseg i dosljednost citiranja; ne provjerava plagijat, izvornost ni sličnost teksta i nije zamjena za sustave provjere izvornosti. Usluga ne piše sadržaj rada umjesto korisnika i ne jamči ocjenu, prihvaćanje ili odobrenje mentora. Pružatelj ne odgovara za odbijenu ili vraćenu predaju rada od strane fakulteta, referade ili mentora, za dobivenu ocjenu, niti za propušteni rok predaje ili obrane; rezultat aplikacije je pomoćna tehnička provjera, a ne jamstvo ishoda.</p><h4>2. Odgovornost korisnika</h4><p>Korisnik mora imati pravo dostaviti dokument i odgovoran je za akademsku čestitost, točnost sadržaja, autorska prava, osobne podatke u radu i konačnu provjeru službenih uputa.</p><h4>3. Narudžba i plaćanje</h4><p>Narudžba postaje operativna nakon uspješnog zaprimanja obrasca i, kada je primjenjivo, potvrđenog plaćanja. Konačni opseg, rok i cijena prikazuju se prije plaćanja ili se potvrđuju zasebnom ponudom.</p><h4>4. Rok i suradnja</h4><p>Rok ovisi o opsegu dokumenta, kvaliteti izvornog Worda i pravodobnoj dostavi svih uputa. Kašnjenje korisnika s dodatnim materijalima može pomaknuti rok.</p><h4>5. Otkaz i povrat</h4><p>Prava na otkaz, jednostrani raskid i povrat ovise o vrsti usluge, trenutku početka izvršenja i primjenjivom potrošačkom pravu. Prije početka individualne obrade korisniku treba jasno potvrditi uvjete, cijenu i eventualni zahtjev za početak izvršenja prije isteka roka za raskid.</p><h4>6. Zabranjena uporaba</h4><p>Nije dopušteno naručiti izradu lažnog rada, prikrivanje plagijata, falsificiranje podataka ili drugu akademsku prijevaru. Pružatelj može odbiti takvu narudžbu.</p><h4>7. Mjerodavna pravila</h4><p>Službene upute fakulteta, studija, kolegija i mentora uvijek imaju prednost pred automatskim profilom aplikacije.</p>`,
    },
    disclaimer: {
      slug: 'odricanje-od-odgovornosti',
      title: 'Odricanje od odgovornosti',
      description: 'Lekta je heurističko tehničko pomagalo, ne službena potvrda fakulteta: mogući lažni alarmi, prednost službenih uputa i odgovornost korisnika.',
      html: `${meta()}<h4>Tehničko pomagalo, ne službena potvrda</h4><p>Rezultat aplikacije je heuristička tehnička provjera. Nije službena potvrda fakulteta, pravno mišljenje, lektura, recenzija znanstvene kvalitete, provjera plagijata, izvornosti ili sličnosti teksta, ni odluka mentora ili povjerenstva. Lekta ne uspoređuje rad s bazama izvora i nije zamjena za sustave provjere izvornosti (npr. Turnitin).</p><h4>Mogući lažni alarmi i propuštanja</h4><p>Word dokumenti, citatni stilovi i fakultetske iznimke mogu biti složeni. Aplikacija može označiti ispravan element ili propustiti stvarnu pogrešku. Svaki nalaz treba provjeriti u izvornom dokumentu i prema aktualnim službenim pravilima.</p><h4>Posebne upute</h4><p>Pisana uputa mentora, nositelja kolegija ili studija ima prednost. Korisnik snosi odgovornost za konačnu verziju rada, izvore, citate, istraživačku etiku i pravodobnu predaju.</p>`,
    },
    purchase: {
      slug: 'pravila-povrata',
      title: 'Pravila kupnje, isporuke i povrata',
      description: 'Kupnja punog izvještaja: cijena, trenutna digitalna isporuka, pravo na odustanak, povrat i reklamacije.',
      html: `${meta(`<strong>Pružatelj:</strong> ${esc(org)} · <strong>Kontakt:</strong> ${esc(contact)}`)}<h4>1. Predmet i cijena</h4><p>Digitalni proizvod je puni izvještaj tehničke provjere oblikovanja, strukture, opsega i citiranja (i, gdje je ponuđeno, paket ponovnih provjera istog rada). Izvještaj ne uključuje provjeru plagijata, izvornosti ni sličnosti teksta. Cijena se prikazuje prije plaćanja i konačna je odluka poslužitelja. Naplatu i račun s pripadajućim PDV-om izdaje konfigurirani Merchant of Record kao prodavatelj.</p><h4>2. Trenutna isporuka</h4><p>Puni izvještaj isporučuje se digitalno, u pravilu odmah nakon uspješno potvrđenog plaćanja. Kupnja se ne može dovršiti bez izričitog pristanka na trenutni početak isporuke.</p><h4>3. Pravo na odustanak</h4><p>Za digitalni sadržaj koji se isporučuje odmah, kupac pri kupnji izričito pristaje na početak isporuke i potvrđuje da time gubi pravo na jednostrani raskid ugovora u roku od 14 dana (čl. 86. st. 1. t. 11. Zakona o zaštiti potrošača, odnosno EU Direktiva 2011/83). Tekst pristanka i vrijeme bilježe se uz narudžbu.</p><h4>4. Povrat</h4><p>Nakon što je puni izvještaj isporučen, povrat se u pravilu ne odobrava, osim kada to nalaže prisilni propis ili zasebna garancija točnosti provjere (vidi <a class="legal-open" data-legal="guarantee" href="/garancija.html">garancijske uvjete</a>). Ako isporuka nije uspjela ili je izostala, kupac ima pravo na ponovnu isporuku ili povrat plaćenog iznosa.</p><h4>5. Reklamacije</h4><p>Prigovor na kupnju ili isporuku šalje se na ${esc(contact)}. Odgovor slijedi u razumnom roku, a spor se rješava prema primjenjivom potrošačkom pravu.</p>`,
    },
    processing: {
      slug: 'obrada-dokumenata',
      title: 'Obrada dokumenata',
      description: 'Što se s dokumentom događa u Lekti: lokalna analiza u pregledniku, što se šalje kod punog izvještaja, a što kod ručne usluge.',
      html: `${meta(identityMeta(c))}<h4>1. Lokalna analiza (zadano ponašanje)</h4><p>Automatska provjera radi u tvom pregledniku. Word datoteka se otvara i analizira lokalno; ni datoteka ni tekst rada ne šalju se na poslužitelj. Zatvaranjem kartice analiza nestaje, a lokalna povijest (ako je uključena) čuva samo naziv datoteke, rezultat i odabrani profil, u tvom pregledniku.</p><h4>2. Puni izvještaj (uz prijavu)</h4><p>Ako izričito zatražiš puni izvještaj, na poslužitelj se šalju samo podaci izvedeni iz dokumenta koji su nužni za njegovu izradu: naslov i autor rada, struktura naslova i pronađene stavke provjere. Cijeli tekst rada i sama datoteka i tada ostaju u pregledniku. Ti se podaci koriste isključivo za izradu i vezivanje naručenog izvještaja.</p><h4>3. Ručna usluga (izričita predaja)</h4><p>Dokument se prenosi jedino kada izričito naručiš ručnu uslugu, prihvatiš uvjete obrade i potvrdiš slanje. Tada se obrađuju podaci obrasca (ime, e-mail, rok, napomena) i dokument koji si odabrao, isključivo radi izvršenja naručene usluge. Čuvaju se najdulje ${days} dana nakon dovršetka usluge, a zatim se brišu ili anonimiziraju.</p><h4>4. Sigurnost</h4><p>Sva komunikacija s poslužiteljem ide šifriranim kanalom (HTTPS). Poslužiteljski podaci drže se u EU regiji. IP adresa se u logovima pohranjuje isključivo hashirana i briše se odnosno anonimizira po isteku roka čuvanja (najdulje ${logDays} dana).</p><h4>5. Brisanje na zahtjev</h4><p>Brisanje poslanih podataka i dokumenata možeš zatražiti u svakom trenutku na ${esc(contact)}. Detalji prava su u <a class="legal-open" data-legal="privacy" href="/privatnost.html">Obavijesti o privatnosti</a>.</p>`,
    },
    cookies: {
      slug: 'kolacici',
      title: 'Kolačići i lokalna pohrana',
      description: 'Lekta ne koristi marketinške kolačiće: pregled lokalne pohrane u pregledniku i analitike koja radi samo uz privolu.',
      html: `${meta()}<h4>1. Nema marketinških kolačića</h4><p>Stranica ne postavlja marketinške ni oglašivačke kolačiće i ne učitava trackere trećih strana. Osnovne funkcije i lokalna analiza rade bez ikakvih kolačića.</p><h4>2. Lokalna pohrana (localStorage)</h4><p>Za rad aplikacije koristi se lokalna pohrana preglednika, koja ostaje na tvom uređaju i ne šalje se na poslužitelj:</p><ul><li>odabrana tema sučelja (svijetla ili tamna);</li><li>lokalna povijest analiza (naziv datoteke, rezultat, profil), ako je koristiš;</li><li>postavke analize i status privole za analitiku;</li><li>podaci prijave (sesija), ako se prijaviš e-mailom.</li></ul><p>Sve se briše čišćenjem podataka stranice u pregledniku, a povijest i unutar same aplikacije.</p><h4>3. Analitika samo uz privolu</h4><p>Anonimni događaji korištenja (bez teksta rada i bez osobnih podataka) šalju se jedino ako to izričito dopustiš u obavijesti o privatnosti i jedino kada je takav endpoint uopće konfiguriran. Privolu možeš povući u Postavkama privatnosti.</p><h4>4. Poslužiteljska analitika</h4><p>Hosting (Netlify) može voditi zbirnu poslužiteljsku statistiku posjeta koja ne koristi kolačiće i ne profilira korisnike.</p>`,
    },
    guarantee: {
      slug: 'garancija',
      title: 'Garancijski uvjeti (T2/T3)',
      description: 'Uvjeti garancije točnosti Lekta provjere: što pokriva, rokovi, dokaz, tko odlučuje i što je isključeno.',
      html: `${meta(`<strong>Pružatelj:</strong> ${esc(org)} · <strong>Kontakt:</strong> ${esc(contact)}`)}<h4>1. Što garancija pokriva</h4><p>Garancija pokriva točnost <strong>verificiranih, bodovanih pravila</strong> na profilima razine pokrivenosti T2 ili T3 (u aplikaciji označeni kao verificirani prema službenom izvoru). Vrijedi kada je referada ili fakultet vratio rad zbog pravila koje je plaćeni puni izvještaj označio prolaznim.</p><h4>2. Mjerodavna verzija pravila</h4><p>Mjerodavna su pravila i status profila <strong>kakvi su bili na dan vezivanja punog izvještaja uz rad</strong> (razina pokrivenosti se u tom trenutku trajno bilježi uz izvještaj). Kasnije izmjene pravila, profila ili službenih uputa ne mijenjaju uvjete već vezanog izvještaja, ni na korist ni na štetu korisnika.</p><h4>3. Rok podnošenja zahtjeva</h4><p>Garancijski zahtjev podnosi se unutar <strong>30 dana</strong> od dana vezivanja punog izvještaja uz rad, kroz za to predviđen obrazac u aplikaciji.</p><h4>4. Dokaz</h4><p>Zahtjev mora sadržavati sporno pravilo i dokaz povrata: opis te poveznicu na dopis ili e-mail referade odnosno njihovu presliku. Ako je dokaz nepotpun, dopuna se traži e-mailom; rok za odgovor teče od zaprimanja potpunog zahtjeva.</p><h4>5. Tko odlučuje</h4><p>O zahtjevu odlučuje čovjek nakon pregleda dokumentacije; odluka nije automatska. Status zahtjeva je najprije zaprimljen, a zatim odobren ili odbijen, s obrazloženjem.</p><h4>6. Rok odgovora</h4><p>Odgovor na potpun zahtjev stiže e-mailom najkasnije u roku od <strong>5 radnih dana</strong> od zaprimanja.</p><h4>7. Što se dobiva ako je zahtjev odobren</h4><p>Prema procjeni pri odobrenju: povrat plaćenog iznosa za taj izvještaj, besplatan ručni popravak spornog oblikovanja, ili oboje.</p><h4>8. Što je isključeno</h4><p>Garancija se ne odnosi na: prihvaćanje ili ocjenu rada, akademsku kvalitetu sadržaja; plagijat, izvornost i sličnost teksta (Lekta uopće ne provodi provjeru plagijata ni sličnosti, pa to nije ni predmet ni garancija usluge); rokove predaje i obrane; subjektivne ili usmene zahtjeve mentora i kolegija (takva pravila su u aplikaciji savjetodavna i ne boduju se); profile koji nisu verificirani (razine T0 i T1); pravila koja je izvještaj označio kao problem (garancija pokriva samo pravila označena prolaznima).</p><h4>9. Pokriveni fakulteti</h4><p>Garanciju nose profili koji su u aplikaciji, u trenutku vezivanja izvještaja, označeni kao verificirani prema službenom izvoru (razina T2 ili T3). Razina pokrivenosti odabranog profila jasno je prikazana prije kupnje.</p>`,
    },
  };
}
