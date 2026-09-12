/**
 * GARD NAD MREZOM POPRAVKA (`docs/generated/repair-net.json`, `data/profiles/repair-net-ratchet.json`).
 *
 * Mreza odgovara na jedino pitanje na koje nijedan postojeci artefakt ne odgovara: je li ovaj fixer
 * ZATRAZEN i nije ucinio NISTA na dokumentu koji je napisao pravi alat. `closed-loop.json` sprema
 * `requested` kao goli broj, `repair-real-corpus.json` ima `offeredFixerIds` bez ijednog citatelja,
 * a `coverage-cells` klasificira staticki i nikad ne premjerava.
 *
 * Test namjerno NE vrti popravak (to je `npm run repair-net`, desetak sekundi po dokumentu): on cuva
 * UGOVOR artefakta i ratcheta. Agregacija se pritom dokazuje nad podmetnutim ulazom, jer bi inace
 * ostala neprovjerena polovica mehanizma.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateByFixer,
  deadFixers,
  awaitingConfirmationFixers,
  type DocumentMeasurement,
} from '../scripts/corpus-gen/net-core.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTEFAKT = join(ROOT, 'docs', 'generated', 'repair-net.json');
const RATCHET = join(ROOT, 'data', 'profiles', 'repair-net-ratchet.json');
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'docx-authored');

interface FixerRowJson {
  fixerId: string;
  requested: number;
  changed: number;
  reasons: Record<string, number>;
  deadOn: string[];
  awaitingConfirmation: number;
}
interface Artefakt {
  schemaVersion: number;
  summary: {
    documentCount: number;
    fixerCount: number;
    deadCount: number;
    dead: string[];
    awaitingCount: number;
    awaiting: string[];
  };
  fixers: FixerRowJson[];
  documents: DocumentMeasurement[];
  generatedAt?: string;
  generatedFromCommit?: string | null;
}
interface Ratchet {
  measuredAt: string;
  note: string;
  dead: Array<{ fixerId: string; reason: string; why: string }>;
}

const artefakt = JSON.parse(readFileSync(ARTEFAKT, 'utf8')) as Artefakt;
const ratchet = JSON.parse(readFileSync(RATCHET, 'utf8')) as Ratchet;

describe('mreza nad fixerima: ugovor artefakta', () => {
  it('mjeri neprazan skup dokumenata', () => {
    // Prazna mreza ne moze nikoga uhvatiti, a njezino zeleno bi se citalo kao "svi fixeri rade".
    expect(artefakt.summary.documentCount).toBeGreaterThan(0);
    expect(artefakt.documents.length).toBe(artefakt.summary.documentCount);
    const naDisku = readdirSync(FIXTURES).filter((f) => f.toLowerCase().endsWith('.docx'));
    expect(naDisku.length).toBe(artefakt.summary.documentCount);
  });

  it('svaki `authored` fixture nosi dva pojasa, pa ne moze u dokaz razine A', () => {
    const sidecari = readdirSync(FIXTURES).filter((f) => f.toLowerCase().endsWith('.json'));
    expect(sidecari.length).toBeGreaterThan(0);
    for (const s of sidecari) {
      const meta = JSON.parse(readFileSync(join(FIXTURES, s), 'utf8')) as Record<string, unknown>;
      expect(meta.synthetic, s).toBe(true);
      expect(meta.track, s).toBe('authored');
      expect((meta.provenance as { tool?: string } | undefined)?.tool, s).toBeTruthy();
    }
  });

  it('nosi provenijenciju, inace se ne zna je li star artefakt ili nov izvor', () => {
    expect(artefakt.generatedAt).toBeTruthy();
    expect(artefakt.schemaVersion).toBe(1);
  });

  it('mjeri vise fixera nego sto ih je mrtvo, inace mjerenje nista ne dokazuje', () => {
    expect(artefakt.summary.fixerCount).toBeGreaterThan(artefakt.summary.deadCount);
    const zivi = artefakt.fixers.filter((f) => f.changed > 0);
    expect(zivi.length).toBeGreaterThan(0);
  });

  /**
   * `invalid-params` NIJE stanje dokumenta nego nas kvar.
   *
   * Ostali razlozi opisuju ULAZ: `no-target` znaci da mete nema, `already-ok` da je vec ispravno,
   * `unsupported-structure` da dokument taj zahvat ne podnosi, `stale-anchor` da se sidro pomaklo.
   * `invalid-params` jedini govori o POZIVU: motor je odbio zahtjev koji smo mi sastavili.
   *
   * IZMJERENO 2026-09-08: `heading-style-fixer` ga je vracao na cetiri dokumenta, jer je stavka
   * isla kao `violated: true` s PRAZNIM popisom meta (kandidat postoji, nijedan nije predodabran),
   * pa je zadani odabir slao zahtjev bez ijedne mete. Popravljeno u `src/ui/repair-items.ts`.
   *
   * Bez ove tvrdnje bi se takav kvar citao kao "fixer je mrtav" i trazio na krivom mjestu.
   */
  it('nijedan fixer ne vraca `invalid-params`, jer to opisuje NAS zahtjev, ne dokument', () => {
    const losZahtjev = artefakt.fixers
      .filter((f) => Number(f.reasons?.['invalid-params'] ?? 0) > 0)
      .map((f) => `${f.fixerId} (${f.reasons['invalid-params']}x)`);
    expect(
      losZahtjev,
      'zahtjev koji motor odbija sastavlja pozivatelj; popravi graditelja stavki, ne fixer',
    ).toEqual([]);
    // Anti-vakuum: tvrdnja iznad prolazi i nad praznim artefaktom, pa se trazi i stvarno mjerenje.
    expect(artefakt.fixers.some((f) => f.requested > 0)).toBe(true);
  });
});

describe('ratchet: popis mrtvih je imenovan i smije samo padati', () => {
  it('izmjereni mrtvi fixeri odgovaraju imenovanom popisu', () => {
    const mrtvi = artefakt.summary.dead.slice().sort();
    const imenovani = ratchet.dead.map((d) => d.fixerId).sort();
    expect(mrtvi, 'nov mrtav fixer ili fixer koji je ozivio; popis se azurira SVJESNO').toEqual(imenovani);
  });

  /**
   * `reason` u ratchetu nije procjena nego vrijednost koju motor sam vrati. Prvi upis je pogadjao
   * (`invalid-params` za dva fixera), a mjerenje je vratilo `no-target`; razlika je bitna, jer
   * `invalid-params` znaci prazan odabir koji ceka covjeka, a `no-target` da mete nema.
   */
  it('zapisan razlog se poklapa s onim sto je motor vratio', () => {
    for (const d of ratchet.dead) {
      const row = artefakt.fixers.find((f) => f.fixerId === d.fixerId);
      expect(row, `${d.fixerId} je na popisu mrtvih a nije ni zatrazen`).toBeTruthy();
      const izmjereni = Object.keys(row!.reasons);
      expect(izmjereni, `${d.fixerId}: ratchet tvrdi "${d.reason}", motor je vratio ${izmjereni.join('|')}`).toContain(
        d.reason,
      );
    }
  });

  it('svaki unos ima obrazlozenje, jer popis bez razloga postaje popis izgovora', () => {
    for (const d of ratchet.dead) {
      expect(d.why.length, d.fixerId).toBeGreaterThan(80);
    }
    expect(new Set(ratchet.dead.map((d) => d.fixerId)).size).toBe(ratchet.dead.length);
  });

  it('mrtav fixer je stvarno zatrazen: popis ne smije nositi fixer koji se nikad ne nudi', () => {
    for (const d of ratchet.dead) {
      const row = artefakt.fixers.find((f) => f.fixerId === d.fixerId);
      expect(row!.requested, d.fixerId).toBeGreaterThan(0);
      expect(row!.changed, d.fixerId).toBe(0);
      expect(row!.deadOn.length, d.fixerId).toBeGreaterThan(0);
    }
  });

  /**
   * PRAZAN RATCHET PROLAZI VAKUUMSKI kroz sve tvrdnje iznad, jer se svaka vrti po njegovim unosima.
   * Popis je 2026-09-08 doista ispraznjen, pa je bez ove tvrdnje cijeli ovaj describe od tog dana
   * prestao ista dokazivati. Trazi se dakle da mjerenje POSTOJI i da nijedan fixer ne bude mrtav
   * a da to nitko nije upisao.
   */
  it('prazan popis mrtvih znaci da MJERENJE nije naslo nijednog, ne da mjerenja nema', () => {
    expect(artefakt.fixers.length, 'nijedan fixer nije ni zatrazen; mreza nista ne mjeri').toBeGreaterThan(0);
    expect(artefakt.summary.dead).toEqual([]);
    expect(ratchet.dead).toEqual([]);
  });
});

/**
 * TRI STANJA, NE DVA. Fixer kojemu `params` ni na jednom dokumentu ne nose posao NIJE mrtav nego
 * ceka ljudsku potvrdu. Do 2026-09-08 je mreza ta dva stanja mijesala, pa su `consistency-fixer`
 * (24/0) i `citation-bibliography-sync-fixer` (5/0) godinama stajali na popisu mrtvih. Posljedica
 * nije bila kozmeticka: da se JEDAN OD NJIH doista pokvari, izgledalo bi tocno kao tada.
 */
describe('fixer koji ceka potvrdu nije mrtav', () => {
  it('artefakt razdvaja `dead` od `awaiting`, i skupovi se ne preklapaju', () => {
    const presjek = artefakt.summary.dead.filter((f) => artefakt.summary.awaiting.includes(f));
    expect(presjek, 'isti fixer ne moze biti i mrtav i u cekanju').toEqual([]);
    expect(artefakt.summary.awaitingCount).toBe(artefakt.summary.awaiting.length);
    expect(artefakt.summary.deadCount).toBe(artefakt.summary.dead.length);
  });

  it('svaki fixer u cekanju je zatrazen, nista nije promijenio, i SVAKI mu je zahtjev bio bez posla', () => {
    // Anti-vakuum: popis ne smije biti prazan, inace tvrdnje ispod ne mjere nista.
    expect(artefakt.summary.awaiting.length).toBeGreaterThan(0);
    for (const id of artefakt.summary.awaiting) {
      const row = artefakt.fixers.find((f) => f.fixerId === id);
      expect(row, `${id} je u cekanju a nije ni zatrazen`).toBeTruthy();
      expect(row!.changed, id).toBe(0);
      expect(row!.awaitingConfirmation, id).toBe(row!.requested);
    }
  });

  it('fixer koji je BAREM jednom dobio zahtjev s poslom a nista nije promijenio ostaje MRTAV', () => {
    const m = (dokument: string, ceka: boolean): DocumentMeasurement => ({
      dokument,
      profileId: 'p',
      paloPrije: [],
      zatrazeno: ['x'],
      promijenili: [],
      bezUcinka: [{ fixerId: 'x', reason: 'no-target' }],
      cekaPotvrdu: ceka ? ['x'] : [],
      rijeseno: [],
      nerijeseno: [],
      regresije: [],
      integrityFailure: null,
    });
    const svi = aggregateByFixer([m('a.docx', true), m('b.docx', true)]);
    expect(deadFixers(svi)).toEqual([]);
    expect(awaitingConfirmationFixers(svi)).toEqual(['x']);

    const jedan = aggregateByFixer([m('a.docx', true), m('b.docx', false)]);
    expect(deadFixers(jedan), 'jedan zahtjev s poslom vraca fixer medju mrtve').toEqual(['x']);
    expect(awaitingConfirmationFixers(jedan)).toEqual([]);
  });
});

describe('agregacija po fixeru: mehanizam se dokazuje nad podmetnutim ulazom', () => {
  const mjerenje = (dokument: string, zatrazeno: string[], promijenili: string[], razlog = 'no-target'): DocumentMeasurement => ({
    dokument,
    profileId: 'p',
    paloPrije: [],
    zatrazeno,
    promijenili,
    bezUcinka: zatrazeno.filter((f) => !promijenili.includes(f)).map((fixerId) => ({ fixerId, reason: razlog })),
    cekaPotvrdu: [],
    rijeseno: [],
    nerijeseno: [],
    regresije: [],
    integrityFailure: null,
  });

  it('fixer koji je promijenio nesto na BAREM jednom dokumentu nije mrtav', () => {
    const rows = aggregateByFixer([mjerenje('a.docx', ['x'], []), mjerenje('b.docx', ['x'], ['x'])]);
    expect(rows[0]).toMatchObject({ fixerId: 'x', requested: 2, changed: 1 });
    expect(deadFixers(rows)).toEqual([]);
    expect(rows[0].deadOn).toEqual(['a.docx']);
  });

  it('fixer bez ijedne promjene je mrtav, i razlog se zbraja po vrijednosti', () => {
    const rows = aggregateByFixer([mjerenje('a.docx', ['x'], []), mjerenje('b.docx', ['x'], [], 'already-ok')]);
    expect(deadFixers(rows)).toEqual(['x']);
    expect(rows[0].reasons).toEqual({ 'no-target': 1, 'already-ok': 1 });
  });

  it('fixer koji nikad nije zatrazen ne ulazi u mjerenje (nije ni ziv ni mrtav)', () => {
    const rows = aggregateByFixer([mjerenje('a.docx', ['x'], ['x'])]);
    expect(rows.map((r) => r.fixerId)).toEqual(['x']);
    expect(deadFixers(rows)).toEqual([]);
  });
});

/**
 * Ugovor CI posla, po uzoru na `tests/repair-slow-workflow.test.ts`.
 *
 * Bez ovoga bi uvjet "svaki put provjeri radi li fixer" ovisio o tome sjeti li se netko pokrenuti
 * mrezu. Posao mora postojati, biti read-only i zvati BAS mrezu; ime naredbe je jedini dio koji
 * stvarno mjeri, pa se tvrdi doslovno.
 */
describe('ugovor CI posla nad mrezom', () => {
  const workflow = join(ROOT, '.github', 'workflows', 'repair-net.yml');

  it('posao postoji, cita se na svaki push i zove mrezu', () => {
    const yaml = readFileSync(workflow, 'utf8');
    expect(yaml).toMatch(/name:\s*repair-net/);
    expect(yaml).toMatch(/push:/);
    expect(yaml).toMatch(/pull_request:/);
    expect(yaml).toMatch(/permissions:\s*\r?\n\s+contents:\s*read/);
    expect(yaml).toMatch(/run:\s*npm run repair-net/);
  });
});
