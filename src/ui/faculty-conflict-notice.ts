/**
 * NAPOMENA O DRUGOM FAKULTETU: IZGRADNJA I PRIKAZ (izdvojeno iz `src/ui/confirmed-faculty.ts`,
 * bundle-guard "rad" u `vite.config.ts`).
 *
 * Ovaj modul se UCITAVA DINAMICKI (`await import(...)`) iz `confirmed-faculty.ts`, tek kad
 * detekcija stvarno nade drugi fakultet od zakljucanog i odluka ("Zadrži"/"Prebaci") za njega jos
 * ne postoji. U statickom grafu ulaza `rad` ostaje samo `confirmed-faculty.ts`, s malom provjerom
 * (`detekcijaSmije`); tekst napomene, DOM oba mjesta (znacka liste i vidljivi red), oba gumba i
 * povrat fokusa zive OVDJE.
 *
 * UTRKA UCITAVANJA: `confirmed-faculty.ts` provjerava identitet brave (i, kroz `generacija`, svaku
 * promjenu brave ili odluke) NAKON `await`-a, pa zamjena dokumenta ili nova brava stigla dok se
 * ovaj modul jos ucitavao ne ostavlja zastarjelu napomenu na ekranu (test u
 * `tests/intake-live.test.ts`, "utrka ucitavanja").
 */
import { findUnit } from '../catalog/catalog-loader';

/** Id vidljivog reda napomene na `/rad/` (izvan `#profileSheet`, u `.analyze-row`). */
const NAPOMENA_FAKULTETA_ID = 'facultyConflict';

/** Puni naziv jedinice iz kataloga; nepoznat id (ne bi se trebao dogoditi) vraca sam id. */
function nazivJedinice(unitId: string): string {
  return findUnit(unitId)?.name ?? unitId;
}

/** Tekst znacke kad dokument pokazuje drugi fakultet od potvrdjenog. */
export function napomenaDrugiFakultet(prepoznatoId: string, potvrdjenoId: string): string {
  return `Dokument izgleda kao rad koji pripada fakultetu ${nazivJedinice(prepoznatoId)}. Na ulazu je potvrđen ${nazivJedinice(potvrdjenoId)}.`;
}

/** Mjesto napomene: znacka u listu profila (`#detectBadge`) ili vidljivi red (`#facultyConflict`). */
type MjestoNapomene = 'list' | 'red';

/**
 * Kamo ide fokus kad se napomena zatvori. Iz lista: izbornik fakulteta (fokus ostaje u modalu).
 * Iz vidljivog reda: "Analiziraj dokument" dok je omogucen (uz sukob je rad vec ucitan), inace
 * prvi omoguceni gumb kartice profila. `null` samo kad na stranici nema nicega od toga.
 */
function ciljFokusa(mjesto: MjestoNapomene, doc: Document): HTMLElement | null {
  if (mjesto === 'list') {
    const izbornik = doc.getElementById('unitSelect');
    if (izbornik) return izbornik;
  }
  const analiziraj = doc.getElementById('analyzeBtn') as HTMLButtonElement | null;
  if (analiziraj && !analiziraj.disabled) return analiziraj;
  return doc.getElementById('analyzeProfile')?.querySelector<HTMLElement>('button:not([disabled])') ?? null;
}

/**
 * Nakon zatvaranja napomene: ako je fokus bio na zatvorenom gumbu (ili je vec pao na `<body>`, ili
 * stoji na odspojenom cvoru), premjesta ga na `ciljFokusa`. Fokus koji je u medjuvremenu otisao
 * drugamo se ne otima.
 */
function vratiFokus(gumb: HTMLElement, mjesto: MjestoNapomene, doc: Document): void {
  const aktivan = doc.activeElement;
  const izgubljen = !aktivan || aktivan === doc.body || aktivan === gumb || !aktivan.isConnected;
  if (izgubljen) ciljFokusa(mjesto, doc)?.focus();
}

/** Oba gumba napomene; svako mjesto dobiva vlastiti par (cvor ne moze stajati na dva mjesta). */
function gumbiNapomene(
  prepoznato: string, potvrdjeno: string, mjesto: MjestoNapomene, doc: Document, prebaci: () => void, zadrzi: () => void,
): HTMLButtonElement[] {
  const prebaciBtn = doc.createElement('button');
  prebaciBtn.type = 'button';
  prebaciBtn.className = 'btn btn-ghost btn-sm';
  prebaciBtn.textContent = `Prebaci na ${nazivJedinice(prepoznato)}`;
  prebaciBtn.addEventListener('click', () => { prebaci(); vratiFokus(prebaciBtn, mjesto, doc); });
  const zadrziBtn = doc.createElement('button');
  zadrziBtn.type = 'button';
  zadrziBtn.className = 'btn btn-ghost btn-sm';
  zadrziBtn.textContent = `Zadrži ${nazivJedinice(potvrdjeno)}`;
  zadrziBtn.addEventListener('click', () => { zadrzi(); vratiFokus(zadrziBtn, mjesto, doc); });
  return [prebaciBtn, zadrziBtn];
}

/**
 * Vidljivi red napomene (`#facultyConflict`): oznaka s tockom (Z3), recenica i oba gumba.
 * Sadrzaj se mijenja UNUTAR reda koji je vec `role="status"`, pa ga citac procita; fokus pri
 * pojavi ostaje gdje jest (nema `focus()` ni `scrollIntoView`), a pri zatvaranju ga vraca `vratiFokus`.
 */
function nacrtajVidljivuNapomenu(
  red: HTMLElement, prepoznato: string, potvrdjeno: string, doc: Document, prebaci: () => void, zadrzi: () => void,
): void {
  const oznaka = doc.createElement('span');
  oznaka.className = 'fc-oznaka';
  oznaka.textContent = 'Drugi fakultet u dokumentu';
  const tekst = doc.createElement('p');
  tekst.className = 'fc-tekst';
  tekst.textContent = napomenaDrugiFakultet(prepoznato, potvrdjeno);
  const akcije = doc.createElement('div');
  akcije.className = 'fc-akcije';
  akcije.append(...gumbiNapomene(prepoznato, potvrdjeno, 'red', doc, prebaci, zadrzi));
  red.replaceChildren(oznaka, tekst, akcije);
}

interface PrikaziNapomeneArgs {
  prepoznato: string;
  potvrdjeno: string;
  doc: Document;
  /** Klik na "Prebaci"; odluku i bravu vec drzi `confirmed-faculty.ts`. */
  prebaci: () => void;
  /** Klik na "Zadrži"; odluku vec drzi `confirmed-faculty.ts`. */
  zadrzi: () => void;
}

/**
 * Crta napomenu na oba mjesta (znacka `#detectBadge` i vidljivi red `#facultyConflict`), ako
 * postoje u DOM-u; poziva je iskljucivo `confirmed-faculty.ts` (`ucitajNapomenu`) POSLIJE provjere
 * da odluka jos vrijedi.
 */
export function prikaziNapomenu({ prepoznato, potvrdjeno, doc, prebaci, zadrzi }: PrikaziNapomeneArgs): void {
  const znacka = doc.getElementById('detectBadge');
  if (znacka) {
    const ikona = doc.createElement('i');
    ikona.setAttribute('data-lucide', 'info');
    const tekst = doc.createElement('span');
    tekst.textContent = ` ${napomenaDrugiFakultet(prepoznato, potvrdjeno)} `;
    znacka.replaceChildren(ikona, tekst, ...gumbiNapomene(prepoznato, potvrdjeno, 'list', doc, prebaci, zadrzi));
    znacka.classList.remove('hidden');
    doc.defaultView?.__lektaIcons?.();
  }
  const red = doc.getElementById(NAPOMENA_FAKULTETA_ID);
  if (red) nacrtajVidljivuNapomenu(red, prepoznato, potvrdjeno, doc, prebaci, zadrzi);
}
