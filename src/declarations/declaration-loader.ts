/**
 * Loader predlozaka izjave o izvornosti (data/declarations/declarations.json), uzor
 * src/title-pages/template-loader.ts. Tanak prolaz: import + tipiziranje + izbor po
 * (unitId, razina).
 *
 * Namjerna razlika od naslovnice: BEZ cross-level reuse-a. Naslovnica smije preuzeti
 * layout druge vrste rada istog fakulteta (najgore: badge napomena o preuzimanju), ali
 * kriva "sluzbena" formulacija izjave za doktorski umjesto diplomskog moze biti strukturno
 * pogresna - kriva sluzbena formulacija je gora od generickog teksta. resolveDeclaration
 * zato staje na tocnoj razini ili level=null zapisu, nikad ne preuzima drugu razinu.
 */
import rawDeclarations from '../../data/declarations/declarations.json';
import type { DeclarationTemplate, DeclarationProvenanceStatus } from './declaration-schema';

// Granica prema podacima: JSON inferira siroke tipove, jednom castamo na autorski oblik.
export const DECLARATION_TEMPLATES = rawDeclarations as unknown as DeclarationTemplate[];

/** Cista jezgra izbora (testabilna sa sintetickim nizom): tocna razina > level=null > null. */
export function resolveDeclaration(
  templates: DeclarationTemplate[],
  unitId: string,
  level: string,
): DeclarationTemplate | null {
  const candidates = templates.filter((t) => t.unitId === unitId);
  if (!candidates.length) return null;
  const exact = candidates.find((t) => t.level === level);
  if (exact) return exact;
  return candidates.find((t) => t.level === null) || null;
}

export interface DeclarationSelection {
  template: DeclarationTemplate | null;
  /** 'generic' kad zapisa nema (badge u UI-u). */
  provenance: DeclarationProvenanceStatus;
}

/** Izbor iz UI stanja; prazan/nepoznat unit ili nepostojeci zapis daje 'generic'. */
export function selectDeclaration(unitId: string | null | undefined, level: string): DeclarationSelection {
  const raw = unitId ? resolveDeclaration(DECLARATION_TEMPLATES, unitId, level) : null;
  return raw ? { template: raw, provenance: raw.provenance.status } : { template: null, provenance: 'generic' };
}
