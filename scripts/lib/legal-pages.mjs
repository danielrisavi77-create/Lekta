// Popis pravnih stranica i njihovih markera, JEDAN izvor za dvije provjere.
//
// ZASTO ODVOJENO. Iste stranice provjeravaju dva alata na dva mjesta u lancu:
// `verify-deploy-dist.mjs` gleda `dist/` PRIJE deploya, `post-deploy-smoke.mjs` gleda ono sto je
// stvarno POSLUZENO. Dok je popis bio prepisan na dva mjesta, dodavanje stranice u jedan alat
// tiho je ostavljalo drugi da je ne provjerava, a upravo taj drugi je jedini koji vidi produkciju.
//
// Marker je kratak, stabilan ULOMAK TEKSTA iz stranice. Namjerno nije naslov ni copy koji se
// mijenja pri lektiranju: verify-deploy-dist je vec jednom rusio cijeli Netlify build jer se
// literal razisao s tekstom stranice (vidi biljesku uz pokrivenost.html).
export const LEGAL_PAGES = [
  ['privatnost.html', 'AZOP'],
  ['garancija.html', '5 radnih dana'],
  ['obrada-dokumenata.html', 'Lokalna analiza'],
  ['kolacici.html', 'localStorage'],
  ['uvjeti-koristenja.html', 'Predmet usluge'],
  ['pravila-povrata.html', 'Merchant of Record'],
  ['odricanje-od-odgovornosti.html', 'heuristička'],
];
