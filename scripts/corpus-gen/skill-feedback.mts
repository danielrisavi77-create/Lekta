/**
 * IZVOZ NALAZA PREMA `katedra` SKILLU.
 *
 *   npm run skill-feedback [-- --nastavak-od N] [-- --write]
 *
 * Cita `docs/generated/skill-compare.json` (nalaze, nikad pravila) i sastavlja FRAGMENT kataloga
 * kvarova u obliku koji `katedra/scripts/kvar.py` provjerava: `## N. naslov`, proza iz koje se citaju
 * cetiri stvari, barem jedna brojka, barem jedan blok izlaza, najmanje 400 znakova po unosu.
 *
 * SMJER JE JEDNOSMJERAN I OSTAJE TAKAV. Odavde prema Katedri putuje opis KVARA U NJEZINU ALATU,
 * dakle metapodatak o ponasanju skripte. Nijedno fakultetsko pravilo i nijedna recenica rada ne ide
 * ovim kanalom; renderer prozu ne prima ni kao ulaz (`src/corpus/tool-feedback.ts`).
 *
 * ZASTO SU BROJKE I BLOKOVI DOSLOVNI. Ciljani katalog trazi dokaz, ne dojam. Svaki blok nize je
 * prepisan iz stvarnog ispisa alata na imenovanom dokumentu, a ne sastavljen radi ilustracije.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDefectFragment, type DefectClass } from '../../src/corpus/tool-feedback';
import type { ComparisonRow } from '../../src/corpus/tool-comparison';
import { withProvenance } from '../lib/provenance.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const USPOREDBA = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const OUT = join(ROOT, 'docs', 'generated', 'skill-feedback.md');

/**
 * KATALOG KVAROVA DRUGE STRANE.
 *
 * Svaki je izmjeren rucno, na imenovanom dokumentu, prije nego je zapisan. Popis je namjerno kratak:
 * zapis bez potkrepe ne izlazi, pa rast popisa mora pratiti mjerenje, ne slutnju.
 */
export const KVAROVI: readonly DefectClass[] = [
  {
    id: 'pokrivenost-pretpostavlja-autor-godinu',
    owner: 'katedra-lite',
    title: 'Pokrivenost izvora mjeri se samo autor-godinom, pa rad koji citira drukcije nema nijedan citat',
    body: [
      '`verify_sources.py --pokrivenost` gradi skup citata iz tijela rada preko `H.kljucevi_citata`, koji',
      'prepoznaje oblik autor-godina. Rad koji citira numericki (Vancouver) ili u fusnotama (Chicago) ne',
      'proizvede nijedan kljuc, pa skup citata ostane prazan. Svaka jedinica popisa literature tada nema',
      'para i zavrsi na popisu necitiranih.',
      '',
      'Kvar je tih, i to je najgori dio. Skripta ne pada, ne javlja upozorenje o stilu i ne kaze da citate',
      'nije nasla; ispise dug, uredan popis necitiranih jedinica koji izgleda kao pomno mjerenje. Autor koji',
      'taj popis dobije nad urednim radom nauci da mu crvena boja tog alata ne znaci nista, pa ce i stvaran',
      'promasaj poslije proci neopazeno.',
      '',
      'Ograda koja bi ga bila uhvatila stoji u samom izlazu: `citata_razlicitih` je vec u JSON-u i bio je',
      '`0`. Nula prepoznatih citata u radu koji ima punu literaturu nije nalaz o radu nego o citacu, pa',
      'pokrivenost uz tu vrijednost ne smije izdati popis necitiranih, nego reci da stil citiranja nije',
      'prepoznat. Popravak zato ima dva dijela: prepoznavanje numerickog i fusnotnog citiranja u',
      '`pokrivenost`, i tvrdu ogradu koja kod nula prepoznatih citata odbija izdati popis.',
    ].join('\n'),
    output: [
      '$ python3 scripts/verify_sources.py fzsri--final--prijediplomski--uskladjen.docx --pokrivenost --offline',
      '   citata_razlicitih: 0 | necitiranih: 20 | bez_izvora: 0',
      '   (rad ima 20 jedinica literature i citira ih numericki, Vancouver)',
      '',
      '$ python3 scripts/verify_sources.py effectus--seminar--diplomski--uskladjen.docx --pokrivenost --offline',
      '   citata_razlicitih: 0 | necitiranih: 18 | bez_izvora: 0',
      '   (rad ima 18 jedinica i 12 fusnota; pokrivenost cita samo tijelo_rada(put))',
    ].join('\n'),
    support: [
      { kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' },
      { kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'effectus' },
    ],
  },
  {
    id: 'prezime-u-kosom-padezu',
    owner: 'katedra-lite',
    title: 'Prezime u kosom padezu ne nadje svoju jedinicu, pa jedan ispravan citat da dva lazna nalaza',
    body: [
      'Kljuc citata se svodi na prezime prvog autora i godinu, ali se svodjenje radi nad DOSLOVNIM nizom iz',
      'teksta. Hrvatski taj niz sklanja. Recenica "Prema Galtungu i Rugeu (1965)" daje kljuc',
      '`galtungu 1965`, dok jedinica "Galtung, J. i Ruge, M. H. (1965)" daje `galtung 1965`. Kljucevi se',
      'ne poklope.',
      '',
      'Jedan te isti ispravno napisan citat zato proizvede DVA nalaza koji se citaju kao razliciti problemi:',
      'citat bez izvora (jer se kljuc iz teksta ne nalazi u literaturi) i necitirana jedinica (jer se',
      'jedinica ne nalazi u tekstu). Tko gleda samo jedan od ta dva popisa nema nacina vidjeti da su to dvije',
      'strane iste stvari, pa ce popravljati tekst koji je bio tocan.',
      '',
      'Lekta je isti kvar imala i popravila ga svodjenjem na korijen prije usporedbe. Recept je prenosiv i',
      'kratak: skini padezni nastavak s popisa `ovima, evima, ima, ova, eva, om, em, ju, a, e, i, u`,',
      'odbaci korijen kraci od cetiri znaka i uz svaki korijen ponudi i oblik s dodanim `a` zbog zenske',
      'sklonidbe, jer "Bandure" treba dati "bandura". Granica od cetiri znaka nije ukras: bez nje "Mara"',
      'postane "mar" i pocne se lazno vezati uz svaku jedinicu koja pocinje tim slovima, a lazan pozitiv je',
      'gori od laznog negativa jer tiho tvrdi podudaranje kojega nema. Popravak zivi u `kljuc_prvog_autora`',
      'i `kljuc_izvora`, dakle na obje strane usporedbe, inace se raskorak samo preseli.',
    ].join('\n'),
    output: [
      '$ python3 scripts/verify_sources.py fpzg--final--prijediplomski--uskladjen.docx --pokrivenost --offline',
      '   citata_razlicitih: 19 | necitiranih: 1 | bez_izvora: 2',
      '   bez_izvora:  [galtungu 1965, wallacea 2018]      <- kljucevi iz TIJELA rada',
      '   necitirani:  [galtung 1965]                      <- kljuc iste jedinice iz LITERATURE',
      '',
      '   Ista jedinica je istovremeno na oba popisa, pa jedan kvar izgleda kao dva razlicita.',
      '   Tijelo rada pise prezime u dativu i genitivu, sto je ispravan hrvatski; literatura ga pise u',
      '   nominativu, sto je ispravan APA. Nijedna strana nije pogrijesila.',
      '',
      '   (Popis necitiranih je ovdje sveden na KLJUC. Doslovna jedinica je tekst iz dokumenta i ne',
      '    prelazi granicu izmedju dvaju proizvoda; kljuc je izvedenica i dovoljan je za mehanizam.)',
    ].join('\n'),
    support: [
      { kind: 'usporedba', os: 'citirano-bez-jedinice', documentPrefix: 'fpzg' },
      { kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fpzg' },
    ],
  },
  {
    id: 'popis-nadjen-a-poruka-kaze-da-nije',
    owner: 'katedra-lite',
    title: 'Popis literature je nadjen, a poruka kaze da nije: brojcani prefiks jedinice odnese sva prezimena',
    body: [
      '`literatura_prezimena` u `provjeri_fusnote.py` nadje naslov popisa preko `H.NASLOV_LIT`, prodje kroz',
      'jedinice i iz svake izvuce prezime uzorkom koji je usidren na POCETAK odlomka i trazi barem tri znaka',
      'prije zareza ili tocke. Jedinica u numeriranom popisu pocinje brojem i tockom, pa uzorak vidi samo',
      'znamenku, odbije ju i ne uhvati nista.',
      '',
      'Skup prezimena time ostane prazan iako je popis uredno pronadjen i imao 18 jedinica. Poruka koju',
      'korisnik dobije glasi da popis literature nije nadjen, jer prazan skup i nepostojeci popis prolaze',
      'kroz istu granu. Dvije razlicite dijagnoze pod jednom porukom gore su od nijedne: poruka salje',
      'korisnika da trazi naslov koji vec postoji i uredno je stiliziran kao `Heading1`.',
      '',
      'Prava steta je ono sto se pritom PRESKOCI. Provjera razrjesava li se fusnotni citat u popisu',
      'literature jedina je koja tim skupom barata, pa nad numeriranim popisom nikad ne trci. Rad prodje kao',
      'provjeren, a cijela jedna provjera nije bila izvedena, i to uz stanje koje izgleda neutralno.',
      'Popravak ima dva dijela i drugi je vazniji: dopusti neobavezan brojcani prefiks u uzorku za prezime,',
      'i razdvoji dvije poruke, tako da "popis nije nadjen" i "popis nadjen, nijedna jedinica nije',
      'procitana" budu razliciti nalazi. Drugi je ozbiljniji i mora biti vidljiv i kad prvi ne vrijedi.',
    ].join('\n'),
    output: [
      '$ python3 scripts/provjeri_fusnote.py effectus--seminar--diplomski--uskladjen.docx --json out.json',
      '   {"fusnota": 12, "prazno": false, "raspon": "2-13",',
      '    "nalazi": [{"pravilo": "popis", "stanje": "neutralno",',
      '                "poruka": "popis literature nije nadjen - razrjesavanje fusnota nije provjereno"}]}',
      '',
      '   Trag kroz literatura_prezimena() na tom istom dokumentu:',
      '     NASLOV_LIT.match("Literatura")          -> True   (naslov JE nadjen, stil Heading1)',
      '     jedinica poslije naslova                -> 18',
      '     PREZIME.match("1. <Prezime>, <Ime> ...") -> False  (uzorak vidi "1", trazi 3+ znaka)',
      '     literatura_prezimena(...)               -> 0 prezimena',
      '',
      '   (Jedinica je prikazana kao OBLIK, ne doslovno: doslovan redak je tekst iz dokumenta i ne',
      '    prelazi granicu izmedju dvaju proizvoda. Za mehanizam je vazan samo brojcani prefiks.)',
    ].join('\n'),
    support: [
      {
        kind: 'izravno',
        command: 'python3 scripts/provjeri_fusnote.py <docx> --json out.json',
        documents: [
          'effectus--seminar--diplomski--uskladjen.docx',
          'effectus--seminar--diplomski--word.docx',
          'effectus--seminar--diplomski--neuredan.docx',
        ],
      },
    ],
  },
];

function main(): void {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const idx = argv.indexOf('--nastavak-od');
  const continuesFrom = idx >= 0 ? Number(argv[idx + 1]) : 140;

  if (!Number.isInteger(continuesFrom) || continuesFrom < 0) {
    console.error('--nastavak-od trazi cijeli broj (zadnji zauzet broj u ciljanom katalogu).');
    process.exitCode = 2;
    return;
  }
  if (!existsSync(USPOREDBA)) {
    console.error(`Nema artefakta usporedbe: ${USPOREDBA}`);
    console.error('Pokreni `npm run skill-compare -- --write`; bez mjerenja kvar nema potkrepu.');
    process.exitCode = 2;
    return;
  }

  const rows = (JSON.parse(readFileSync(USPOREDBA, 'utf8')) as { rows: ComparisonRow[] }).rows;
  const { markdown, unsupported, numbers } = renderDefectFragment(KVAROVI, rows, continuesFrom);

  console.log(`kvarova u katalogu: ${KVAROVI.length}, izlazi: ${numbers.length} (brojevi ${numbers.join(', ')})`);
  if (unsupported.length) {
    // Nije greska nego ISHOD: mjerenje vise ne potkrepljuje taj zapis, pa je vjerojatno popravljen.
    console.log(`bez potkrepe, ne izlaze: ${unsupported.join(', ')}`);
  }
  if (!numbers.length) {
    console.error('Nijedan kvar nema potkrepu; izvoz bi bio tvrdnja bez dokumenta.');
    process.exitCode = 1;
    return;
  }

  if (!write) {
    console.log(`\n${markdown}`);
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const zaglavlje = withProvenance({}, 'npm run skill-feedback -- --write') as Record<string, string>;
  writeFileSync(
    OUT,
    `<!-- ${zaglavlje.generator} | ${zaglavlje.generatedAt} | ${zaglavlje.generatedFromCommit} -->\n` +
      `<!-- Fragment za <katedra-lite>/references/zamke.md. Provjera na drugoj strani: -->\n` +
      `<!-- python3 <katedra>/scripts/kvar.py <ovaj-fragment>.md --provjeri --nastavak-od ${continuesFrom} -->\n\n` +
      markdown,
    'utf8',
  );
  console.log(`\nzapisano: ${OUT}`);
}

main();
