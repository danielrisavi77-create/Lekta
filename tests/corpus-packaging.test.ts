/**
 * RUCNO SLOZEN PAKET: oblici PAKIRANJA koje nijedan alat na ovom stroju ne proizvodi.
 *
 * Tri oblika koja stvarni radovi nose dolaze iz Google Docs izvoza, a njega ovdje nema. Izmjereno
 * 2026-09-08 nad 457 radova u `Lekta-korpus`:
 *
 *     zip/direktoriji         130 od 457   (21 od njih NIJE Google Docs, pa oblik nije samo njegov)
 *     paket/comments-prazan   135 od 457
 *     gdocs/potpis            129 od 457   (`docProps/app.xml` s doslovno praznim `<Properties/>`)
 *
 * Fixtura ih nosi, a ovaj gard tvrdi ono zbog cega ima smisla postojati: da motor takav paket cita
 * i da ga popravak ponovno napise BEZ gubitka tih oblika. Bez druge tvrdnje bi fixtura bila samo
 * datoteka koja popunjava popis pokrivenih oblika, dakle tocno vakuum protiv kojeg popis postoji.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/repair/zip-codec';
import { applyFixers } from '../src/repair/apply-fixers';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { sidecarAdmitted } from './real-corpus/corpus-track';
import { detectShapes, verifyRepairRoundTrip, verifyShapeClaims } from '../src/corpus/docx-shapes';
import { buildDocx, type DocSpec } from './helpers/docx-builder';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'fixtures', 'docx-packaging');
const DOCX = join(DIR, 'gdocs-otisak.docx');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SIDECAR = join(DIR, 'gdocs-otisak.json');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Sidecar {
  synthetic?: unknown;
  track?: unknown;
  profileId?: unknown;
  shapes?: { claimed?: string[] };
}

function citajSidecar(): Sidecar {
  return JSON.parse(readFileSync(SIDECAR, 'utf8')) as Sidecar;
}

describe('rucno slozen paket: oblici pakiranja', () => {
  it('fixtura i sidecar postoje i nisu prazni', () => {
    // Anti-vakuum: bez ove tvrdnje bi svaka tvrdnja nize prosla nad datotekom koje nema, jer bi
    // `readFileSync` bacio tek u prvom testu koji je cita, a popis pokrivenih oblika bi je brojao.
    expect(existsSync(DOCX), DOCX).toBe(true);
    expect(existsSync(SIDECAR), SIDECAR).toBe(true);
    expect(readFileSync(DOCX).length).toBeGreaterThan(2000);
  });

  it('paket nosi svaki oblik koji sidecar tvrdi', async () => {
    const sidecar = citajSidecar();
    const claimed = sidecar.shapes?.claimed ?? [];
    expect(claimed).toEqual(['zip/direktoriji', 'paket/comments-prazan', 'gdocs/potpis']);

    const counts = detectShapes(await readZip(new Uint8Array(readFileSync(DOCX))));
    const v = verifyShapeClaims(claimed, counts);
    expect(v).toEqual({ missing: [], unknown: [], underDetected: [] });
  });

  it('zid dokaza drzi: paket je sinteticki i traka mu je izvan dopustenih', () => {
    const sidecar = citajSidecar();
    expect(sidecar.synthetic).toBe(true);
    expect(sidecar.track).toBe('handbuilt');
    expect(sidecarAdmitted(sidecar)).toBe(false);
  });

  it('analiza cita paket s direktorijskim zapisima i praznim comments.xml', async () => {
    const bytes = new Uint8Array(readFileSync(DOCX));
    const result = await analyzeFixture(new File([bytes], 'gdocs-otisak.docx', { type: MIME }));
    // Direktorijski zapis nema sadrzaja i lako ga je procitati kao dio dokumenta; da se to dogadja,
    // analiza bi pukla ili vratila prazan skup provjera umjesto uredne ocjene.
    expect((result.checks ?? []).length).toBeGreaterThan(20);
  });

  /**
   * Glavna tvrdnja: popravak paket PONOVNO NAPISE, i oblici pakiranja to prezive.
   *
   * `empty-paragraph-fixer` je odabran jer mu je posao vidljiv u bajtovima (cetiri prazna odlomka
   * svede na jedan), pa promjena nije stvar procjene. Zahtjev se salje izravno, a ne kroz zadani
   * odabir: bez profila taj odabir na ovom dokumentu daje NULA zahtjeva, `applyFixers` tada vrati
   * ulazne bajtove, i cijela bi tvrdnja prosla nad netaknutim originalom.
   */
  it('popravak ponovno napise paket a oblici pakiranja prezive', async () => {
    const bytes = new Uint8Array(readFileSync(DOCX));
    const applied = await applyFixers(bytes, [
      { fixerId: 'empty-paragraph-fixer', ruleId: 'higijena.prazni-odlomci', params: { maxConsecutive: 1 } },
    ] as never);

    expect((applied as { integrityFailure?: unknown }).integrityFailure ?? null).toBeNull();
    const changelog = applied.changelog ?? [];
    expect(changelog.map((c: { fixerId?: string }) => c.fixerId)).toContain('empty-paragraph-fixer');
    const changed = applied.docxBytes.length !== bytes.length;
    expect(changed, 'popravak nije promijenio paket, pa tvrdnja o prezivljavanju ne mjeri nista').toBe(true);

    const after = await readZip(applied.docxBytes);
    const verdict = verifyRepairRoundTrip(citajSidecar().shapes?.claimed ?? [], detectShapes(after), { changed });
    expect(verdict).toEqual({ lost: [], vacuous: false });
    // Direktorijski zapisi su jedini oblik koji zivi ISKLJUCIVO u imenima zip zapisa, pa se broji i
    // izravno: da ih pisac paketa ispusti, gornja tvrdnja bi pala, ali ne bi se vidjelo koliko ih je.
    expect(after.filter((e) => e.name.endsWith('/')).length).toBe(4);
  }, 30_000);

  it('negativna kontrola: isti graditelj bez dodataka ne nosi nijedan od ta tri oblika', async () => {
    const spec: DocSpec = { paragraphs: [{ text: 'Tijelo rada.' }], settings: true };
    const counts = detectShapes(await readZip(buildDocx(spec)));
    expect(counts['zip/direktoriji']).toBe(0);
    expect(counts['paket/comments-prazan']).toBe(0);
    expect(counts['gdocs/potpis']).toBe(0);
  });
});

/**
 * DRUGA FIXTURA: `paket/bez-png-default`, jedini oblik cijeg nositelja NIJE dala mjera nego odluka.
 *
 * Zbog toga je ovdje jedna tvrdnja koje kod ostalih fixtura nema: sidecar MORA reci da potkrepe u
 * stvarnom korpusu nema. Bez nje bi za godinu dana ovaj oblik izgledao jednako potkrijepljen kao
 * `zip/direktoriji`, koji stoji na 130 stvarnih radova.
 */
describe('rucno slozen paket: png bez deklarirane vrste', () => {
  const PNG_DOCX = join(DIR, 'png-bez-defaulta.docx');
  const PNG_SIDECAR = join(DIR, 'png-bez-defaulta.json');

  it('fixtura postoji i nosi tocno tvrdjeni oblik', async () => {
    expect(existsSync(PNG_DOCX), PNG_DOCX).toBe(true);
    const sidecar = JSON.parse(readFileSync(PNG_SIDECAR, 'utf8')) as Sidecar;
    expect(sidecar.shapes?.claimed).toEqual(['paket/bez-png-default']);

    const counts = detectShapes(await readZip(new Uint8Array(readFileSync(PNG_DOCX))));
    expect(verifyShapeClaims(sidecar.shapes?.claimed ?? [], counts)).toEqual({
      missing: [],
      unknown: [],
      underDetected: [],
    });
  });

  it('sidecar izricito kaze da oblik nema potkrepu u stvarnom korpusu', () => {
    const sidecar = JSON.parse(readFileSync(PNG_SIDECAR, 'utf8')) as Sidecar & {
      razlog?: string;
      toolLimitations?: string[];
    };
    expect(sidecar.razlog ?? '').toMatch(/IZMISLJEN OBLIK/);
    expect((sidecar.toolLimitations ?? []).join(' ')).toMatch(/nema potkrepu u stvarnom korpusu/);
    expect(sidecarAdmitted(sidecar)).toBe(false);
  });

  it('negativna kontrola: isti paket bez png dijela oblik NE nosi', async () => {
    const spec: DocSpec = { paragraphs: [{ text: 'Tijelo rada.' }], settings: true };
    const counts = detectShapes(await readZip(buildDocx(spec)));
    expect(counts['paket/bez-png-default']).toBe(0);
  });

  it('analiza cita paket s nedeklariranim dijelom, ne puca na njemu', async () => {
    const bytes = new Uint8Array(readFileSync(PNG_DOCX));
    const result = await analyzeFixture(new File([bytes], 'png-bez-defaulta.docx', { type: MIME }));
    expect((result.checks ?? []).length).toBeGreaterThan(20);
  });
});

/**
 * VEZE GLAVNOG DIJELA (`word/_rels/document.xml.rels`) su dio koji svaki pravi `.docx` ima, a nas
 * graditelj ga je pisao SAMO uz podnozje.
 *
 * Nije bila kozmetika nego je gasila pola zahvata. `footerPageFixer` prvi redak glasi
 * `if (!contentTypesXml || !documentRelsXml) return NO_OP(parts)`, a `sectionInsertFixer` ga zove
 * iznutra. Bez veza je popravak upisivao `pgNumType` (rimski prednji dio, arapski glavni) i NIJE
 * umetao podnozje, pa je dokument imao numeraciju koja se nema gdje ispisati. Zatvorena petlja je to
 * biljezila kao uredan `section-insert-fixer` i sve zeleno.
 *
 * IZMJERENO 2026-09-12, isti profil, jedina razlika su veze:
 *
 *     bez veza   footer dijelova 0   footerReference 0   pgNumType 2
 *     s vezama   footer dijelova 1   footerReference 1   pgNumType 2
 *
 * U proizvodu se to ne dogadja, jer stvarni dokument veze uvijek ima; posljedica je bila da je petlja
 * mjerila SLABIJI popravak od onoga koji korisnik dobije. Tocno razred na koji vodic upozorava: dok
 * generatoru ne dokazes da proizvodi oblik koji tvrdis da pokrivas, mjerenje nije istinito.
 */
describe('paket: veze glavnog dijela postoje i bez podnozja', () => {
  it('svaki dokument iz graditelja nosi word/_rels/document.xml.rels', async () => {
    const spec: DocSpec = { paragraphs: [{ text: 'Tijelo rada.' }] };
    const zip = await readZip(new Uint8Array(await buildDocx(spec)));
    const imena = zip.map((e) => e.name);
    expect(imena, 'dokument bez veza glavnog dijela; nijedan pravi .docx tako ne izgleda').toContain(
      'word/_rels/document.xml.rels',
    );
    const rels = new TextDecoder().decode(zip.find((e) => e.name === 'word/_rels/document.xml.rels')!.data);
    // Veza na stilove je ona koju Word upise i u najprazniji dokument.
    expect(rels).toContain('styles.xml');
  });

  it('veze imenuju samo dijelove koji u paketu DOISTA postoje', async () => {
    const spec: DocSpec = { paragraphs: [{ text: 'Tijelo rada.' }], footnotes: ['Fusnota.'], settings: true };
    const zip = await readZip(new Uint8Array(await buildDocx(spec)));
    const imena = new Set(zip.map((e) => e.name));
    const rels = new TextDecoder().decode(zip.find((e) => e.name === 'word/_rels/document.xml.rels')!.data);
    for (const m of rels.matchAll(/Target="([^"]+)"/g)) {
      expect(imena, `veza obecava dio kojeg u zipu nema: ${m[1]}`).toContain(`word/${m[1]}`);
    }
    // Netrivijalnost: spec IMA fusnote i postavke, pa veza mora biti vise od same jedne na stilove.
    expect([...rels.matchAll(/Target="/g)].length).toBeGreaterThan(1);
  });

  it('bez podnozja u ulazu, popravak sekcije UMETNE podnozje s brojem stranice', async () => {
    const { buildViolatingDocx } = await import('./helpers/violating-docx');
    const { liveProfile } = await import('./helpers/live-profile');
    const { buildAllRepairableItems } = await import('../src/ui/repair-item-assembly');
    const { buildDefaultRepairRequests } = await import('../src/repair/default-selection');
    const { draftRuleEntriesFor } = await import('../src/profiles/drafts-runtime');

    const profileId = 'pravo-socijalni-rad-zavrsni';
    const profile = liveProfile(profileId);
    const { bytes } = await buildViolatingDocx(profile as never, { structural: true } as never);
    const ulaz = await readZip(new Uint8Array(bytes));
    // Kontrola polaznog stanja: ULAZ podnozje NEMA, pa "izlaz ga ima" ne moze biti vakuum.
    expect(ulaz.some((e) => /^word\/footer\d*\.xml$/.test(e.name))).toBe(false);

    const before = await analyzeFixture(new File([bytes], `${profileId}.docx`, { type: DOCX_MIME }), {
      profileId,
      profile,
    } as never);
    const items = buildAllRepairableItems({
      result: before,
      profile,
      entries: draftRuleEntriesFor(profileId),
    } as never) as Array<Record<string, unknown>>;
    const out = await applyFixers(bytes, buildDefaultRepairRequests(items as never) as never);
    // Vrata integriteta uz pad vracaju ULAZNE bajtove i prazan changelog, pa bi tvrdnje nize prosle
    // vakuumski nad originalom. Polje je `undefined` kad pada nije bilo.
    expect(out.integrityFailure ?? null).toBeNull();

    const izlaz = await readZip(new Uint8Array(out.docxBytes));
    const doc = new TextDecoder().decode(izlaz.find((e) => e.name === 'word/document.xml')!.data);
    expect(
      izlaz.some((e) => /^word\/footer\d*\.xml$/.test(e.name)),
      'popravak je postavio numeraciju, a podnozja nema: broj stranice se nema gdje ispisati',
    ).toBe(true);
    expect(doc).toMatch(/<w:footerReference\b/);
    expect(doc).toMatch(/<w:pgNumType\b/);
  }, 60_000);
});
