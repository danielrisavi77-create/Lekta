// Dijeljeni draft izmedju generatora naslovnice i izjave o izvornosti: oba alata traze
// gotovo ista polja (ime, naslov rada, vrsta rada, mjesto), pa student koji prijedje s
// jedne stranice na drugu ne mora sve ponovno tipkati.
//
// NAMJERNO sessionStorage, ne URL ni localStorage: osobni podaci (ime) ne smiju zavrsiti
// u adresnoj traci/povijesti preglednika ni prezivjeti zatvaranje taba. Citanje puni SAMO
// prazna polja (nikad ne gazi ono sto je korisnik vec upisao na toj stranici). Sve u
// try/catch: bez storage-a (privatni nacin i sl.) alati rade kao i prije, samo bez prijenosa.

export interface ToolDraft {
  author?: string;
  title?: string;
  /** VIDLJIVI label vrste rada ("Diplomski rad"), ne value kljuc: izjava koristi labele,
   *  naslovnica value kljuceve, pa je label jedini oblik koji obje strane znaju mapirati. */
  workTypeLabel?: string;
  place?: string;
  /** Godina (naslovnica) i tekstualni datum (izjava) NE dijele se: nisu isto polje. */
}

const KEY = 'lekta.tool-draft';

export function saveToolDraft(draft: ToolDraft): void {
  try {
    const clean: ToolDraft = {};
    for (const k of ['author', 'title', 'workTypeLabel', 'place'] as const) {
      const v = (draft[k] || '').trim();
      if (v) clean[k] = v;
    }
    if (Object.keys(clean).length) sessionStorage.setItem(KEY, JSON.stringify(clean));
    else sessionStorage.removeItem(KEY);
  } catch { /* bez storage-a: alat radi bez prijenosa */ }
}

export function readToolDraft(): ToolDraft {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: ToolDraft = {};
    for (const k of ['author', 'title', 'workTypeLabel', 'place'] as const) {
      if (typeof parsed[k] === 'string' && parsed[k].trim()) out[k] = parsed[k].trim();
    }
    return out;
  } catch {
    return {};
  }
}
