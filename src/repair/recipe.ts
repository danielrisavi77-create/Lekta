/**
 * PISANI RECEPT POPRAVKA: sto se popravlja, kojim fixerom, na koju vrijednost i iz kojeg izvora,
 * profil po profil. Izvor za docs/REPAIR_RECIPE.md.
 *
 * ZASTO: popravak nema prompt ni model - to je deterministicki XML patch, a "recept" je niz
 * {fixerId, ruleId, params} koji klijent slozi iz profila fakulteta. Taj recept dosad nije postojao
 * nigdje u citljivom obliku: da se odgovori "sto tocno popravljamo za FPZG diplomski i odakle nam ta
 * vrijednost", trebalo je citati kod i tri JSON-a.
 *
 * KLJUCNO: recept se NE PISE RUCNO nego IZVODI iz istih funkcija koje se stvarno izvrsavaju
 * (src/ui/repair-items.ts) i iz istog izvora pravila koji cita zivi app (repairEntriesFor iz pecene
 * repair-map.json). Rucno pisan dokument zastario bi prvim uredjivanjem profila; ovaj ne moze
 * odlutati od koda, a tests/repair-recipe.test.ts pada ako netko dira profile bez regeneriranja.
 *
 * NIJE u javnom bundleu (app.ts ga ne uvozi): povlaci drafts-runtime (~1,3 MB eager glob), isto kao
 * verification-console. Pokrece ga scripts/generate-repair-recipe.mts (npm run repair-recipe) i test.
 */
import { resolveProfile } from '../analysis/golden-entry';
import { FIXER_IDS } from './apply-fixers';
import { VERIFIED_PROFILE_REGISTRY } from '../profiles/profile-registry';
import { repairEntriesFor } from '../profiles/profile-runtime-maps';
import { draftRuleEntriesFor } from '../profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../verification/verification-registry';
import {
  buildRepairableItems,
  paragraphSpacingRepairableItem,
  footnoteSpacingRepairableItem,
  pageNumberAlignmentRepairableItem,
  headingFormatRepairableItem,
  headingCaseRepairableItem,
  footnoteTypographyRepairableItem,
} from '../ui/repair-items';
import type { SourceEntry } from '../profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];

export interface RecipeItem {
  ruleId: string;
  fixerId: string;
  label: string;
  /**
   * 'profil'  = vrijednost dolazi iz sluzbene upute fakulteta (ruleEntry ili profilna zastavica),
   * 'opce'    = univerzalna higijena koja vrijedi svugdje i ne ovisi ni o jednom fakultetu.
   * Bez ove razlike izgleda kao da svaki profil ima popravak, a "prazni odlomci" ima svaki.
   */
  scope: 'profil' | 'opce';
  /** Preporuceno (advisory), nije obavezno: vrijednost dolazi iz ruleEntry.value (paramsFromValue),
   *  ne iz profil.rules kao za obavezne stavke - vidi tests/repair-recipe.test.ts. */
  recommended?: boolean;
  /** Ciljana vrijednost, citljivo ("Times New Roman", "3 / 2,5 / 3 / 2,5 cm", "1,5"). */
  target: string;
  /** Sirovi params koje klijent salje serveru (dokazni trag uz citljivi target). */
  params: Record<string, unknown>;
  /** Uvjet pod kojim se stavka uopce ponudi, kad nije bezuvjetna. */
  condition?: string;
  source?: { id: string; title: string; url: string } | null;
  sourcePage?: string | null;
  authority?: string | null;
  lastVerified?: string | null;
}

export interface RecipeProfile {
  id: string;
  label: string;
  unitId: string;
  status: string;
  workTypes: string[];
  items: RecipeItem[];
}

/** Stavke koje ovise o SADRZAJU dokumenta, pa se u receptu opisuju uvjetom, ne vrijednoscu. */
const DOCUMENT_CONDITIONAL: Array<{
  gate: (p: any) => boolean;
  item: (p: any) => Omit<RecipeItem, 'source' | 'sourcePage' | 'authority' | 'lastVerified'>;
}> = [
  {
    gate: () => true,
    item: () => ({
      ruleId: 'cross-file-submission-consistency-assisted',
      fixerId: 'submission-metadata-fixer',
      label: 'Usklađivanje predajnog paketa',
      scope: 'opce',
      target: 'potvrđene DOCX metapodatke između Worda, PDF-a i obrasca',
      params: { version: 1, fields: [] },
      condition: 'Lokalno uspoređuje potvrđene podatke predajnog paketa. Originalne datoteke i PDF tekst ostaju nepromijenjeni.',
    }),
  },
  {
    gate: (p) => p?.checkPageNumberStartAtIntro === true,
    item: (p) => ({
      ruleId: 'page-numbering-universal / section-insert-intro',
      fixerId: 'page-numbering-fixer / section-insert-fixer',
      label: 'Numeriranje stranica od Uvoda',
      scope: 'profil',
      target: `prednji listovi rimski, glavni tekst arapski od 1, broj ${String(p?.pageNumberAlignment || 'right')}`,
      params: {},
      condition: 'Uvod je prepoznat. Kad prijelom sekcije vec pada tocno na Uvod, postavlja se numeriranje nad postojecim sekcijama; kad prijeloma nema (jednosekcijski rad), umece se prijelom, uz izricitu potvrdu mjesta.',
    }),
  },
  {
    gate: (p) => p?.requireToc === true,
    item: () => ({
      ruleId: 'toc-field-universal',
      fixerId: 'toc-field-fixer',
      label: 'Sadrzaj kao zivo TOC polje',
      scope: 'profil',
      target: 'Word sam azurira sadrzaj',
      params: {},
      condition: 'Dokument ima naslov Sadrzaj, a jos nema zivo TOC polje. Nedestruktivno: rucne stavke se ne brisu.',
    }),
  },
  {
    gate: () => true,
    item: () => ({
      ruleId: 'empty-paragraphs-universal',
      fixerId: 'empty-paragraph-fixer',
      label: 'Prazni odlomci',
      scope: 'opce',
      target: 'uklanjanje viska praznih odlomaka',
      params: {},
      condition: 'Univerzalna higijena, ne ovisi o profilu; nudi se kad analiza nadje mnogo praznih odlomaka.',
    }),
  },
];

/** Citljiv opis ciljne vrijednosti iz sirovih params (bez izmisljanja: sve dolazi iz profila). */
function describeTarget(fixerId: string, params: Record<string, unknown>): string {
  const num = (v: unknown) => String(v).replace('.', ',');
  if (fixerId === 'margins-fixer') {
    const m = params as Record<string, unknown>;
    const parts = ['top', 'right', 'bottom', 'left'].map((k) => (m[k] == null ? '?' : num(m[k])));
    return `${parts.join(' / ')} cm (gore/desno/dolje/lijevo)`;
  }
  if (fixerId === 'paper-size-fixer') return `${num(params.w)} x ${num(params.h)} cm`;
  if (fixerId === 'line-spacing-fixer') return `prored ${num(params.multiplier)}`;
  if (fixerId === 'alignment-fixer') return params.val === 'both' ? 'obostrano' : 'lijevo';
  if (fixerId === 'page-number-alignment-fixer') return `broj stranice ${String(params.align)}`;
  if (fixerId === 'heading-case-fixer') return `velika slova, razine ${(params.levels as number[] || []).join(', ')}`;
  if (fixerId === 'heading-format-fixer') {
    const t = (params.targets as Array<Record<string, unknown>>) || [];
    return t.map((x) => {
      const bits = [`razina ${x.level}`];
      if (x.sizeHalfPoints != null) bits.push(`${num(Number(x.sizeHalfPoints) / 2)} pt`);
      if (x.bold) bits.push('podebljano');
      if (x.italic) bits.push('kurziv');
      if (x.alignLeft) bits.push('lijevo');
      return bits.join(' ');
    }).join('; ');
  }
  const bits: string[] = [];
  if (params.fontName) bits.push(String(params.fontName));
  if (params.fontSizePt != null) bits.push(`${num(params.fontSizePt)} pt`);
  if (bits.length) return bits.join(', ');
  return Object.keys(params).length ? JSON.stringify(params) : 'bez parametara';
}

function provenanceFor(profileId: string, ruleId: string) {
  const entry = draftRuleEntriesFor(profileId).find((e) => e.ruleId === ruleId);
  if (!entry) return {};
  const src = entry.sourceId ? SOURCES.find((s) => s.id === entry.sourceId) : undefined;
  return {
    source: src ? { id: src.id, title: src.title, url: src.url } : null,
    sourcePage: entry.sourcePage ?? null,
    authority: entry.authority ?? null,
    lastVerified: entry.lastVerified ?? null,
  };
}

export function buildRecipe(): RecipeProfile[] {
  const out: RecipeProfile[] = [];
  for (const entry of [...VERIFIED_PROFILE_REGISTRY].sort((a, b) => a.id.localeCompare(b.id))) {
    let profile: any;
    try { profile = resolveProfile(entry.id); } catch { continue; }

    // Recept opisuje "uskladi sve", pa se stavke racunaju BEZ konkretnog dokumenta: prazan popis
    // checkova + includeNonViolated. Zovu se ISTE funkcije koje se izvrse u pregledniku, pa recept
    // ne moze tvrditi nesto sto se u praksi ne dogadja.
    const noChecks: any[] = [];
    const items = [
      ...buildRepairableItems(noChecks, profile, repairEntriesFor(entry.id), { includeNonViolated: true }),
      ...paragraphSpacingRepairableItem(noChecks, profile),
      ...footnoteSpacingRepairableItem(noChecks, profile),
      ...pageNumberAlignmentRepairableItem(noChecks, profile),
      ...headingFormatRepairableItem(noChecks, profile),
      ...footnoteTypographyRepairableItem(noChecks, profile),
      ...headingCaseRepairableItem(noChecks, profile),
    ].map((it: any): RecipeItem => ({
      ruleId: it.ruleId,
      fixerId: it.fixerId,
      label: it.label,
      scope: 'profil',
      target: describeTarget(it.fixerId, it.params || {}),
      params: it.params || {},
      ...(it.recommended ? { recommended: true } : {}),
      ...(it.requiresConfirmation ? { condition: 'Trazi izricitu privolu (mijenja autorov tekst ili strukturu).' } : {}),
      ...provenanceFor(entry.id, it.ruleId),
    }));

    for (const c of DOCUMENT_CONDITIONAL) {
      if (c.gate(profile)) items.push({ ...c.item(profile), ...provenanceFor(entry.id, c.item(profile).ruleId) });
    }

    out.push({
      id: entry.id,
      label: (entry as any).profileLabel || entry.id,
      unitId: (entry as any).unitId || '',
      status: (entry as any).status || '',
      workTypes: (entry as any).workTypes || [],
      items,
    });
  }
  return out;
}

/** Profil ima STVARAN popravak po uputi fakulteta, ne samo univerzalnu higijenu. Brojka "svi profili
 *  imaju popravak" bila bi tocna a bezvrijedna: "prazni odlomci" dobiva svaki. */
export function hasProfileRules(p: RecipeProfile): boolean {
  return p.items.some((i) => i.scope === 'profil');
}

export function renderRecipeMarkdown(recipe: RecipeProfile[]): string {
  const totalItems = recipe.reduce((n, p) => n + p.items.length, 0);
  const withItems = recipe.filter(hasProfileRules);
  const universalOnly = recipe.filter((p) => !hasProfileRules(p));
  const lines: string[] = [];

  lines.push('# Recept popravka po profilu');
  lines.push('');
  lines.push('> GENERIRANO. Ne uredjuj rucno: `npm run repair-recipe` (izvor su profili i');
  lines.push('> `src/ui/repair-items.ts`). Drift hvata `tests/repair-recipe.test.ts`.');
  lines.push('');
  lines.push('## Kako popravak radi');
  lines.push('');
  lines.push('U popravku NEMA jezicnog modela ni prompta. Popravak je deterministicki XML patch nad');
  // Broj se IZRACUNAVA iz FIXER_IDS. Prije je bio hardkodiran ('16') i zaostao je za motorom,
  // pa je javno objavljeni docs/REPAIR_RECIPE.md godinama tvrdio krivi broj.
  lines.push(`OOXML-om: ${FIXER_IDS.length} fixera (\`src/repair/fixers.ts\`) mijenja \`word/document.xml\`, \`styles.xml\`,`);
  lines.push('`footnotes.xml` i podnozja, a svi ostali dijelovi dokumenta (slike, tema, veze) prolaze');
  lines.push('bajt-identicno (`src/repair/apply-fixers.ts`).');
  lines.push('');
  lines.push('Ulogu "prompta" ima recept: niz `{fixerId, ruleId, params}` koji klijent slozi iz');
  lines.push('PROFILA prije slanja. Server pravila ne izvodi - provjeri je li fixer poznat i ziv,');
  lines.push('sanira parametre i izvrsi. Zato je recept po fakultetu izrazen kao PODACI, ne kao tekst:');
  lines.push('jedna masina, `${recipe.length}` skupova vrijednosti.'.replace('${recipe.length}', String(recipe.length)));
  lines.push('');
  lines.push('Vrijednosti dolaze iz onoga sto zivi engine stvarno cita (`rules` profila; ciljane');
  lines.push('vrijednosti racuna `paramsForCheck` u `src/ui/repair-items.ts`), a provenijencija');
  lines.push('(izvor, stranica, autoritet, datum) iz `ruleEntries`. Prazna provenijencija znaci da');
  lines.push('pravilo nije vezano uz potvrdjen izvor - ne nagadja se.');
  lines.push('');
  lines.push('## Opseg');
  lines.push('');
  lines.push(`- profila: **${recipe.length}**`);
  lines.push(`- s popravkom po UPUTI FAKULTETA: **${withItems.length}**`);
  lines.push(`- samo univerzalna higijena (prazni odlomci), bez potvrdjenih tehnickih pravila: **${universalOnly.length}**`);
  lines.push(`- ukupno stavki recepta: **${totalItems}**`);
  lines.push('');
  lines.push('Sto se NE popravlja automatski: sadrzaj, argument, citati i literatura (osim provjere');
  lines.push('postojanja izvora), numeriranje naslova i svaka odluka koja je autorska.');
  lines.push('');

  const byUnit = new Map<string, RecipeProfile[]>();
  for (const p of withItems) {
    const key = p.unitId || '(bez ustanove)';
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key)!.push(p);
  }

  lines.push('## Profili');
  lines.push('');
  for (const unit of [...byUnit.keys()].sort()) {
    lines.push(`### ${unit}`);
    lines.push('');
    for (const p of byUnit.get(unit)!) {
      lines.push(`#### ${p.label}`);
      lines.push('');
      lines.push(`\`${p.id}\` · status: ${p.status} · vrste rada: ${p.workTypes.join(', ') || '-'}`);
      lines.push('');
      lines.push('| Pravilo | Fixer | Ciljana vrijednost | Izvor | Str. |');
      lines.push('|---|---|---|---|---|');
      for (const it of p.items) {
        const src = it.source ? `[${it.source.title}](${it.source.url})` : '';
        const target = it.condition ? `${it.target}<br><sub>${it.condition}</sub>` : it.target;
        lines.push(`| ${it.label} | \`${it.fixerId}\` | ${target} | ${src} | ${it.sourcePage ?? ''} |`);
      }
      lines.push('');
    }
  }

  if (universalOnly.length) {
    lines.push('## Profili bez tehnickih pravila za popravak');
    lines.push('');
    lines.push('Ovi profili nemaju nijedno pravilo koje je istodobno `autoFixable`, `verified` i ima');
    lines.push('ciljanu vrijednost u profilu, pa dobivaju samo univerzalnu higijenu. To NIJE kvar:');
    lines.push('bez potvrdjene vrijednosti iz sluzbenog izvora popravak se ne nudi, jer bismo inace');
    lines.push('nametali vrijednost koju fakultet nije propisao.');
    lines.push('');
    for (const p of universalOnly) lines.push(`- \`${p.id}\` (${p.label})`);
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

