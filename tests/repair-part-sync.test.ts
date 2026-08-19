/**
 * TIHI GUBITAK POPRAVKA: fixer koji pise u `packageXmlParts` ne smije biti ponisten fixerom koji
 * pise u `parts.documentXml` (2026-08-17).
 *
 * Isti XML dio bio je dostupan kroz DVIJE reprezentacije, a sinkronizacija je isla samo u jednom
 * smjeru (polje -> mapa). Posljedica u zadanom toku "Popravi sve":
 *
 *   1. final-document-inspector-fixer obrise `w:rsid*` atribute u packageXmlParts['word/document.xml'];
 *   2. `parts.documentXml` ostane STARA verzija, s rsidovima;
 *   3. sljedeci fixer radi nad tom starom verzijom i promijeni je;
 *   4. sinkronizacija zakljuci da mapu nitko nije dirao i prepise je starim dokumentom.
 *
 * Rezultat: uklanjanje revizijskih tragova NIJE radilo, a harness je to vidio samo kao "drugi
 * prolaz nije no-op". Izmjereno na stvarnom radu: 16031 rsid atributa prije, 15125 nakon prvog
 * prolaza, 0 tek nakon drugog. Nakon popravka: 0 vec u prvom prolazu, na svih 50 dokumenata.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installXmlDomParser } from '../src/docx/xml-dom-install';
import { applyFixers, FIXER_IDS, type FixerRequest } from '../src/repair/apply-fixers';
import { readZip, writeZip } from '../src/repair/zip-codec';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { finalDocumentInspectorRepairableItem } from '../src/ui/repair-items';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PROFILE_ID = 'fer-diplomski';

installXmlDomParser(true);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY_SRC = readFileSync(join(root, 'src/repair/apply-fixers.ts'), 'utf8');

/**
 * Nijedan commitani fixture nema `w:rsid` atribute (anonimizirani su), pa ih test sam umece u
 * postojeci paket. Time je uvjet dokaza eksplicitan i determinististican, umjesto da ovisi o tome
 * hoce li neka buduca fixtura slucajno nositi revizijske tragove.
 */
async function withRsids(bytes: Uint8Array): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  const patched = entries.map((entry) => {
    if (entry.name !== 'word/document.xml') return entry;
    const xml = new TextDecoder().decode(entry.data).replace(/<w:p(\s|>)/g, '<w:p w:rsidR="00AB12CD" w:rsidRDefault="00AB12CD"$1');
    return { name: entry.name, data: new TextEncoder().encode(xml) };
  });
  return writeZip(patched);
}

async function countRsid(bytes: Uint8Array): Promise<number> {
  const entries = await readZip(bytes);
  let total = 0;
  for (const entry of entries) {
    if (!/\.xml$/i.test(entry.name)) continue;
    total += (new TextDecoder().decode(entry.data).match(/\sw:rsid[A-Za-z]+=/g) || []).length;
  }
  return total;
}

/**
 * Zahtjev inspektora se gradi PROIZVODNIM putem (finalDocumentInspectorRepairableItem +
 * form.buildParams), ne rucno: rucno slozen params ne prodje sanitizaciju i zavrsi kao
 * 'invalid-params', pa bi test tiho mjerio preskocen popravak umjesto primijenjenog.
 */
async function inspectorRequest(bytes: Uint8Array): Promise<FixerRequest> {
  const analysis = await analyzeFixture(new File([bytes], 'sync.docx', { type: DOCX_MIME }), { profileId: PROFILE_ID });
  const items = finalDocumentInspectorRepairableItem(analysis);
  expect(items.length, 'inspektor mora ponuditi stavku za ovaj dokument').toBeGreaterThan(0);
  return { fixerId: items[0].fixerId, ruleId: items[0].ruleId, params: items[0].params } as FixerRequest;
}

describe('sinkronizacija dijelova paketa je DVOSMJERNA', () => {
  const fixture = join(root, 'tests/fixtures/docx/fer-diplomski-puna-struktura.docx');
  const original = new Uint8Array(readFileSync(fixture));
  let bytes: Uint8Array;
  beforeAll(async () => { bytes = await withRsids(original); });

  it('fixture uopce ima revizijske identifikatore (inace test nista ne dokazuje)', async () => {
    expect(await countRsid(bytes)).toBeGreaterThan(0);
  });

  it('uklanjanje rsid-ova prezivi popravak koji NAKON njega mijenja document.xml', async () => {
    // font-fixer pise u parts.documentXml; prije popravka bi njegov zapis vratio rsidove.
    const requests: FixerRequest[] = [
      await inspectorRequest(bytes),
      { fixerId: 'font-fixer', ruleId: 'font', params: { fontName: 'Times New Roman', deep: true } } as FixerRequest,
    ];
    const applied = await applyFixers(bytes, requests);
    expect(applied.changelog.length, 'oba popravka moraju se primijeniti').toBeGreaterThan(0);
    expect(await countRsid(applied.docxBytes), 'rsid mora nestati vec u PRVOM prolazu').toBe(0);
  });

  it('drugi prolaz istih zahtjeva je no-op (idempotentnost)', async () => {
    const requests: FixerRequest[] = [
      await inspectorRequest(bytes),
      { fixerId: 'font-fixer', ruleId: 'font', params: { fontName: 'Times New Roman', deep: true } } as FixerRequest,
    ];
    const first = await applyFixers(bytes, requests);
    const second = await applyFixers(first.docxBytes, requests);
    expect(second.changelog, 'drugi prolaz ne smije nista mijenjati').toEqual([]);
    expect(second.docxBytes, 'no-op mora zadrzati istu referencu').toBe(first.docxBytes);
  });
});

describe('globalni prepisivaci idu posljednji u svojoj fazi', () => {
  it('final-document-inspector-fixer je oznacen kao globalni prepisivac', () => {
    // Kad se izvede rano, njegov globalni zahvat ponisti sidra (anchorFingerprint) svih
    // anchor-osjetljivih fixera iza njega, pa oni fail-safe preskoce s 'no-target'. Izmjereno:
    // prvi prolaz je primjenjivao 3 od 5 popravaka, a preostala dva tek na sljedeci klik.
    expect(APPLY_SRC).toContain('GLOBAL_REWRITE_FIXERS');
    expect(APPLY_SRC).toMatch(/GLOBAL_REWRITE_FIXERS[^;]*'final-document-inspector-fixer'/);
    expect(APPLY_SRC, 'redoslijed mora koristiti GLOBAL_REWRITE_FIXERS').toContain('GLOBAL_REWRITE_FIXERS.has(a.request.fixerId)');
  });

  it('svaki naveden globalni prepisivac je stvarno registriran fixer', () => {
    const listed = [...APPLY_SRC.matchAll(/GLOBAL_REWRITE_FIXERS[\s\S]*?\[([\s\S]*?)\]/g)][0]?.[1] ?? '';
    const ids = [...listed.matchAll(/'([a-z0-9-]+-fixer)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(FIXER_IDS as readonly string[], id).toContain(id);
  });
});

describe('anchor-osjetljivi fixeri idu PRVI u svojoj fazi', () => {
  /**
   * Zrcalna slika GLOBAL_REWRITE_FIXERS. Zahtjev `field-integrity-fixera` nosi otisak
   * (`anchorFingerprint`) racunat nad IZVORNIM dokumentom, pa ga svaka ranija preinaka tog
   * odlomka ucini slijepim za vlastite mete.
   *
   * Izmjereno na stvarnom radu (85 Word polja): u zadanom redoslijedu oznacio je samo 5 polja,
   * izveden PRVI svih 85. Preostalih 80 nije padalo s greskom nego TIHO, jer otisak vise ne
   * pogadja odlomak koji su prije njega prepisali paper-size i heading-style. Korisnik je to
   * vidio kao "drugi klik na Popravi opet ima sto raditi": 6 od 10 radova nije konvergiralo,
   * nakon popravka 0 od 10.
   */
  it('field-integrity i croatian-typography su oznaceni kao anchor-osjetljivi', () => {
    expect(APPLY_SRC).toContain('ANCHOR_SENSITIVE_FIXERS');
    expect(APPLY_SRC).toMatch(/ANCHOR_SENSITIVE_FIXERS[\s\S]{0,200}'field-integrity-fixer'/);
    expect(APPLY_SRC).toMatch(/ANCHOR_SENSITIVE_FIXERS[\s\S]{0,200}'croatian-typography-fixer'/);
  });

  it('redoslijed ih stvarno stavlja ispred ostalih u fazi', () => {
    expect(APPLY_SRC).toContain('ANCHOR_SENSITIVE_FIXERS.has(b.request.fixerId)');
    // Anchor-prvi mora se odluciti PRIJE globalnih prepisivaca, inace se dva pravila potiru.
    const anchorAt = APPLY_SRC.indexOf('ANCHOR_SENSITIVE_FIXERS.has(b.request.fixerId)');
    const globalAt = APPLY_SRC.indexOf('GLOBAL_REWRITE_FIXERS.has(a.request.fixerId)');
    expect(anchorAt).toBeGreaterThan(-1);
    expect(globalAt).toBeGreaterThan(anchorAt);
  });

  it('svaki naveden anchor-osjetljiv fixer je stvarno registriran', () => {
    const listed = /ANCHOR_SENSITIVE_FIXERS[\s\S]*?\[([\s\S]*?)\]/.exec(APPLY_SRC)?.[1] ?? '';
    const ids = [...listed.matchAll(/'([a-z0-9-]+-fixer)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(FIXER_IDS as readonly string[], id).toContain(id);
  });
});
