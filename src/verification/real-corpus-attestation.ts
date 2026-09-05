/**
 * OVJERA DOKAZA NAD STVARNIM RADOVIMA.
 *
 * ZASTO POSTOJI. Razina dokaza `A` trazi dokaz na stvarnom studentskom radu, a ljestvica je dosad
 * priznavala samo COMMITANE uzorke. Stvarni korpus (38 radova) su tudji studentski radovi i
 * gitignoriran je, pa je `A` bila nedostizna PO KONSTRUKCIJI: 338 profila trajno je stajalo na `B`
 * uz blokator koji nitko nikad ne moze ukloniti. To je najgori oblik mjere, jer izgleda kao
 * zaostatak a zapravo je zid, pa svaka sesija trosi trud na nesto sto ne moze pomaknuti brojku.
 *
 * STO OVJERA JEST: zapis da je mjerenje IZVEDENO, s brojkama i potpisom. Sto ovjera NIJE: dokument,
 * njegov sadrzaj, ni bilo sto iz cega bi se rad dao rekonstruirati. U repozitorij ulazi tvrdnja o
 * mjerenju, ne gradja nad kojom je mjereno.
 *
 * ZASTO POTPIS. Bez njega bi ovjera bila samopotvrdjujuca: skripta bi tvrdila da je dokaz izveden
 * jer ju je netko pokrenuo. Potpis je isti standard koji repozitorij vec trazi od tvrdnji o
 * pravilima (`verifiedBy`, `decidedBy`), i jedini je razlog zasto ovjera vrijedi vise od komentara.
 *
 * NEPOTPISANA OVJERA NE VRIJEDI NISTA i to je namjerno: generator je smije napisati, ali dok je
 * covjek ne potpise, ljestvica je ne gleda. Time se ne moze dogoditi da razina `A` poraste zato sto
 * je netko pokrenuo skriptu.
 */

/** Jedan mjereni profil: brojke iz prolaza, bez ijednog podatka o dokumentima. */
export interface CorpusAttestationEntry {
  profileId: string;
  workType: string;
  /** Koliko je stvarnih radova uslo u mjerenje za ovaj profil. */
  documentCount: number;
  /** Koliko ih je zavrsilo bez pada isporuke i bez pass-regresije. */
  cleanCount: number;
  /** Imena provjera koje su igdje regresirale; prazno znaci nijedna. */
  regressedChecks: string[];
}

export interface CorpusAttestation {
  schemaVersion: 1;
  /** Otisak SKUPA mjerenih radova (imena i velicine), nikad sadrzaja. Mijenja se kad se korpus mijenja. */
  corpusFingerprint: string;
  measuredAt: string;
  /** Commit nad kojim je mjereno; bez njega se ne zna sto je tocno dokazano. */
  measuredFromCommit: string | null;
  /** Alati kojima je mjereno. Prazno = ovjera ne vrijedi. */
  oracles: string[];
  /** Tko jamci za mjerenje. `null` dok covjek ne potpise, i tada ovjera NE vrijedi. */
  signedBy: string | null;
  signedAt: string | null;
  entries: CorpusAttestationEntry[];
}

/** Razlozi zbog kojih ovjera ne vrijedi. Prazan niz znaci da vrijedi. */
export function attestationProblems(a: CorpusAttestation | null | undefined): string[] {
  if (!a) return ['ovjere nema'];
  const p: string[] = [];
  if (a.schemaVersion !== 1) p.push('nepoznata verzija sheme');
  if (!a.signedBy || !a.signedBy.trim()) p.push('nije potpisana');
  if (!a.signedAt) p.push('nema datuma potpisa');
  if (!Array.isArray(a.oracles) || a.oracles.length === 0) p.push('nema navedenih alata mjerenja');
  if (!a.corpusFingerprint) p.push('nema otiska korpusa');
  if (!a.measuredFromCommit) p.push('nema commita nad kojim je mjereno');
  if (!Array.isArray(a.entries) || a.entries.length === 0) p.push('nema nijednog mjerenog profila');

  // POTPIS NE SMIJE BITI STARIJI OD MJERENJA KOJE POKRIVA.
  //
  // Izmjereno 2026-09-04: ovjera je nosila potpis od 21:50 i mjerenje od 23:04, dakle 74 minute
  // KASNIJE. Datoteka je time tvrdila da je covjek ovjerio brojke koje u trenutku potpisa nisu
  // postojale. Nijedna postojeca provjera to nije vidjela: sve su gledale POSTOJI li potpis, nikad
  // sto pokriva.
  //
  // Nastalo je bez ičije namjere, mehanicki: mjerenje je ponovljeno nakon sto je zatvorena
  // regresija, a potpis je prenesen iz prethodne ovjere. Zato je i gard mehanicki.
  if (a.signedAt && a.measuredAt) {
    const potpis = Date.parse(a.signedAt);
    const mjerenje = Date.parse(a.measuredAt);
    if (Number.isFinite(potpis) && Number.isFinite(mjerenje) && potpis < mjerenje) {
      p.push('potpis je stariji od mjerenja koje pokriva');
    }
  }

  return p;
}

/**
 * Profili kojima ovjera daje dokaz na stvarnom radu.
 *
 * Kljuc je `profileId::workType`, jer isti profil moze biti mjeren za jednu vrstu rada a ne za drugu,
 * i spajanje bi dokaz prosirilo na nesto sto nije mjereno.
 *
 * Profil ulazi SAMO ako je barem jedan rad zavrsio cisto I nijedna provjera nije regresirala. Mjerenje
 * koje je naslo regresiju nije dokaz da popravak radi; ono je dokaz da ne radi.
 */
export function provenProfiles(a: CorpusAttestation | null | undefined): Set<string> {
  if (attestationProblems(a).length > 0) return new Set();
  const out = new Set<string>();
  for (const e of a!.entries) {
    if (e.documentCount > 0 && e.cleanCount > 0 && e.regressedChecks.length === 0) {
      out.add(`${e.profileId}::${e.workType}`);
    }
  }
  return out;
}
