import { describe, expect, it } from 'vitest';
import { canLinkSession, emptyLedger } from '../src/routes/workspace/workspace-state';
// Kompozitori zive u `bootstrap.ts`; razlog je zapisan ondje.
import { afterDocumentAccepted, afterPersist } from '../src/routes/workspace/bootstrap';

/**
 * KNJIGA SESIJE RADNOG PROSTORA (prije: stroj stanja; povuceno 2026-09-12, korak B5).
 *
 * STO JE OVDJE PRIJE STAJALO, i zasto je otislo: tvrdnje o dvanaest stanja i osamnaest dogadjaja,
 * ukljucujuci `analyzing`, `results`, `repairPlan`, `comparison` i `submission`. Izmjereno
 * 2026-09-10: nijedno od tih stanja produkcija nikad nije dosegla, a te dogadjaje nitko nije
 * emitirao izvan ovog testa. Gard koji ne moze pasti nije pokrivenost, pa je otisao zajedno sa
 * strojem. Stanja korisnickog toka vozi `src/ui/wizard-machine.ts`, koji stvarno pise prikaz, a
 * njegove tvrdnje zive u `tests/wizard-machine.test.ts` i `tests/wizard-phase.test.ts`.
 *
 * OD TRI PRAVILA koja je stari uvod naveo kao razlog svog postojanja, dva su presla u stroj
 * prikaza (analiza ne pocinje prije potvrde profila; greska ne baci rad), a trece je ostalo ovdje
 * i tek se sada stvarno mjeri: poveznica na sesiju koja nije zapisana.
 */

describe('knjiga sesije', () => {
  it('prazna knjiga nema ni dokument ni zapis', () => {
    const l = emptyLedger();
    expect(l.documentPresent).toBe(false);
    expect(l.sessionPersisted).toBe(false);
    expect(canLinkSession(l)).toBe(false);
  });

  /**
   * OVA TVRDNJA JE NOVA, i to je poanta koraka.
   *
   * U starom stroju se `true` nikad nije izmjerio: jedina grana koja je postavljala
   * `sessionPersisted` zivjela je u `main.ts`, a nijedan test je nije prosao. Gard je time tvrdio
   * samo negativnu stranu. Sada se mjere OBA ishoda.
   *
   * Pronalazak sesije u pohrani i dalje NE daje `true`, i to je zatecen ugovor koji ovaj korak
   * namjerno cuva: poveznica se nudi samo za zapis koji smo MI napravili.
   */
  it('poveznica se smije ponuditi TEK kad zapis stvarno postoji', () => {
    expect(canLinkSession(afterPersist(emptyLedger(), true))).toBe(true);
    expect(canLinkSession(afterPersist(emptyLedger(), false)), 'neuspjeh zapisa ne nudi poveznicu').toBe(false);
    expect(canLinkSession(emptyLedger()), 'pronadjen zapis nije nas zapis').toBe(false);
  });

  it('prihvacen dokument JOS nije zapisana sesija', () => {
    const l = afterDocumentAccepted(emptyLedger());
    expect(l.documentPresent).toBe(true);
    expect(l.sessionPersisted, 'u trenutku prihvata zapis jos ne postoji').toBe(false);
    expect(canLinkSession(l)).toBe(false);
  });

  it('zamjena dokumenta ponistava zapis, jer stara sesija opisuje drugi rad', () => {
    const zapisana = afterPersist(afterDocumentAccepted(emptyLedger()), true);
    expect(canLinkSession(zapisana)).toBe(true);
    const zamijenjen = afterDocumentAccepted(zapisana);
    expect(zamijenjen.documentPresent).toBe(true);
    expect(canLinkSession(zamijenjen), 'poveznica bi vodila na krivi dokument').toBe(false);
  });

  it('neuspjeh zapisa NE baca dokument: rad ostaje u kartici', () => {
    const l = afterPersist(afterDocumentAccepted(emptyLedger()), false);
    expect(l.documentPresent, 'dokument se ne smije izgubiti zbog pohrane').toBe(true);
    expect(canLinkSession(l)).toBe(false);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg knjiga postoji:
   * poveznica ponudena zato sto dokument POSTOJI, umjesto zato sto je zapis USPIO.
   */
  it('gard grize: poveznica bez zapisa mora biti prijavljena', () => {
    const posteno = afterDocumentAccepted(emptyLedger());
    expect(canLinkSession(posteno), 'baseline je izmjeren, ne pretpostavljen').toBe(false);
    const popustljiv = (l: { documentPresent: boolean }): boolean => l.documentPresent;
    expect(popustljiv(posteno), 'podmetnuta popustljiva provjera mora dati drukciji odgovor').toBe(true);
  });

  it('SENTINEL: knjiga nosi tocno dvije cinjenice, pa se ne moze tiho pretvoriti natrag u stroj', () => {
    expect(Object.keys(emptyLedger()).sort()).toEqual(['documentPresent', 'sessionPersisted']);
  });
});
