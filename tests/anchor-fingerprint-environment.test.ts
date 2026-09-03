import { describe, expect, it } from 'vitest';
import { anchorFingerprintForXml } from '../src/analysis/element-structure';

/**
 * KARAKTERIZACIJA: otisak sidra NIJE isti bez `DOMParser`-a (T15, prvi korak).
 *
 * `anchorFingerprintForXml` parsira XML i racuna otisak iz STRUKTURE; kad parsiranje ne uspije,
 * `catch` grana vraca posve drugi otisak, izveden regex normalizacijom sirovog stringa.
 *
 * To nije teorijska grana. Izmjereno izvodjenjem, na istom ulazu:
 *
 *     Deno (Edge funkcija)   `typeof DOMParser === 'undefined'`   ->  56373eeb
 *     Node / preglednik      `typeof DOMParser === 'function'`    ->  b7bbf729
 *
 * `supabase/functions/deno.json` dodaje `dom` u `lib`, ali to su TIPOVI za `deno check`, ne
 * runtime; polyfilla nema (`grep DOMParser supabase/functions` -> samo taj config).
 *
 * ZASTO JE TO VAZNO. `element-caption-fixer` (u serverskom lancu, `apply-fixers.ts:85`) na retku
 * 275 usporedjuje PONOVNO IZRACUNAT otisak s `target.anchorFingerprint` koji stize u zahtjevu, a
 * klijent ga racuna u pregledniku, dakle s pravim `DOMParser`-om. Dvije strane usporedbe tako
 * nastaju u razlicitim granama iste funkcije.
 *
 * OVAJ TEST NE POPRAVLJA NISTA i namjerno: popravak dira analitcku jezgru koja je golden-zasticena,
 * i vlasnikova je odluka. Test zakljucava ZATECENO ponasanje, pa ce pasti u trenutku kad ga netko
 * ucini okolinski neovisnim. To je zeljeni ishod, a ne regresija: tada se ovaj opis brise.
 *
 * NIJE PROVJERENO do kraja, i ne tvrdi se: puni put parametara za natpise elemenata od analize do
 * Edge funkcije. Tvrdi se samo mehanizam iznad, koji je izmjeren.
 */

const XML = '<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:tr><w:tc><w:p><w:r><w:t>Naslov</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';

describe('otisak sidra i okolina', () => {
  it('s DOMParser-om i bez njega daje RAZLICIT otisak', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const sParserom = anchorFingerprintForXml('table', XML);
    expect(typeof g.DOMParser, 'test setup mora podmetnuti xmldom kao DOMParser').toBe('function');

    const spremljen = g.DOMParser;
    delete g.DOMParser;
    let bezParsera: string;
    try {
      bezParsera = anchorFingerprintForXml('table', XML);
    } finally {
      g.DOMParser = spremljen;
    }

    expect(sParserom).toMatch(/^[0-9a-f]{8}$/);
    expect(bezParsera).toMatch(/^[0-9a-f]{8}$/);
    expect(
      bezParsera,
      'Otisci se poklapaju, dakle netko je funkciju ucinio okolinski neovisnom. '
      + 'To je zeljeni ishod: obrisi ovaj test i njegov opis, i skini nalaz s popisa.',
    ).not.toBe(sParserom);
  });

  it('vrijednost iz grane bez parsera je bas ona izmjerena u Denu', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const spremljen = g.DOMParser;
    delete g.DOMParser;
    let bezParsera: string;
    try {
      bezParsera = anchorFingerprintForXml('table', XML);
    } finally {
      g.DOMParser = spremljen;
    }
    // Mjereno `deno run` nad istim ulazom, uz `supabase/functions/deno.json`.
    expect(bezParsera, 'grana bez parsera vise ne daje ono sto Edge funkcija stvarno izracuna').toBe('56373eeb');
  });
});
