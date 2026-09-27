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

/**
 * Zakljucava fakultet `trazeno` ako ga je obrazac stvarno prihvatio (`uObrascu`). Vraca je li
 * zakljucan; obrazac koji tu jedinicu ne zna prikazati ne ostavlja bravu.
 */
export function zakljucajFakultet(trazeno: string | undefined, uObrascu: string | undefined): boolean {
  jedinica = trazeno && trazeno === uObrascu ? trazeno : null;
  datoteka = null;
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
  const znacka = doc.getElementById('detectBadge');
  znacka?.classList.add('hidden');
}

/**
 * Smije li detekcija iz dokumenta primijeniti prepoznati fakultet. Kad ne smije (fakultet je
 * potvrdjen, a dokument pokazuje drugi), znacka detekcije imenuje prepoznati fakultet i nudi
 * jednim klikom prebacivanje na njega ili zadrzavanje potvrdjenog; vraca `false`.
 */
export function detekcijaSmije(prepoznato: string, doc: Document = document): boolean {
  if (jedinica === null || prepoznato === jedinica) return true;
  const potvrdjeno = jedinica;
  const znacka = doc.getElementById('detectBadge');
  if (znacka) {
    const ikona = doc.createElement('i');
    ikona.setAttribute('data-lucide', 'info');
    const tekst = doc.createElement('span');
    tekst.textContent = ` ${napomenaDrugiFakultet(prepoznato, potvrdjeno)} `;
    const prebaci = doc.createElement('button');
    prebaci.type = 'button';
    prebaci.className = 'btn btn-ghost btn-sm';
    prebaci.textContent = `Prebaci na ${nazivJedinice(prepoznato)}`;
    prebaci.addEventListener('click', () => prebaciNaPrepoznato(prepoznato, doc));
    const zadrzi = doc.createElement('button');
    zadrzi.type = 'button';
    zadrzi.className = 'btn btn-ghost btn-sm';
    zadrzi.textContent = `Zadrži ${nazivJedinice(potvrdjeno)}`;
    zadrzi.addEventListener('click', () => znacka.classList.add('hidden'));
    znacka.replaceChildren(ikona, tekst, prebaci, zadrzi);
    znacka.classList.remove('hidden');
    doc.defaultView?.__lektaIcons?.();
  }
  return false;
}

subscribeAnalyzerDocumentSettled((e) => {
  if (jedinica === null) return;
  if (e.kind !== 'accepted') { if (!datoteka) jedinica = null; return; }
  if (!datoteka) datoteka = e.file;
  else if (e.file !== datoteka) jedinica = null;
});
