import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSelectionIds, type SelectionIds } from '../src/ui/profile-selection-ids';
import { subscribeProfileConfirmed, type ProfileConfirmed } from '../src/ui/profile-confirmed-events';
import { createConfirmedProfile, NOTICE_PROFILE_MISMATCH } from '../src/routes/workspace/confirmed-profile';

/**
 * OBNOVA POTVRDJENOG PROFILA IZ SESIJE (korak C4, 2026-09-12), nad stvarnom radnom povrsinom
 * (`rad/index.html` + `initAnalyzerApp`), po uzoru na `tests/analyzer-document-entry.test.ts`.
 *
 * Tri stvari koje bi bez ovog garda otisle tiho:
 *  1. DETEKCIJA IZ DOKUMENTA NE PREGAZI SESIJU. `admitFile` nad obnovljenim dokumentom svaki put
 *     zove detekciju, ASINKRONO iza `accepted`; obnova bi izgledala kao da radi pa se promijenila
 *     sekundu poslije. Test zato CEKA da se detekcija smiri, a negativna kontrola dokazuje da isti
 *     dokument bez sesijskog profila odabir DOISTA pomice (inace bi tvrdnja bila vakuumska).
 *  2. GLOBALNE POSTAVKE NE PREGAZE SESIJU. `restorePreferences` (lekta.preferences.v2) vraca zadnji
 *     odabir za SVE radove; sesijski profil mora doci poslije nje.
 *  3. NESUKLADNA SNIMKA KAZE `mismatch`, ne "vraceno".
 *
 * REDOSLIJED DESCRIBE BLOKOVA JE NAMJERAN: blok o detekciji ide PRVI, jer blok o obnovi ostavlja
 * modulsku zastavicu sesijskog profila podignutu bez vezanog dokumenta (nista je ne ucitava), a
 * negativna kontrola detekcije trazi spusten pocetni polozaj.
 */

const ROOT = resolve(__dirname, '..');
const INDEX = readFileSync(resolve(ROOT, 'rad', 'index.html'), 'utf8');
/**
 * Fixture s PREPOZNATLJIVOM naslovnicom. `fer-diplomski-uskladjen.docx` (koji koristi test ulaza
 * dokumenta) nema naslovnicu i detekcija nad njim vraca `null`, sto je izmjereno prije odabira;
 * negativna kontrola dolje to hvata ako se fixture ikad zamijeni.
 */
const REAL_DOCX = readFileSync(resolve(ROOT, 'tests', 'fixtures', 'docx', 'lo-fpzg-zavrsni-uskladjen.docx'));
/**
 * Fakultet koji detekcija prepoznaje iz fixtura (naslovnica FPZG-a). Katalog otvara obrazac bas na
 * `fpzg`, pa se POCETNI polozaj u testovima detekcije pomice globalnim postavkama na drugi fakultet;
 * inace "detekcija je pomaknula odabir" nema sto pomaknuti, i negativna kontrola to tvrdi izricito.
 * (`pravo-integrirani-fusnote.docx` bi bio jasniji, ali ga intake gate odbija kao premalen.)
 */
const DETECTED_UNIT = 'fpzg';
/** Fakultet u sesiji: razlicit od detektiranog, od globalnog i od pocetnog, da se svaki izvor razlikuje po vrijednosti. */
const SESSION_UNIT = 'fer';
const GLOBAL_UNIT = 'efzg';

function workspaceDoc(): Document {
  const parsed = document.implementation.createHTMLDocument('izvor');
  parsed.documentElement.innerHTML = INDEX;
  const analyzer = parsed.getElementById('analyzer');
  if (!analyzer) throw new Error('index.html nema #analyzer');
  const doc = document.implementation.createHTMLDocument('rad');
  // Dva korijena, kao u ostalim testovima montaze: kontrole profila zive u `#profileSheet`.
  doc.body.innerHTML = analyzer.outerHTML + (parsed.getElementById('profileSheet')?.outerHTML ?? '');
  return doc;
}

const realDocx = (name: string) => new File([new Uint8Array(REAL_DOCX)], name, {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const wrongExtension = () => new File([new Uint8Array([1, 2, 3])], 'rad.pdf', { type: 'application/pdf' });

type Api = typeof import('../src/ui/app');

/**
 * Prije demontaze se ceka da se asinkroni `updateProfile` (lijeno ucitavanje pravila) smiri: nakon
 * `disposeAnalyzerApp` `$()` pada na globalni `document` bez obrasca, pa bi obecanje u letu puklo
 * kao neobradjeno odbijanje i oborilo cijeli run, iako tvrdnje testa prolaze.
 */
const settle = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));

async function withMountedApp<T>(fn: (api: Api, doc: Document) => Promise<T>): Promise<T> {
  const api = await import('../src/ui/app');
  const doc = workspaceDoc();
  api.initAnalyzerApp(doc);
  try { return await fn(api, doc); } finally { await settle(); api.disposeAnalyzerApp(doc); }
}

const unitOf = (doc: Document) => (doc.getElementById('unitSelect') as HTMLSelectElement).value;

/** Ceka dok `pred` ne postane istinit ili rok ne istekne; vraca proteklo vrijeme ili -1. */
async function waitFor(pred: () => boolean, ms: number): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred() ? Date.now() - t0 : -1;
}

/** Sesijska snimka izvedena iz STVARNOG obrasca, pa su svih osam polja valjane opcije. */
function sessionSnapshot(api: Api, doc: Document): { ids: SelectionIds; profileDefinitionId: string } {
  const profileDefinitionId = api.applyConfirmedProfileSelection({ institution: 'unizg', unit: SESSION_UNIT, workType: 'graduate' });
  if (!profileDefinitionId) throw new Error(`fixture: odabir ${SESSION_UNIT}/graduate mora razrjesavati verificiran profil`);
  return { ids: readSelectionIds(doc), profileDefinitionId };
}

/** Koliko je detekciji trebalo u negativnoj kontroli; pozitivna tvrdnja ceka visekratnik toga. */
let detectionMs = 0;

describe('detekcija iz dokumenta naspram potvrdjenog profila sesije', () => {
  // Pocetni polozaj obrasca je GLOBALNI fakultet (restorePreferences), razlicit od detektiranog.
  beforeEach(() => { localStorage.setItem('lekta.preferences.v2', JSON.stringify({ institution: 'unizg', unit: GLOBAL_UNIT })); });
  afterEach(() => { localStorage.removeItem('lekta.preferences.v2'); });

  it('NEGATIVNA KONTROLA: bez sesijskog profila isti dokument POMICE odabir', async () => {
    await withMountedApp(async (api, doc) => {
      expect(unitOf(doc), 'pocetni polozaj mora biti razlicit od detektiranog').not.toBe(DETECTED_UNIT);
      const out = await api.loadAnalyzerDocument(realDocx('kontrola.docx'));
      expect(out.kind).toBe('accepted');
      detectionMs = await waitFor(() => unitOf(doc) === DETECTED_UNIT, 60_000);
      expect(
        detectionMs,
        `fixture nije prepoznatljiv: detekcija nije pomaknula #unitSelect na "${DETECTED_UNIT}", pa bi tvrdnja o zastiti bila vakuumska. Zamijeni fixture.`,
      ).toBeGreaterThanOrEqual(0);
    });
  }, 180_000);

  it('sesijski profil PREZIVI detekciju obnovljenog dokumenta, a DRUGA datoteka je opet pusta', async () => {
    await withMountedApp(async (api, doc) => {
      const { ids } = sessionSnapshot(api, doc);
      expect(unitOf(doc)).toBe(SESSION_UNIT);

      const out = await api.loadAnalyzerDocument(realDocx('obnovljeni.docx'));
      expect(out.kind).toBe('accepted');
      // Ceka se DULJE nego sto je detekcija trebala u kontroli: tvrdnja "nije se promijenilo" vrijedi
      // samo ako je detekcija imala vremena da se dogodi.
      const changed = await waitFor(() => unitOf(doc) !== SESSION_UNIT, Math.max(3 * detectionMs, 3_000));
      expect(changed, 'detekcija je pregazila potvrdjeni profil sesije').toBe(-1);
      expect(readSelectionIds(doc)).toEqual(ids);

      // Druga datoteka: zastavica se gasi, detekcija opet radi. Bez toga bi sljedeci rad ostao bez
      // detekcije, a obrazac pokazivao profil rada koji nije ucitan.
      const drugi = await api.loadAnalyzerDocument(realDocx('drugi.docx'));
      expect(drugi.kind).toBe('accepted');
      const moved = await waitFor(() => unitOf(doc) === DETECTED_UNIT, 60_000);
      expect(moved, 'nakon druge datoteke detekcija mora opet pomicati odabir').toBeGreaterThanOrEqual(0);
    });
  }, 180_000);

  it('ODBIJEN obnovljeni dokument gasi zastavicu: sljedeci dokument opet prolazi detekciju', async () => {
    await withMountedApp(async (api, doc) => {
      sessionSnapshot(api, doc);
      const refused = await api.loadAnalyzerDocument(wrongExtension());
      expect(refused.kind).toBe('rejected');
      const out = await api.loadAnalyzerDocument(realDocx('novi.docx'));
      expect(out.kind).toBe('accepted');
      const moved = await waitFor(() => unitOf(doc) === DETECTED_UNIT, 60_000);
      expect(moved, 'nakon odbijene obnove detekcija mora opet raditi').toBeGreaterThanOrEqual(0);
    });
  }, 180_000);
});

describe('obnova potvrdjenog profila iz sesije', () => {
  it('CIST BASELINE: sesijski profil pobjedjuje globalne postavke, i vraca zapisani id', async () => {
    // Snimka se izvodi iz stvarnog obrasca u prvoj montazi...
    const snapshot = await withMountedApp(async (api, doc) => sessionSnapshot(api, doc));
    expect(snapshot.ids.unit).toBe(SESSION_UNIT);

    // ...a zatim se globalne postavke postave na DRUGI fakultet i montaza ponovi.
    localStorage.setItem('lekta.preferences.v2', JSON.stringify({ institution: 'unizg', unit: GLOBAL_UNIT }));
    try {
      await withMountedApp(async (api, doc) => {
        const unit = doc.getElementById('unitSelect') as HTMLSelectElement;
        // SENTINEL: `setOptionIfExists` tiho ne radi nista nad praznim popisom, pa bi test prosao
        // vakuumski. Oba fakulteta moraju biti stvarne opcije.
        const opcije = [...unit.options].map((o) => o.value);
        expect(opcije.length).toBeGreaterThan(0);
        expect(opcije).toContain(SESSION_UNIT);
        expect(opcije).toContain(GLOBAL_UNIT);
        expect(unitOf(doc), 'montaza vraca GLOBALNE postavke (restorePreferences)').toBe(GLOBAL_UNIT);

        const emitirano: ProfileConfirmed[] = [];
        const off = subscribeProfileConfirmed((e) => emitirano.push(e));
        const resolved = api.applyConfirmedProfileSelection(snapshot.ids as unknown as Record<string, string>);
        off();
        expect(emitirano, 'obnova NE emitira potvrdu (povratna petlja zapisa)').toEqual([]);
        expect(readSelectionIds(doc), 'svih osam polja nosi sesijske vrijednosti').toEqual(snapshot.ids);
        expect(resolved).toBe(snapshot.profileDefinitionId);

        // IZRECENA ODLUKA (rizik iz projekta C4): obnova sesije kroz `syncProfileContext` PISE i
        // globalne postavke, pa zadnji svjesni odabir postaje polazni obrazac za sve buduce radove.
        // Tvrdi se izricito, da promjena tog ponasanja ne prodje kao slucajnost.
        expect(JSON.parse(localStorage.getItem('lekta.preferences.v2') ?? '{}').unit, 'obnova sesije postaje i globalni default').toBe(SESSION_UNIT);

        // MUTACIJA IZVEDENA U TESTU (redoslijed/globalne-postavke-poslije-sesije): globalne postavke
        // se vrate na drugi fakultet, pa ponovna montaza nad istim dokumentom pozove
        // `restorePreferences` POSLIJE sesijskog profila. Obrazac tada pokazuje globalni fakultet,
        // dakle tocno kvar koji ugovor o redoslijedu sprjecava.
        localStorage.setItem('lekta.preferences.v2', JSON.stringify({ institution: 'unizg', unit: GLOBAL_UNIT }));
        api.disposeAnalyzerApp(doc);
        api.initAnalyzerApp(doc);
        expect(unitOf(doc), 'krivi redoslijed MORA pregaziti sesiju (inace mutacija nije stvarna)').toBe(GLOBAL_UNIT);
        expect(unitOf(doc)).not.toBe(SESSION_UNIT);
      });
    } finally {
      localStorage.removeItem('lekta.preferences.v2');
    }
  }, 180_000);

  it('potvrda u carobnjaku emitira TOCNO JEDNU potvrdu s razrjesenim profilom', async () => {
    await withMountedApp(async (api, doc) => {
      const snapshot = sessionSnapshot(api, doc);
      const emitirano: ProfileConfirmed[] = [];
      const off = subscribeProfileConfirmed((e) => emitirano.push(e));
      (doc.getElementById('stepToAnalyze') as HTMLButtonElement).click();
      off();
      expect(emitirano).toHaveLength(1);
      expect(emitirano[0].profileDefinitionId).toBe(snapshot.profileDefinitionId);
      expect(emitirano[0].selectionIds).toEqual(snapshot.ids);
      expect(emitirano[0].confirmedAt).toBeGreaterThan(0);
    });
  }, 180_000);

  it('valjana snimka daje applied, nesukladna mismatch s porukom', async () => {
    await withMountedApp(async (api, doc) => {
      const snapshot = sessionSnapshot(api, doc);
      const statusi: Array<string | null> = [];
      const profil = createConfirmedProfile({
        store: () => null, sessionId: () => null, apply: api.applyConfirmedProfileSelection, status: (t) => statusi.push(t),
      });
      // KONTROLA: valjana snimka JEST applied; bez nje bi prolazio i gard koji vristi na sve.
      expect(profil.restore({ profileDefinitionId: snapshot.profileDefinitionId, selectionIds: snapshot.ids, confirmedAt: 1 })).toBe('applied');
      expect(profil.state.restored).toBe('applied');
      expect(statusi).toEqual([]);

      // Profil kojeg u registru nema (uklonjen, preimenovan): obrazac se postavi, ali se to KAZE.
      expect(profil.restore({ profileDefinitionId: 'fpzg-profil-koji-vise-ne-postoji', selectionIds: snapshot.ids, confirmedAt: 2 })).toBe('mismatch');
      expect(profil.state.restored).not.toBe('applied');
      expect(statusi.at(-1)).toBe(NOTICE_PROFILE_MISMATCH);

      expect(profil.restore(undefined)).toBe('none');
    });
  }, 180_000);

  /**
   * Baseline garda (obnova/presuda-bez-usporedbe): stvarni `restore` usporedjuje povratnu vrijednost
   * `apply` sa spremljenim id-om, pa nepodudaranje daje `mismatch`, a ne `applied`. Stvarna mutacija
   * ovog garda izvodi se na izvoru i dokumentirana je u commit poruci, ne u ovom testu.
   */
  it('baseline: applied i mismatch se razlikuju kad se id ne poklapa', () => {
    const profil = createConfirmedProfile({ store: () => null, sessionId: () => null, apply: () => 'fpzg-politologija-diplomski', status: () => {} });
    expect(profil.restore({ profileDefinitionId: 'drugi', selectionIds: {}, confirmedAt: 1 }), 'stvarni modul usporedjuje').toBe('mismatch');
  });
});
