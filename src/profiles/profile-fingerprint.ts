/**
 * OTISAK PRAVILA PROFILA, izdvojen iz `src/ui/app.ts` 2026-09-10 (korak A2).
 *
 * ZASTO IZDVOJEN: otisak treba OBJE strane usporedbe. Danas ga proizvodi analiza i sprema u
 * `result.details.profileFingerprint`, a `ruleChangeNotice` ga cita da bi rekla je li se profil
 * promijenio od kad je nalaz nastao. Kad se rad pocne pamtiti preko osvjezavanja stranice, ista
 * usporedba treba i pri obnovi, iz modula koji ne vuce cijeli UI. Drugi otisak u repozitoriju
 * znacio bi dvije definicije "isti profil", pa se seli postojeci umjesto pisanja novog.
 *
 * SELIDBA JE DOSLOVNA. Ni jedan bajt izlaza se ne smije promijeniti: otisci vec zive u spremljenoj
 * povijesti (`lekta.history.v2`) i u receptima popravka (`profileFingerprint` putuje do fixera),
 * pa bi tiha promjena razvrgnula usporedbu sa svime sto je zapisano prije danas.
 *
 * RED KLJUCEVA JE UGOVOR, ne stil. `JSON.stringify` serijalizira redom umetanja, pa bi preslagivanje
 * polja u `compact` promijenilo hash bez ijedne promjene znacenja.
 */
import { APP_VERSION } from '../config/app-version';

/**
 * FNV-1a, 32-bitni, ispisan kao osam heksadekadskih znamenki.
 *
 * `Math.imul` je namjeran: obicno mnozenje bi na velikim vrijednostima preslo u dvostruku
 * preciznost i prestalo biti FNV. Provjereno unakrsno, neovisnom izvedbom u Pythonu, da rezultat
 * nije samo interno dosljedan nego i tocan FNV-1a.
 */
export function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Otisak BODOVANIH pravila profila, ne cijelog profila.
 *
 * U `compact` ulazi samo ono sto mijenja ishod provjere (dimenzije oblikovanja, opseg, obvezni
 * dijelovi, pravila naslova, autoritet i izvori). Namjerno NE ulaze prikazna polja (naziv, oznake),
 * jer promjena natpisa nije promjena pravila i ne smije obezvrijediti spremljen nalaz.
 */
export function profileFingerprint(profile: any): string {
  const compact = {
    version: APP_VERSION,
    definition: profile.definitionId || null,
    department: profile.department?.id || null,
    workType: profile.selection?.workType,
    citation: profile.citation,
    authority: profile.ruleAuthority,
    rules: {
      font: profile.font,
      size: profile.size,
      spacing: profile.spacing,
      margins: profile.margins,
      wordMin: profile.wordMin,
      wordMax: profile.wordMax,
      charMin: profile.charMin,
      charMax: profile.charMax,
      minReferences: profile.minReferences,
      requiredSections: profile.requiredSections?.map((x: any) => x.key),
      headingRules: profile.headingRules,
    },
    sources: (profile.sources || []).map((x: any) => x.url),
  };
  return `LK-${APP_VERSION}-${hashString(JSON.stringify(compact))}`;
}
