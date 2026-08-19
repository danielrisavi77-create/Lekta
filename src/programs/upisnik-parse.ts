/**
 * Parser rezultata pretrazivanja Upisnika studijskih programa (P1-2 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Izvor: https://hko.srce.hr/usp (Ministarstvo znanosti, obrazovanja i mladih; programsku
 * podrsku odrzava Srce). To je SLUZBENA evidencija akreditiranih studijskih programa i jedini
 * izvor koji smije popuniti `officialProgramCode` (`sifraUpisnik` u sucelju Upisnika).
 *
 * Zasto je parser odvojen od skripte koja dohvaca: dohvat trazi mrezu i sesiju, a parsiranje ne.
 * Ovako se ponasanje parsera dokazuje nad commitanim uzorkom HTML-a, bez mreze u CI-ju, po istom
 * nacelu po kojem su i ostali generatori premjesteni u `src/` da bi uopce bili testabilni.
 *
 * SEMANTIKA KOJU NE POGADJAMO: naziv u tablici uvijek pocinje jednom znamenkom (1 na 1239
 * programa, 2 na 72, 5 na jednom). To je strukturni marker sucelja, a ne dio imena; ovdje se
 * odvaja u `nameMarker` i ostaje NEPROTUMACEN. Izgleda kao oznaka jezika naziva (programi s
 * markerom 2 imaju engleske nazive), ali dok to nije potvrdjeno iz izvora, `language` se ne
 * izvodi iz njega nego iz izricitog facet upita (`jezikIzvodenja`).
 */

/** Jedan redak tablice rezultata; imena polja prate stupce sucelja Upisnika. */
export interface UpisnikRow {
  /** "Sifra iz upisnika" - sluzbena sifra programa. */
  sifraUpisnik: string;
  /** "Sifra zapisa" - interni id zapisa u aplikaciji. */
  sifraZapisa: string;
  naziv: string;
  /** Vodeca znamenka iz celije naziva; strukturni marker sucelja, znacenje nepotvrdjeno. */
  nameMarker: string | null;
  /** Ustanova nositelj programa. */
  nositelj: string;
  /** Sastavnica izvoditelj (fakultet/odjel); ovo se uparuje s nasim jedinicama. */
  izvoditelj: string;
  /** Vrsta studija doslovno kako je Upisnik pise ("Sveucilisni diplomski studij" i sl.). */
  vrsta: string;
  mjesto: string;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Odvaja strukturni marker od naziva. Marker je TOCNO jedna vodeca znamenka i uvijek je prisutan,
 * pa program koji se doista zove "3D dizajn" u tablici stoji kao "13D dizajn" i skidanjem jedne
 * znamenke se ispravno vraca. Zato se skida fiksno jedna, a ne "sve vodece znamenke".
 */
function splitMarker(cell: string): { marker: string | null; naziv: string } {
  const match = /^(\d)(.+)$/s.exec(cell);
  if (!match) return { marker: null, naziv: cell };
  return { marker: match[1], naziv: match[2].trim() };
}

/** Vrste studija koje Upisnik koristi; sluzi kao provjera da parser nije skliznuo za stupac. */
export const UPISNIK_VRSTE = [
  'Sveučilišni prijediplomski studij',
  'Sveučilišni diplomski studij',
  'Sveučilišni integrirani prijediplomski i diplomski studij',
  'Sveučilišni specijalistički studij',
  'Doktorski studij',
  'Stručni kratki studij',
  'Stručni prijediplomski studij',
  'Stručni diplomski studij',
] as const;

export interface ParseResult {
  rows: UpisnikRow[];
  /** Redci koje nismo mogli procitati; prazno za ispravan ulaz. Nikad se ne preskacu u tisini. */
  skipped: string[];
}

/**
 * Parsira HTML stranice rezultata u retke. Tolerantan je na razmake i atribute, ali NE i na
 * promjenu broja stupaca: redak s drugacijim brojem celija ide u `skipped`, a ne u tihi gubitak.
 */
export function parseUpisnikResults(html: string): ParseResult {
  const rows: UpisnikRow[] = [];
  const skipped: string[] = [];

  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const body = rowMatch[1];
    if (/<th[\s>]/.test(body)) continue; // zaglavlje
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (!cells.length) continue;
    if (cells.length !== 7) {
      skipped.push(decode(body).slice(0, 120));
      continue;
    }
    const { marker, naziv } = splitMarker(decode(cells[2]));
    rows.push({
      sifraUpisnik: decode(cells[0]),
      sifraZapisa: decode(cells[1]),
      naziv,
      nameMarker: marker,
      nositelj: decode(cells[3]),
      izvoditelj: decode(cells[4]),
      vrsta: decode(cells[5]),
      mjesto: decode(cells[6]),
    });
  }

  return { rows, skipped };
}
