/**
 * UGOVOR BIJELE LISTE ZA PRIJENOS KONTEKSTA `/` -> `/rad/`, kao provjera nad BILO KOJOM izvedbom.
 *
 * Zasto kao funkcija koja prima izvedbu, a ne kao niz `expect` poziva: gard nad bijelom listom
 * moze biti zelen i kad propusta sve (`tests/gate-mutations.test.ts` postoji upravo zbog te klase
 * kvara). Ovdje se isti popis tvrdnji pusta i preko stvarne funkcije, gdje mora dati prazan
 * popis problema, i preko podmetnute izvedbe koja propusta svaki kljuc, gdje mora zagristi.
 */

export type HandoffQueryBuilder = (search: string | null | undefined) => string;

function keysOf(query: string): string[] {
  return [...new URLSearchParams(query.startsWith('?') ? query.slice(1) : query).keys()];
}

/**
 * Vraca popis PREKRSENIH tvrdnji. Prazan popis znaci da izvedba postuje ugovor.
 * Svaki redak imenuje kvar koji bi se propustanjem dogodio, ne samo ime testa.
 */
export function handoffQueryProblems(build: HandoffQueryBuilder): string[] {
  const problems: string[] = [];
  const fail = (message: string): void => { problems.push(message); };

  // 1. Otvoren prijenos odredista: `redirect` koji prezivi navigaciju je povrsina za napad.
  const withRedirect = build('?unit=ffzg&redirect=https%3A%2F%2Fzlo.example%2Fx');
  if (keysOf(withRedirect).includes('redirect')) fail('kljuc redirect prezivio prijenos');
  if (!keysOf(withRedirect).includes('unit')) fail('kljuc unit nije prezivio prijenos');

  // 2. Nosioci ovlasti nemaju sto traziti u linku koji se dijeli i indeksira.
  if (build('?token=tajna') !== '') fail('kljuc token prezivio prijenos');
  if (build('?access_token=tajna&next=/admin') !== '') fail('kljucevi access_token/next prezivjeli prijenos');

  // 3. Kljuc koji uopce nije ime parametra nego pokusaj ubrizgavanja.
  const injected = build('?%3Cscript%3E=1&utm_%3Cscript%3E=1&unit=ffzg');
  if (/script/i.test(injected)) fail('kljuc s <script> prezivio prijenos');

  // 4. Broj utm kljuceva je ogranicen; deveti se odbacuje.
  const manyUtm = build(`?${Array.from({ length: 12 }, (_, i) => `utm_k${i}=v${i}`).join('&')}`);
  const utmKeys = keysOf(manyUtm).filter((k) => k.startsWith('utm_'));
  if (utmKeys.length > 8) fail(`utm kljuceva ${utmKeys.length}, granica je 8`);
  if (utmKeys.length < 1) fail('nijedan utm kljuc nije prezivio prijenos');

  // 5. Predugacka vrijednost se odbacuje, ne krati.
  const longValue = 'x'.repeat(201);
  if (build(`?unit=${longValue}`) !== '') fail('vrijednost preko 200 znakova prezivjela prijenos');
  const keptValue = 'y'.repeat(200);
  if (build(`?unit=${keptValue}`) !== `?unit=${keptValue}`) fail('vrijednost od tocno 200 znakova odbacena');

  // 6. Prazan ulaz daje prazan izlaz, u svim oblicima praznine.
  for (const empty of ['', '?', null, undefined]) {
    if (build(empty) !== '') fail(`prazan ulaz ${JSON.stringify(empty)} nije dao prazan izlaz`);
  }

  // 7. Idempotencija: izlaz ponovno kroz istu funkciju mora dati isti niz.
  const once = build('?unit=ffzg&work=diplomski&project=p1&utm_source=faculty_page&token=x');
  if (build(once) !== once) fail(`nije idempotentno: ${once} -> ${build(once)}`);

  return problems;
}

/**
 * UGOVOR NAD PRODUKCIJSKOM VEZOM U `src/routes/intake/main.ts`.
 *
 * ZASTO POSTOJI: pregled je izmjerio rupu, nije je pretpostavio. Brisanjem JEDNOG retka
 * (`handoffSearch: window.location.search`) iz `main.ts` cijeli prijenos prestaje raditi u
 * pregledniku, a svi testovi ostaju zeleni, jer svaki od njih `handoffSearch` ubrizgava rucno kroz
 * ovisnosti kontrolera i time nikad ne dotice stvarnu vezu. Tako bi buduci refaktor, revert ili
 * merge tiho vratio nalaz #11 iz audita 22. 9. (student sa SEO stranice fakulteta opet dobiva
 * genericki obrazac) bez ijednog crvenog signala.
 *
 * CLAUDE.md, "Verifikacijska disciplina": novi mehanizam mora imati vlastiti izravni signal.
 * Provjera je nad IZVOROM jer je to jedini sloj na kojem se ta veza vidi; isti idiom vec koristi
 * `tests/intake-entry-boundary.test.ts` za `uploadCapBytes` i `deviceMemory`.
 *
 * Vraca popis PREKRSENIH tvrdnji; prazan popis znaci da je veza na mjestu.
 */
export function intakeHandoffWiringProblems(mainSource: string): string[] {
  const problems: string[] = [];
  const fail = (message: string): void => { problems.push(message); };

  const mountIndex = mainSource.indexOf('mountIntakeController(');
  if (mountIndex < 0) {
    fail('mountIntakeController se ne poziva iz main.ts');
    return problems;
  }

  // Gleda se SAMO tijelo poziva, da tvrdnju ne moze lazno zadovoljiti spomen u komentaru negdje
  // drugdje u datoteci.
  const callBody = mainSource.slice(mountIndex);
  const wiring = /handoffSearch\s*:\s*([^,\n]+)/.exec(callBody);
  if (!wiring) {
    fail('mountIntakeController se poziva bez handoffSearch: kontekst sa `/?unit=...` se gubi');
    return problems;
  }

  const value = wiring[1].trim();
  if (!/^(?:window\.)?location\.search$/.test(value)) {
    fail(`handoffSearch ne dolazi iz location.search nego iz \`${value}\``);
  }

  return problems;
}
