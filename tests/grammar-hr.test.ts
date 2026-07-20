import { describe, it, expect } from 'vitest';
import {
  grammarLint, grammarLintSummary,
  KIND_NE_SPOJENO, KIND_KONDICIONAL, KIND_DA_PREZENT, KIND_VEZNIK,
  KIND_JE_LI, KIND_S_SA, KIND_SRBIZAM, KIND_PLEONAZAM, KIND_ADMINISTRATIVIZAM,
  KIND_IJE_JE, KIND_ZAREZ, KIND_ANGLIZAM,
} from '../src/audits/grammar-hr';

function kindsOf(text: string): string[] {
  return grammarLint([text]).map((f) => f.kind);
}
function has(text: string, kind: string): boolean {
  return kindsOf(text).includes(kind);
}
function suggestionFor(text: string, kind: string): string {
  return (grammarLint([text]).find((f) => f.kind === kind) || { suggestion: '' }).suggestion;
}

describe('grammar-hr: nijek „ne” sastavljeno', () => {
  it('oznaci glagol s neispravno sastavljenim „ne”', () => {
    expect(has('Ja to nemogu napraviti do sutra.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('On nezna gdje je ostavio ključeve.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('To mi netreba više.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('Ja nebih se s time složio.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('Ti nesmiješ ulaziti ovamo.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('Oni mi nedaju mira.', KIND_NE_SPOJENO)).toBe(true);
    expect(has('Oni nevole takva pravila.', KIND_NE_SPOJENO)).toBe(true);
    expect(suggestionFor('to nemogu', KIND_NE_SPOJENO)).toContain('ne mogu');
  });

  it('NE oznaci ispravno sastavljene izvedenice ni valjane nijekane oblike (FP-zamke)', () => {
    for (const s of [
      'To je nemoguća misija.', 'Nemoguće je sve stići na vrijeme.', 'Njegovo neznanje bilo je zapanjujuće.',
      'To je posve nebitan detalj.', 'Pogledao je u vedro nebo.', 'Rad je tekao nesmetan cijeli dan.',
      'Zapao je u veliku nevolju.', 'Bio je to posve neželjen ishod.', 'Nedavno smo se vidjeli u knjižnici.',
      'U nedjelju idemo na izlet.', 'Nemam vremena za to.', 'Neću stići do večeri.', 'Nemoj to raditi.',
      'U ontologiji biće i nebiće nisu istoznačni.', 'Nedostaje jedan dio dokumentacije.',
      'Netreba, I. (2019). Digitalizacija obrazovanja. Zagreb.',
    ]) {
      expect(has(s, KIND_NE_SPOJENO), s).toBe(false);
    }
  });
});

describe('grammar-hr: kondicional (slaganje s licem)', () => {
  it('oznaci neslaganje uz izraženu zamjenicu', () => {
    expect(suggestionFor('Ja bi to učinio na tvome mjestu.', KIND_KONDICIONAL)).toContain('ja bih');
    expect(suggestionFor('Mi bi tako postupili.', KIND_KONDICIONAL)).toContain('mi bismo');
    expect(suggestionFor('Vi bi trebali otići.', KIND_KONDICIONAL)).toContain('vi biste');
  });

  it('NE oznaci ispravno slaganje, „bi” 3. lice ni „bi li” (FP-zamke)', () => {
    for (const s of [
      'Ja bih to učinio ni za što.', 'Mi bismo to trebali preispitati.',
      'Moja bi generacija to drukčije riješila.', 'Koja bi ideja bila najbolja?',
      'Svi bi trebali sudjelovati.', 'Novi bi pristup mogao pomoći.',
      'Reci mi bi li došao na vrijeme.', 'Situacija bi se mogla promijeniti.',
    ]) {
      expect(has(s, KIND_KONDICIONAL), s).toBe(false);
    }
  });
});

describe('grammar-hr: „da” + prezent umjesto infinitiva', () => {
  it('oznaci 1. lice modalni + da + glagol na -m/-mo (isti subjekt)', () => {
    expect(has('Moram da idem odmah.', KIND_DA_PREZENT)).toBe(true);
    expect(has('Želim da napišem taj rad.', KIND_DA_PREZENT)).toBe(true);
    expect(has('Mogu da vidim rezultate.', KIND_DA_PREZENT)).toBe(true);
    expect(has('Moramo da odemo ranije.', KIND_DA_PREZENT)).toBe(true);
  });

  it('oznaci futurski „ću/ćemo da” + prezent (isti subjekt)', () => {
    expect(has('Ja ću da napišem taj rad do petka.', KIND_DA_PREZENT)).toBe(true);
    expect(has('Mi ćemo da odemo ranije.', KIND_DA_PREZENT)).toBe(true);
    expect(suggestionFor('Sutra ću da završim analizu.', KIND_DA_PREZENT)).toContain('napisat ću');
  });

  it('NE oznaci različit subjekt, 3. lice, futur „će da” ni „da” kao veznik (FP-zamke)', () => {
    for (const s of [
      'Želim da dođeš na vrijeme.', 'Mora da je već kasno.', 'Znam da idem u pravom smjeru.',
      'Rekao je da razumije problem.', 'Radi to da bi uspio.', 'Sve što mi treba da bih uspio jest mir.',
      'Radit ću analizu do petka.', 'Naša će analiza obuhvatiti sve slučajeve.',
    ]) {
      expect(has(s, KIND_DA_PREZENT), s).toBe(false);
    }
  });
});

describe('grammar-hr: veznici (s obzirom / u vezi)', () => {
  it('oznaci nestandardne veznicke oblike', () => {
    expect(suggestionFor('Obzirom da je padala kiša, ostali smo.', KIND_VEZNIK)).toContain('s obzirom na to da');
    expect(suggestionFor('U vezi toga nemam komentar.', KIND_VEZNIK)).toContain('u vezi s tim');
    expect(has('U svezi s Vašim upitom javljamo se.', KIND_VEZNIK)).toBe(true);
    expect(has('S obzirom da kasnimo, požurimo.', KIND_VEZNIK)).toBe(true);
  });

  it('NE oznaci ispravne oblike (FP-zamke)', () => {
    for (const s of [
      'S obzirom na to da je kišilo, ostali smo.', 'Bez obzira na sve, uspjeli smo.',
      'U toj vezi nema ničega spornog.', 'U vezi s tim slažemo se.', 'Svezak knjige bio je otrgnut.',
    ]) {
      expect(has(s, KIND_VEZNIK), s).toBe(false);
    }
  });
});

describe('grammar-hr: upitna čestica „je li”', () => {
  it('oznaci jeli/jel/da li/dal', () => {
    expect(suggestionFor('Jeli to točno?', KIND_JE_LI)).toContain('je li to');
    expect(has('Jel može ovako?', KIND_JE_LI)).toBe(true);
    expect(has('Da li je moguće završiti?', KIND_JE_LI)).toBe(true);
    expect(has("Dal' ideš s nama?", KIND_JE_LI)).toBe(true);
  });

  it('NE oznaci glagol „jesti”, izvedenice ni kraticu JEL (FP-zamke)', () => {
    for (const s of [
      'Danas su jeli u menzi.', 'Na jelovniku je bila riba.', 'Radi u pravnom odjelu.',
      'Pomaže da lijek djeluje.', 'Krenuli su dalje niz cestu.', 'JEL klasifikacija primjenjuje se u statistici.',
      'Cijeli je posao dovršen na vrijeme.',
    ]) {
      expect(has(s, KIND_JE_LI), s).toBe(false);
    }
  });
});

describe('grammar-hr: prijedlog s/sa (suženo)', () => {
  it('oznaci „sa” + samoglasnik, „s mnom” i „s sobom”', () => {
    expect(has('Došao je sa autom.', KIND_S_SA)).toBe(true);
    expect(has('Razgovarao je sa Ivanom.', KIND_S_SA)).toBe(true);
    expect(suggestionFor('Idi s mnom na predavanje.', KIND_S_SA)).toContain('sa mnom');
    expect(suggestionFor('Ponio je alat s sobom.', KIND_S_SA)).toContain('sa sobom');
  });

  it('NE oznaci ispravne s/sa oblike (FP-zamke)', () => {
    for (const s of [
      'Razgovarao je sa mnom.', 'Došao je s autom na vrijeme.', 'Putovao je sa Zagrebom u pozadini.',
      'Radi sa školom već godinama.', 'Za i protiv, sa i bez toga.', 'Otišao je s njom.',
      'Ponio je alat sa sobom.', 'Razmisli o tome sam sa sobom.',
    ]) {
      expect(has(s, KIND_S_SA), s).toBe(false);
    }
  });
});

describe('grammar-hr: nestandardni (srpski) oblici', () => {
  it('oznaci nedvosmisleno nestandardne oblike', () => {
    expect(suggestionFor('Prosvjedovalo je hiljadu ljudi.', KIND_SRBIZAM)).toContain('tisuća');
    expect(suggestionFor('Radni uslovi bili su teški.', KIND_SRBIZAM)).toContain('uvjet');
    expect(has('Prisutni sudija donio je odluku.', KIND_SRBIZAM)).toBe(true);
    expect(has('Gust saobraćaj usporio je promet.', KIND_SRBIZAM)).toBe(true);
  });

  it('NE oznaci izvedenice, vlastita imena ni valjane hrvatske riječi (FP-zamke)', () => {
    for (const s of [
      'Primijenili su talasoterapiju u lječilištu.', 'Porodilja je dobila pomoć.',
      'Ostrvo s blagom klasični je roman.', 'Napisao je vrlo opširan uvod.',
      'Predao je izvještaj o provedenom istraživanju.', 'Radi na Saobraćajnom fakultetu.',
    ]) {
      expect(has(s, KIND_SRBIZAM), s).toBe(false);
    }
  });
});

describe('grammar-hr: pleonazmi', () => {
  it('oznaci suvišne konstrukcije i dvostruki superlativ', () => {
    expect(suggestionFor('U tom vremenskom periodu porasla je potražnja.', KIND_PLEONAZAM)).toContain('razdoblj');
    expect(has('Njihova zajednička suradnja urodila je plodom.', KIND_PLEONAZAM)).toBe(true);
    expect(has('Bilo ih je otprilike oko sto.', KIND_PLEONAZAM)).toBe(true);
    expect(has('Odlučili su se vratiti natrag na početak.', KIND_PLEONAZAM)).toBe(true);
    expect(has('Odabrali su najoptimalnije rješenje.', KIND_PLEONAZAM)).toBe(true);
    expect(has('To je bio najidealniji scenarij.', KIND_PLEONAZAM)).toBe(true);
  });

  it('NE oznaci valjane izraze ni „najam/najava” (FP-zamke)', () => {
    for (const s of [
      'Period titranja iznosi dvije sekunde.', 'Pokrenuli su zajednički projekt.',
      'Rasprava oko problema potrajala je.', 'Napravili su korak natrag u pregovorima.',
      'Ugovor o najmu istječe u lipnju.', 'Objavili su najavu događaja.',
      'Odabrali su optimalno rješenje.', 'Tražili su najbolje moguće rješenje.',
    ]) {
      expect(has(s, KIND_PLEONAZAM), s).toBe(false);
    }
  });
});

describe('grammar-hr: administrativizmi i germanizmi', () => {
  it('oznaci kancelarijske sklopove i „za + infinitiv”', () => {
    expect(has('Rad je ocijenjen od strane povjerenstva.', KIND_ADMINISTRATIVIZAM)).toBe(true);
    expect(suggestionFor('Otišao je bez da se ikome javio.', KIND_ADMINISTRATIVIZAM)).toContain('a da');
    expect(has('Po pitanju metodologije nema primjedbi.', KIND_ADMINISTRATIVIZAM)).toBe(true);
    expect(has('Riješili su to na način da su podijelili zadatke.', KIND_ADMINISTRATIVIZAM)).toBe(true);
    expect(has('Iz razloga što je uzorak malen, rezultati su okvirni.', KIND_ADMINISTRATIVIZAM)).toBe(true);
    expect(suggestionFor('Bilo je za očekivati takav ishod.', KIND_ADMINISTRATIVIZAM)).toContain('očekuje se');
    expect(has('Za primijetiti je porast potražnje.', KIND_ADMINISTRATIVIZAM)).toBe(true);
  });

  it('NE oznaci valjane izraze ni „od strane <broj>” (FP-zamke)', () => {
    for (const s of [
      'S druge strane, rezultati su dosljedni.', 'Citat je preuzet od strane 12 izvornika.',
      'Za tu je svrhu razvijen poseban model.', 'Naveo je razloge zbog kojih je odustao.',
      'Na taj su način riješili problem.', 'U vezi s tim javit ćemo se naknadno.',
    ]) {
      expect(has(s, KIND_ADMINISTRATIVIZAM), s).toBe(false);
    }
  });
});

describe('grammar-hr: pisanje ije/je', () => {
  it('oznaci hiperkorekciju („ije” gdje ide „je”)', () => {
    expect(suggestionFor('U tom vrijemenu porasla je potražnja.', KIND_IJE_JE)).toContain('vremenu');
    expect(suggestionFor('Poslijedica toga bila je jasna.', KIND_IJE_JE)).toContain('posljedica');
    expect(has('Prijedsjednik je otvorio sjednicu.', KIND_IJE_JE)).toBe(true);
    expect(has('Postavljen je jasan zahtijev.', KIND_IJE_JE)).toBe(true);
    expect(has('Nijesam o tome razmišljao.', KIND_IJE_JE)).toBe(true);
  });

  it('oznaci obrnutu pogrešku („je” gdje ide „ije”)', () => {
    expect(suggestionFor('Odlučili su primjeniti novu metodu.', KIND_IJE_JE)).toContain('primijeniti');
    expect(suggestionFor('Moguće je primjetiti porast.', KIND_IJE_JE)).toContain('primijetiti');
    expect(suggestionFor('Uzorak su podjelili u dvije skupine.', KIND_IJE_JE)).toContain('podijelili');
    expect(has('Svi djelovi sustava rade.', KIND_IJE_JE)).toBe(true);
    expect(has('To je uvjek bio problem.', KIND_IJE_JE)).toBe(true);
  });

  it('NE oznaci valjane srodnice koje dijele pocetak (FP-zamke)', () => {
    for (const s of [
      'Primjena metode dala je rezultate.', 'Model se primjenjuje u praksi.',
      'Podjela rada bila je jasna.', 'Svi dijelovi sustava rade.',
      'Bio je svjestan rizika.', 'Prekinuo ga je smijeh iz publike.',
      'Zamijenio je mjenjač na vozilu.', 'Njegovo djelo ostalo je zapamćeno.',
      'Odlučio je naslijediti posjed.', 'Uspio je završiti na vrijeme.',
      'Zakon zahtijeva pisani pristanak.', 'Ispunjenje zahtjeva je obvezno.',
      'Skrb o dobrobiti djeteta je prioritet.', 'Razumijem tvoju zabrinutost.',
      'Namjerava mijenjati pristup.', 'Vrijeme je isteklo.',
    ]) {
      expect(has(s, KIND_IJE_JE), s).toBe(false);
    }
  });

  it('„slijedeći” okida SAMO uz imenicu u znacenju „iduci”, ne kao glagolski prilog', () => {
    // pridjev (= iduci): pogresno napisano, treba "sljedeci"
    expect(suggestionFor('Slijedeći korak je analiza podataka.', KIND_IJE_JE)).toContain('Sljedeći korak');
    expect(suggestionFor('U slijedećem poglavlju iznosimo rezultate.', KIND_IJE_JE)).toContain('sljedećem poglavlju');
    expect(has('Slijedeće godine ponovit ćemo mjerenje.', KIND_IJE_JE)).toBe(true);
    expect(has('Podaci su u slijedećoj tablici.', KIND_IJE_JE)).toBe(true);

    // glagolski prilog (= dok slijedi): POSVE ISPRAVNO, ne smije okinuti
    for (const s of [
      'Slijedeći upute mentora, autor je proširio okvir.',
      'Slijedeći preporuke struke, uveli su novi postupak.',
      'Slijedeći smjernice, ispunio je obrazac.',
      'Sljedeći korak je analiza podataka.',
      'Slijediti upute je obvezno.',
    ]) {
      expect(has(s, KIND_IJE_JE), s).toBe(false);
    }
  });
});

describe('grammar-hr: zarez ispred „ali”', () => {
  it('oznaci nedostajuci zarez', () => {
    expect(suggestionFor('Rezultat je točan ali nepotpun.', KIND_ZAREZ)).toContain('zarez');
    expect(has('Pokušali su ali nisu uspjeli.', KIND_ZAREZ)).toBe(true);
  });

  it('NE oznaci kad zarez postoji, na pocetku recenice ni prezime Ali (FP-zamke)', () => {
    for (const s of [
      'Rezultat je točan, ali nepotpun.', 'Pokušali su, ali nisu uspjeli.',
      'Uspjeli su. Ali tek iz drugog pokušaja.', 'Muhammad Ali bio je boksač.',
      'Njegov alibi bio je uvjerljiv.', 'Poslao je ali.',
    ]) {
      expect(has(s, KIND_ZAREZ), s).toBe(false);
    }
  });
});

describe('grammar-hr: anglizmi i kalkovi', () => {
  it('oznaci „bazirano na” i „na X bazi”', () => {
    expect(suggestionFor('Model je baziran na regresiji.', KIND_ANGLIZAM)).toContain('utemeljen na');
    expect(suggestionFor('Podatke prikupljamo na dnevnoj bazi.', KIND_ANGLIZAM)).toContain('svakodnevno');
    expect(has('Zaključak se bazira na uzorku.', KIND_ANGLIZAM)).toBe(true);
  });

  it('NE oznaci prihvacene tudjice ni valjane izraze (FP-zamke)', () => {
    for (const s of [
      'Model je utemeljen na regresiji.', 'Metodu smo implementirali u praksi.',
      'Baza podataka sadrži 500 zapisa.', 'Analiza se temelji na uzorku.',
    ]) {
      expect(has(s, KIND_ANGLIZAM), s).toBe(false);
    }
  });
});

describe('grammar-hr: prosireni nestandardni oblici', () => {
  it('oznaci vjerovatno/uticaj/obim/preduzece (mala slova, sredina recenice)', () => {
    expect(suggestionFor('To je vjerovatno točno.', KIND_SRBIZAM)).toContain('vjerojatno');
    expect(suggestionFor('Veliki uticaj medija je nesporan.', KIND_SRBIZAM)).toContain('utjecaj');
    expect(has('Veliki obim istraživanja iziskuje vrijeme.', KIND_SRBIZAM)).toBe(true);
    expect(has('Njihovo preduzeće osnovano je 2010.', KIND_SRBIZAM)).toBe(true);
    expect(has('Objavljeno je u zvaničnom listu.', KIND_SRBIZAM)).toBe(true);
  });

  // Dokumentirani kompromis: case-sensitive poklapanje stiti vlastita imena i naslove
  // ("Ostrvo s blagom", "Saobracajni fakultet", list "Stampa"), a cijena je da se
  // recenicno-inicijalni (veliko slovo) oblici PROPUSTAJU. Bolje propustiti nego lazno optuziti.
  it('recenicno-inicijalne oblike NAMJERNO propusta (cijena zastite vlastitih imena)', () => {
    expect(has('Uticaj medija je velik.', KIND_SRBIZAM)).toBe(false);
    expect(has('Štampa je o tome izvijestila.', KIND_SRBIZAM)).toBe(false);
  });

  it('NE oznaci hrvatske standarde (FP-zamke)', () => {
    for (const s of [
      'To je vjerojatno točno.', 'Utjecaj medija je velik.', 'Opseg istraživanja bio je velik.',
      'Poduzeće je osnovano 2010.', 'Dao je suglasnost za objavu.', 'Popis literature je potpun.',
      'Objavljeno je u službenom listu.', 'Osobni podaci su zaštićeni.',
    ]) {
      expect(has(s, KIND_SRBIZAM), s).toBe(false);
    }
  });
});

// Precizijski gard preko SVIH provjera odjednom: dobro napisan hrvatski akademski tekst mora dati
// TOCNO NULA nalaza. Recenice su birane tako da gaze uz same rubove pravila (ispravni parnjaci
// izraza koje lovimo), pa hvata i medudjelovanje provjera koje per-kind zamke ne vide.
const CISTI_KORPUS = [
  'S obzirom na to da je uzorak malen, rezultate treba tumačiti oprezno.',
  'Rezultat je točan, ali nepotpun, pa ga valja dopuniti.',
  'Analiza se temelji na podacima prikupljenima tijekom 2024. godine.',
  'U sljedećem poglavlju iznose se rezultati istraživanja.',
  'Slijedeći upute mentora, autor je proširio teorijski okvir.',
  'Primjena metode pokazala se učinkovitom u praksi.',
  'Podjela ispitanika u dvije skupine provedena je nasumično.',
  'Svi dijelovi sustava provjereni su prije predaje.',
  'Autor je bio svjestan ograničenja odabranoga pristupa.',
  'Zakon zahtijeva pisani pristanak ispitanika.',
  'Ispunjenje zahtjeva propisano je pravilnikom.',
  'Vjerojatnost pogreške iznosi manje od pet posto.',
  'Utjecaj medija na javno mnijenje opsežno je istražen.',
  'Opseg istraživanja obuhvaća tri hrvatske županije.',
  'Poduzeće je osnovano 2010. i posluje do danas.',
  'Dobivena je suglasnost etičkoga povjerenstva.',
  'Popis literature izrađen je prema uputama fakulteta.',
  'Osobni podaci ispitanika zaštićeni su u skladu s propisima.',
  'Razumijem da su nalazi ograničeni na promatrani uzorak.',
  'Autor namjerava mijenjati pristup u budućim istraživanjima.',
  'Skrb o dobrobiti djeteta prioritet je svake ustanove.',
  'Posljedice tih odluka vidljive su i danas.',
  'Nasljednik je preuzeo obvezu vođenja projekta.',
  'Predsjednik povjerenstva otvorio je obranu rada.',
  'Rad je podijeljen na pet poglavlja i zaključak.',
  'Metoda je primijenjena na cjelokupnom uzorku.',
  'Moguće je primijetiti blagi porast tijekom promatranog razdoblja.',
  'Citat je preuzet od strane 12 izvornika, uz naznaku stranice.',
  'Sa mnom je surađivalo troje kolega s odsjeka.',
  'Ponio je svu dokumentaciju sa sobom na obranu.',
  'Vremenski okvir istraživanja obuhvaća dvije akademske godine.',
  'Odabrano je optimalno rješenje za zadani problem.',
  'Uvijek se navodi izvor podatka, bez iznimke.',
  'Napisat ću zaključak nakon što dovršim analizu.',
];

describe('grammar-hr: precizija na cistom akademskom tekstu', () => {
  it('dobro napisan hrvatski daje NULA nalaza (gard protiv laznih uzbuna)', () => {
    const nalazi = grammarLint(CISTI_KORPUS);
    const opis = nalazi.map((f) => `${f.kind}: „${f.excerpt}” -> ${f.suggestion}`).join('\n');
    expect(nalazi.length, `ocekivano nula nalaza, dobiveno ${nalazi.length}:\n${opis}`).toBe(0);
  });
});

describe('grammar-hr: summary i robusnost', () => {
  it('summary broji po vrsti; prazan/nevaljan ulaz ne ruši', () => {
    const f = grammarLint(['Ja bi to učinio, ali nemogu.', 'Uslovi su bili loši.']);
    const s = grammarLintSummary(f);
    expect(s.total).toBe(f.length);
    expect(Object.keys(s.byKind).length).toBeGreaterThan(0);
    expect(grammarLint([])).toEqual([]);
    expect(grammarLint(null as any)).toEqual([]);
  });
});
