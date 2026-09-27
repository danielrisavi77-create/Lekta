/**
 * FAKULTET POTVRDJEN NA ULAZU, BEZ STUDIJA (Z32 popravak, odluka vlasnika 2026-09-27).
 *
 * Student na `/` smije potvrditi fakultet koji mu je ponudjen (zapamcene postavke ili `?unit=`
 * link), a da studij nije potvrdio. `/rad/` tada fakultet postavi i NE PITA PONOVO: detekcija iz
 * dokumenta (`applyDetectedContext` u `app.ts`) ga ne smije promijeniti. Studij i dalje prepoznaje
 * ona, jer ga student nije potvrdio; kad dokument pokazuje drugi fakultet, studij se ne pogadja
 * nego znacka to kaze, a kartica profila ostaje nesigurna (`renderAnalyzeSummary`).
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
 * procita uljudno, a fokus se ne dira. "Zadrzi" zatvara napomenu i PAMTI izbor dok vrijedi
 * brava: ista detekcija za isti rad je vise ne vraca. Pamti se u memoriji modula, ne u pohrani.
 *
 * ZASTO ZASEBAN MODUL: `app.ts` ima ratchet velicine (`tests/ui-module-budget.test.ts`), pa u
 * njemu ostaju samo dvije kuke; stanje, vezanje za dokument i tekst znacke zive ovdje.
 *
 * VRIJEDI ZA PRVI PRIHVACENI DOKUMENT SESIJE, istim pravilom kao potvrdjen profil sesije (C4,
 * `profile-confirmed-events.ts`): drugi dokument u istoj kartici je drugi rad, pa brava pada.
 */
import { ZAGREB_CATALOG, findUnit } from '../catalog/catalog-loader';
import { subscribeAnalyzerDocumentSettled } from './analyzer-document-events';

let jedinica: string | null = null;
let datoteka: File | null = null;
/** Prepoznati fakultet za koji je student rekao "Zadrzi"; vrijedi dok vrijedi ista brava. */
let zadrzanoProtiv: string | null = null;

/** Id vidljivog reda napomene na `/rad/` (izvan `#profileSheet`, u `.analyze-row`). */
export const NAPOMENA_FAKULTETA_ID = 'facultyConflict';

/** Puni naziv jedinice iz kataloga; nepoznat id (ne bi se trebao dogoditi) vraca sam id. */
function nazivJedinice(unitId: string): string {
  return findUnit(unitId)?.name ?? unitId;
}

/** Id ustanove kojoj jedinica pripada, za slucaj da prebacivanje mijenja i ustanovu. */
function institucijaZaJedinicu(unitId: string): string | undefined {
  return ZAGREB_CATALOG.find((institucija) => institucija.units.some((u) => u.id === unitId))?.id;
}

/** Tekst znacke kad dokument pokazuje drugi fakultet od potvrdjenog. */
export function napomenaDrugiFakultet(prepoznatoId: string, potvrdjenoId: string): string {
  return `Dokument izgleda kao rad koji pripada fakultetu ${nazivJedinice(prepoznatoId)}. Na ulazu je potvrđen ${nazivJedinice(potvrdjenoId)}.`;
}

/** Skriva napomenu na oba mjesta: znacku u listu profila i vidljivi red. */
function skrijNapomenu(doc: Document): void {
  doc.getElementById('detectBadge')?.classList.add('hidden');
  // Vidljivi red se ne skriva klasom nego PRAZNI: ostaje u stablu pristupacnosti kao zivo
  // podrucje, pa sljedeca napomena u njemu bude procitana (prazan red CSS vadi iz toka).
  doc.getElementById(NAPOMENA_FAKULTETA_ID)?.replaceChildren();
}

/** Nova brava ili pad brave: izbor "Zadrzi" pripadao je staroj, pa se zaboravlja, a napomena gasi. */
function zaboraviIzbor(): void {
  zadrzanoProtiv = null;
  if (typeof document !== 'undefined') skrijNapomenu(document);
}

/**
 * Zakljucava fakultet `trazeno` ako ga je obrazac stvarno prihvatio (`uObrascu`). Vraca je li
 * zakljucan; obrazac koji tu jedinicu ne zna prikazati ne ostavlja bravu.
 */
export function zakljucajFakultet(trazeno: string | undefined, uObrascu: string | undefined): boolean {
  jedinica = trazeno && trazeno === uObrascu ? trazeno : null;
  datoteka = null;
  zaboraviIzbor();
  return jedinica !== null;
}

/** Zakljucan fakultet ili `null`. */
export function potvrdjenFakultet(): string | null {
  return jedinica;
}

/**
 * Prebacuje potvrdjeni fakultet na prepoznati: skida bravu za staru jedinicu, postavlja novu i
 * odrazava odabir na obrazac (ustanova i fakultet), pa ostatak obrasca (studij, razina) i dalje
 * ide postojecim promjenskim rukovateljima nad `#institutionSelect`/`#unitSelect` (`app.ts`).
 */
function prebaciNaPrepoznato(prepoznato: string, doc: Document): void {
  jedinica = prepoznato;
  datoteka = null;
  zadrzanoProtiv = null;
  const institucija = institucijaZaJedinicu(prepoznato);
  const institutionSelect = doc.getElementById('institutionSelect') as HTMLSelectElement | null;
  if (institucija && institutionSelect && institutionSelect.value !== institucija) {
    institutionSelect.value = institucija;
    institutionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const unitSelect = doc.getElementById('unitSelect') as HTMLSelectElement | null;
  if (unitSelect) {
    unitSelect.value = prepoznato;
    unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  skrijNapomenu(doc);
}

/** "Zadrzi": potvrdjeni fakultet ostaje, napomena se zatvara i za ovaj prepoznati se ne vraca. */
function zadrziPotvrdjeno(prepoznato: string, doc: Document): void {
  zadrzanoProtiv = prepoznato;
  skrijNapomenu(doc);
}

/** Oba gumba napomene; svako mjesto dobiva vlastiti par (cvor ne moze stajati na dva mjesta). */
function gumbiNapomene(prepoznato: string, potvrdjeno: string, doc: Document): HTMLButtonElement[] {
  const prebaci = doc.createElement('button');
  prebaci.type = 'button';
  prebaci.className = 'btn btn-ghost btn-sm';
  prebaci.textContent = `Prebaci na ${nazivJedinice(prepoznato)}`;
  prebaci.addEventListener('click', () => prebaciNaPrepoznato(prepoznato, doc));
  const zadrzi = doc.createElement('button');
  zadrzi.type = 'button';
  zadrzi.className = 'btn btn-ghost btn-sm';
  zadrzi.textContent = `Zadrži ${nazivJedinice(potvrdjeno)}`;
  zadrzi.addEventListener('click', () => zadrziPotvrdjeno(prepoznato, doc));
  return [prebaci, zadrzi];
}

/**
 * Vidljivi red napomene (`#facultyConflict`): oznaka s tockom (Z3), recenica i oba gumba.
 * Sadrzaj se mijenja UNUTAR reda koji je vec `role="status"`, pa ga citac procita; fokus ostaje
 * gdje jest (nema `focus()` ni `scrollIntoView`).
 */
function nacrtajVidljivuNapomenu(red: HTMLElement, prepoznato: string, potvrdjeno: string, doc: Document): void {
  const oznaka = doc.createElement('span');
  oznaka.className = 'fc-oznaka';
  oznaka.textContent = 'Drugi fakultet u dokumentu';
  const tekst = doc.createElement('p');
  tekst.className = 'fc-tekst';
  tekst.textContent = napomenaDrugiFakultet(prepoznato, potvrdjeno);
  const akcije = doc.createElement('div');
  akcije.className = 'fc-akcije';
  akcije.append(...gumbiNapomene(prepoznato, potvrdjeno, doc));
  red.replaceChildren(oznaka, tekst, akcije);
}

/**
 * Smije li detekcija iz dokumenta primijeniti prepoznati fakultet. Kad ne smije (fakultet je
 * potvrdjen, a dokument pokazuje drugi), napomena imenuje prepoznati fakultet i nudi jednim
 * klikom prebacivanje na njega ili zadrzavanje potvrdjenog, i to na dva mjesta: u znacki lista
 * profila i u vidljivom redu `#facultyConflict`; vraca `false`. Ako je student za taj prepoznati
 * fakultet vec rekao "Zadrzi", napomena se ne vraca, a brava i dalje drzi.
 */
export function detekcijaSmije(prepoznato: string, doc: Document = document): boolean {
  if (jedinica === null || prepoznato === jedinica) return true;
  if (zadrzanoProtiv === prepoznato) return false;
  const potvrdjeno = jedinica;
  const znacka = doc.getElementById('detectBadge');
  if (znacka) {
    const ikona = doc.createElement('i');
    ikona.setAttribute('data-lucide', 'info');
    const tekst = doc.createElement('span');
    tekst.textContent = ` ${napomenaDrugiFakultet(prepoznato, potvrdjeno)} `;
    znacka.replaceChildren(ikona, tekst, ...gumbiNapomene(prepoznato, potvrdjeno, doc));
    znacka.classList.remove('hidden');
    doc.defaultView?.__lektaIcons?.();
  }
  const red = doc.getElementById(NAPOMENA_FAKULTETA_ID);
  if (red) nacrtajVidljivuNapomenu(red, prepoznato, potvrdjeno, doc);
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
