// Dijeljeni fakultetski kontekst kroz besplatne alate (katalos: fakultet/studij/vrsta rada).
// Odvojeno od draft-share.ts (sessionStorage, OSOBNI prikazni stringovi: ime/naslov/mjesto)
// jer ovo nosi KATALOSKI identitet (unitId je isti prostor kao ?unit= u app.ts, #tp-unit u
// naslovnica-page.ts i TitlePageTemplate.unitId) i namjerno prezivljava zatvaranje taba
// (semestar traje mjesecima), pa je localStorage, ne sessionStorage.
import type { WorkType } from '../profiles/profile-schema';

export interface ToolFacultyContext {
  unitId?: string;
  program?: string;
  level?: WorkType;
}

const KEY = 'lekta.faculty-context';
// Pred-migracijski kljuc (citat-page.ts do B2): bare unitId string, ne JSON objekt.
const LEGACY_FACULTY_KEY = 'lekta.citat-faculty';

function sanitize(raw: any): ToolFacultyContext {
  if (!raw || typeof raw !== 'object') return {};
  const out: ToolFacultyContext = {};
  if (typeof raw.unitId === 'string' && raw.unitId) out.unitId = raw.unitId;
  if (typeof raw.program === 'string' && raw.program) out.program = raw.program;
  if (typeof raw.level === 'string' && raw.level) out.level = raw.level as WorkType;
  return out;
}

/** Cita kontekst; na prvi susret sa starim `lekta.citat-faculty` ga jednom migrira. */
export function readFacultyContext(): ToolFacultyContext {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return sanitize(parsed);
    }
  } catch {
    /* smece pod novim kljucem: padamo na migraciju ispod */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_FACULTY_KEY);
    if (legacy) {
      const migrated: ToolFacultyContext = { unitId: legacy };
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
        // Stari kljuc se brise SAMO ako je upis pod novim uspio - inace bi korisnik trajno
        // izgubio zapamceni fakultet kad setItem baci (kvota/privatni nacin).
        localStorage.removeItem(LEGACY_FACULTY_KEY);
      } catch {
        /* upis pod novim kljucem nije uspio: probaj migraciju opet drugi put */
      }
      return migrated;
    }
  } catch {
    /* bez storage-a: prazan kontekst */
  }
  return {};
}

/**
 * Read-modify-write MERGE, ne overwrite: citat zna samo unitId, naslovnica zna sva tri polja,
 * pa pisanje jednog polja ne smije obrisati preostala vec spremljena za isti fakultet.
 * `saveFacultyContext({ unitId: '' })` je eksplicitni reset cijelog konteksta (isto ponasanje
 * kao dosadasnji `saveFacultyChoice('')` u citat-page.ts za "Bez fakulteta").
 */
export function saveFacultyContext(patch: Partial<ToolFacultyContext>): void {
  try {
    if (patch.unitId === '') {
      localStorage.removeItem(KEY);
      return;
    }
    const merged = sanitize({ ...readFacultyContext(), ...patch });
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* bez storage-a: izbor se ne pamti unutar ove posjete */
  }
}
