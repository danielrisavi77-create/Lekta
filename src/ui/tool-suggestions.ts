/**
 * Utkivanje alata u tok ispravaka: za pojedini problem iz analize predlaze konkretan
 * Lekta alat koji ga rjesava (naslovnica, citat, literatura, kartice, izjava).
 *
 * Cista, framework-agnosticna logika bez DOM-a (testabilno). app.ts (renderActionPlan)
 * poziva suggestTool i, ako postoji pogodak, prikaze CTA prema alatu. Konzervativno:
 * kad nista ne odgovara vraca null (nema laznih ponuda).
 */

export interface ToolSuggestion {
  /** Relativna putanja alata (postojeca stranica u root-u). */
  href: string;
  /** Poziv na akciju na hrvatskom. */
  label: string;
}

export interface IssueLike {
  title?: string;
  detail?: string;
  category?: string;
}

/**
 * Mapiraj problem na alat. Redoslijed je namjeran: specificni obrasci (naslovnica,
 * izjava, literatura, opseg) prije opceg citatnog, jer literatura i navodi oboje
 * mogu nositi kategoriju "citations".
 */
export function suggestTool(issue: IssueLike): ToolSuggestion | null {
  const text = `${issue.title ?? ''} ${issue.detail ?? ''}`.toLowerCase();
  const cat = issue.category ?? '';

  if (/naslovnic|naslovna stranica/.test(text)) {
    return { href: 'naslovnica.html', label: 'Složi naslovnicu' };
  }
  if (/izjav|izvornost|plagijat/.test(text)) {
    return { href: 'izjava.html', label: 'Izradi izjavu o izvornosti' };
  }
  if (/literatur|bibliografij|popis izvora|popis literature/.test(text)) {
    return { href: 'literatura.html', label: 'Sredi literaturu' };
  }
  if (/opseg|broj rije|kartic|premalo rije|previse rije|duljina teksta/.test(text)) {
    return { href: 'kartice.html', label: 'Prebroji kartice' };
  }
  if (cat === 'citations' || /citat|navod|referenc|fusnot/.test(text)) {
    return { href: 'citat.html', label: 'Otvori citat generator' };
  }
  return null;
}
