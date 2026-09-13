/**
 * Straza nad Edge funkcijama: multipart se smije citati SAMO kroz `readFormDataBounded`.
 *
 * `req.formData()` cita tijelo do kraja i tek onda vraca dijelove, pa svaka provjera velicine koja
 * dolazi poslije njega stize kad je memorija vec potrosena. Vanjski audit 2026-09-08 (nalaz 5)
 * nasao je tocno taj oblik u `repair-docx`, jedinoj funkciji s visemegabajtnim binarnim tijelom,
 * dok su cetiri druge funkcije vec koristile omedjeno citanje iz `_shared/read-body.ts`.
 *
 * Provjera je doslovna (bez gradnje regexa iz nizova), iz istog razloga kao i ostale straze u
 * `tests/helpers/`: escape kroz slaganje zna nestati i gard tada ne grize nista.
 */

/** `req.formData()` ili `request.formData()` pozvan izravno, bez omedjenog omotaca. */
const NEOMEDJEN_FORMDATA = /\b(?:req|request)\s*\.\s*formData\s*\(\s*\)/;

/** True kad izvor Edge funkcije cita multipart neomedjeno. */
export function hasUnboundedFormData(source: string): boolean {
  return NEOMEDJEN_FORMDATA.test(source);
}
