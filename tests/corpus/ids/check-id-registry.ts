/**
 * Registar stabilnih ID-jeva je PROMOVIRAN u produkciju: `src/scoring/check-id-registry.ts`.
 *
 * Dok je zivio samo ovdje, produkcija je identitet nalaza vodila po hrvatskom `check.title`
 * (UI stringu), pa su regresija popravka i mapiranje na fixer pucali na svaku preformulaciju
 * naslova. Ovaj modul ostaje kao re-export da postojeci korpus testovi rade nepromijenjeni.
 */
export {
  CHECK_ID_BY_TITLE,
  stableCheckId,
  isWellFormedCheckId,
  allCheckIds,
} from '../../../src/scoring/check-id-registry';
