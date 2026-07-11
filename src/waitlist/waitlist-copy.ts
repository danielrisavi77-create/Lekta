/**
 * Mikrokopija waitlist trake (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcija 4).
 *
 * Cista funkcija: stanje detekcije + prikazna imena -> tekstovi. Hrvatski, bez crtica,
 * aktivni glas, bez obecanog datuma, uvijek jasno "opca pravila, ne provjerena pravila
 * fakulteta". Vraca SIROVE stringove; pozivatelj (app.ts) ih escapea pri unosu u innerHTML.
 */

import type { WaitlistDetection } from './waitlist-detect';

export interface WaitlistCopy {
  title: string;
  body: string;
  note: string;
  placeholder: string;
  cta: string;
  success: string;
  emailInvalid: string;
  networkError: string;
  closeLabel: string;
}

const COMMON = {
  note: 'Bez imena bilježimo da je ovaj fakultet tražen; e-mail koristimo samo za tu jednu obavijest.',
  placeholder: 'tvoj@email.hr',
  cta: 'Javi mi kad bude gotovo',
  emailInvalid: 'Provjeri e-mail adresu.',
  networkError: 'Nije uspjelo poslati. Pokušaj kasnije.',
  closeLabel: 'Zatvori obavijest',
};

/** Tekstovi trake za znanu celiju (stanja A i B). Stanje C (nepoznat fakultet) ima vlastiti obrazac. */
export function waitlistCopy(
  detection: WaitlistDetection,
  opts: { workTypeLabel?: string } = {},
): WaitlistCopy {
  const name = detection.cell.facultyName;
  const wt = opts.workTypeLabel || 'ta vrsta rada';

  if (detection.state === 'worktype-uncovered') {
    return {
      ...COMMON,
      title: `Za ${name} još nema provjerena pravila za ${wt}`,
      body: `Analiza gore koristi opća akademska pravila. Ostavi e-mail i javit ćemo ti se kad ${wt} za taj fakultet bude gotov.`,
      success: 'Hvala. Javit ćemo ti se e-mailom kad bude gotovo.',
    };
  }
  // faculty-uncovered (i default): fakultet u katalogu bez provjerenog profila ili blokiran izvor
  return {
    ...COMMON,
    title: `Fakultet ${name} još nije pokriven`,
    body: `Analiza gore koristi opća akademska pravila, ne provjerena pravila tvojeg fakulteta. Ostavi e-mail i javit ćemo ti se kad ${name} bude gotov.`,
    success: `Hvala. Javit ćemo ti se e-mailom kad ${name} bude gotov.`,
  };
}
