/**
 * ODABIR PROFILA KAO PODATAK, izdvojeno iz `buildAnalysisSettings` u `src/ui/app.ts`
 * (2026-09-10, korak A2).
 *
 * ZASTO IZDVOJENO: isti skup polja treba na tri mjesta koja se ne smiju razici. Danas ga cita
 * analiza (`settings.selectionIds`) i povijest (`applySelectionIds` ga vraca natrag u obrazac).
 * Kad se potvrdjeni profil pocne pamtiti uz sesiju, obnova ga mora usporediti s tekucim stanjem
 * obrasca; usporedba s literalom zakopanim u monolitu nije moguca bez uvoza cijelog UI-ja.
 *
 * RED KLJUCEVA JE UGOVOR: vrijednost zavrsava u `JSON.stringify` (povijest, otisci), pa
 * preslagivanje polja mijenja zapis bez ijedne promjene znacenja.
 *
 * SEMANTIKA JE PRENESENA DOSLOVNO, ukljucujuci nesimetriju koja izgleda kao previd a nije mjesto
 * da se popravi u selidbi: prva cetiri polja i `citation` citaju `.value` NEZASTICENO, pa bi
 * nedostajuci element bacio, dok `department` i `methodology` koriste `?.` i padaju na
 * `'general'` odnosno `'auto'`. Ta razlika postoji od prije i ovaj korak je ne dira, jer bi
 * promjena ponasanja u koraku koji tvrdi da je selidba bila neprovjeriva. Ako je treba
 * ujednaciti, to je zaseban zahvat s vlastitim gardom.
 */

/** Polja odabira, redom kojim ulaze u zapis. */
export interface SelectionIds {
  institution: string;
  unit: string;
  program: string;
  workType: string;
  variant: string;
  department: string;
  methodology: string;
  citation: string;
}

/**
 * Cita tekuci odabir iz obrasca. `doc` se PRIMA, ne pretpostavlja: modul time ostaje testabilan
 * bez preglednika i bez `runtimeDocument()` iz monolita.
 */
export function readSelectionIds(doc: Document): SelectionIds {
  const q = (sel: string): any => doc.querySelector(sel);
  return {
    institution: q('#institutionSelect').value,
    unit: q('#unitSelect').value,
    program: q('#programSelect').value,
    workType: q('#workType').value,
    variant: q('#workVariant').value,
    department: q('#departmentSelect')?.value || 'general',
    methodology: q('#methodologySelect')?.value || 'auto',
    citation: q('#citationStyle').value,
  };
}
