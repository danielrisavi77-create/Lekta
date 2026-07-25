/**
 * Cista jezgra "Sto je popravljeno": poravna odlomke PRIJE i POSLIJE popravka i klasificira svaku
 * promjenu (obrisano / dodano / promijenjen tekst), s razlikom na razini rijeci za promijenjeni tekst.
 * Bez DOM-a i bez mreze, pa je u cijelosti testabilna.
 *
 * ZASTO OVO POSTOJI: prethodni lokator (locateChanges) resinkronizirao je usporedbu gledajuci samo
 * JEDAN odlomak unaprijed, pa je tipican popravak (empty-paragraph-fixer sazme niz od 3+ praznih
 * odlomaka na 1, umetne se Sadrzaj od 20-ak redaka) trajno desinkronizirao poravnanje i prijavljivao
 * do 50 laznih "mjesta promjena". Ovdje je poravnanje prozorsko (trazi najblize sidro s najmanje
 * izmjena unutar prozora), pa pomak od 2+ odlomka vise ne razbija ostatak dokumenta.
 *
 * VAZNO: oblikovne promjene (font, prored, poravnanje, margine, razmaci) NAMJERNO nisu ovdje.
 * One vrijede za cijeli dokument i nemaju jedno mjesto u tekstu; prikazuju se kao popis (changelog),
 * ne kao inline oznaka. Ovdje su samo promjene koje STVARNO imaju lokaciju: obrisan/dodan odlomak i
 * promijenjen tekst odlomka (npr. naslov "Uvod" -> "UVOD").
 */

/** Minimalni oblik odlomka koji trebamo iz preview modela (kompatibilno s PreviewParagraph). */
export interface DiffParagraph {
  index: number;
  text: string;
  headingLevel?: number | null;
}

interface DiffModelLike {
  paragraphs?: DiffParagraph[];
}

/** Jedan token razlike na razini rijeci; `changed` znaci uklonjeno (lijevo) ili dodano (desno). */
export interface WordToken {
  text: string;
  changed: boolean;
}

/** Jedna promjena s lokacijom. `equal` odlomci se ne vracaju (nema ih sto oznaciti). */
export interface DiffOp {
  kind: 'delete' | 'insert' | 'replace';
  /** 1-based index odlomka u modelu PRIJE (null za cisto dodavanje). */
  before: number | null;
  /** 1-based index odlomka u modelu POSLIJE (null za cisto brisanje). */
  after: number | null;
  beforeText: string;
  afterText: string;
  /** Razina naslova (za labelu "Naslov N" u popisu); null/undefined za obican odlomak. */
  headingLevel: number | null;
  /** Samo za `replace`: tokeni lijeve strane s oznakom promjene (za crveno). */
  beforeWords?: WordToken[];
  /** Samo za `replace`: tokeni desne strane s oznakom promjene (za zeleno). */
  afterWords?: WordToken[];
}

type RawKind = 'equal' | 'delete' | 'insert';
interface RawOp {
  kind: RawKind;
  i: number; // index u `before` (za equal/delete)
  j: number; // index u `after` (za equal/insert)
}

/** Koliko odlomaka unaprijed trazimo sidro pri poravnanju. Pokriva realne pomake (Sadrzaj ~20 redaka). */
const ALIGN_WINDOW = 400;
/** Gornja granica broja tokena za diff rijeci; iznad toga se cijeli odlomak oznaci kao promijenjen. */
const MAX_WORD_TOKENS = 600;

/**
 * Poravnaj dva niza tekstova odlomaka. Kad se ne poklapaju, trazi najblize sljedece sidro s NAJMANJE
 * izmjena (najmanji di+dj) unutar prozora, pa emitira di brisanja i dj umetanja i nastavi od sidra.
 * Time se pomak od vise odlomaka oporavi umjesto da trajno razbije ostatak (za razliku od lookahead-1).
 */
function alignTexts(a: string[], b: string[]): RawOp[] {
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', i, j });
      i++;
      j++;
      continue;
    }
    let foundDi = -1;
    let foundDj = -1;
    const maxK = Math.min(ALIGN_WINDOW, a.length - i + (b.length - j));
    outer: for (let k = 1; k <= maxK; k++) {
      for (let di = 0; di <= k; di++) {
        const dj = k - di;
        if (i + di >= a.length || j + dj >= b.length) continue;
        if (a[i + di] === b[j + dj]) {
          foundDi = di;
          foundDj = dj;
          break outer;
        }
      }
    }
    if (foundDi < 0) {
      // Bez sidra u prozoru: tretiraj kao jednu zamjenu i pomakni oba (kasnije se upari u replace).
      ops.push({ kind: 'delete', i, j });
      ops.push({ kind: 'insert', i, j });
      i++;
      j++;
      continue;
    }
    for (let d = 0; d < foundDi; d++) ops.push({ kind: 'delete', i: i + d, j });
    for (let d = 0; d < foundDj; d++) ops.push({ kind: 'insert', i, j: j + d });
    i += foundDi;
    j += foundDj;
  }
  while (i < a.length) ops.push({ kind: 'delete', i: i++, j });
  while (j < b.length) ops.push({ kind: 'insert', i, j: j++ });
  return ops;
}

/** Podijeli tekst na tokene (rijeci i razmaci naizmjence), cuvajuci sve znakove. */
function tokenize(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/**
 * Razlika na razini rijeci izmedju dva teksta. LCS nad tokenima: zajednicki tokeni ostaju
 * nepromijenjeni, ostali se oznace (`changed`). Kod predugih odlomaka cijeli tekst se oznaci kao
 * promijenjen (izbjegava kvadratni trosak). Konkatenacija `text` svih tokena === izvorni tekst.
 */
export function diffWords(beforeText: string, afterText: string): { before: WordToken[]; after: WordToken[] } {
  const A = tokenize(beforeText);
  const B = tokenize(afterText);
  if (A.length + B.length > MAX_WORD_TOKENS) {
    return {
      before: beforeText ? [{ text: beforeText, changed: true }] : [],
      after: afterText ? [{ text: afterText, changed: true }] : [],
    };
  }
  const n = A.length;
  const m = B.length;
  // LCS tablica (n+1)x(m+1).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      dp[x][y] = A[x] === B[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
    }
  }
  const before: WordToken[] = [];
  const after: WordToken[] = [];
  let x = 0;
  let y = 0;
  while (x < n && y < m) {
    if (A[x] === B[y]) {
      before.push({ text: A[x], changed: false });
      after.push({ text: B[y], changed: false });
      x++;
      y++;
    } else if (dp[x + 1][y] >= dp[x][y + 1]) {
      before.push({ text: A[x], changed: true });
      x++;
    } else {
      after.push({ text: B[y], changed: true });
      y++;
    }
  }
  while (x < n) before.push({ text: A[x++], changed: true });
  while (y < m) after.push({ text: B[y++], changed: true });
  return { before, after };
}

const isBlank = (t: string): boolean => !t || !t.trim();

/**
 * Izgradi uredjen popis promjena s lokacijom. `equal` odlomci se izostavljaju. Susjedna brisanja i
 * umetanja se uparuju u `replace` (promijenjen tekst istog odlomka, npr. naslov velika slova), osim
 * kad je jedna strana prazna a druga nije (tada su to strukturna brisanja/umetanja, ne zamjena).
 */
export function buildDiffOps(before: DiffModelLike | null | undefined, after: DiffModelLike | null | undefined, limit = 80): DiffOp[] {
  const bp = before?.paragraphs ?? [];
  const ap = after?.paragraphs ?? [];
  const raw = alignTexts(bp.map((p) => p.text ?? ''), ap.map((p) => p.text ?? ''));

  const out: DiffOp[] = [];
  const headingOf = (p: DiffParagraph | undefined): number | null => (p && typeof p.headingLevel === 'number' ? p.headingLevel : null);

  let idx = 0;
  while (idx < raw.length && out.length < limit) {
    if (raw[idx].kind === 'equal') {
      idx++;
      continue;
    }
    // Skupi maksimalni blok ne-jednakih operacija.
    const dels: number[] = [];
    const inss: number[] = [];
    while (idx < raw.length && raw[idx].kind !== 'equal') {
      if (raw[idx].kind === 'delete') dels.push(raw[idx].i);
      else inss.push(raw[idx].j);
      idx++;
    }
    // Prazni odlomci su uvijek cisto strukturni (brisanje viska Enter-a, umetnut prazan red).
    const textDels = dels.filter((i) => !isBlank(bp[i]?.text ?? ''));
    const blankDels = dels.filter((i) => isBlank(bp[i]?.text ?? ''));
    const textInss = inss.filter((j) => !isBlank(ap[j]?.text ?? ''));
    const blankInss = inss.filter((j) => isBlank(ap[j]?.text ?? ''));

    // Upari tekstualna brisanja i umetanja pozicijski u zamjene.
    const pairs = Math.min(textDels.length, textInss.length);
    for (let k = 0; k < pairs && out.length < limit; k++) {
      const b = bp[textDels[k]];
      const a = ap[textInss[k]];
      const words = diffWords(b.text ?? '', a.text ?? '');
      out.push({
        kind: 'replace',
        before: b.index,
        after: a.index,
        beforeText: b.text ?? '',
        afterText: a.text ?? '',
        headingLevel: headingOf(a) ?? headingOf(b),
        beforeWords: words.before,
        afterWords: words.after,
      });
    }
    for (let k = pairs; k < textDels.length && out.length < limit; k++) {
      const b = bp[textDels[k]];
      out.push({ kind: 'delete', before: b.index, after: null, beforeText: b.text ?? '', afterText: '', headingLevel: headingOf(b) });
    }
    for (let k = pairs; k < textInss.length && out.length < limit; k++) {
      const a = ap[textInss[k]];
      out.push({ kind: 'insert', before: null, after: a.index, beforeText: '', afterText: a.text ?? '', headingLevel: headingOf(a) });
    }
    for (const i of blankDels) {
      if (out.length >= limit) break;
      out.push({ kind: 'delete', before: bp[i].index, after: null, beforeText: bp[i].text ?? '', afterText: '', headingLevel: null });
    }
    for (const j of blankInss) {
      if (out.length >= limit) break;
      out.push({ kind: 'insert', before: null, after: ap[j].index, beforeText: '', afterText: ap[j].text ?? '', headingLevel: null });
    }
  }
  return out;
}

/** Mjesto strukturne promjene (za skok u faksimilu): indeksi odlomka prije i poslije. */
export interface LocatedChange {
  before: number | null;
  after: number | null;
}

/**
 * Natrag-kompatibilan lokator: vrati po jedno mjesto za svaku stvarnu promjenu (brisanje, umetanje,
 * zamjena teksta). Za razliku od stare implementacije NE desinkronizira se na pomaku vecem od jednog
 * odlomka i ne izmislja lazna mjesta na kraju.
 */
export function locateChanges(before: DiffModelLike | null | undefined, after: DiffModelLike | null | undefined, limit = 80): LocatedChange[] {
  return buildDiffOps(before, after, limit).map((op) => ({ before: op.before, after: op.after }));
}
