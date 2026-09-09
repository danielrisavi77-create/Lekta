/**
 * GDJE PLAN SLIJECE U PANEL. Sedma tocka, drugi dio.
 *
 * Brif: "Nalaz prirodno zavrsava u popravku." Do sada je CTA plana otvarao panel i doskrolao na
 * njegov VRH, a fokus je isao na prvi omoguceni gumb, sto je znalo biti "Uredi..." u popisu. Ulaz
 * je time postojao, ali je korisnik i dalje morao pronaci radnju.
 *
 * CTA NAMJERNO NE POKRECE POPRAVAK. Izmedju "prihvacam plan" i "dokument je poslan" stoji trenutak
 * privole koji je osma tocka izricito trazila, a stavke s `requiresConfirmation` imaju i drugu
 * kapiju (`renderConfirmation`). Gumb koji preskoci prvo ili bi pao na drugom nije "jedan klik do
 * popravka" nego ponisten dogovor. Plan zato slijece TOCNO na odluku, s vec odabranim sigurnim
 * stavkama, pa je put `plan -> privola -> popravak`: dva klika, oba znace nesto.
 *
 * Zivi izvan `app.ts` jer je odluka o meti, ne ozicenje: ovako je mjerljiva bez preglednika, a
 * `app.ts` (pod `BUDZET_APP`) dobiva dva retka umjesto obrazlozenja.
 */

export interface RepairLanding {
  /** Sto dovesti u vidno polje. */
  readonly scroll: Element;
  /** Sto fokusirati; `null` kad panel nema omogucenu radnju (npr. sve odabrano vec primijenjeno). */
  readonly focus: HTMLElement | null;
}

/** Glavna radnja oba panela, lokalnog i serverskog. Isti razred je jedina zajednicka tocka. */
const GLAVNA = '.lekta-repair-panel__download';

/**
 * Trenutak odluke: na serverskom putu blok koji kaze da dokument odlazi s uredaja (osma tocka), a
 * odmah ispod njega su privola i gumb. Na lokalnom putu se nista ne salje, pa je odluka sam gumb.
 */
export function repairLanding(mount: Element): RepairLanding {
  const glavna = mount.querySelector<HTMLElement>(`${GLAVNA}:not([disabled])`);
  const prijelaz = mount.querySelector('[data-privacy-prijelaz]');
  const scroll = prijelaz ?? glavna ?? mount;
  // Rezerva postoji jer panel ne mora imati glavnu radnju (sve primijenjeno, ili samo tekstualne
  // stavke); tada je bolje fokusirati bilo sto upotrebljivo nego ostaviti fokus na starom ekranu.
  const focus = glavna ?? mount.querySelector<HTMLElement>('button:not([disabled]),a[href]');
  return { scroll, focus };
}
