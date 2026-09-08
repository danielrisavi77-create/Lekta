/**
 * KARTICA POTVRDE PROFILA: cist HTML iz podataka, bez DOM-a i bez stanja analizatora.
 *
 * Izdvojeno iz `app.ts` iz dva razloga. Prvi je ratchet: `src/ui` ima budzet koji trazi da se
 * `app.ts` SMANJUJE, a kartica je pisana kao zamjena za jednoredni sazetak, pa ga je prebacila
 * preko granice (357,2 naspram 357 kB). Drugi je da se ovako moze testirati bez preglednika.
 *
 * KONTEKST JE POTVRDA, NE FORMULAR (`docs/UX_PRINCIPLES.md`, odjeljak 2): "jedan redak s
 * popunjenim defaultom, primarna akcija Potvrdi, promjena sekundarna i skrivena iza promijeni,
 * cilj nula do jedan tap". Do 2026-09-07 je bilo obrnuto: devet selectova kao glavni sadrzaj, a
 * potvrda se pojavljivala samo kad profil nije verificiran.
 */

export interface ProfileCardData {
  /** Fakultet ili akademija; kad ga nema, ustanova (sveuciliste). */
  readonly naslov: string;
  readonly studij?: string | null;
  readonly vrsta: string;
  readonly citiranje?: string | null;
  /** Akademska godina VERIFIKACIJE, format "2025./2026."; `null` kad je nema. */
  readonly akademskaGodina?: string | null;
  readonly statusKey: string;
  readonly statusLabel: string;
  /**
   * Je li profil samo ZADAN, a ne prepoznat iz dokumenta. `isConfidentDetection` je istinit samo
   * kad je iz teksta prepoznat STUDIJ; kad nije, izbornik studija stoji na alfabetski prvom
   * fallbacku iz `populatePrograms`. Kartica koja bi to prikazala jednako kao prepoznat profil
   * tvrdila bi korisniku cija se pravila primjenjuju, a ne zna.
   */
  readonly nesiguran: boolean;
}

type Escape = (value: string) => string;

export function renderProfileCard(data: ProfileCardData, escapeHtml: Escape): string {
  const redak = (oznaka: string, vrijednost: string | null | undefined): string => (vrijednost
    ? `<div class="ap-red"><span>${escapeHtml(oznaka)}</span><b>${escapeHtml(String(vrijednost))}</b></div>`
    : '');
  const potvrdi = data.nesiguran ? 'btn-secondary' : 'btn-primary';
  const promijeni = data.nesiguran ? 'btn-primary' : 'btn-ghost';
  return `<div class="ap-kartica${data.nesiguran ? ' ap-nesigurno' : ''}">`
    + `<div class="ap-head"><span class="profile-status ${escapeHtml(data.statusKey)}">`
    + `${data.statusKey === 'verified' ? '✓' : '●'} ${escapeHtml(data.statusLabel)}</span></div>`
    + '<div class="ap-tijelo">'
    + `<div class="ap-ustanova">${escapeHtml(data.naslov)}</div>`
    + (data.studij ? `<div class="ap-studij">${escapeHtml(data.studij)}</div>` : '')
    + `<div class="ap-vrsta">${escapeHtml(data.vrsta)}</div>`
    // Godina se IZOSTAVLJA kad je nema, umjesto da se napise nesto priblizno: `verifiedAt` je datum
    // kad je covjek citao izvor, a "ak. godina verifikacije" NE znaci "pravila vrijede za tu
    // godinu" (vidi biljesku uz `academicYear` u `profile-schema.ts`).
    + redak('Pravila provjerena', data.akademskaGodina)
    + redak('Citiranje', data.citiranje)
    + '</div>'
    + (data.nesiguran
      ? '<p class="ap-upozorenje">Nisam prepoznao studij iz dokumenta, pa je ovo zadani odabir.'
        + ' Provjeri ga prije provjere, inače rezultat neće odgovarati tvojoj ustanovi.</p>'
      : '')
    + '<div class="ap-akcije">'
    + `<button class="btn ${potvrdi} btn-sm" type="button" data-confirm-profile>Potvrdi i provjeri →</button>`
    + `<button class="btn ${promijeni} btn-sm" type="button" data-change-profile>Promijeni</button>`
    + '</div></div>';
}
