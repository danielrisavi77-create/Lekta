/**
 * Word komentari kao LOKALNI zadaci studenta (plan T13, prva isporuka).
 *
 * Opseg: klasicni komentari iz `word/comments.xml` s dostupnim tekstom i sidrom u `word/document.xml`
 * (`w:commentRangeStart`/`w:commentReference`). Threaded i extended komentari (`commentsExtended.xml`,
 * odgovori, rijeseno) se NE tumace: oznacavaju se kao `unsupported` da sucelje ne tvrdi vise nego sto zna.
 *
 * Tvrde granice (CLAUDE.md, tvrdo pravilo o sadrzaju rada):
 *  - bez LLM-a, bez slanja komentara vanjskim servisima, bez automatskog pisanja odgovora;
 *  - `userStatus: 'addressed'` je STUDENTOVA oznaka i nikad ne postaje strojna potvrda kvalitete sadrzaja;
 *  - `verification: 'formal-check-passed'` smije dati SAMO povezana formalna provjera koja stvarno prolazi;
 *    sadrzajna primjedba mentora ostaje `not-verified` bez obzira na status.
 *
 * Puni tekst komentara sastavlja se iz SVIH `w:t` cvorova (ne iz skracenog isjecka inspektora); bez
 * pouzdanog sidra `anchorKey` je `null`, nikad izmisljen.
 */

export interface CommentTask {
  id: string;
  commentId: string;
  text: string;
  authorLabel: string | null;
  /** Otisak teksta odlomka na koji komentar pokazuje; `null` kad sidro nije pronadjeno. */
  anchorKey: string | null;
  /** Formalni nalazi koje je KORISNIK potvrdio kao povezane (prijedlog dolazi iz sucelja, potvrda od korisnika). */
  linkedFindingIds: string[];
  userStatus: 'open' | 'addressed';
  verification: 'not-verified' | 'formal-check-passed';
  /** Nepodrzana struktura (threaded/extended, odgovor) izricito oznacena, bez tumacenja. */
  unsupported: boolean;
}

export interface CommentSource {
  /** Sadrzaj `word/comments.xml`. */
  commentsXml: string;
  /** Sadrzaj `word/document.xml`, za sidra. */
  documentXml: string;
  /** Sadrzaj `word/commentsExtended.xml` ako postoji; sluzi SAMO za oznaku `unsupported`. */
  commentsExtendedXml?: string | null;
}

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Spojeni tekst svih `w:t` cvorova u fragmentu, s razmakom izmedju odlomaka. */
export function joinedText(fragment: string): string {
  const paragraphs = fragment.split(/<\/w:p\s*>/i);
  const out: string[] = [];
  for (const p of paragraphs) {
    const runs = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi)].map((m) => decodeEntities(m[1]));
    const text = runs.join('').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out.join(' ');
}

/** Stabilan otisak teksta odlomka; isti algoritam kao `anchorKey` da se komentar veze na sadrzaj, ne na polozaj. */
export function textFingerprint(text: string): string {
  const norm = text.replace(/\s+/g, ' ').trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `p:${h.toString(16).padStart(8, '0')}:${norm.length}`;
}

function anchorFor(documentXml: string, commentId: string): string | null {
  // Odlomak koji sadrzi referencu na komentar; bez nje sidro ne postoji.
  const ref = new RegExp(`<w:commentReference\\b[^>]*w:id="${commentId}"`, 'i');
  const paragraphs = documentXml.split(/(?=<w:p\b)/i);
  for (const p of paragraphs) {
    if (!ref.test(p) && !new RegExp(`<w:commentRangeStart\\b[^>]*w:id="${commentId}"`, 'i').test(p)) continue;
    const text = joinedText(p);
    return text ? textFingerprint(text) : null;
  }
  return null;
}

/** Izvuci zadatke iz komentara. Cisto, deterministicki, bez mreze. */
export function extractCommentTasks(source: CommentSource): CommentTask[] {
  const tasks: CommentTask[] = [];
  const extended = source.commentsExtendedXml ?? '';
  // Threaded: element s `paraIdParent` je ODGOVOR (njegov paraId), a vrijednost `paraIdParent` je roditelj s
  // odgovorima; oba su izvan opsega prve isporuke. `done="1"` (rijeseno u Wordu) takodjer se ne tumaci.
  const threaded = new Set<string>();
  for (const m of extended.matchAll(/<w15:commentEx\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const paraId = /w15:paraId="([^"]+)"/i.exec(attrs)?.[1]?.toUpperCase();
    const parent = /w15:paraIdParent="([^"]+)"/i.exec(attrs)?.[1]?.toUpperCase();
    const done = /w15:done="1"/i.test(attrs);
    if (parent) { threaded.add(parent); if (paraId) threaded.add(paraId); }
    if (done && paraId) threaded.add(paraId);
  }
  for (const match of source.commentsXml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment\s*>/gi)) {
    const attrs = match[1];
    const body = match[2];
    const commentId = /w:id="([^"]+)"/i.exec(attrs)?.[1];
    if (commentId === undefined) continue;
    const author = /w:author="([^"]*)"/i.exec(attrs)?.[1];
    const paraId = /w14:paraId="([^"]+)"/i.exec(body)?.[1]?.toUpperCase();
    const text = joinedText(body);
    const unsupported = Boolean(paraId && threaded.has(paraId));
    tasks.push({
      id: `comment:${commentId}`,
      commentId,
      text,
      authorLabel: author ? decodeEntities(author).trim() || null : null,
      anchorKey: anchorFor(source.documentXml, commentId),
      linkedFindingIds: [],
      userStatus: 'open',
      verification: 'not-verified',
      unsupported,
    });
  }
  return tasks;
}

export interface FormalCheckState {
  id: string;
  status: 'pass' | 'fail' | 'unmeasurable';
}

/** Korisnik oznacava zadatak obradjenim; strojna potvrda se ne mijenja time. */
export function markAddressed(task: CommentTask): CommentTask {
  return { ...task, userStatus: 'addressed' };
}

/** Korisnik potvrdjuje vezu s formalnim nalazima (prijedlog iz sucelja mora proci kroz ovu potvrdu). */
export function confirmLinks(task: CommentTask, findingIds: string[]): CommentTask {
  return { ...task, linkedFindingIds: [...new Set(findingIds)].sort() };
}

/**
 * Strojna potvrda ISKLJUCIVO iz povezanih formalnih provjera koje stvarno prolaze. Bez veze, ili s bilo kojom
 * povezanom provjerom koja ne prolazi, ostaje `not-verified`. Sadrzajni komentar (bez veze) time nikad ne
 * moze dobiti strojnu potvrdu, ma kako bio oznacen.
 */
export function verifyAgainstChecks(task: CommentTask, checks: FormalCheckState[]): CommentTask {
  if (!task.linkedFindingIds.length) return { ...task, verification: 'not-verified' };
  const byId = new Map(checks.map((c) => [c.id, c.status]));
  const allPass = task.linkedFindingIds.every((id) => byId.get(id) === 'pass');
  return { ...task, verification: allPass ? 'formal-check-passed' : 'not-verified' };
}
