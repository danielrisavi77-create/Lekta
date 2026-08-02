/**
 * Cross-check: nalazi li se ono sto rad TVRDI (brojevi+jedinice, HRN EN norme, oznake projekta,
 * gole vece brojke - src/analysis/domains.ts `extractUniversalClaims`) u izvornoj gradji koju je
 * student uploadao uz rad. Port `cross_check.py` (vanjski "Katedra" skill), algoritam prenesen,
 * kod NIJE 1:1 prijepis.
 *
 * Detekcija je namjerno naivna (substring nakon normalizacije razmaka) - ovo je DOKUMENTIRAN izvor
 * laznih pozitivaca (npr. "40 t" unutar "iznos 40 tvrtke" preko granice recenice), ne bug za
 * "popraviti". Zato SVAKI pogodak nosi ±radius znakova konteksta iz SIROVOG (ne normaliziranog)
 * teksta izvora, da covjek vizualno provjeri je li podudaranje stvarno prije nego ga proglasi
 * potvrdjenim.
 */
import type { ExtractedClaim } from './domains';

export interface ClaimSourceMatch {
  fileName: string;
  found: boolean;
  context: string | null;
}

export interface ClaimCrossCheckResult {
  claim: ExtractedClaim;
  foundInAnySource: boolean;
  perSource: ClaimSourceMatch[];
}

export interface ClaimSourceDoc {
  fileName: string;
  rawText: string;
}

function normalizeWhitespace(s: string): string {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ClaimContextMatch {
  found: boolean;
  context: string | null;
}

/**
 * Nadji `claim` u SIROVOM (NEnormaliziranom) tekstu, dopustajuci proizvoljne razmake izmedju
 * pojedinih znakova (hvata claim razdvojen prijelomom retka/viseznakovnim razmakom), i vrati
 * okolni isjecak od `radius` znakova. Kontekst se gradi iz sirovog teksta upravo zato da lazni
 * pozitivac (substring preko granice recenice) bude vizualno vidljiv, ne samo tvrdnja imena
 * datoteke. Moze vratiti found:false cak i kad je normalizirana substring-provjera uspjela
 * (rijedak rub-slucaj kad `\s*`-spojeni regex ne uspije rekonstruirati poziciju) - poziv na
 * source-claim-check.ts da to prijavi POSTENO (found:true, context:null), ne da nalaz nestane.
 */
export function findContext(rawText: string, claim: string, radius = 40): ClaimContextMatch {
  const core = [...String(claim || '')].filter((ch) => !/\s/.test(ch));
  if (!core.length) return { found: false, context: null };
  const pattern = core.map(escapeRegExp).join('\\s*');
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return { found: false, context: null };
  }
  const m = re.exec(String(rawText || ''));
  if (!m) return { found: false, context: null };
  const start = Math.max(0, m.index - radius);
  const end = Math.min(rawText.length, m.index + m[0].length + radius);
  const snippet = rawText.slice(start, end).replace(/\s+/g, ' ').trim();
  return { found: true, context: snippet };
}

/** Provjeri svaku tvrdnju protiv svakog izvora (naivni substring nakon normalizacije razmaka). */
export function crossCheckClaims(claims: ExtractedClaim[], sourceDocs: ClaimSourceDoc[]): ClaimCrossCheckResult[] {
  return claims.map((claim) => {
    const normClaim = normalizeWhitespace(claim.raw);
    const perSource: ClaimSourceMatch[] = sourceDocs.map((doc) => {
      if (!normClaim || !normalizeWhitespace(doc.rawText).includes(normClaim)) {
        return { fileName: doc.fileName, found: false, context: null };
      }
      const ctx = findContext(doc.rawText, claim.raw);
      return { fileName: doc.fileName, found: true, context: ctx.context };
    });
    return { claim, foundInAnySource: perSource.some((s) => s.found), perSource };
  });
}
