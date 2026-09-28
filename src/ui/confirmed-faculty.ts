/**
 * FAKULTET POTVRDJEN NA ULAZU (Z32 popravak, odluka vlasnika 2026-09-27).
 *
 * Student na `/` smije potvrditi fakultet koji mu je ponudjen (zapamcene postavke ili `?unit=`
 * link), sa studijem ili bez njega. `/rad/` tada fakultet postavi i NE PITA PONOVO: detekcija iz
 * dokumenta (`applyDetectedContext` u `app.ts`) ga ne smije promijeniti. Bez studija studij i
 * dalje prepoznaje ona, jer ga student nije potvrdio; kad dokument pokazuje drugi fakultet,
 * studij se ne pogadja nego znacka to kaze, a kartica profila ostaje nesigurna
 * (`renderAnalyzeSummary`).
 *
 * DVA ULAZA U BRAVU. `primijeniFakultetUlaza` (samo fakultet, `applyFacultyIds`) i
 * `primijeniProfilUlaza` (cijeli profil, `applyConfirmedProfileSelection`, put C4). NALAZ PREGLEDA
 * (Codex, blocker): cijeli profil prije nije postavljao bravu, a C4 je detekciju preskakao PRIJE
 * nego je napomena mogla nastati, pa student koji je potvrdio FER · Računarstvo i ubacio rad
 * FPZG-a napomenu nije vidio. Sada oba puta zakljucaju fakultet, a `app.ts` preskace detekciju
 * samo kad brave nema (`_sessionProfileApplied&&!potvrdjenFakultet()`); isti fakultet u dokumentu
 * i dalje ne dira potvrdjeni profil (C4).
 *
 * NALAZ PREGLEDA Z32: znacka je do sada tvrdila da studij "nisam prepoznao", a stvarno stanje je
 * suprotno - detekcija JE prepoznala fakultet, samo drugi od potvrdjenog. Znacka sada IMENUJE taj
 * prepoznati fakultet i nudi jednim klikom prebacivanje na njega, ili zadrzavanje potvrdjenog;
 * "nisam prepoznao" vrijedi samo kad detekcija stvarno nista ne nadje, a taj slucaj ovamo i ne
 * stize (`detekcijaSmije` se zove samo s vec prepoznatim id-om, `applyDetectedContext`).
 *
 * NAPOMENA SE POKAZUJE SAMA (odluka vlasnika 2026-09-27, "Da, sama"): znacka `#detectBadge` zivi
 * unutar lista `#profileSheet`, koji se u toku s ulaza ne otvara, pa student napomenu nije vidio.
 * Isti tekst i ista dva gumba zato se crtaju i u `#facultyConflict`, vidljivi red uz karticu
 * profila na `/rad/` (`.analyze-row`), izvan svakog modala. Red je `role="status"`: citac ga
 * procita uljudno, a fokus se pri POJAVI ne dira.
 *
 * "PREBACI" PRIMIJENI DETEKCIJU, NE MIJENJA OBRAZAC (nalaz pregleda Codex, major). Prva izvedba je
 * izbornicima slala `change`, a `app.ts` na svaki `change` izbornika profila oznaci CIJELI profil
 * potvrdjenim; izmjereno na `lo-fpzg-zavrsni-uskladjen.docx` (prijediplomski Politologija): kartica
 * je poslije "Prebaci" tvrdila "Pravila potvrđena · Diplomski studij Novinarstvo". Sada "Prebaci"
 * premjesti bravu i pozove `naPrebaci` iz `app.ts`, koji primijeni prepoznati kontekst istim putem
 * kao da brave nije bilo (studij i razina iz dokumenta, `_profileConfirmed` po
 * `isConfidentDetection`). Bez `naPrebaci` se mijenja samo brava.
 *
 * ODLUKA SE PAMTI UZ SESIJU (nalaz pregleda Codex, major). "Zadrži" i "Prebaci" su odluke o OVOM
 * radu, pa ponovno otvaranje iste sesije (`/rad/#session=...`) napomenu ne smije vratiti. Pamcenje
 * (`PamcenjeOdluke`) daje `intake-confirmation.ts` nad mapom po sesiji u
 * `src/shared/intake-choice.ts`, istim mehanizmom kao rok i potvrda; ovaj modul ga ne uvozi, jer
 * je u statickom grafu `app.ts`, a `intake-choice` se na `/rad/` ucitava lijeno (bundle-guard).
 * Bez pamcenja (brava bez sesije) odluka zivi samo u memoriji modula.
 *
 * FOKUS PRI ZATVARANJU (nalaz pregleda, WCAG 2.4.3): gumb koji zatvara napomenu nestaje s njom
 * (red se prazni, znacka skriva), pa bi fokus pao na `<body>` i sljedeci Tab krenuo s vrha
 * stranice. Zato ga `vratiFokus` (u `faculty-conflict-notice.ts`) vraca na smislen element: iz
 * vidljivog reda na gumb "Analiziraj dokument" (sljedeci korak, stalan cvor koji se ne crta ponovo
 * kao kartica profila), a iz znacke u listu profila na izbornik fakulteta, da fokus ostane u modalu.
 *
 * ZASTO ZASEBAN MODUL: `app.ts` ima ratchet velicine (`tests/ui-module-budget.test.ts`), pa u
 * njemu ostaju samo kuke: straza `detekcijaSmije` u `applyDetectedContext`, `skrijNapomenu` u
 * `setFile` i `applyFacultyIds` (postavi obrazac i spusti `_profileConfirmed`). Brava, stanje,
 * vezanje za dokument i odluka o napomeni zive ovdje.
 *
 * IZGRADNJA NAPOMENE JE LIJENA (bundle-guard "rad" u `vite.config.ts`, budzet 960 KB). Tekst
 * (`napomenaDrugiFakultet`), DOM na oba mjesta i oba gumba sada zive u
 * `src/ui/faculty-conflict-notice.ts`, ucitanom DINAMICKI (`await import(...)`) tek kad
 * `detekcijaSmije` stvarno nade sukob bez postojece odluke (`ucitajNapomenu`). Ovaj modul u
 * statickom grafu ostaje mala provjera; nema `findUnit` niti izgradnje DOM-a napomene.
 *
 * UTRKA UCITAVANJA: `ucitajNapomenu` snima brojac `generacija` i prateci dokument PRIJE `await`-a,
 * pa zamjena dokumenta ili nova/pala brava dok se modul jos ucitavao (obje mijenjaju `generacija`
 * kroz `zaboraviIzbor`) ostavlja rezultat uvoza da se jednostavno ne primijeni: zastarjela
 * napomena se ne crta (test u `tests/intake-live.test.ts`, "utrka ucitavanja").
 *
 * VRIJEDI ZA PRVI PRIHVACENI DOKUMENT SESIJE, istim pravilom kao potvrdjen profil sesije (C4,
 * `profile-confirmed-events.ts`): drugi dokument u istoj kartici je drugi rad, pa brava pada.
 * "Prebaci" pracenje dokumenta NE resetira (nalaz pregleda Codex, major): prebaceni fakultet
 * vrijedi za isti rad, a drugi rad ga otpusta kao i potvrdjeni.
 *
 * RUCNA POTVRDA DRUGOG PROFILA PONISTAVA STARU "PREBACI" ODLUKU (Z32 popravak, regresija otkrivena
 * u pregledu eaf21950, odluka vlasnika 2026-09-27 "korisnik moze odabrati sam" i C4). Student koji
 * je kliknuo "Prebaci" (odluka zapisana uz sesiju), pa se predomislio i u listu profila RUCNO
 * potvrdio drugi profil (`potvrdiProfil` u `app.ts`, `emitProfileConfirmed`), pri ponovnom
 * otvaranju iste sesije (`zakljucajObnovljeniFakultet`) ne smije dobiti staru odluku vracenu: ona
 * bi se ponovila i tiho pregazila upravo rucno potvrdjeni profil. Odluka se zato PRETVARA u
 * "zadrzi" za isti prepoznati fakultet (ne brise): brisanje bi pri ponovnom otvaranju ostavilo
 * sljedecu detekciju bez odluke, pa bi napomena iskrsla iznova umjesto da rucna potvrda
 * jednostavno vrijedi. Rucna potvrda TOCNO onog fakulteta na koji je "Prebaci" vec prebacio ne
 * dira odluku, jer je vec dosljedna. Bez rucne potvrde odluka ostaje netaknuta i "Prebaci" se pri
 * ponovnom otvaranju ponovi kao i prije ovog popravka.
 */
import { subscribeAnalyzerDocumentSettled } from './analyzer-document-events';
import { subscribeProfileConfirmed } from './profile-confirmed-events';

/** Odluka studenta o napomeni za JEDAN rad: zadrzao je potvrdjeni ili prebacio na prepoznati. */
interface OdlukaNapomene {
  odluka: 'zadrzi' | 'prebaci';
  prepoznato: string;
}

/** Trajno pamcenje odluke za jednu sesiju (`pamcenjeOdlukeSesije` u `intake-confirmation.ts`). */
export interface PamcenjeOdluke {
  procitaj: () => OdlukaNapomene | null;
  zapisi: (odluka: OdlukaNapomene) => void;
}

let jedinica: string | null = null;
let datoteka: File | null = null;
/** Odluka za rad pod ovom bravom; vrijedi dok vrijedi brava. */
let odluka: OdlukaNapomene | null = null;
let pamcenje: PamcenjeOdluke | null = null;
/** Raste na svaku promjenu brave ili odluke; `ucitajNapomenu` njime otkriva zastarjeli uvoz. */
let generacija = 0;
/** Uvoz `faculty-conflict-notice.ts` u tijeku, ako postoji; `cekajNapomenuTest` ga cita u testu. */
let ucitavanjeNapomene: Promise<void> | null = null;

/** Id vidljivog reda napomene na `/rad/` (izvan `#profileSheet`, u `.analyze-row`); vidi i istoimenu
 *  konstantu u `faculty-conflict-notice.ts` (namjerno dvije kopije, ne uvoz radi lijenog grafa). */
const NAPOMENA_FAKULTETA_ID = 'facultyConflict';

/**
 * Skriva napomenu na oba mjesta: znacku u listu profila i vidljivi red. Zove je i `setFile` u
 * `app.ts` (nalaz pregleda Codex, minor): zamjena dokumenta napomenu o STAROM radu gasi odmah, a
 * ne tek kad se novi slegne, jer odbijen novi rad bravu ne otpusta i red bi ostao zauvijek.
 */
export function skrijNapomenu(doc: Document = document): void {
  doc.getElementById('detectBadge')?.classList.add('hidden');
  // Vidljivi red se ne skriva klasom nego PRAZNI: ostaje u stablu pristupacnosti kao zivo
  // podrucje, pa sljedeca napomena u njemu bude procitana (prazan red CSS vadi iz toka).
  doc.getElementById(NAPOMENA_FAKULTETA_ID)?.replaceChildren();
}

/**
 * Nova brava ili pad brave: odluka pripadala je staroj, pa se zaboravlja, a napomena gasi.
 * Diže `generacija`, pa uvoz `faculty-conflict-notice.ts` pokrenut PRIJE ove promjene (za stari
 * prepoznati fakultet) po povratku vidi da je zastario i ne crta nista (utrka ucitavanja).
 */
function zaboraviIzbor(): void {
  odluka = null;
  pamcenje = null;
  generacija += 1;
  if (typeof document !== 'undefined') skrijNapomenu(document);
}

/** Odluka ide u memoriju i, kad sesija postoji, u pamcenje; kvar pohrane ne rusi klik. */
function zapamti(nova: OdlukaNapomene): void {
  odluka = nova;
  generacija += 1;
  try { pamcenje?.zapisi(nova); } catch { /* pohrana nedostupna: vrijedi barem do ponovnog ucitavanja */ }
}

/**
 * Zakljucava fakultet `trazeno` ako ga je obrazac stvarno prihvatio (`uObrascu`). Vraca je li
 * zakljucan; obrazac koji tu jedinicu ne zna prikazati ne ostavlja bravu. Uz `novoPamcenje`
 * brava cita odluku iz iste sesije (ponovno otvaranje), pa je ne pita ponovo.
 */
export function zakljucajFakultet(
  trazeno: string | undefined,
  uObrascu: string | undefined,
  novoPamcenje: PamcenjeOdluke | null = null,
): boolean {
  jedinica = trazeno && trazeno === uObrascu ? trazeno : null;
  datoteka = null;
  zaboraviIzbor();
  if (jedinica !== null && novoPamcenje) {
    pamcenje = novoPamcenje;
    try { odluka = novoPamcenje.procitaj(); } catch { odluka = null; }
  }
  return jedinica !== null;
}

const jedinicaUObrascu = (doc: Document): string | undefined =>
  (doc.getElementById('unitSelect') as HTMLSelectElement | null)?.value;

/**
 * Primjena fakulteta potvrdjenog na ulazu, bez studija (`applyFaculty` u `primijeniPotvrduUlaza`,
 * `src/routes/workspace/intake-confirmation.ts`). `postaviObrazac` je `applyFacultyIds` iz
 * `app.ts`: postavi ustanovu, fakultet i razinu u obrazac i spusti `_profileConfirmed`, jer
 * studij nije potvrdjen. Brava se postavlja TEK POSLIJE, prema onome sto je obrazac stvarno
 * prihvatio; obrazac koji jedinicu ne zna prikazati ne ostavlja bravu i vraca `false`.
 */
export function primijeniFakultetUlaza(
  ids: Record<string, string>,
  postaviObrazac: (ids: Record<string, string>) => void,
  novoPamcenje: PamcenjeOdluke | null = null,
  doc: Document = document,
): boolean {
  postaviObrazac(ids);
  return zakljucajFakultet(ids.unit, jedinicaUObrascu(doc), novoPamcenje);
}

/**
 * Primjena CIJELOG profila potvrdjenog na ulazu (`apply` u `primijeniPotvrduUlaza`):
 * `primijeniProfil` je `applyConfirmedProfileSelection` (put C4). Fakultet se i ovdje zakljucava
 * TEK POSLIJE, prema obrascu, pa rad drugog fakulteta dobije napomenu (nalaz pregleda Codex).
 * Vraca ono sto vrati `primijeniProfil` (razrijeseni id profila ili `null`).
 */
export function primijeniProfilUlaza(
  ids: Record<string, string>,
  primijeniProfil: (ids: Record<string, string>) => string | null,
  novoPamcenje: PamcenjeOdluke | null = null,
  doc: Document = document,
): string | null {
  const definicija = primijeniProfil(ids);
  zakljucajFakultet(ids.unit, jedinicaUObrascu(doc), novoPamcenje);
  return definicija;
}

/**
 * Ponovno otvaranje sesije s vlastitim profilom (C4) koja je nastala iz potvrde s ulaza
 * (`zakljucajObnovljeno` u `intake-confirmation.ts`): brava na fakultet koji obrazac POSLIJE
 * obnove pokazuje, s pamcenjem odluke, pa "Prebaci" iz prvog otvaranja ne nestane tiho.
 */
export function zakljucajObnovljeniFakultet(novoPamcenje: PamcenjeOdluke, doc: Document = document): boolean {
  const u = jedinicaUObrascu(doc);
  return zakljucajFakultet(u, u, novoPamcenje);
}

/** Zakljucan fakultet ili `null`. */
export function potvrdjenFakultet(): string | null {
  return jedinica;
}

/**
 * "Prebaci": brava prelazi na prepoznati fakultet, odluka se pamti uz sesiju, napomena se gasi, a
 * `naPrebaci` (iz `app.ts`) primijeni prepoznati kontekst. Obrascu se NE salje `change` (vidi
 * zaglavlje), a praceni dokument ostaje isti: prebacivanje ne otvara novi rad.
 */
function prebaciNaPrepoznato(prepoznato: string, doc: Document, naPrebaci?: () => void): void {
  jedinica = prepoznato;
  zapamti({ odluka: 'prebaci', prepoznato });
  skrijNapomenu(doc);
  naPrebaci?.();
}

/** "Zadrzi": potvrdjeni fakultet ostaje, napomena se zatvara i za ovaj prepoznati se ne vraca. */
function zadrziPotvrdjeno(prepoznato: string, doc: Document): void {
  zapamti({ odluka: 'zadrzi', prepoznato });
  skrijNapomenu(doc);
}

/**
 * Ucitava `faculty-conflict-notice.ts` DINAMICKI i, ako odluka za `prepoznato` jos vrijedi (nista
 * se u medjuvremenu nije promijenilo, provjereno preko `generacija` i identiteta brave/datoteke),
 * trazi od njega da nacrta napomenu na oba mjesta. Klik na gumbe zove `prebaciNaPrepoznato`
 * odnosno `zadrziPotvrdjeno` (ovdje, ne u lijenom modulu): odluka i brava su izvor istine ovog
 * modula, lijeni modul samo crta i vraca fokus.
 *
 * Pad modula (npr. mrezna greska pri dinamickom uvozu) ne rusi tok: napomena se jednostavno ne
 * pokaze, a `detekcijaSmije` je vec vratio `false` (detekcija ne primjenjuje prepoznati fakultet).
 */
function ucitajNapomenu(prepoznato: string, potvrdjeno: string, doc: Document, naPrebaci?: () => void): void {
  const ocekivanaGeneracija = generacija;
  const ocekivanaDatoteka = datoteka;
  ucitavanjeNapomene = import('./faculty-conflict-notice')
    .then((modul) => {
      if (generacija !== ocekivanaGeneracija || jedinica !== potvrdjeno || datoteka !== ocekivanaDatoteka) return;
      if (odluka?.prepoznato === prepoznato) return; // odluka za TAJ prepoznati fakultet je stigla dok se modul ucitavao
      modul.prikaziNapomenu({
        prepoznato, potvrdjeno, doc,
        prebaci: () => prebaciNaPrepoznato(prepoznato, doc, naPrebaci),
        zadrzi: () => zadrziPotvrdjeno(prepoznato, doc),
      });
    })
    .catch(() => { /* modul se nije ucitao: napomena se jednostavno ne prikazuje */ });
}

/** SAMO ZA TESTOVE (`tests/intake-live.test.ts`): ceka dinamicki uvoz napomene, ako je u tijeku. */
export function cekajNapomenuTest(): Promise<void> {
  return ucitavanjeNapomene ?? Promise.resolve();
}

/**
 * Smije li detekcija iz dokumenta primijeniti prepoznati fakultet. Kad ne smije (fakultet je
 * potvrdjen, a dokument pokazuje drugi), napomena (ucitana lijeno, `ucitajNapomenu`) imenuje
 * prepoznati fakultet i nudi jednim klikom prebacivanje na njega (`naPrebaci`) ili zadrzavanje
 * potvrdjenog, i to na dva mjesta: u znacki lista profila i u vidljivom redu `#facultyConflict`;
 * vraca `false` ODMAH, prije nego se napomena stigne nacrtati.
 *
 * Odluka za ovaj rad (iz memorije ili iz sesije) se postuje bez napomene: "Zadrži" za taj
 * prepoznati fakultet vraca `false`, a "Prebaci" na njega ponovi prebacivanje (brava na prepoznati,
 * pa `naPrebaci`; bez `naPrebaci` detekcija smije).
 */
export function detekcijaSmije(prepoznato: string, naPrebaci?: () => void, doc: Document = document): boolean {
  if (jedinica === null || prepoznato === jedinica) return true;
  if (odluka?.prepoznato === prepoznato) {
    if (odluka.odluka === 'zadrzi') return false;
    jedinica = prepoznato;
    if (!naPrebaci) return true;
    naPrebaci();
    return false;
  }
  const potvrdjeno = jedinica;
  ucitajNapomenu(prepoznato, potvrdjeno, doc, naPrebaci);
  return false;
}

subscribeAnalyzerDocumentSettled((e) => {
  if (jedinica === null) return;
  if (e.kind !== 'accepted') {
    if (!datoteka) { jedinica = null; zaboraviIzbor(); }
    return;
  }
  if (!datoteka) datoteka = e.file;
  else if (e.file !== datoteka) { jedinica = null; zaboraviIzbor(); }
});

/**
 * Rucna potvrda profila (vidi zaglavlje) poništava odluku "Prebaci" koja ciljala DRUGI fakultet od
 * upravo potvrdjenog: pretvara je u "Zadrži" za taj isti prepoznati fakultet, pa se pri ponovnom
 * otvaranju ne ponovi. Bez aktivne odluke za ovu sesiju (`odluka` ili `pamcenje` prazni), ili kad
 * je rucno potvrdjen TOCNO fakultet na koji je "Prebaci" vec prebacio, nista se ne dira.
 */
subscribeProfileConfirmed((event) => {
  if (!odluka || !pamcenje) return;
  const potvrdjenoRucno = event.selectionIds.unit;
  if (!potvrdjenoRucno || potvrdjenoRucno === odluka.prepoznato) return;
  zapamti({ odluka: 'zadrzi', prepoznato: odluka.prepoznato });
});
