/**
 * Simulira "korisnik je potvrdio sve" nad obrascem asistiranog popravka.
 *
 * Zasto to treba: vecina asistiranih fixera (consistency, citation-bibliography-sync,
 * required-section, table-figure-rescue, legal-footnote, croatian-typography, field-integrity...)
 * namjerno dolazi s NEOZNACENIM stavkama. Sucelje trazi izricitu potvrdu po stavci prije nego
 * dira dokument, sto je ispravno ponasanje proizvoda. Posljedica za testove je da golden matrica,
 * koja koristi zadani oblik, za te fixere biljezi applied=false i nikad ne izvrti njihovu stvarnu
 * granu, pa bi regresija u toj grani prosla nezapazeno.
 *
 * Closed-loop testovi to vec rade, ali rucno i po fixeru (vidi tests/repair-closed-loop-*.test.ts).
 * Ovdje je isti postupak izveden genericki, jer su svi obrasci istog oblika: nizovi objekata s
 * poljem `selected` i funkcija `buildParams(form)`.
 *
 * SAMO ZA TESTOVE. Ne mijenja ni jednu granu proizvodnog koda i ne koristi se u zivom panelu.
 */
import type { RepairableItem } from '../../src/ui/repair-panel';

/** Kljucevi koji na obrascu znace "korisnik je ovo izricito odobrio". */
const CONSENT_KEYS = new Set(['selected', 'zoneConsent', 'confirmed']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Duboko oznaci sve sto se da oznaciti. Vraca NOVE objekte, pa izvorni oblik (i sam rezultat
 * analize iz kojeg je izveden) ostaje netaknut.
 */
function confirmDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(confirmDeep);
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = typeof item === 'function' ? item : confirmDeep(item);
  }
  for (const key of CONSENT_KEYS) {
    if (typeof out[key] === 'boolean') out[key] = true;
  }
  // Gdje sucelje trazi IZBOR, a ne samo potvrdu, uzmi prvu ponudjenu mogucnost.
  if (out.selectedCandidate === undefined && Array.isArray(out.candidates) && out.candidates.length) {
    const first = out.candidates[0];
    if (typeof first === 'string') out.selectedCandidate = first;
  }
  if (out.selectedCanonical === undefined && Array.isArray(out.variants) && out.variants.length) {
    // Ista pretpostavka kao u closed-loop testovima: druga varijanta je ona koju korisnik bira
    // kad prva nije kanonska; ako postoji samo jedna, uzmi nju.
    const variants = out.variants as Array<{ text?: unknown }>;
    const chosen = variants[1]?.text ?? variants[0]?.text;
    if (typeof chosen === 'string') out.selectedCanonical = chosen;
  }
  return out;
}

/** Ime svojstva obrasca na stavci popravka (npr. "consistencyForm"), ako postoji. */
function formKeyOf(item: RepairableItem): string | null {
  for (const key of Object.keys(item)) {
    if (!key.endsWith('Form')) continue;
    const candidate = (item as unknown as Record<string, unknown>)[key];
    if (isPlainObject(candidate) && typeof candidate.buildParams === 'function') return key;
  }
  return null;
}

/**
 * Vrati params kakve bi fixer dobio da je korisnik potvrdio sve ponudjeno.
 *
 * Vraca `null` kad potvrdu ne moze izvesti pouzdano; pozivatelj tada ostaje na zadanim params.
 * Namjerno konzervativno: bolje je da golden zabiljezi zadani oblik nego da izmisli potvrdu
 * koju sucelje nikad ne bi proizvelo.
 */
export function confirmedParamsFor(item: RepairableItem): Record<string, unknown> | null {
  const key = formKeyOf(item);
  if (!key) return null;
  const form = (item as unknown as Record<string, unknown>)[key] as Record<string, unknown>;
  const buildParams = form.buildParams as (input: unknown) => Record<string, unknown>;

  // titlePageForm je jedini obrazac ciji buildParams ne prima formu nego mapu vrijednosti polja
  // (kljuc -> vrijednost), pa ga treba pozvati po njegovim pravilima.
  if (key === 'titlePageForm') {
    const fields = Array.isArray(form.fields) ? (form.fields as Array<Record<string, unknown>>) : [];
    if (!fields.length) return null;
    const values = Object.fromEntries(fields.map((field) => [String(field.key), String(field.value ?? '')]));
    try {
      return buildParams(values);
    } catch {
      return null;
    }
  }

  try {
    const confirmed = confirmDeep(form) as Record<string, unknown>;
    const params = buildParams(confirmed);
    return isPlainObject(params) ? params : null;
  } catch {
    return null;
  }
}
