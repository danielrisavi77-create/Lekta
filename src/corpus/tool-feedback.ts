/**
 * IZVOZ NALAZA PREMA `katedra` SKILLU: kvar zapis u obliku koji taj katalog cita.
 *
 * Sto ovaj modul jest. Usporedba dvaju alata (`tool-comparison.ts`) kaze da se nalazi razilaze; ona
 * ne kaze zasto. Ovdje se to razilazenje pretvara u ZAPIS koji druga strana moze primijeniti: naslov
 * koji imenuje mehanizam, proza iz koje se citaju cetiri stvari (sto se vidjelo, zasto, sto se
 * mijenja, gdje popravak zivi), izmjerena brojka i blok IZLAZA ALATA.
 *
 * GRANICA KOJU CUVA. Ustav proizvoda dopusta da izmedju aplikacija putuju samo metapodaci,
 * identifikatori nalaza, ozbiljnost i ocjena, nikad sadrzaj rada. Zato je zapis sastavljen
 * iskljucivo od DEKLARIRANIH polja u ovom modulu i IZMJERENIH brojki iz artefakta usporedbe. Prozni
 * tekst rada nema kanal kojim bi usao: renderer ga ne prima ni kao ulaz.
 *
 * ZASTO SVAKI ZAPIS MORA IMATI POTKREPU. Zeljezno pravilo ciljanog skilla je "nijedan kvar bez
 * dokumenta koji ga je proizveo". To se ovdje ne cuva pamcenjem nego mehanicki: zapis bez ijednog
 * retka mjerenja koji ga podupire ne izlazi, nego se prijavljuje. Kvar koji se popravi na drugoj
 * strani time sam ispadne iz izvoza umjesto da godinama stoji kao istinita proslost.
 */
import type { ComparisonRow } from './tool-comparison';

/**
 * Cime je zapis potkrijepljen.
 *
 * `usporedba` je jaci oblik: potkrepa se ponovno izracuna iz artefakta pri svakom izvozu, pa zapis
 * istrune sam od sebe kad kvara nestane. `izravno` postoji za kvarove koje usporedba po konstrukciji
 * ne vidi, jer druga strana mjeri os koju nasa nema; ondje se biljezi NAREDBA kojom se ponavlja.
 */
export type DefectSupport =
  | { kind: 'usporedba'; os: string; documentPrefix: string }
  | { kind: 'izravno'; command: string; documents: readonly string[] };

export interface DefectClass {
  /** Interni identitet, za gard i za povezivanje s eval slucajem. Nikad ne izlazi u zapis. */
  id: string;
  /**
   * Referenca na popravak kad je kvar zatvoren UZVODNO. Zapis time IZLAZI IZ IZVOZA, ali OSTAJE u
   * katalogu.
   *
   * Zasto ne brisanje: brisanjem bi nestao i dokaz da je kvar postojao i eval slucaj koji se na njega
   * veze preko `defectId`. Uz to bi katalog tiho ostao prazan, a prazan izvoz izgleda isto kao izvoz
   * koji vise nista ne mjeri. Ovako se prazno stanje ne moze dogoditi neprimjetno: gard trazi da SVAKI
   * zapis ima ili potkrepu ili ovu referencu, i da otvorenih bude barem jedan.
   *
   * IZMJERENO 2026-09-10: sva tri zatecena zapisa bila su zatvorena uzvodno, a mjerili smo ih protiv
   * kopije paketa koja je bila OSAMNAEST verzija stara (v1.9.22 naspram v1.9.40). Nalaz o tudjem alatu
   * vrijedi samo uz verziju uz koju je izmjeren.
   */
  resolvedUpstream?: string;
  /** Skill cija je skripta kriva; odredjuje u koji katalog zapis ide. */
  owner: 'katedra-lite' | 'rad-audit' | 'rad-docx';
  /** Naslov imenuje MEHANIZAM, ne simptom. Bez broja i bez oblika "Kvar N -". */
  title: string;
  /** Proza kvara. Cetiri stvari moraju se dati procitati, ali se ne pisu kao rubrike. */
  body: string;
  /** Blok izlaza alata ili koda, doslovno. Dolazi iz ISPISA, nikad iz teksta rada. */
  output: string;
  support: readonly DefectSupport[];
}

export interface RenderedFragment {
  markdown: string;
  /** Zapisi koje mjerenje vise ne potkrepljuje; ovi NISU u izlazu. */
  unsupported: string[];
  /** Koliko je zapisa izaslo, i s kojim brojevima. */
  numbers: number[];
}

/** Redci mjerenja koji podupiru jedan zapis: razilazenje na navedenoj osi i dokumentu. */
export function supportingRows(support: readonly DefectSupport[], rows: readonly ComparisonRow[]): ComparisonRow[] {
  const trazeni = support.filter((s): s is Extract<DefectSupport, { kind: 'usporedba' }> => s.kind === 'usporedba');
  if (!trazeni.length) return [];
  return rows.filter((r) =>
    trazeni.some(
      (s) =>
        s.os === r.os &&
        r.dokument.startsWith(s.documentPrefix) &&
        (r.ishod === 'samo-katedra' || r.ishod === 'samo-lekta'),
    ),
  );
}

/**
 * Zapisi koji jos NISU zatvoreni uzvodno; samo oni idu u izvoz prema drugom proizvodu.
 *
 * Izvoz zatvorenog kvara nije bezopasan: druga strana ga procita kao otvoren zadatak i potrosi pregled
 * na posao koji je vec obavljen. Izmjereno 2026-09-10 na vlastitoj kozi, granom koja je duplicirala
 * postojeci popravak i morala biti povucena.
 */
export function openDefects(klase: readonly DefectClass[]): DefectClass[] {
  return klase.filter((k) => !k.resolvedUpstream);
}

/**
 * Zapis je potkrijepljen ako ga podupire barem jedan redak mjerenja, ILI ako nosi izravnu potkrepu
 * s naredbom i imenovanim dokumentima. Prazan popis dokumenata nije potkrepa nego tvrdnja.
 */
export function isSupported(cls: DefectClass, rows: readonly ComparisonRow[]): boolean {
  if (supportingRows(cls.support, rows).length > 0) return true;
  return cls.support.some((s) => s.kind === 'izravno' && s.command.length > 0 && s.documents.length > 0);
}

/**
 * Hrvatski broj uz imenicu ima TRI oblika, ne dva, i zapis ide drugom proizvodu pa se cita kao nas
 * rad: 1 dokument, 2 do 4 dokumenta, 5 i vise dokumenata. Iznimke su tinejdzerske: 11 do 14 uvijek
 * uzimaju zadnji oblik, pa `11 dokumenata` a `21 dokument`.
 */
export function dokumenata(n: number): string {
  const zadnja = n % 10;
  const dvije = n % 100;
  if (zadnja === 1 && dvije !== 11) return `${n} dokumentu`;
  if (zadnja >= 2 && zadnja <= 4 && (dvije < 12 || dvije > 14)) return `${n} dokumenta`;
  return `${n} dokumenata`;
}

function measuredLine(cls: DefectClass, rows: readonly ComparisonRow[]): string {
  const podupiruci = supportingRows(cls.support, rows);
  if (podupiruci.length) {
    const dokumenti = [...new Set(podupiruci.map((r) => r.dokument))].sort();
    const najveci = podupiruci.reduce((a, r) => Math.max(a, r.katedra ?? 0), 0);
    return (
      `Izmjereno na ${dokumenata(dokumenti.length)} (${dokumenti.join(', ')}); ` +
      `najveci broj nalaza na jednom dokumentu je ${najveci}.`
    );
  }
  const izravna = cls.support.find((s): s is Extract<DefectSupport, { kind: 'izravno' }> => s.kind === 'izravno');
  const imena = izravna?.documents ?? [];
  return `Izmjereno izravno na ${dokumenata(imena.length)} (${imena.join(', ')}).`;
}

/**
 * Sastavlja FRAGMENT kataloga: dopunu koja pocinje na `continuesFrom + 1`. Zaglavlje "nadovezuje se
 * na unos N" cita alat druge strane, pa se numeracija ne sudara sa zapisima koje mi ne vidimo.
 */
export function renderDefectFragment(
  classes: readonly DefectClass[],
  rows: readonly ComparisonRow[],
  continuesFrom: number,
): RenderedFragment {
  const unsupported: string[] = [];
  const numbers: number[] = [];
  const dijelovi: string[] = [`nadovezuje se na unos ${continuesFrom}`, ''];

  let broj = continuesFrom;
  for (const cls of classes) {
    if (!isSupported(cls, rows)) {
      unsupported.push(cls.id);
      continue;
    }
    broj += 1;
    numbers.push(broj);
    dijelovi.push(
      `## ${broj}. ${cls.title}`,
      '',
      cls.body.trim(),
      '',
      measuredLine(cls, rows),
      '',
      '```',
      cls.output.trim(),
      '```',
      '',
    );
  }

  return { markdown: dijelovi.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', unsupported, numbers };
}
