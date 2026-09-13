/**
 * PRIVATNOST KAO STANJE, ne kao ukras. Osma tocka vlasnikova pregleda.
 *
 * Zateceno je bilo CETIRI znaka u TRI formulacije ("Lokalno", "Lokalna obrada", "Automatska
 * provjera je lokalna"), i nijedan se nije mijenjao. Cetiri izvora iste tvrdnje se raziđu, a
 * tvrdnja o privatnosti koja se razilazi sama sebe opovrgava.
 *
 * Slanje je jedini trenutak kad tvrdnja prestaje vrijediti, pa je i jedini koji smije izgledati
 * drukcije. Sadrzaj se pritom NE ublazava: sve tri cinjenice stare pravnicke recenice ostaju.
 * Ugovor i mutacije: `tests/privacy-state.test.ts`.
 */

export type PrivacyFaza = 'lokalno' | 'slanje';

export interface PrivacyStanje {
  readonly faza: PrivacyFaza;
  /** Kratak natpis uz lokot; jedini tekst koji stoji u zaglavlju. */
  readonly znacka: string;
  /** Puna recenica za `title`/`aria`, jer znacka je prekratka da bude tvrdnja. */
  readonly objasnjenje: string;
}

const STANJA: Readonly<Record<PrivacyFaza, PrivacyStanje>> = {
  lokalno: {
    faza: 'lokalno',
    znacka: 'Lokalno na ovom uređaju',
    objasnjenje: 'Analiza radi u tvom pregledniku. Dokument ne odlazi s uređaja.',
  },
  slanje: {
    faza: 'slanje',
    znacka: 'Za ovaj korak se šalje Lekti',
    objasnjenje: 'Automatski popravak radi na Lektinom poslužitelju, pa za taj jedan korak dokument odlazi s uređaja.',
  },
};

export function privacyStanje(faza: PrivacyFaza): PrivacyStanje {
  return STANJA[faza] ?? STANJA.lokalno;
}

/**
 * Blok stoji UZ gumb popravka, ne u zasebnom koraku i ne u modalu: obavijest koja trazi jos jedan
 * klik da bi se vidjela nije obavijest. Kucica ispod ostaje, jer je ona zapis privole; mijenja se
 * samo ono sto korisnik cita prije nje.
 */
export function privacyPrijelazHtml(esc: (v: string) => string): string {
  const s = privacyStanje('slanje');
  return '<div class="pv-prijelaz" data-privacy-prijelaz>'
    + '<p class="pv-prijelaz__naslov">' + esc(s.znacka) + '</p>'
    + '<p class="pv-prijelaz__tijelo">Popravak radi na Lektinom poslužitelju, pa se dokument za taj '
    + 'korak šalje i ostaje spremljen u <strong>Moji popravci</strong> dok ga ne obrišeš. '
    + '<strong>Original na tvom uređaju se ne mijenja</strong>: vraća se nova kopija, a ti biraš '
    + 'hoćeš li je zadržati. Besplatna analiza i dalje radi lokalno.</p>'
    + '</div>';
}
