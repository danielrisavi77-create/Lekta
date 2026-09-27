/**
 * PRIJENOS KONTEKSTA S ULAZA `/` NA RADNU POVRSINU `/rad/`.
 *
 * ZASTO POSTOJI: SEO stranice fakulteta i citatni alati vode na `/?unit=<id>&utm_source=...`
 * (`scripts/generate-faculty-pages.mjs`, `scripts/generate-citation-tools.mjs`). Ulaz je od reza
 * naslovnice samo upload i navigira na `/rad/#session=<uuid>`, bez ikakvog querya, pa su se i
 * fakultet i oznake izvora gubili na prvom koraku. Student sa stranice svog fakulteta dobivao je
 * genericki obrazac.
 *
 * STO ODREDISTE STVARNO CITA, A STO SAMO NOSI (izmjereno 23. 9. 2026, grep po `src/`):
 *  - `unit`, `work` i `project` KONZUMIRA `src/ui/selection-entry.ts` (`urlSelection`), kojeg
 *    `src/ui/app.ts` zove kroz `applyUnitFromUrl`. Za te tri kljuceve prijenos stvarno mijenja
 *    ono sto student vidi: predodabir profila umjesto generickog obrasca.
 *  - `utm_*` kljuceve u ovom trenutku NE CITA nijedan potrosac u aplikaciji. `src/ui/telemetry.ts`
 *    salje `path: location.pathname`, bez `location.search`, a `sanitizeEventData` propusta samo
 *    kljuceve s popisa `DOPUSTENI_KLJUCEVI`, na kojem nema nijednog utm polja; u `index.html` ni u
 *    `rad/index.html` nema analitike trece strane koja bi procitala punu adresu. Prijenos ih dakle
 *    zadrzava u adresnoj traci i time ostavlja OTVORENIM put do atribucije, ali je sam po sebi ne
 *    uspostavlja. Tko god je bude uspostavljao, mora to uciniti uz privolu i na strani potrosaca;
 *    ovdje se ne smije tvrditi da je atribucija rijesena.
 *
 * BIJELA LISTA, NE FILTAR CRNE LISTE. Prenose se tocno `unit`, `work`, `project` i `utm_*`
 * kljucevi. Sve ostalo se odbacuje bez iznimke, jer je ovo javno dosegljiv ulaz: proizvoljan
 * kljuc koji preziva navigaciju je povrsina za napad (`redirect`, `token`, `next`), a lista onoga
 * sto treba odbaciti nikad nije potpuna. Vrijednosti se NE mijenjaju osim URL enkodiranja.
 *
 * STO OVDJE NAMJERNO NIJE: pohrana. Query je izvor kad postoji i putuje kroz URL; nema zapisa u
 * `localStorage` ni drugog bocnog kanala (CLAUDE.md, "Konvencije").
 */

/** Kljucevi s tocnim imenom koje odrediste vec razumije; poredak je poredak prvenstva citanja. */
export const HANDOFF_EXACT_KEYS: readonly string[] = ['unit', 'work', 'project'];

/**
 * Oblik prihvatljivog UTM kljuca. Uzak namjerno: `utm_<script>` ili `utm_` s razmakom nije
 * atribucija nego pokusaj da se kroz bijelu listu provuce nesto drugo.
 */
const UTM_KEY_PATTERN = /^utm_[a-z0-9_]{1,32}$/i;

/**
 * Gornja granica duljine JEDNE vrijednosti. Predugacka vrijednost se ODBACUJE, ne krati: krnja
 * oznaka kampanje ili krnji `unit` tise su lazi od izostanka.
 */
export const HANDOFF_VALUE_MAX_LENGTH = 200;

/** Najveci broj `utm_*` kljuceva koji prezive prijenos; visak se odbacuje s kraja. */
export const HANDOFF_UTM_MAX_KEYS = 8;

function isAllowedKey(key: string): boolean {
  return HANDOFF_EXACT_KEYS.includes(key) || UTM_KEY_PATTERN.test(key);
}

/**
 * Gradi query za `/rad/` iz ulaznog `location.search`.
 *
 * Vraca prazan niz kad nema nicega za prenijeti, inace niz koji POCINJE znakom `?`, spreman za
 * nadovezivanje ispred fragmenta sesije.
 *
 * Ugovor koji drze testovi (`tests/helpers/handoff-query-contract.ts`):
 *  - prolazi samo bijela lista; sve ostalo nestaje,
 *  - prvi pojavak kljuca pobjeduje, ponovljeni se odbacuje (zagadjenje parametara),
 *  - prazna vrijednost se odbacuje, jer `?unit=` ne znaci nista,
 *  - poredak je poredak prvog pojavka u ulazu, pa je funkcija idempotentna.
 */
export function buildHandoffQuery(search: string | URLSearchParams | null | undefined): string {
  if (search === null || search === undefined) return '';

  let source: URLSearchParams;
  try {
    source = typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  } catch {
    return '';
  }

  const out = new URLSearchParams();
  const seen = new Set<string>();
  let utmCount = 0;

  for (const [rawKey, rawValue] of source) {
    const key = rawKey.trim();
    if (!isAllowedKey(key)) continue;
    if (seen.has(key)) continue;
    if (rawValue.length === 0 || rawValue.trim().length === 0) continue;
    if (rawValue.length > HANDOFF_VALUE_MAX_LENGTH) continue;

    const isUtm = !HANDOFF_EXACT_KEYS.includes(key);
    if (isUtm) {
      if (utmCount >= HANDOFF_UTM_MAX_KEYS) continue;
      utmCount += 1;
    }

    seen.add(key);
    out.append(key, rawValue);
  }

  const serialized = out.toString();
  return serialized ? `?${serialized}` : '';
}
