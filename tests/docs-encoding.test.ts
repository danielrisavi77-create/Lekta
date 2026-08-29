/**
 * Gard protiv mojibakea u dokumentaciji (T17).
 *
 * DIJAGNOZA (izmjerena, ne pretpostavljena): `docs/VISION.md`, `docs/UX_PRINCIPLES.md` i
 * `docs/MONETIZATION_AND_ANTI_ABUSE.md` nastali su iz teksta koji je UTF-8 procitan kao Latin-1,
 * nakon cega su C1 bajtovi (0x80..0x9F) OBRISANI. To nije obicno dvostruko kodiranje nego kvar
 * S GUBITKOM: drugi bajt para nestao je za sva slova ciji nastavak pada u taj raspon, dakle za
 * c, c s kvackom, d s crtom i njihove verzale. Sest razlicitih slova ostavlja isti ostatak "Ä",
 * pa se obnova NE moze izvesti cistom transformacijom.
 *
 * Isti nalaz stoji zapisan u BOOTSTRAP.md od bootstrapa ("hrvatski c/c/d su djelomicno
 * izgubljeni"), ali datoteke nisu bile popravljene. Obnovljene su 2026-08-29 tako da je svaka
 * pojava razrijesena dokazom iz projektova vlastitog teksta (ista rijec drugdje u repou), a
 * ostatak izricitom tablicom uz citanje konteksta.
 *
 * Ovaj test cuva da se to ne vrati. Isjecci koda se preskacu NAMJERNO: BOOTSTRAP.md mojibake
 * navodi kao PRIMJER u backticks, i to je legitiman tekst.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Par: vodeci bajt UTF-8 sekvence procitan kao Latin-1, pa jos jedan takav znak ("Å¾", "Â·"). */
const MOJIBAKE_PAIR = /[\u00C0-\u00C5\u00D0\u00DF][\u0080-\u00BF]/g;
/** Sirotan: vodeci bajt kojem je nastavak obrisan, pa neposredno slijedi slovo ("OtkljuÄaj"). */
const MOJIBAKE_ORPHAN = /[\u00C2-\u00C5](?=[A-Za-z])/g;
/** Zamjenski znak: ulaz koji vise nije valjan UTF-8. */
const REPLACEMENT = /\uFFFD/g;

/** Isjecci koda nose primjere kvara i legitimni su; proza ih ne smije sadrzavati. */
function withoutCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function markdownFiles(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name.endsWith('.md') && statSync(join(root, name)).isFile()) out.push(join(root, name));
  }
  const walk = (dir: string, depth = 0): void => {
    if (depth > 4) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (name.endsWith('.md')) out.push(p);
    }
  };
  walk(join(root, 'docs'));
  return out;
}

function damage(text: string): { pairs: number; orphans: number; replacements: number } {
  const prose = withoutCode(text);
  return {
    pairs: (prose.match(MOJIBAKE_PAIR) || []).length,
    orphans: (prose.match(MOJIBAKE_ORPHAN) || []).length,
    replacements: (prose.match(REPLACEMENT) || []).length,
  };
}

describe('dokumentacija je valjan UTF-8 bez mojibakea', () => {
  const files = markdownFiles();

  it('pregledava netrivijalan broj dokumenata', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('nijedan dokument ne nosi tragove pogresnog kodiranja', () => {
    const pogodeni = files
      .map((f) => ({ f: relative(root, f), d: damage(readFileSync(f, 'utf8')) }))
      .filter((x) => x.d.pairs || x.d.orphans || x.d.replacements)
      .map((x) => `${x.f}: par=${x.d.pairs} siroce=${x.d.orphans} zamjenskih=${x.d.replacements}`);
    expect(pogodeni).toEqual([]);
  });

  it('tri obnovljena dokumenta stvarno nose hrvatske dijakritike', () => {
    for (const f of ['docs/VISION.md', 'docs/UX_PRINCIPLES.md', 'docs/MONETIZATION_AND_ANTI_ABUSE.md']) {
      const t = readFileSync(join(root, f), 'utf8');
      const dijakritika = (t.match(/[čćđšžČĆĐŠŽ]/g) || []).length;
      expect(dijakritika, `${f} je ostao bez dijakritika, dakle obnova je izgubljena`).toBeGreaterThan(40);
    }
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmetnuta su sva tri oblika kvara, plus dokaz da
   * nemutiran ulaz prolazi cisto (inace bi "prolazio" i gard koji vristi na sve).
   */
  it('gard stvarno grize na svaki od tri oblika kvara', () => {
    const cist = 'Lekta ti točno kaže što popraviti. Vidi `OtkljuÄaj` kao primjer.';
    expect(damage(cist)).toEqual({ pairs: 0, orphans: 0, replacements: 0 });

    expect(damage('kaÅ¾e').pairs).toBe(1);
    expect(damage('OtkljuÄaj').orphans).toBe(1);
    expect(damage('Ruiz-L\uFFFDpez').replacements).toBe(1);
  });
});
