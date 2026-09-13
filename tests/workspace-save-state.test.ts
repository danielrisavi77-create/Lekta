import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  nextSaveState, saveStateLabel, saveStateTone, SAVE_LABELS, SAVE_STATES,
  type SaveEvent, type SaveState,
} from '../src/routes/workspace/save-state';
import { createSaveIndicator } from '../src/routes/workspace/save-indicator';
import { createSessionWriter, type SessionWriteOutcome } from '../src/session/session-writer';
import { createConfirmedProfile } from '../src/routes/workspace/confirmed-profile';
import { createRepairSelectionMemory } from '../src/routes/workspace/repair-selection';
import { createRevisions } from '../src/routes/workspace/revisions';
import { emitRepairPanelReady } from '../src/ui/analyzer-document-events';
import type { RepairPanelHandle, RepairableItem } from '../src/ui/repair-panel';
import { MemoryDocumentSessionStore } from '../src/session/indexeddb-document-session-store';
import {
  LOCAL_DOCUMENT_SCHEMA_VERSION, LOCAL_DOCUMENT_TTL_MS,
  type LocalDocumentSessionUpdate, type LocalDocumentSessionV1,
} from '../src/session/local-document-session';

/**
 * INDIKATOR SPREMANJA KOJI NE LAZE (korak C7, 2026-09-13).
 *
 * Gard nad jezgrom (`save-state.ts`), nad jedinim piscem u DOM-u (`save-indicator.ts`) i nad
 * time da STVARNI proizvodjaci ishoda (dokument, revizije, profil, odabir) u indikator ulaze
 * kroz isti dogadjaj, pa grane `quota`/`expired`/`failed` nisu sintetski vakuum.
 *
 * Mutacije su u istoj datoteci (UI gard, po uzoru na `tests/ui-module-budget.test.ts`): svaka
 * ima BASELINE (nemutiran ulaz cist), MUTACIJU (podmetnut kvar mora pasti) i SENTINEL (prazna
 * populacija ne prolazi). Mutacije NAD IZVOROM su izvedene rucno i zapisane u commit poruci;
 * ovdje su njihove kopije nad tablicom ili nad kopijom izvora, da gard grize i u CI-ju.
 */

const ROOT = resolve(__dirname, '..');
const ID = 'e2b0c7a4-1111-4222-8333-444455556666';

const written = (at = 1_700_000_000_000): SessionWriteOutcome => ({ kind: 'written', revision: 1, at });
const OUTCOMES: readonly SessionWriteOutcome[] = [
  written(), { kind: 'quota' }, { kind: 'expired' }, { kind: 'conflict' }, { kind: 'failed', reason: 'x' },
];
/** Sva cetiri razreda dogadjaja; ishodi su svih pet vrsta. */
const EVENTS: readonly SaveEvent[] = [
  { kind: 'storage-off' }, { kind: 'storage-on' }, { kind: 'queued' },
  ...OUTCOMES.map((outcome): SaveEvent => ({ kind: 'outcome', outcome })),
];

/** Korijen "sprem" bez dijakritika i velikih slova; natpis koji ga nosi tvrdi da je nesto spremljeno. */
const nosiSprem = (s: string): boolean => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('sprem');

function rucniTajmeri() {
  const zakazano: Array<() => void> = [];
  return {
    setTimeoutImpl: (fn: () => void) => { zakazano.push(fn); return zakazano.length; },
    clearTimeoutImpl: (h: unknown) => { zakazano[(h as number) - 1] = () => {}; },
  };
}

/** Lazna pohrana koja na SVAKI `update` baca zadani kod; `null` znaci uspjeh. */
function fakeStore(fail: string | null) {
  let revision = 0;
  return {
    brojaci: { update: 0 },
    async update(_id: string, _u: LocalDocumentSessionUpdate) {
      this.brojaci.update += 1;
      if (fail) throw Object.assign(new Error(fail), { code: fail });
      revision += 1;
      return { revision } as unknown as LocalDocumentSessionV1;
    },
    async get() { return { revision } as unknown as LocalDocumentSessionV1; },
  };
}

describe('save-state: tablica prijelaza', () => {
  it('CIST BASELINE: puna tablica 7 stanja x 8 dogadjaja daje ocekivane vrijednosti', () => {
    // SENTINEL: tocno sedam imenovanih stanja; prazan popis ne smije proci.
    expect(SAVE_STATES).toHaveLength(7);
    expect(EVENTS).toHaveLength(8);
    const ocekivano = (s: SaveState, e: SaveEvent): SaveState => {
      if (e.kind === 'storage-off') return 'off';
      if (e.kind === 'storage-on') return 'idle';
      if (s === 'off') return 'off';
      if (e.kind === 'queued') return 'saving';
      return ({ written: 'saved', quota: 'quota', expired: 'expired', conflict: 'failed', failed: 'failed' } as const)[e.outcome.kind];
    };
    let parova = 0;
    for (const s of SAVE_STATES) for (const e of EVENTS) {
      expect(nextSaveState(s, e), `${s} + ${JSON.stringify(e)}`).toBe(ocekivano(s, e));
      parova += 1;
    }
    expect(parova).toBe(56);
  });

  it('saved je dosezljivo SAMO iz outcome written; queued iz svakog stanja daje saving', () => {
    // SENTINEL: skup dogadjaja nad kojim se petlja mora nositi sva cetiri razreda.
    expect(new Set(EVENTS.map((e) => e.kind))).toEqual(new Set(['storage-off', 'storage-on', 'queued', 'outcome']));
    const bezWritten = EVENTS.filter((e) => !(e.kind === 'outcome' && e.outcome.kind === 'written'));
    expect(bezWritten.length).toBeGreaterThan(0);
    const krivi: string[] = [];
    for (const s of SAVE_STATES) for (const e of bezWritten) {
      if (nextSaveState(s, e) === 'saved') krivi.push(`(${s},${e.kind})`);
    }
    expect(krivi, 'saved dosegnuto bez potvrdjenog zapisa').toEqual([]);
    for (const s of SAVE_STATES.filter((x) => x !== 'off')) expect(nextSaveState(s, { kind: 'queued' })).toBe('saving');

    // MUTACIJA (kopija tablice): optimisticni indikator koji na `queued` kaze saved, tocno kvar zbog
    // kojeg korak postoji. Ista provjera ga mora prijaviti na paru (idle, queued).
    const mutiran = (s: SaveState, e: SaveEvent): SaveState => (e.kind === 'queued' && s !== 'off' ? 'saved' : nextSaveState(s, e));
    const nalazi: string[] = [];
    for (const s of SAVE_STATES) for (const e of bezWritten) if (mutiran(s, e) === 'saved') nalazi.push(`(${s},${e.kind})`);
    expect(nalazi).toContain('(idle,queued)');
  });

  it('saved NE prezivi neuspjeh: iz saved svaki neuspjeli ishod daje svoje stanje greske', () => {
    // Imenovano, ne prebrojano. `conflict` se STAPA u `failed` (odluka C7, vidi save-state.ts).
    const greske: Array<[SessionWriteOutcome, SaveState]> = [
      [{ kind: 'quota' }, 'quota'],
      [{ kind: 'expired' }, 'expired'],
      [{ kind: 'conflict' }, 'failed'],
      [{ kind: 'failed', reason: 'x' }, 'failed'],
    ];
    expect(greske.length).toBeGreaterThan(0);
    for (const [outcome, stanje] of greske) expect(nextSaveState('saved', { kind: 'outcome', outcome })).toBe(stanje);
    expect(nextSaveState('saved', { kind: 'storage-off' })).toBe('off');

    // MUTACIJA (kopija): "zadnji zapis je ipak postojao" pa conflict iz saved ostavlja saved.
    const mutiran = (s: SaveState, e: SaveEvent): SaveState =>
      (s === 'saved' && e.kind === 'outcome' && e.outcome.kind === 'conflict' ? 'saved' : nextSaveState(s, e));
    expect(mutiran('saved', { kind: 'outcome', outcome: { kind: 'conflict' } })).toBe('saved');
    expect(greske.some(([o, st]) => mutiran('saved', { kind: 'outcome', outcome: o }) !== st), 'mutacija mora pasti na tvrdnji').toBe(true);
  });

  it('off je apsorbirajuce dok ne stigne storage-on', () => {
    for (const e of EVENTS.filter((x) => x.kind !== 'storage-on')) expect(nextSaveState('off', e)).toBe('off');
    expect(nextSaveState('off', { kind: 'storage-on' })).toBe('idle');
  });
});

describe('save-state: natpisi', () => {
  it('nijedan natpis za off/quota/expired/failed ne nosi korijen sprem; saved ga MORA nositi; idle nema natpis', () => {
    // SENTINEL: prazna tablica natpisa ne prolazi.
    expect(Object.keys(SAVE_LABELS).sort()).toEqual([...SAVE_STATES].sort());
    for (const s of ['off', 'saving', 'saved', 'quota', 'expired', 'failed'] as const) {
      expect(SAVE_LABELS[s], `${s} mora imati ne-prazan natpis`).toBeTruthy();
    }
    expect(SAVE_LABELS.idle).toBeNull();
    expect(saveStateLabel('idle')).toBeNull();
    for (const s of ['off', 'quota', 'expired', 'failed'] as const) {
      expect(nosiSprem(SAVE_LABELS[s]!), `natpis za ${s} tvrdi spremanje: "${SAVE_LABELS[s]}"`).toBe(false);
    }
    expect(nosiSprem(SAVE_LABELS.saved!)).toBe(true);
    expect(saveStateLabel('saved', Date.UTC(2026, 0, 1, 10, 5))).toMatch(/^Spremljeno \d\d:\d\d$/);
    expect(saveStateLabel('expired')).toBe('Rad je istekao');
    expect(saveStateTone('failed')).toBe('warn');
    expect(saveStateTone('saved')).toBe('ok');

    // MUTACIJA (kopija tablice): failed -> "Nije spremljeno". Kratki natpis s negacijom je tocno
    // ono sto oko u prolazu procita kao "Spremljeno".
    const mutirano = { ...SAVE_LABELS, failed: 'Nije spremljeno' };
    expect(nosiSprem(mutirano.failed)).toBe(true);
    // Ista provjera kao gore, nad mutiranom tablicom, mora pasti.
    const pada = (['off', 'quota', 'expired', 'failed'] as const).some((s) => nosiSprem(mutirano[s]!));
    expect(pada).toBe(true);
  });

  it('kvota dolazi iz stvarne greske: izvor ne spominje navigator ni storage.estimate', () => {
    const src = readFileSync(resolve(ROOT, 'src', 'routes', 'workspace', 'save-state.ts'), 'utf8');
    expect(src.length, 'sentinel: prazan izvor bi lazno prosao').toBeGreaterThan(0);
    // Provjera je izvucena u funkciju da se ISTA tvrdnja pusti i nad mutiranim ulazom; tvrdnja da
    // mutant "sadrzi token" ne dokazuje nista o gardu.
    const provjera = (izvor: string) => {
      expect(izvor).not.toContain('navigator');
      expect(izvor).not.toContain('storage.estimate');
      expect(izvor, 'quota nastaje samo iz outcome.kind').toContain("case 'quota': return 'quota'");
    };
    provjera(src);
    // MUTACIJA (kopija izvora): predvidjanje kvote. Gard nad mutantom MORA pasti.
    const mutiran = src + '\nvoid navigator.storage.estimate();\n';
    expect(() => provjera(mutiran)).toThrow(/navigator/);
  });
});

describe('save-indicator: jedini pisac u DOM-u', () => {
  function dom() {
    document.body.innerHTML = '<div id="radDocBar"><span id="radDocSave" data-save-state="idle" hidden></span></div>'
      + '<p id="workspace-status" role="status" aria-live="polite" hidden></p>';
    return {
      el: document.getElementById('radDocSave') as HTMLElement,
      status: document.getElementById('workspace-status') as HTMLElement,
    };
  }

  it('mehanizam ima vlastiti brojac: 3 queued + 1 written daje queued=3, written=1, failures=0, i tek tada DOM kaze Spremljeno', () => {
    const { el } = dom();
    const ind = createSaveIndicator({ mount: () => el, now: () => 1 });
    ind.apply({ kind: 'storage-on' });
    expect(el.hidden, 'idle je skriven').toBe(true);
    for (let i = 0; i < 3; i++) expect(ind.apply({ kind: 'queued' })).toBe('saving');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Zapisujem');
    expect(el.dataset.saveState).toBe('saving');
    expect(ind.apply({ kind: 'outcome', outcome: written(Date.UTC(2026, 0, 1, 9, 30)) })).toBe('saved');
    const c = ind.counters();
    expect(c).toEqual({ queued: 3, written: 1, failures: 0 });
    // SENTINEL: written RAZLICIT OD NULE prije tvrdnje o prikazu; prikaz nije dokaz upisa.
    expect(c.written).toBeGreaterThan(0);
    expect(el.textContent).toMatch(/^Spremljeno \d\d:\d\d$/);
    expect(el.dataset.saveState).toBe('saved');
    expect(el.dataset.saveTone).toBe('ok');
    expect(el.title.length).toBeGreaterThan(0);

    // MUTACIJA (kopija): apply koji vraca stanje bez pisanja u DOM (mrtav kod). Brojac stanja bi
    // bio tocan, a tvrdnja o DOM-u mora pasti.
    const { el: el2 } = dom();
    let s: SaveState = 'idle';
    const mrtav = { apply: (e: SaveEvent) => { s = nextSaveState(s, e); return s; } };
    mrtav.apply({ kind: 'storage-on' }); mrtav.apply({ kind: 'queued' }); mrtav.apply({ kind: 'outcome', outcome: written() });
    expect(s).toBe('saved');
    expect(el2.dataset.saveState === 'saved' && /Spremljeno/.test(el2.textContent ?? ''), 'mrtav pisac mora pasti na DOM tvrdnji').toBe(false);
  });

  it('neuspjeh se broji i pise; saved ne ostaje na ekranu nakon njega', () => {
    const { el } = dom();
    const ind = createSaveIndicator({ mount: () => el });
    ind.apply({ kind: 'storage-on' });
    ind.apply({ kind: 'queued' });
    ind.apply({ kind: 'outcome', outcome: written() });
    expect(el.textContent).toMatch(/Spremljeno/);
    ind.apply({ kind: 'queued' });
    expect(ind.apply({ kind: 'outcome', outcome: { kind: 'quota' } })).toBe('quota');
    expect(el.textContent).toBe('Nema mjesta u lokalnoj pohrani');
    expect(el.dataset.saveTone).toBe('warn');
    expect(ind.counters()).toEqual({ queued: 2, written: 1, failures: 1 });
    ind.apply({ kind: 'storage-off' });
    expect(el.textContent).toBe('Bez lokalne pohrane');
    expect(el.hidden).toBe(false);
  });

  it('ziva regija se ne dira: kroz sve prijelaze #workspace-status ostaje prazan i skriven', () => {
    const { el, status } = dom();
    const ind = createSaveIndicator({ mount: () => el });
    let promjenaIndikatora = 0;
    let zadnji = el.textContent;
    for (const s of SAVE_STATES) for (const e of EVENTS) {
      // Postavi polaziste kroz dogadjaje (ne izravno), pa primijeni dogadjaj.
      ind.apply({ kind: 'storage-on' });
      if (s === 'off') ind.apply({ kind: 'storage-off' });
      else if (s !== 'idle') ind.apply(s === 'saving' ? { kind: 'queued' } : { kind: 'outcome', outcome: OUTCOMES.find((o) => nextSaveState('idle', { kind: 'outcome', outcome: o }) === s)! });
      ind.apply(e);
      if (el.textContent !== zadnji) { promjenaIndikatora += 1; zadnji = el.textContent; }
      expect(status.hidden, 'status je otkriven').toBe(true);
      expect(status.textContent).toBe('');
    }
    // SENTINEL: indikator je doista pisao (inace bi "nula dodira statusa" prolazilo i za mrtav pisac).
    expect(promjenaIndikatora).toBeGreaterThan(0);
    // MUTACIJA (kopija): pisac koji svaki prijelaz salje u status; ista tvrdnja mora pasti.
    const brbljav = (e: SaveEvent) => { const st = ind.apply(e); status.hidden = false; status.textContent = st; };
    brbljav({ kind: 'queued' });
    expect(status.hidden).toBe(false);
  });
});

describe('save-state: stvarni proizvodjaci ishoda ulaze u indikator', () => {
  /** Snimka sesije za memorijsku pohranu, s rokom od 24 h. */
  function sesija(createdAt: number): LocalDocumentSessionV1 {
    return {
      schemaVersion: LOCAL_DOCUMENT_SCHEMA_VERSION,
      id: ID,
      createdAt,
      expiresAt: createdAt + LOCAL_DOCUMENT_TTL_MS,
      document: { name: 'rad.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', lastModified: createdAt - 1, bytes: new Uint8Array([1, 2, 3]).buffer },
      intake: { kind: 'ok', quickStats: null, suspicious: false, suspicionReason: null, capability: null } as unknown as LocalDocumentSessionV1['intake'],
    };
  }

  it('ISTEK 24 h: memorijska pohrana javlja kod expired, pisac ga mapira u outcome expired, indikator kaze "Rad je istekao"', async () => {
    const T0 = Date.UTC(2026, 8, 13, 9, 0, 0);
    let sat = T0 + 1_000;
    const store = new MemoryDocumentSessionStore({ now: () => sat });
    await store.put(sesija(T0));
    // KONTROLA: prije isteka zapis prolazi (inace bi tvrdnja o isteku vrijedila i za pokvaren store).
    await expect(store.update(ID, { workspace: { stage: 'results' } })).resolves.toBeTruthy();

    sat = T0 + LOCAL_DOCUMENT_TTL_MS + 1;
    await expect(store.update(ID, { workspace: { stage: 'results' } })).rejects.toMatchObject({ code: 'expired' });

    const ishodi: SessionWriteOutcome[] = [];
    const w = createSessionWriter(ID, { store, ...rucniTajmeri(), onOutcome: (o) => ishodi.push(o) });
    w.enqueue({ workspace: { stage: 'results' } });
    const out = await w.flush();
    expect(out).toEqual({ kind: 'expired' });
    expect(ishodi).toEqual([{ kind: 'expired' }]);

    const el = document.createElement('span');
    const ind = createSaveIndicator({ mount: () => el });
    ind.apply({ kind: 'storage-on' });
    ind.apply({ kind: 'queued' });
    expect(ind.apply({ kind: 'outcome', outcome: out! })).toBe('expired');
    expect(el.textContent).toBe('Rad je istekao');
    expect(nosiSprem(el.textContent ?? '')).toBe(false);
  });

  it('profil (C4): queued pri predaji pisacu, outcome written nakon upisa; quota i failed dolaze kao svoje stanje', async () => {
    for (const [fail, stanje] of [[null, 'saved'], ['quota', 'quota'], ['transaction', 'failed'], ['expired', 'expired']] as const) {
      const el = document.createElement('span');
      const ind = createSaveIndicator({ mount: () => el });
      ind.apply({ kind: 'storage-on' });
      const store = fakeStore(fail);
      const dogadjaji: SaveEvent[] = [];
      const t = rucniTajmeri();
      const profil = createConfirmedProfile({
        store: () => store as never, sessionId: () => ID, apply: () => null, status: () => {},
        ...t, onSaveEvent: (e) => { dogadjaji.push(e); ind.apply(e); },
      });
      profil.onConfirmed({ profileDefinitionId: 'fpzg-politologija-diplomski', selectionIds: { unit: 'fpzg' }, confirmedAt: 5 });
      expect(dogadjaji.map((e) => e.kind)).toEqual(['queued']);
      expect(ind.state()).toBe('saving');
      await profil.flush();
      expect(store.brojaci.update, 'sentinel: pohrana je doista pozvana').toBe(1);
      expect(dogadjaji.map((e) => e.kind)).toEqual(['queued', 'outcome']);
      expect(ind.state(), `fail=${fail}`).toBe(stanje);
      expect(profil.state.claimedSaved).toBe(stanje === 'saved');
    }
  });

  it('odabir (C6): promjena kroz handle daje queued pa outcome', async () => {
    const items: RepairableItem[] = [{ ruleId: 'a', fixerId: 'font-fixer', label: 'a', params: {}, violated: true }];
    const sel = new Set(['a']);
    const listeners = new Set<() => void>();
    const handle: RepairPanelHandle = {
      applySelection: (ids) => { sel.clear(); for (const i of ids) sel.add(i); return sel.size; },
      selectedRuleIds: () => [...sel],
      phase: () => 'ready',
      onSelectionChange: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
      deep: () => null, setDeep: () => false, dispose: () => listeners.clear(),
    };
    const el = document.createElement('span');
    const ind = createSaveIndicator({ mount: () => el });
    ind.apply({ kind: 'storage-on' });
    const store = fakeStore(null);
    const dogadjaji: SaveEvent[] = [];
    const odabir = createRepairSelectionMemory({
      store: () => store as never, sessionId: () => ID, status: () => {}, ...rucniTajmeri(),
      onSaveEvent: (e) => { dogadjaji.push(e); ind.apply(e); },
    });
    emitRepairPanelReady({ handle, items } as never);
    odabir.onPanel({ handle, items } as never);
    sel.delete('a'); for (const cb of listeners) cb();
    expect(dogadjaji.map((e) => e.kind)).toEqual(['queued']);
    expect(el.textContent).toBe('Zapisujem');
    await odabir.flush();
    expect(store.brojaci.update).toBe(1);
    expect(ind.state()).toBe('saved');
    expect(odabir.state.writes).toBe(1);
  });

  it('revizije (T12): izravni store.update prijavljuje queued i outcome iz koda greske', async () => {
    for (const [fail, stanje] of [[null, 'saved'], ['quota', 'quota'], ['expired', 'expired'], ['conflict', 'failed']] as const) {
      const el = document.createElement('span');
      const ind = createSaveIndicator({ mount: () => el });
      ind.apply({ kind: 'storage-on' });
      const store = fakeStore(fail);
      const statusi: Array<string | null> = [];
      const r = createRevisions({
        store: () => store as never, sessionId: () => ID, mount: () => null, esc: (v) => v,
        status: (t) => statusi.push(t), onSaveEvent: ind.apply,
      });
      r.onResult({ version: '2', generatedAt: '2026-09-13T00:00:00.000Z', checks: [], documentStructure: { title: 'T', author: 'A', headings: [] }, details: {} }, 1);
      await new Promise((res) => setTimeout(res, 0));
      expect(store.brojaci.update).toBe(1);
      expect(ind.state(), `fail=${fail}`).toBe(stanje);
      // Jednokratna obavijest revizija ostaje SVOJ glas (ne mijenja se u C7), a indikator ne dira status.
      expect(statusi.length).toBe(fail ? 1 : 0);
    }
  });
});

describe('C7: ozicenje u ruti i zaglavlju (tekstualni gardovi nad izvorom)', () => {
  const main = readFileSync(resolve(ROOT, 'src', 'routes', 'workspace', 'main.ts'), 'utf8');

  it('main.ts: indikator postoji, sva tri modula dobivaju onSaveEvent, dokument salje queued i outcome', () => {
    expect(main.length).toBeGreaterThan(0);
    expect(main).toContain("createSaveIndicator({ mount: () => document.getElementById('radDocSave') })");
    expect((main.match(/onSaveEvent: indikator\.apply/g) ?? []).length, 'revisions, profil i odabir').toBe(3);
    expect(main).toContain("indikator.apply({ kind: 'queued' });");
    expect(main).toContain("kind: 'storage-off'");
  });

  it('main.ts: pagehide prazni OBA pisca (profil i odabir)', () => {
    const i = main.indexOf("addEventListener('pagehide'");
    expect(i, 'gard je oslijepio: nema pagehide slusaca').toBeGreaterThanOrEqual(0);
    const redak = main.slice(i, main.indexOf('\n', i));
    const provjera = (r: string) => {
      expect(r).toContain('profil.flush()');
      expect(r).toContain('odabir.flush()');
    };
    provjera(redak);
    // MUTACIJA (kopija izvora): slusac koji prazni samo profil. Gard nad mutantom MORA pasti.
    const mutiran = redak.replace('void odabir.flush();', '');
    expect(mutiran, 'sentinel: zamjena mora pogoditi, inace je mutant jednak izvoru').not.toBe(redak);
    expect(() => provjera(mutiran)).toThrow(/odabir\.flush/);
  });
});
