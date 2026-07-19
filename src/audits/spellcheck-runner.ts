/**
 * Lijeni loader + pokretac hrvatske pravopisne provjere za preglednik. Uvozi PRAVI Hunspell u WASM-u
 * (hunspell-asm) i vendorani hrvatski rjecnik (src/audits/hr-dict, LGPL-2.1/SISSL) preko Vite `?url`
 * asseta, pa checking prepusta cistoj jezgri (spellcheck-hr.ts). Sve je lokalno: WASM i rjecnik su
 * isto-domenski staticki asseti (nista se ne salje na trecu stranu), a doslovni tekst rada nikad ne
 * napusta preglednik. Ucitava se TEK na opt-in klik (dinamicki import + fetch), pa glavni bundle
 * ostaje lagan, a analiza .docx ovo NIKAD ne zove.
 *
 * KLJUCNO (zasto pravi Hunspell, a ne nspell): hrvatski `.aff` koristi FLAG long + AF alias tablicu +
 * COMPOUND pravila; nspell to ne razrjesuje pa lazno oznacava flektirane oblike (znanost, istrazivanje,
 * automobili...). hunspell-asm implementira puni Hunspell affix pa je pokrivenost ispravna.
 */
import affUrl from './hr-dict/hr_HR.aff?url';
import dicUrl from './hr-dict/hr_HR.dic?url';
import { runSpellcheckHr, type SpellChecker, type SpellParagraph, type SpellResult, type SpellcheckOptions } from './spellcheck-hr';

// Jednom ucitan Hunspell + rjecnik ostaju u memoriji za ovu sesiju (ponovna provjera je trenutna).
let _checker: SpellChecker | null = null;
let _loading: Promise<SpellChecker> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ne mogu ucitati rjecnik (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

async function buildChecker(): Promise<SpellChecker> {
  const [{ loadModule }, aff, dic] = await Promise.all([
    import('hunspell-asm'),
    fetchBytes(affUrl),
    fetchBytes(dicUrl),
  ]);
  const factory = await loadModule();
  const affPath = factory.mountBuffer(aff, 'hr_HR.aff');
  const dicPath = factory.mountBuffer(dic, 'hr_HR.dic');
  const hunspell = factory.create(affPath, dicPath);
  return {
    correct: (w: string) => hunspell.spell(w),
    suggest: (w: string) => hunspell.suggest(w),
  };
}

/** Ucitaj (jednom) i vrati provjernik. Visestruki paralelni pozivi dijele isti loading promise. */
export function loadHrChecker(): Promise<SpellChecker> {
  if (_checker) return Promise.resolve(_checker);
  if (!_loading) {
    _loading = buildChecker().then(
      (c) => {
        _checker = c;
        return c;
      },
      (err) => {
        _loading = null; // dopusti ponovni pokusaj nakon greske (npr. mrezni pad asseta)
        throw err;
      },
    );
  }
  return _loading;
}

/** Lijeno ucitaj hrvatski Hunspell i pokreni pravopisnu provjeru nad odlomcima. */
export async function runHrSpellcheck(paragraphs: SpellParagraph[], opts?: SpellcheckOptions): Promise<SpellResult> {
  const checker = await loadHrChecker();
  return runSpellcheckHr(paragraphs, checker, opts);
}
