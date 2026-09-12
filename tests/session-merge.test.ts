import { describe, expect, it } from 'vitest';
import { mergeSessionWork, type SessionWork } from '../src/session/session-merge';
import {
  REPAIR_SELECTION_SCHEMA_VERSION, STORED_ANALYSIS_SCHEMA_VERSION,
  type ConfirmedProfileSnapshot, type LocalWorkspaceSnapshot, type RepairSelectionSnapshot,
} from '../src/session/local-document-session';

/**
 * SPAJANJE RADA (korak C1, 2026-09-12).
 *
 * Gard ne mjeri da se polja prepisuju, nego jedno pravilo koje bi bez njega otislo tiho: "zadnji
 * pobjedjuje" nad CIJELIM objektom brise tudji rad. Tko god zapise drugi, njegov profil pregazi
 * analizu koju nije ni vidio.
 */

const profil = (confirmedAt: number, id = 'fpzg-diplomski'): ConfirmedProfileSnapshot => ({
  profileDefinitionId: id, selectionIds: { unit: 'fpzg' }, confirmedAt,
});

const analiza = (createdAt: number): LocalWorkspaceSnapshot['analysis'] => ({
  schemaVersion: STORED_ANALYSIS_SCHEMA_VERSION, createdAt, payload: { score: createdAt },
});

const odabir = (updatedAt: number, itemsDigest: string, selected: string[]): RepairSelectionSnapshot => ({
  schemaVersion: REPAIR_SELECTION_SCHEMA_VERSION, itemsDigest, selected, deep: false, updatedAt,
});

const rad = (w: Partial<LocalWorkspaceSnapshot> & { stage?: LocalWorkspaceSnapshot['stage'] } = {}): SessionWork => ({
  workspace: { stage: 'results', ...w },
});

describe('spajanje rada iz dvije kartice', () => {
  it('profil: pobjedjuje novija odluka, bez obzira tko pise drugi', () => {
    expect(mergeSessionWork({ profile: profil(200) }, { profile: profil(100, 'stariji') }).profile?.confirmedAt)
      .toBe(200);
    expect(mergeSessionWork({ profile: profil(100) }, { profile: profil(200) }).profile?.confirmedAt)
      .toBe(200);
  });

  /**
   * OVO JE KVAR ZBOG KOJEG MODUL POSTOJI. Kartica koja zapise profil ne smije obrisati analizu
   * koju je druga upravo dovrsila; obje su korisnikov rad nad istim dokumentom.
   */
  it('zapis profila NE BRISE tudju analizu, ni obrnuto', () => {
    const base: SessionWork = { workspace: { stage: 'results', analysis: analiza(500) } };
    const patch: SessionWork = { profile: profil(600) };
    const out = mergeSessionWork(base, patch);
    expect(out.profile?.confirmedAt).toBe(600);
    expect(out.workspace?.analysis?.createdAt, 'analiza je nestala pri zapisu profila').toBe(500);
  });

  it('analiza: pobjedjuje novija', () => {
    const out = mergeSessionWork(rad({ analysis: analiza(100) }), rad({ analysis: analiza(300) }));
    expect(out.workspace?.analysis?.createdAt).toBe(300);
    const obrnuto = mergeSessionWork(rad({ analysis: analiza(300) }), rad({ analysis: analiza(100) }));
    expect(obrnuto.workspace?.analysis?.createdAt).toBe(300);
  });

  it('stage prati karticu koja pise, jer opisuje sto korisnik GLEDA', () => {
    const out = mergeSessionWork(rad({ stage: 'results' }), rad({ stage: 'repairPlan' }));
    expect(out.workspace?.stage).toBe('repairPlan');
  });

  it('odabir: nad ISTIM popisom pobjedjuje noviji', () => {
    const out = mergeSessionWork(
      rad({ repairSelection: odabir(100, 'D1', ['a|1']) }),
      rad({ repairSelection: odabir(200, 'D1', ['a|1', 'b|2']) }),
    );
    expect(out.workspace?.repairSelection?.selected).toEqual(['a|1', 'b|2']);
    const stariji = mergeSessionWork(
      rad({ repairSelection: odabir(200, 'D1', ['a|1', 'b|2']) }),
      rad({ repairSelection: odabir(100, 'D1', ['a|1']) }),
    );
    expect(stariji.workspace?.repairSelection?.selected, 'stariji odabir ne smije pregaziti noviji')
      .toEqual(['a|1', 'b|2']);
  });

  /**
   * Otisak je jedino sto razlikuje "isti popis, drugo vrijeme" od "drugi popis". Bez njega bi se
   * odabir preslikao na kljuceve koji slucajno postoje i u drugom popisu, pa bi korisnik dobio
   * oznaceno ono sto nije birao.
   */
  it('odabir nad DRUGIM popisom se ne mijesa s ovim', () => {
    const out = mergeSessionWork(
      rad({ repairSelection: odabir(900, 'STARI', ['a|1', 'b|2', 'c|3']) }),
      rad({ repairSelection: odabir(100, 'NOVI', ['a|1']) }),
    );
    expect(out.workspace?.repairSelection?.itemsDigest, 'vrijedi popis koji korisnik gleda').toBe('NOVI');
    expect(out.workspace?.repairSelection?.selected).toEqual(['a|1']);
  });

  it('prazna strana ne brise punu', () => {
    const pun: SessionWork = { profile: profil(1), workspace: { stage: 'results', analysis: analiza(1) } };
    expect(mergeSessionWork(pun, {})).toEqual(pun);
    expect(mergeSessionWork({}, pun)).toEqual(pun);
    expect(mergeSessionWork({}, {})).toEqual({});
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno ono protiv cega modul postoji.
   */
  it('gard grize: "zadnji pobjedjuje" nad cijelim objektom gubi rad', () => {
    const base: SessionWork = { workspace: { stage: 'results', analysis: analiza(500) } };
    const patch: SessionWork = { profile: profil(600) };

    const naivno = { ...base, ...patch };
    expect(naivno.workspace?.analysis, 'baseline: naivno spajanje objekata cuva workspace').toBeTruthy();

    // Stvaran oblik kvara: patch koji nosi SVOJ workspace bez analize.
    const patchSWorkspaceom: SessionWork = { profile: profil(600), workspace: { stage: 'profile' } };
    const naivno2 = { ...base, ...patchSWorkspaceom };
    expect(naivno2.workspace?.analysis, 'podmetnuto naivno spajanje MORA izgubiti analizu').toBeUndefined();
    expect(mergeSessionWork(base, patchSWorkspaceom).workspace?.analysis?.createdAt, 'spajanje je cuva').toBe(500);
  });

  it('SENTINEL: spajanje ne mutira ulaze', () => {
    const base: SessionWork = { profile: profil(1), workspace: { stage: 'results', analysis: analiza(1) } };
    const patch: SessionWork = { profile: profil(2), workspace: { stage: 'repairPlan' } };
    const kopijaBase = JSON.stringify(base);
    const kopijaPatch = JSON.stringify(patch);
    mergeSessionWork(base, patch);
    expect(JSON.stringify(base)).toBe(kopijaBase);
    expect(JSON.stringify(patch)).toBe(kopijaPatch);
  });
});
