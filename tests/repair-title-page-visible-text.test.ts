import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { readZip } from '../src/repair/zip-codec';
import { anchorTextOfXml } from '../src/repair/anchor-text';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { ensureRepairMapHeavy, repairEntriesFor } from '../src/profiles/profile-runtime-maps';
import { ensureTemplatesHeavy, selectTemplate } from '../src/title-pages/template-loader';

/**
 * TEST VIDLJIVOG TEKSTA ZA `title-page-fixer`.
 *
 * Vodic dopusta mijenjanje vidljivog teksta TOCNO PET popravaka (`heading-case`,
 * `croatian-typography`, `bibliography-repair`, `link-doi`, `toc-field`, plus `required-section` za
 * natpis koji profil propisuje). `title-page-fixer` NIJE medju njima, i to nije previd: on tvrdi da
 * samo PRESLAGUJE postojecu naslovnicu po predlosku, dakle isti tekst u kanonskom rasporedu.
 *
 * Kad ta tvrdnja padne, ne pada kozmetika nego rad: fixer zamjenjuje raspon odlomaka i sve sto u
 * njemu nije prepoznato NESTANE iz dokumenta. Izmjereno 2026-09-13 na `--neuredan` primjerku, koji
 * iznad naslovnice ima rucno pisan sadrzaj: zajedno s njim odlazi i ono sto autor ne smije izgubiti.
 *
 * GARD MJERI SAMO OVAJ FIXER, ne zadani skup. Zadani skup nosi i `croatian-typography` i
 * `heading-case`, kojima je promjena teksta DOPUSTENA, pa bi mjerenje nad njim mijesalo dva razreda
 * i ne bi moglo optuziti nikoga.
 *
 * ANTI-VAKUUM: tvrdnja vrijedi samo ako fixer doista nesto radi. Zato se trazi barem jedan dokument
 * na kojem je stavka izgradjena I changelog neprazan; bez toga gard pada s porukom da mjeri prazno.
 */

const FIXTURES = join(__dirname, 'fixtures', 'docx-authored');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Spojeni tekst svakog odlomka, ISTIM izvlakacem koji koriste sidra (tab/br -> razmak). */
async function odlomci(bytes: Uint8Array): Promise<string[]> {
  const entries = await readZip(bytes);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('paket nema word/document.xml');
  const xml = new TextDecoder().decode(doc.data);
  const opens = [...xml.matchAll(/<w:p\b[^>]*>/g)];
  return opens
    .map((open, i) => {
      const start = (open.index ?? 0) + open[0].length;
      const end = i + 1 < opens.length ? (opens[i + 1].index ?? xml.length) : xml.length;
      return anchorTextOfXml(xml.slice(start, end)).trim();
    })
    .filter(Boolean);
}

/** `<jedinica>--<vrsta>--<razina>--<inacica>.docx` -> profil iz sidecara. */
function profilZa(naziv: string): string | null {
  try {
    const side = JSON.parse(readFileSync(join(FIXTURES, naziv.replace(/\.docx$/, '.json')), 'utf8'));
    return side?.profileId ?? side?.row?.profileId ?? null;
  } catch {
    return null;
  }
}

describe('title-page-fixer ne smije brisati vidljivi tekst', () => {
  it('nijedan odlomak koji je autor napisao ne nestaje kad se primijeni SAMO taj popravak', async () => {
    await ensureTemplatesHeavy();
    // Bez ovoga `repairEntriesFor` NAMJERNO baca: tiho prazna mapa ugasi sedam fixera bez poruke.
    await ensureRepairMapHeavy();
    const datoteke = readdirSync(FIXTURES).filter((f) => f.toLowerCase().endsWith('.docx')).sort();
    expect(datoteke.length, 'nema fixtura; gard bi prosao ni nad cim').toBeGreaterThan(10);

    const nestalo: string[] = [];
    let primijenjen = 0;
    let ponudjen = 0;

    for (const naziv of datoteke) {
      const profileId = profilZa(naziv);
      if (!profileId) continue;
      const bytes = new Uint8Array(readFileSync(join(FIXTURES, naziv)));
      const before = await analyzeFixture(new File([bytes], naziv, { type: DOCX_MIME }), { profileId });
      const profile = resolveProfile(profileId) as Record<string, unknown> | null;
      const jedinica = String((profile as { selection?: { unitId?: string } })?.selection?.unitId ?? profileId.split('-')[0]);
      const vrsta = String((profile as { workType?: string })?.workType ?? 'final');
      const titleTemplate = selectTemplate(jedinica, vrsta)?.template ?? null;
      if (!titleTemplate) continue;

      const items = buildAllRepairableItems({
        result: before,
        profile,
        entries: repairEntriesFor(profileId),
        titleTemplate,
      } as never);
      const tp = (items as Array<{ fixerId?: string }>).filter((x) => x.fixerId === 'title-page-fixer');
      if (!tp.length) continue;
      ponudjen += 1;

      // SAMO naslovnica, nikad zadani skup: druga dva fixera smiju mijenjati tekst.
      const zahtjevi = (buildDefaultRepairRequests(items as never) as Array<{ fixerId?: string }>)
        .filter((r) => r.fixerId === 'title-page-fixer');
      if (!zahtjevi.length) continue;

      const out = await applyFixers(bytes, zahtjevi as never);
      expect((out as { integrityFailure?: unknown }).integrityFailure ?? null,
        `${naziv}: vrata integriteta su odbila paket`).toBeNull();
      if (!((out as { changelog?: unknown[] }).changelog ?? []).length) continue;
      primijenjen += 1;

      const prije = await odlomci(bytes);
      const poslije = new Set(await odlomci((out as { docxBytes: Uint8Array }).docxBytes));
      for (const t of prije) if (!poslije.has(t)) nestalo.push(`${naziv}: ${JSON.stringify(t.slice(0, 60))}`);
    }

    // ANTI-VAKUUM: bez ijedne stvarne primjene tvrdnja nize ne mjeri nista.
    expect(primijenjen, `fixer nije promijenio nijedan dokument (ponudjen na ${ponudjen}); gard mjeri prazno`)
      .toBeGreaterThan(0);
    expect(nestalo, 'title-page-fixer je obrisao vidljivi tekst').toEqual([]);
  }, 600_000);
});
