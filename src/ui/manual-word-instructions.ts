const INSTRUCTIONS: Readonly<Record<string, string>> = {
  'format.font.dominant': 'U Wordu otvori Polazno > Stilovi > Izmijeni, uredi stil tijela teksta i postavi font prema prikazanom zahtjevu ili službenoj uputi tvojeg studija. Naslove, citate i bilješke provjeri zasebno.',
  'format.size.body': 'U Wordu otvori Polazno > Stilovi > Izmijeni, uredi stil tijela teksta i postavi veličinu prema prikazanom zahtjevu ili službenoj uputi tvojeg studija. Naslove, citate i bilješke provjeri zasebno.',
  'format.spacing.body': 'U Wordu otvori Polazno > Stilovi > Izmijeni za stil tijela teksta, zatim Oblikovanje > Odlomak > Prored. Postavi prikazani zahtjev te provjeri odvojene stilove tablica i bilježaka.',
  'format.justify.body': 'U Wordu u postavkama stila tijela teksta promijeni poravnanje prema prikazanom pravilu. Naslovnicu i naslove provjeri zasebno.',
  'page.margins': 'U Wordu otvori Raspored > Margine > Prilagođene margine. Upiši vrijednosti prema prikazanom zahtjevu ili službenoj uputi tvojeg studija i provjeri sve sekcije dokumenta.',
  'structure.heading.word-styles': 'U Wordu stvarnim naslovima pridruži odgovarajuće stilove Naslov 1, Naslov 2 i Naslov 3 prema hijerarhiji. Tekst naslova ostaje tvoj.',
  'toc.present': 'Nakon što naslovi imaju Word stilove, otvori Reference > Sadržaj. Osvježi cijelu tablicu i provjeri razine naslova i brojeve stranica.',
  'page.numbers.present': 'U Wordu otvori Umetanje > Broj stranice. Prema službenoj uputi provjeri položaj, početak numeriranja te iznimke naslovnice i sekcija.',
};

export function manualWordInstruction(checkId: string): string | null {
  return Object.hasOwn(INSTRUCTIONS, checkId) ? INSTRUCTIONS[checkId] : null;
}
