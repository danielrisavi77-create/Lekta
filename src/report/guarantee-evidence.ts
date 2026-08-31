// Provjera garancijskog DOKAZA (audit P1-09).
//
// Do ovog modula je `evidencePath` bio proizvoljan string koji se provjeravao samo na truthiness
// (`hasEvidence: !!evidencePath`) i takav zapisivao u bazu. Posljedica su bile tri rupe:
//
//   1. Minimalna duljina opisa postojala je SAMO u pregledniku, pa je poziv mimo sucelja prolazio
//      s dokazom "x".
//   2. Stupac se zove `evidence_path`, ali je drzao slobodan opis, pa je svatko tko poslije cita
//      bazu razumno mogao pokusati otvoriti tu "putanju".
//   3. Ako bi netko rucno poslao putanju, nitko je nije provjeravao: `drugi-korisnik/rad.docx`
//      prosao bi jednako dobro kao vlastita. IDOR prema tudjem dokumentu, s administratorom kao
//      nesvjesnim posrednikom.
//
// Zato je vrsta dokaza sada IZRICITA, a ne stvar pogadjanja po obliku stringa. Pogadjanje po
// obliku ("ima li kosu crtu, onda je putanja") bilo bi novi kvar iste vrste: opis dokaza uredno
// smije sadrzavati kosu crtu.
//
// Ovdje su samo ODLUKE koje se daju donijeti bez mreze. Postojanje objekta, njegovu velicinu,
// MIME i otisak provjerava Edge funkcija, i to TEK nakon sto ovaj modul potvrdi da putanja uopce
// pripada pozivatelju: nikad ne diramo Storage na temelju nevalidirane putanje.

export type EvidenceKind = 'text' | 'storage';

export type EvidenceDecision =
  | { ok: true; kind: 'text'; text: string }
  | { ok: true; kind: 'storage'; path: string }
  | { ok: false; reason: EvidenceRejection };

export type EvidenceRejection =
  | 'missing_evidence'
  | 'evidence_too_short'
  | 'evidence_too_long'
  | 'evidence_kind_invalid'
  | 'evidence_path_not_owned'
  | 'evidence_path_invalid'
  | 'evidence_type_not_allowed';

/** Opis dokaza. Donja granica je ista koju sucelje vec obecava, samo je sada i posluzitelj drzi. */
export const EVIDENCE_TEXT_MIN = 20;
export const EVIDENCE_TEXT_MAX = 2000;

/** Ime datoteke unutar korisnikova prefiksa; dovoljno za uuid + nastavak, prekratko za zloupotrebu. */
export const EVIDENCE_NAME_MAX = 200;

/**
 * Dopusteni nastavci. Dokaz je povrat referade: snimka zaslona, skenirani dopis, PDF. NIKAD sam
 * rad, pa `.docx` namjerno NIJE na popisu. Bucket u 0097 drzi isti skup preko `allowed_mime_types`;
 * ovo je ista granica izrazena ranije, da se ne dira Storage bez potrebe.
 */
export const EVIDENCE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'] as const;

export interface EvidenceInput {
  kind?: string | null;
  /** Kod `kind === 'storage'` putanja objekta, inace slobodan opis. Ime polja je naslijedjeno. */
  evidencePath?: unknown;
  /** UUID pozivatelja iz JWT-a, NIKAD iz tijela zahtjeva. */
  userId: string;
}

/**
 * Odluci je li dokaz prihvatljiv i u kojem obliku.
 *
 * Nepoznata vrsta se ODBIJA, ne tumaci kao tekst: tiho svodjenje na blazi slucaj je nacin na koji
 * gateovi prestanu gristi. Vrsta koja nedostaje je i dalje 'text', jer je to zatecen ugovor
 * postojeceg sucelja i jedini oblik koji su stari klijenti slali.
 */
export function validateGuaranteeEvidence(input: EvidenceInput): EvidenceDecision {
  const kind = input.kind == null || input.kind === '' ? 'text' : String(input.kind);
  if (kind !== 'text' && kind !== 'storage') return { ok: false, reason: 'evidence_kind_invalid' };

  const rawValue = typeof input.evidencePath === 'string' ? input.evidencePath : '';
  if (!rawValue.trim()) return { ok: false, reason: 'missing_evidence' };

  if (kind === 'text') {
    const text = rawValue.trim();
    if (text.length < EVIDENCE_TEXT_MIN) return { ok: false, reason: 'evidence_too_short' };
    if (text.length > EVIDENCE_TEXT_MAX) return { ok: false, reason: 'evidence_too_long' };
    return { ok: true, kind: 'text', text };
  }

  return validateStoragePath(rawValue, input.userId);
}

function validateStoragePath(raw: string, userId: string): EvidenceDecision {
  // Bez normalizacije prije provjere: normalizacija koja "popravi" putanju lako pretvori tudji
  // prefiks u vlastiti. Sve sumnjivo se odbija, ne ispravlja.
  if (raw !== raw.trim()) return { ok: false, reason: 'evidence_path_invalid' };
  if (raw.startsWith('/') || raw.endsWith('/')) return { ok: false, reason: 'evidence_path_invalid' };
  if (raw.includes('\\')) return { ok: false, reason: 'evidence_path_invalid' };
  // Kontrolni znakovi i NUL: nikad legitimni u imenu objekta, redovito u pokusaju zaobilazenja.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, reason: 'evidence_path_invalid' };

  const segments = raw.split('/');
  if (segments.length !== 2) return { ok: false, reason: 'evidence_path_invalid' };
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return { ok: false, reason: 'evidence_path_invalid' };
  }

  const [owner, name] = segments;
  // VLASNISTVO. `userId` dolazi iz provjerenog JWT-a, nikad iz tijela zahtjeva. Usporedba je
  // doslovna: nikakvo case-insensitive ni "pocinje s" podudaranje, jer bi oboje otvorilo tudji
  // prefiks (`<uid>-nesto/` pocinje s `<uid>`).
  if (!userId || owner !== userId) return { ok: false, reason: 'evidence_path_not_owned' };

  if (name.length > EVIDENCE_NAME_MAX) return { ok: false, reason: 'evidence_path_invalid' };

  const lower = name.toLowerCase();
  if (!EVIDENCE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, reason: 'evidence_type_not_allowed' };
  }

  return { ok: true, kind: 'storage', path: raw };
}
