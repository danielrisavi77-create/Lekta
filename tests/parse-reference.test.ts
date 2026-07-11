import { describe, it, expect } from 'vitest';

import { parseReference, splitReferences, type BulkStyle } from '../src/citations/parse-reference';

describe('splitReferences', () => {
  it('dijeli po praznom retku kad postoji', () => {
    const out = splitReferences('Prva referenca.\n\nDruga\nreferenca u dva retka.');
    expect(out).toEqual(['Prva referenca.', 'Druga referenca u dva retka.']);
  });

  it('dijeli po retku kad nema praznih redaka', () => {
    expect(splitReferences('Prva\nDruga\nTreca')).toEqual(['Prva', 'Druga', 'Treca']);
  });

  it('skida redne oznake i prazne unose', () => {
    expect(splitReferences('1. Prva\n2) Druga\n[3] Treca\n   ')).toEqual(['1. Prva', '2) Druga', '[3] Treca']);
    // stripMarker se primjenjuje u parseReference, ne u splitu; split zadrzava sirovi redak
  });
});

describe('parseReference', () => {
  it('APA knjiga: autor, godina, naslov, mjesto, izdavac', () => {
    const r = parseReference('Kovačić, I. (2020). Politički sustavi. Zagreb: Fakultet političkih znanosti.');
    expect(r.type).toBe('knjiga');
    expect(r.fields.year).toBe('2020');
    expect(r.fields.title).toBe('Politički sustavi');
    expect(r.fields.place).toBe('Zagreb');
    expect(r.fields.publisher).toBe('Fakultet političkih znanosti');
    expect(r.fields.authors).toContain('Kovačić');
  });

  it('APA clanak: casopis, volumen, broj, stranice', () => {
    const r = parseReference('Horvat, A., & Marić, P. (2019). Analiza podataka. Društvena istraživanja, 28(3), 45-67.');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.title).toBe('Analiza podataka');
    expect(r.fields.container).toBe('Društvena istraživanja');
    expect(r.fields.volume).toBe('28');
    expect(r.fields.issue).toBe('3');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.authors).toContain('Horvat');
    expect(r.fields.authors).toContain('Marić');
  });

  it('clanak s DOI-jem: izvlaci DOI, ne tretira URL kao mjesto', () => {
    const r = parseReference('Kovač, M. (2021). Naslov rada. Časopis, 5, 1-10. https://doi.org/10.1234/abcd');
    expect(r.fields.doi).toBe('10.1234/abcd');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Naslov rada');
    expect(r.fields.pages).toBe('1-10');
    expect(r.fields.place).toBeUndefined();
    expect(r.fields.publisher).toBeUndefined();
  });

  it('mrezni izvor: institucija kao autor + URL', () => {
    const r = parseReference('Državni zavod za statistiku (2021). Popis stanovništva. https://dzs.hr/popis');
    expect(r.type).toBe('mrezni');
    expect(r.fields.url).toBe('https://dzs.hr/popis');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Popis stanovništva');
    expect(r.fields.authors).toContain('Državni zavod');
  });

  it('prvi autor (za sortiranje) je prezime prije prvog zareza', () => {
    const r = parseReference('Šimić, T. (2018). Naslov. Split: Redak.');
    // sort kljuc se u UI-u racuna preko parseAuthors; ovdje samo potvrda da autor pocinje prezimenom
    expect(r.fields.authors.startsWith('Šimić')).toBe(true);
  });

  it('nepotpun/messy unos ne puca i oznacava nisku pouzdanost', () => {
    const r = parseReference('nekakav nepotpun tekst bez ičega');
    expect(r.type).toBe('knjiga');
    expect(r.lowConfidence).toBe(true);
    expect(() => parseReference('')).not.toThrow();
  });

  it('propis: prepoznaje Narodne novine', () => {
    const r = parseReference('Zakon o radu. Narodne novine, 93/14.');
    expect(r.type).toBe('propis');
  });
});

// Golden korpus: realan zalijepljen popis literature (APA hr/en mix). Pinovi pokrivaju svaku
// klasu popravka bulk parsera; regresija ako se parser pokvari. Ne mijenjati bez razloga.
describe('parseReference: korpus (regresija bulk)', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string> }> = [
    {
      name: 'hrv veznik "i": zadrzava SVA tri autora',
      raw: 'Petz, B., Kolesarić, V. i Ivanec, D. (2012). Petzova statistika. Jastrebarsko: Naklada Slap.',
      type: 'knjiga',
      expect: { authors: 'Petz, B.; Kolesarić, V.; Ivanec, D.', place: 'Jastrebarsko', publisher: 'Naklada Slap' },
    },
    {
      name: 'zadnji inicijal se NE gubi (Deci, E. L.)',
      raw: 'Deci, E. L., & Ryan, R. M. (1985). Intrinsic motivation and self-determination in human behavior. New York: Plenum.',
      type: 'knjiga',
      expect: { authors: 'Deci, E. L.; Ryan, R. M.', place: 'New York', publisher: 'Plenum' },
    },
    {
      name: 'mjesto sa zarezom (Cambridge, MA)',
      raw: 'Vygotsky, L. S. (1978). Mind in society. Cambridge, MA: Harvard University Press.',
      type: 'knjiga',
      expect: { place: 'Cambridge, MA', publisher: 'Harvard University Press' },
    },
    {
      name: 'izdavac s tockama (W. H. Freeman)',
      raw: 'Bandura, A. (1997). Self-efficacy: The exercise of control. New York: W. H. Freeman.',
      type: 'knjiga',
      expect: { title: 'Self-efficacy: The exercise of control', publisher: 'W. H. Freeman' },
    },
    {
      name: 'izdavac sa zarezom (Farrar, Straus and Giroux)',
      raw: 'Kahneman, D. (2011). Thinking, fast and slow. New York: Farrar, Straus and Giroux.',
      type: 'knjiga',
      expect: { publisher: 'Farrar, Straus and Giroux' },
    },
    {
      name: 'clanak: casopis, volumen(broj), stranice',
      raw: 'Kardum, I., & Hudek-Knežević, J. (2012). Osobine ličnosti i zdravlje. Psihologijske teme, 21(2), 235-256.',
      type: 'clanak',
      expect: { authors: 'Kardum, I.; Hudek-Knežević, J.', container: 'Psihologijske teme', volume: '21', issue: '2', pages: '235-256' },
    },
    {
      name: 'poglavlje u zborniku "U: ... (ur.), Knjiga (str. X-Y). Mjesto: Izdavac"',
      raw: 'Šverko, B. (2004). Ljudske vrednote. U: J. Obradović i M. Čudina-Obradović (ur.), Psihologija (str. 45-78). Zagreb: Golden marketing.',
      type: 'poglavlje',
      expect: { title: 'Ljudske vrednote', editor: 'J. Obradović, M. Čudina-Obradović', container: 'Psihologija', pages: '45-78', place: 'Zagreb', publisher: 'Golden marketing' },
    },
    {
      name: 'propis: naziv + Narodne novine + broj',
      raw: 'Zakon o zaštiti osobnih podataka. (2018). Narodne novine, 42/18.',
      type: 'propis',
      expect: { title: 'Zakon o zaštiti osobnih podataka', container: 'Narodne novine', issue: '42/18' },
    },
    {
      name: 'zavrsni/doktorski: ustanova u institution, ne izdavac',
      raw: 'Marušić, I. (2019). Motivacija za učenje (Doktorska disertacija). Filozofski fakultet, Sveučilište u Zagrebu.',
      type: 'zavrsni',
      expect: { institution: 'Filozofski fakultet, Sveučilište u Zagrebu' },
    },
    {
      name: 'APA7 bez mjesta: goli izdavac',
      raw: 'Fulgosi, A. (1997). Faktorska analiza. Školska knjiga.',
      type: 'knjiga',
      expect: { publisher: 'Školska knjiga' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = parseReference(c.raw);
      expect(r.type).toBe(c.type);
      for (const [k, v] of Object.entries(c.expect)) {
        expect(`${k}=${(r.fields as any)[k] ?? ''}`).toBe(`${k}=${v}`);
      }
    });
  }
});

type SourceTypeLike = 'knjiga' | 'poglavlje' | 'clanak' | 'mrezni' | 'zavrsni' | 'propis';

// IEEE (numericki tehnicki: inicijali PRIJE prezimena, naslov u navodnicima, "vol./no./pp.").
describe('parseReference: IEEE korpus', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string> }> = [
    {
      name: 'clanak: inicijali prije prezimena, kratica casopisa s tockom',
      raw: 'J. Smith and A. Jones, "Deep learning for radiology," IEEE Trans. Med. Imag., vol. 39, no. 5, pp. 1234-1245, 2020.',
      type: 'clanak',
      expect: { authors: 'Smith, J.; Jones, A.', title: 'Deep learning for radiology', container: 'IEEE Trans. Med. Imag.', volume: '39', issue: '5', pages: '1234-1245', year: '2020' },
    },
    {
      name: 'konferencija: "in Proc. ...", grad odvojen od naziva',
      raw: 'K. He, X. Zhang, S. Ren, and J. Sun, "Deep residual learning for image recognition," in Proc. IEEE CVPR, Las Vegas, NV, 2016, pp. 770-778.',
      type: 'poglavlje',
      expect: { authors: 'He, K.; Zhang, X.; Ren, S.; Sun, J.', container: 'Proc. IEEE CVPR', place: 'Las Vegas, NV', pages: '770-778', year: '2016' },
    },
    {
      name: 'clanak: dvoslovni inicijali (G. E.)',
      raw: 'A. Krizhevsky, I. Sutskever, and G. E. Hinton, "ImageNet classification," in Proc. NeurIPS, 2012, pp. 1097-1105.',
      type: 'poglavlje',
      expect: { authors: 'Krizhevsky, A.; Sutskever, I.; Hinton, G. E.', container: 'Proc. NeurIPS', pages: '1097-1105' },
    },
  ];
  runCases(cases);
});

// Chicago / fusnota (humanistika, pravo): "Prezime, Ime" ILI "Ime Prezime, Naslov (Mjesto: Izd, god)".
describe('parseReference: Chicago / fusnota korpus', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string> }> = [
    {
      name: 'biblio knjiga: "Prezime, Ime. Naslov. Mjesto: Izdavac, godina."',
      raw: 'Bloom, Harold. The Western Canon: The Books and School of the Ages. New York: Harcourt Brace, 1994.',
      type: 'knjiga',
      expect: { authors: 'Bloom, Harold', title: 'The Western Canon: The Books and School of the Ages', place: 'New York', publisher: 'Harcourt Brace', year: '1994' },
    },
    {
      name: 'biblio clanak: "Casopis Vol, no. N (godina): str" (ne mijesa se s IEEE-om)',
      raw: 'Smith, John. "The Rhetoric of Silence." Critical Inquiry 12, no. 3 (2019): 45-67.',
      type: 'clanak',
      expect: { authors: 'Smith, John', title: 'The Rhetoric of Silence', container: 'Critical Inquiry', volume: '12', issue: '3', pages: '45-67', year: '2019' },
    },
    {
      name: 'fusnota: "Ime Prezime, Naslov (Mjesto: Izdavac, godina), str."',
      raw: 'Ivan Ivić, Ustavno pravo Republike Hrvatske (Zagreb: Narodne novine, 2020), 45.',
      type: 'knjiga',
      expect: { authors: 'Ivić, Ivan', title: 'Ustavno pravo Republike Hrvatske', place: 'Zagreb', publisher: 'Narodne novine', year: '2020', pages: '45' },
    },
    {
      name: 'biblio knjiga: dva autora (prvi obrnut, drugi prirodan + "i")',
      raw: 'Petz, Boris, i Vladimir Kolesarić. Uvod u statistiku. Jastrebarsko: Naklada Slap, 2010.',
      type: 'knjiga',
      expect: { authors: 'Petz, Boris; Kolesarić, Vladimir', place: 'Jastrebarsko', publisher: 'Naklada Slap', year: '2010' },
    },
  ];
  runCases(cases);
});

// Rucni izbor stila: forsiranje grane daje ispravan rezultat cak i kad je auto-detekcija dvojbena.
describe('parseReference: forsiranje stila (rucni izbor)', () => {
  it('chicago picker ispravno parsira clanak koji auto inace moze pomijesati', () => {
    const r = parseReference('Smith, John. "The Title." Journal 5, no. 2 (2019): 10-20.', 'chicago');
    expect(r.type).toBe('clanak');
    expect(r.fields.authors).toBe('Smith, John');
    expect(r.fields.volume).toBe('5');
    expect(r.fields.pages).toBe('10-20');
  });

  it('vancouver picker forsira granu i na graničnom obliku', () => {
    const r = parseReference('Kovač M. Naslov rada. Časopis. 2020;5(2):10-5.', 'vancouver');
    expect(r.type).toBe('clanak');
    expect(r.fields.authors).toBe('Kovač, M.');
    expect(r.fields.container).toBe('Časopis');
  });
});

function runCases(cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string>; style?: BulkStyle }>): void {
  for (const c of cases) {
    it(c.name, () => {
      const r = parseReference(c.raw, c.style);
      expect(r.type).toBe(c.type);
      for (const [k, v] of Object.entries(c.expect)) {
        expect(`${k}=${(r.fields as any)[k] ?? ''}`).toBe(`${k}=${v}`);
      }
    });
  }
}

// Vancouver / ICMJE (numericko biomedicinsko): autori bez zareza/tocaka, "Godina;Vol(Broj):Str".
// Stvarni radioloski/zdravstveni popis (fakulteti medicine/zdravstva ga koriste). Regresija.
describe('parseReference: Vancouver korpus', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string> }> = [
    {
      name: 'clanak: autori bez zareza, casopis, godina;vol(broj):str',
      raw: 'Đorđević V, Braš M. Osnovni pojmovi o komunikaciji u medicini. Medix. 2011;17(92 Supl 1):12-4.',
      type: 'clanak',
      expect: { authors: 'Đorđević, V.; Braš, M.', title: 'Osnovni pojmovi o komunikaciji u medicini', container: 'Medix', year: '2011', volume: '17', issue: '92 Supl 1', pages: '12-4' },
    },
    {
      name: 'clanak: viserjecno prezime + jednorjecni casopis',
      raw: 'Marojević Glibo D, Topić Stipić D. Načela uspješne komunikacije u zdravstvu. Mostariensia. 2019;23(1):81-93.',
      type: 'clanak',
      expect: { authors: 'Marojević Glibo, D.; Topić Stipić, D.', container: 'Mostariensia', volume: '23', issue: '1', pages: '81-93' },
    },
    {
      name: 'clanak: bez broja (samo volumen), broj clanka kao stranica',
      raw: 'Sharkiya SH. Quality communication. BMC Health Serv Res. 2023;23:886.',
      type: 'clanak',
      expect: { authors: 'Sharkiya, S. H.', container: 'BMC Health Serv Res', volume: '23', pages: '886' },
    },
    {
      name: 'clanak: zbijeni inicijali (YKE) se sire, et al se izostavlja',
      raw: 'Zarkan AH, Bamunif AS, Othman Names DI, Almotiri AK, et al. Communication strategies in MRI. J Ecohumanism. 2025;4(4):3494-505.',
      type: 'clanak',
      expect: { authors: 'Zarkan, A. H.; Bamunif, A. S.; Othman Names, D. I.; Almotiri, A. K.', container: 'J Ecohumanism', volume: '4', issue: '4', pages: '3494-505' },
    },
    {
      name: 'clanak: particle prezime (Van) + hrv "i sur."',
      raw: 'Van Goethem M, Mortelmans D, i sur. Influence of the radiographer on the pain felt during mammography. Eur Radiol. 2003;13(10):2384-9.',
      type: 'clanak',
      expect: { authors: 'Van Goethem, M.; Mortelmans, D.', container: 'Eur Radiol', volume: '13', issue: '10', pages: '2384-9' },
    },
    {
      name: 'knjiga: urednici (ur.), Mjesto: Izdavac; Godina',
      raw: 'Sindik J, Vučković Matić M, ur. Komuniciranje u zdravstvu: zbirka nastavnih tekstova. Dubrovnik: Sveučilište u Dubrovniku; 2016.',
      type: 'knjiga',
      expect: { authors: 'Sindik, J.; Vučković Matić, M.', title: 'Komuniciranje u zdravstvu: zbirka nastavnih tekstova', place: 'Dubrovnik', publisher: 'Sveučilište u Dubrovniku', year: '2016' },
    },
    {
      name: 'zavrsni rad: [zavrsni rad] -> institution',
      raw: 'Lukić A. Verbalna i neverbalna komunikacija [završni rad]. Pula: Sveučilište Jurja Dobrile u Puli; 2016.',
      type: 'zavrsni',
      expect: { authors: 'Lukić, A.', title: 'Verbalna i neverbalna komunikacija', institution: 'Pula, Sveučilište Jurja Dobrile u Puli', year: '2016' },
    },
    {
      name: 'diplomski rad: [diplomski rad] -> institution s fakultetom',
      raw: 'Sokol K. Komunikacija kao temelj kvalitetne zdravstvene skrbi [diplomski rad]. Zagreb: Sveučilište u Zagrebu, Medicinski fakultet; 2020.',
      type: 'zavrsni',
      expect: { institution: 'Zagreb, Sveučilište u Zagrebu, Medicinski fakultet', year: '2020' },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = parseReference(c.raw);
      expect(r.type).toBe(c.type);
      for (const [k, v] of Object.entries(c.expect)) {
        expect(`${k}=${(r.fields as any)[k] ?? ''}`).toBe(`${k}=${v}`);
      }
    });
  }
});

// KNJIGE / MONOGRAFIJE / ZBORNICI po SVIM stilovima (regresija). Pokrivaju oblike koje round-trip
// (nas renderer) i cross-style konsenzus (doi.org/CSL) korpus dokazuju; ovdje su pinani doslovno.
describe('parseReference: knjige/monografije/zbornici po stilovima (regresija)', () => {
  const cases: Array<{ name: string; raw: string; type: SourceTypeLike; expect: Record<string, string>; style?: BulkStyle }> = [
    {
      name: 'IEEE knjiga: vise autora, naslov i dotirani izdavac',
      raw: 'B. Petz, V. Kolesarić, and D. Ivanec, Statistika. Zagreb: Naklada Slap, 2012.',
      style: 'ieee', type: 'knjiga',
      expect: { authors: 'Petz, B.; Kolesarić, V.; Ivanec, D.', title: 'Statistika', place: 'Zagreb', publisher: 'Naklada Slap', year: '2012' },
    },
    {
      name: 'IEEE knjiga: naslov s dvotockom (podnaslov)',
      raw: 'A. Bandura, Self-efficacy: The exercise of control. New York: W. H. Freeman, 1997.',
      style: 'ieee', type: 'knjiga',
      expect: { title: 'Self-efficacy: The exercise of control', place: 'New York', publisher: 'W. H. Freeman', year: '1997' },
    },
    {
      name: 'IEEE poglavlje u knjizi: "in Knjiga, Urednik, Ed. Mjesto: Izdavac, God, pp."',
      raw: 'B. Šverko, "Vrednote," in Psihologija, J. Obradović, Ed. Zagreb: Golden marketing, 2004, pp. 45-78.',
      style: 'ieee', type: 'poglavlje',
      expect: { title: 'Vrednote', container: 'Psihologija', editor: 'J. Obradović', place: 'Zagreb', publisher: 'Golden marketing', pages: '45-78', year: '2004' },
    },
    {
      name: 'Vancouver poglavlje: "In: Urednik, editor. Zbornik. Mjesto: Izdavac; God. p. X-Y"',
      raw: 'Čorkalo Biruški D. Psihologija sukoba. In: Ajduković M, editor. Socijalna psihologija. Zagreb: Naklada Slap; 2010. p. 201-230.',
      style: 'vancouver', type: 'poglavlje',
      expect: { title: 'Psihologija sukoba', container: 'Socijalna psihologija', editor: 'Ajduković M', place: 'Zagreb', publisher: 'Naklada Slap', pages: '201-230', year: '2010' },
    },
    {
      name: 'Vancouver (elsevier) rad u zborniku bez volumena: "Zbornik God:Str"',
      raw: 'Saha S, Bhattacharyya SS. Design methodology for embedded computer vision. Embedded Computer Vision 2009:27-47.',
      style: 'vancouver', type: 'clanak',
      expect: { authors: 'Saha, S.; Bhattacharyya, S. S.', title: 'Design methodology for embedded computer vision', container: 'Embedded Computer Vision', year: '2009', pages: '27-47' },
    },
    {
      name: 'Vancouver (elsevier) monografija: gola godina zalijepljena na naslov',
      raw: 'Carbonnier G. Humanitarian economics 2016.',
      style: 'vancouver', type: 'knjiga',
      expect: { authors: 'Carbonnier, G.', title: 'Humanitarian economics', year: '2016' },
    },
    {
      name: 'APA rad u zborniku bez volumena: "Naslov. Zbornik, str."',
      raw: 'Kanmani, B. (2011). Introducing signals and systems. 2011 DSP/SPE Meeting, 84-89.',
      style: 'apa', type: 'knjiga',
      expect: { title: 'Introducing signals and systems', container: '2011 DSP/SPE Meeting', pages: '84-89', year: '2011' },
    },
    {
      name: 'APA zbornik BEZ urednika: "U: Zbornik (str. X-Y). Mjesto: Izdavac"',
      raw: 'Horvat, I., & Kovač, M. (2019). Detekcija anomalija. U: Zbornik radova MIPRO (str. 112-118). Rijeka: MIPRO.',
      style: 'apa', type: 'poglavlje',
      expect: { container: 'Zbornik radova MIPRO', pages: '112-118', place: 'Rijeka', publisher: 'MIPRO' },
    },
    {
      name: 'Chicago poglavlje: gole stranice ("..., Zbornik, 45-78. Mjesto: Izdavac")',
      raw: 'Kardum, Igor, i Jasna Hudek-Knežević. "Osobine ličnosti." U: Denis Bratko (ur.), Ličnost i zdravlje, 45-78. Zagreb: Naklada Slap, 2012.',
      style: 'chicago', type: 'poglavlje',
      expect: { container: 'Ličnost i zdravlje', pages: '45-78', editor: 'Denis Bratko', place: 'Zagreb', publisher: 'Naklada Slap' },
    },
    {
      name: 'Chicago zbornik BEZ urednika: "u: Zbornik, Mjesto: Izdavac, God. str. X-Y"',
      raw: 'Horvat, Ivan. "Detekcija anomalija." u: Zbornik radova MIPRO, Rijeka: MIPRO, 2019. str. 112-118.',
      style: 'chicago', type: 'poglavlje',
      expect: { container: 'Zbornik radova MIPRO', place: 'Rijeka', publisher: 'MIPRO', pages: '112-118', year: '2019' },
    },
  ];
  runCases(cases);
});
