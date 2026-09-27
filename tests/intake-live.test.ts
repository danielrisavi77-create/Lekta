/**
 * Z32: ULAZ KAO ZIVI LIST (ALIGNMENT, varijanta B).
 *
 * Cetiri razine, odvojeno:
 *   1. CISTE FUNKCIJE: dani do roka, tekst pecata, vrata ubacivanja, predodabir fakulteta i
 *      vezanje potvrde za sesiju. Bez DOM-a, tablicom slucajeva.
 *   2. POHRANA: rok i potvrda kroz sigurne omotace; drugi upis iste vrijednosti je no-op, a
 *      nepoznati kljucevi zapisa prezive upis.
 *   3. DOM nad STVARNIM `index.html`: vrata, pribor, pecati, ime datoteke i veza s kontrolerom.
 *   4. OZICENJE I REDOSLIJED nad izvorom (`main.ts` obje rute, CSS, ui-boot), s gardovima iz
 *      `tests/helpers/intake-live-guards.ts`; njihove mutacije su u `tests/gate-mutations.test.ts`.
 *
 * Citanje s diska normalizira CR (CLAUDE.md, "Verifikacijska disciplina").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  danaDoRoka, daniRijecju, normalizirajRok, pecatRoka, razloziDatum, rokOdlucen,
} from '../src/routes/intake/deadline-stamp';
import {
  potvrdaNosiCijeliProfil, potvrdaVrijediZaSesiju, potvrdaZaSesiju, predodabirFakulteta, procitajIzborUlaza,
  rokZaPovratak, rokZaSesiju, spremnostUlaza, veziPotvrduZaSesiju, veziRokZaSesiju, zapisiPotvrdu, zapisiRok,
  type PotvrdaUlaza,
} from '../src/shared/intake-choice';
import { safeStorageSet, STORAGE_KEYS } from '../src/shared/browser-storage';
import { izvorFakulteta, mountIntakeLive, PORUKA_ODBIJENO, tekstPecataProvjere } from '../src/routes/intake/intake-live';
import { mountIntakeController } from '../src/routes/intake/intake-controller';
import { odabirFakulteta, primijeniPotvrduUlaza } from '../src/routes/workspace/intake-confirmation';
import { detekcijaSmije, napomenaDrugiFakultet, potvrdjenFakultet, zakljucajFakultet } from '../src/ui/confirmed-faculty';
import { emitAnalyzerDocumentSettled } from '../src/ui/analyzer-document-events';
import type { SelectionIds } from '../src/ui/profile-selection-ids';
import {
  cijeliProfilProblemi, detekcijaFakultetaProblemi, ispustanjeProblemi, ozicenjeUlazaProblemi, pecatRokaProblemi,
  pokretProblemi, potvrdaSesijeProblemi, povratakRokaProblemi, redoslijedPotvrdeProblemi, vrataProblemi,
} from './helpers/intake-live-guards';

const ROOT = resolve(__dirname, '..');

/**
 * Cista pohrana izmedju testova. `localStorage.clear()` NIJE dovoljan: sigurni omotac pamti i
 * zamjensku kopiju u memoriji kartice (`SESSION_MEMORY`, za preglednike koji pohranu odbiju) i na
 * prazan `localStorage` vraca nju. Upis `null` kroz isti omotac prazni obje.
 */
function ocistiPohranu(): void {
  safeStorageSet(STORAGE_KEYS.intake, null);
  safeStorageSet(STORAGE_KEYS.preferences, null);
  localStorage.clear();
}
const read = (f: string): string => readFileSync(resolve(ROOT, f), 'utf8').replace(/\r/g, '');
const HTML = read('index.html');

describe('Z32 rok: dani do roka i tekst pecata', () => {
  it('dani se broje po KALENDARU, i preko prijelaza na zimsko i ljetno vrijeme', () => {
    expect(danaDoRoka('2026-10-15', new Date(2026, 8, 23, 12))).toBe(22);
    expect(danaDoRoka('2026-09-23', new Date(2026, 8, 23, 23, 59))).toBe(0);
    expect(danaDoRoka('2026-09-22', new Date(2026, 8, 23, 0, 1))).toBe(-1);
    expect(danaDoRoka('2026-10-26', new Date(2026, 9, 24, 23, 30))).toBe(2);
    expect(danaDoRoka('2026-03-30', new Date(2026, 2, 28, 0, 5))).toBe(2);
    expect(danaDoRoka('2027-01-02', new Date(2026, 11, 31, 18))).toBe(2);
  });

  it('nevaljan datum nije rok: ni prelijevanje, ni pogresan oblik', () => {
    for (const x of ['2026-02-30', '2026-13-01', '15.10.2026', '', '2026-1-5']) {
      expect(razloziDatum(x), x).toBeNull();
      expect(danaDoRoka(x, new Date(2026, 8, 23)), x).toBeNull();
    }
    expect(razloziDatum('2028-02-29')).toEqual({ godina: 2028, mjesec: 2, dan: 29 });
  });

  it('hrvatska sklonidba uz broj dana', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 101, 111].map(daniRijecju))
      .toEqual(['1 dan', '2 dana', '5 dana', '11 dana', '12 dana', '21 dan', '22 dana', '101 dan', '111 dana']);
  });

  it('BASELINE garda pecata: stvarna funkcija prolazi sve poznate slucajeve', () => {
    expect(pecatRokaProblemi(pecatRoka)).toEqual([]);
  });

  it('"Još ne znam rok" pobjeduje zaostali datum i odlucuje o roku', () => {
    expect(pecatRoka({ datum: '2026-10-15', neznam: true }, new Date(2026, 8, 23))).toBe('Rok nije zadan');
    expect(rokOdlucen({ datum: null, neznam: true })).toBe(true);
    expect(rokOdlucen({ datum: null, neznam: false })).toBe(false);
    expect(rokOdlucen({ datum: '2026-02-30', neznam: false })).toBe(false);
  });

  it('normalizacija iz pohrane: sve sto nije ocekivani oblik je prazno stanje', () => {
    for (const x of [null, 'rok', 7, [], { datum: 15 }, { datum: '2026-02-30' }]) {
      expect(normalizirajRok(x)).toEqual({ datum: null, neznam: false });
    }
    expect(normalizirajRok({ datum: '2026-10-15', neznam: true })).toEqual({ datum: null, neznam: true });
    expect(normalizirajRok({ datum: '2026-10-15' })).toEqual({ datum: '2026-10-15', neznam: false });
  });
});

describe('Z32 vrata ubacivanja', () => {
  it('BASELINE garda: stvarna funkcija prolazi cijelu tablicu', () => {
    expect(vrataProblemi(spremnostUlaza)).toEqual([]);
  });

  it('fakultet NIJE uvjet: natpis spominje samo rok, a rok ili "Još ne znam rok" otvara vrata', () => {
    expect(spremnostUlaza({ rok: { datum: null, neznam: false } })).toEqual({ spremno: false, natpis: 'Prvo potvrdi rok' });
    expect(spremnostUlaza({ rok: { datum: null, neznam: true } })).toEqual({ spremno: true, natpis: 'ili ispusti dokument ovdje' });
    expect(spremnostUlaza({ rok: { datum: '2026-10-15', neznam: false } }).spremno).toBe(true);
  });

  it('istekao rok iz proslog posjeta se ne vraca; rok danas i "Još ne znam rok" se vracaju', () => {
    expect(povratakRokaProblemi(rokZaPovratak)).toEqual([]);
  });
});

describe('Z32 pecat provjere', () => {
  it('"Čeka provjeru" dok ulaz ne cita, "Čitam" dok cita; ocjene na ulazu nema', () => {
    expect(['idle', 'error', 'memory-only', undefined].map(tekstPecataProvjere)).toEqual(Array(4).fill('Čeka provjeru'));
    expect(['checking', 'saving', 'ready'].map(tekstPecataProvjere)).toEqual(Array(3).fill('Čitam'));
  });
});

describe('Z32 predodabir fakulteta', () => {
  const postavke = { unit: 'fpzg', program: 'Politologija', workType: 'graduate' };

  it('iz postavki: kratica, studij i razina, isti izvor kao plocica u traci', () => {
    expect(predodabirFakulteta('', postavke)).toEqual({
      unit: 'fpzg', program: 'Politologija', workType: 'graduate', izvor: 'postavke',
      natpis: 'FPZG · Politologija · Dipl.', kratko: 'FPZG · Dipl.',
    });
  });

  it('izricit ?unit= pobjeduje postavke i NE preuzima studij iz njih', () => {
    const p = predodabirFakulteta('?unit=efzg&work=zavrsni&utm_source=x', postavke);
    expect(p).toMatchObject({ unit: 'efzg', program: null, workType: 'final', izvor: 'url', natpis: 'EFZG · Zavr.' });
    // Nepoznata jedinica u linku ne pobjeduje: pada se na postavke, ne na pogadjanje.
    expect(predodabirFakulteta('?unit=nepostoji', postavke)?.unit).toBe('fpzg');
  });

  it('bez ikakvog izvora nema predodabira', () => {
    expect(predodabirFakulteta('', null)).toBeNull();
    expect(predodabirFakulteta('', { unit: 'nepostoji' })).toBeNull();
    expect(predodabirFakulteta('', 'smece')).toBeNull();
  });
});

describe('Z32 pohrana izbora na ulazu', () => {
  beforeEach(ocistiPohranu);

  it('drugi upis istog roka je NO-OP, a nepoznati kljucevi zapisa prezive upis', () => {
    localStorage.setItem(STORAGE_KEYS.intake, JSON.stringify({ z34: { biljeska: 'ostaje' } }));
    expect(zapisiRok({ datum: '2026-10-15', neznam: false })).toBe(true);
    const prvi = localStorage.getItem(STORAGE_KEYS.intake);
    expect(zapisiRok({ datum: '2026-10-15', neznam: false }), 'drugi prolaz nije no-op').toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.intake)).toBe(prvi);
    expect(JSON.parse(prvi!).z34).toEqual({ biljeska: 'ostaje' });
    expect(procitajIzborUlaza().rok).toEqual({ datum: '2026-10-15', neznam: false });
  });

  it('pokvaren zapis ne baca nego daje prazan izbor', () => {
    localStorage.setItem(STORAGE_KEYS.intake, '{ovo nije json');
    expect(procitajIzborUlaza()).toEqual({ rok: { datum: null, neznam: false }, potvrda: null });
  });

  it('rok se veze za sesiju: Z34 i Z36 citaju rok TOG rada, drugi upis je no-op', () => {
    expect(rokZaSesiju('s-1')).toBeNull();
    expect(veziRokZaSesiju('s-1', { datum: '2026-10-15', neznam: false })).toBe(true);
    const prvi = localStorage.getItem(STORAGE_KEYS.intake);
    expect(veziRokZaSesiju('s-1', { datum: '2026-10-15', neznam: false }), 'drugi prolaz nije no-op').toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.intake)).toBe(prvi);
    expect(rokZaSesiju('s-1')).toEqual({ datum: '2026-10-15', neznam: false });
    expect(rokZaSesiju('s-2'), 'rok drugog rada').toBeNull();
    // Novi rok na ulazu (sljedeci rad) ne mijenja rok vec ubacenog rada.
    zapisiRok({ datum: null, neznam: true });
    expect(rokZaSesiju('s-1')).toEqual({ datum: '2026-10-15', neznam: false });
  });

  it('potvrda se veze za sesiju tek kad postoji; bez potvrde nema sto vezati', () => {
    expect(veziPotvrduZaSesiju('s-1')).toBe(false);
    zapisiPotvrdu({ unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: null, at: 5 });
    expect(veziPotvrduZaSesiju('s-1')).toBe(true);
    expect(veziPotvrduZaSesiju('s-1'), 'drugi prolaz nije no-op').toBe(false);
    expect(procitajIzborUlaza().potvrda?.sesija).toBe('s-1');
  });

  it('nalaz pregleda Z32: DVIJE SESIJE - S1 zadrzava svoj rok i potvrdu i nakon sto je S2 vezan', () => {
    // Rad 1 (S1): fakultet FER, rok 15. 10.
    zapisiRok({ datum: '2026-10-15', neznam: false });
    zapisiPotvrdu({ unit: 'fer', program: null, workType: null, sesija: null, at: 1 });
    veziRokZaSesiju('s-1', { datum: '2026-10-15', neznam: false });
    veziPotvrduZaSesiju('s-1');
    expect(rokZaSesiju('s-1')).toEqual({ datum: '2026-10-15', neznam: false });
    expect(potvrdaZaSesiju('s-1')).toMatchObject({ unit: 'fer', sesija: 's-1' });
    // Rad 2 (S2), na istom ulazu: drugi fakultet i drugi rok, pa novi klik "Potvrdi".
    zapisiRok({ datum: '2026-11-01', neznam: false });
    zapisiPotvrdu({ unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: null, at: 2 });
    veziRokZaSesiju('s-2', { datum: '2026-11-01', neznam: false });
    veziPotvrduZaSesiju('s-2');
    // /rad/#session=S1 nakon rada S2 i dalje cita FER i rok od S1, ne od S2.
    expect(rokZaSesiju('s-1'), 'rok S1 nije pregazen radom S2').toEqual({ datum: '2026-10-15', neznam: false });
    expect(potvrdaZaSesiju('s-1'), 'potvrda S1 nije pregazena radom S2').toMatchObject({ unit: 'fer', sesija: 's-1' });
    expect(rokZaSesiju('s-2')).toEqual({ datum: '2026-11-01', neznam: false });
    expect(potvrdaZaSesiju('s-2')).toMatchObject({ unit: 'fpzg', sesija: 's-2' });
  });
});

describe('Z32 potvrda na /rad/', () => {
  beforeEach(ocistiPohranu);
  const potvrda: PotvrdaUlaza = { unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: 's-1', at: 42 };
  const obrazac: SelectionIds = {
    institution: 'unizg', unit: 'fpzg', program: 'Politologija', workType: 'graduate',
    variant: 'default', department: 'general', methodology: 'auto', citation: 'apa7',
  };
  const rok = { datum: null, neznam: true };

  it('vrijedi SAMO za svoju sesiju i bez vlastitog profila sesije, i BEZ studija (?unit=)', () => {
    const s = { id: 's-1', imaProfil: false };
    expect(potvrdaVrijediZaSesiju(potvrda, s)).toBe(true);
    expect(potvrdaVrijediZaSesiju({ ...potvrda, program: null, workType: null }, s), 'fakultet iz linka, bez studija').toBe(true);
    expect(potvrdaVrijediZaSesiju(potvrda, { id: 's-2', imaProfil: false }), 'tudja sesija').toBe(false);
    expect(potvrdaVrijediZaSesiju(potvrda, { id: 's-1', imaProfil: true }), 'sesija vec ima profil').toBe(false);
    expect(potvrdaVrijediZaSesiju(null, s)).toBe(false);
  });

  it('cijeli profil samo uz studij i isti obrazac', () => {
    expect(potvrdaNosiCijeliProfil(potvrda, obrazac)).toBe(true);
    expect(potvrdaNosiCijeliProfil({ ...potvrda, program: null }, obrazac), 'bez studija (link)').toBe(false);
    expect(potvrdaNosiCijeliProfil(potvrda, { ...obrazac, program: 'Novinarstvo' }), 'drugi studij').toBe(false);
    expect(potvrdaNosiCijeliProfil(potvrda, { ...obrazac, workType: 'final' }), 'druga razina').toBe(false);
  });

  it('BASELINE gardova: vezanje za sesiju i cijeli profil', () => {
    expect(potvrdaSesijeProblemi(potvrdaVrijediZaSesiju)).toEqual([]);
    expect(cijeliProfilProblemi(potvrdaNosiCijeliProfil)).toEqual([]);
  });

  it('cijeli profil ide ISTIM putem kao obnova sesije: apply pa confirm sa snimkom', () => {
    const apply = vi.fn(() => 'fpzg-politologija-diplomski');
    const applyFaculty = vi.fn(() => true);
    const confirm = vi.fn();
    const ishod = primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => obrazac, apply, applyFaculty, confirm,
      read: () => ({ rok, potvrda }),
    });
    expect(ishod).toBe('applied');
    expect(apply).toHaveBeenCalledWith({ ...obrazac });
    expect(applyFaculty).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith({ profileDefinitionId: 'fpzg-politologija-diplomski', selectionIds: obrazac, confirmedAt: 42 });
  });

  it('fakultet potvrdjen BEZ studija (?unit=) primijeni se kao potvrdjen fakultet; studij ostaje detekciji', () => {
    // Nalaz pregleda: prva izvedba ovu potvrdu odbijala (`program=null`), pa je `/rad/` fakultet
    // pitao ponovo i detekcija ga je smjela promijeniti.
    const apply = vi.fn(() => 'x');
    const applyFaculty = vi.fn(() => true);
    const confirm = vi.fn();
    const ishod = primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => obrazac, apply, applyFaculty, confirm,
      read: () => ({ rok, potvrda: { unit: 'fer', program: null, workType: null, sesija: 's-1', at: 7 } }),
    });
    expect(ishod).toBe('faculty');
    expect(applyFaculty).toHaveBeenCalledWith({ institution: 'unizg', unit: 'fer' });
    expect(apply, 'bez studija nema potvrdjenog profila').not.toHaveBeenCalled();
    expect(confirm, 'bez studija nema snimke profila').not.toHaveBeenCalled();
    // Studij iz postavki koji obrazac nije prihvatio (drugi u obrascu): isto samo fakultet.
    applyFaculty.mockClear();
    expect(primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => ({ ...obrazac, program: 'Novinarstvo' }), apply, applyFaculty, confirm,
      read: () => ({ rok, potvrda }),
    })).toBe('faculty');
    expect(applyFaculty).toHaveBeenCalledWith({ institution: 'unizg', unit: 'fpzg', workType: 'graduate' });
    expect(odabirFakulteta({ unit: 'nepostoji', workType: null }), 'nepoznata jedinica').toBeNull();
  });

  it('bez vazece potvrde /rad/ ostaje netaknut; nerazrijesen profil se ne zapisuje', () => {
    const apply = vi.fn(() => null);
    const applyFaculty = vi.fn(() => false);
    const confirm = vi.fn();
    const base = { sessionHasProfile: false, readForm: () => obrazac, apply, applyFaculty, confirm };
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-2', read: () => ({ rok, potvrda }) })).toBe('none');
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', read: () => ({ rok, potvrda: null }) })).toBe('none');
    expect(apply).not.toHaveBeenCalled();
    expect(applyFaculty).not.toHaveBeenCalled();
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', read: () => ({ rok, potvrda }) })).toBe('unresolved');
    expect(confirm).not.toHaveBeenCalled();
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', readForm: () => { throw new Error('nema obrasca'); }, read: () => ({ rok, potvrda }) })).toBe('none');
    // Fakultet koji obrazac ne prihvati, ili ga nema u katalogu: nista potvrdjeno.
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', read: () => ({ rok, potvrda: { ...potvrda, program: null } }) })).toBe('none');
    applyFaculty.mockClear();
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', read: () => ({ rok, potvrda: { ...potvrda, unit: 'nepostoji', program: null } }) })).toBe('none');
    expect(applyFaculty).not.toHaveBeenCalled();
  });

  it('kraj do kraja preko STVARNE pohrane: /rad/#session=S1 primjenjuje FER i nakon sto je S2 potvrdio FPZG', () => {
    // Rad 1 (S1) na ulazu: potvrdjen FER, bez studija (?unit=), pa vezan za sesiju S1.
    zapisiPotvrdu({ unit: 'fer', program: null, workType: null, sesija: null, at: 1 });
    veziPotvrduZaSesiju('s-1');
    // Rad 2 (S2) na ISTOM ulazu: novi klik "Potvrdi" pregazi tekuci slot potvrdom FPZG, vezan za S2.
    zapisiPotvrdu({ unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: null, at: 2 });
    veziPotvrduZaSesiju('s-2');
    const applyFacultyS1 = vi.fn(() => true);
    const applyFacultyS2 = vi.fn(() => true);
    // /rad/#session=S1: citanje ide STVARNIM putem primijeniPotvrduUlaza (bez `read` mocka), pa
    // mora vratiti FER, ne FPZG od S2 koji je pregazio tekuci slot.
    expect(primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => obrazac, apply: vi.fn(), applyFaculty: applyFacultyS1, confirm: vi.fn(),
    })).toBe('faculty');
    expect(applyFacultyS1).toHaveBeenCalledWith({ institution: 'unizg', unit: 'fer' });
    // /rad/#session=S2 i dalje ispravno primjenjuje FPZG (cijeli profil, jer S2 nosi studij).
    expect(primijeniPotvrduUlaza({
      sessionId: 's-2', sessionHasProfile: false, readForm: () => obrazac,
      apply: vi.fn(() => 'fpzg-politologija-diplomski'), applyFaculty: applyFacultyS2, confirm: vi.fn(),
    })).toBe('applied');
  });

  it('STARA pohrana (jos bez zapisa u mapi po sesiji): stari jedini slot vrijedi za svoju sesiju', () => {
    // Simulira zapis prije Z32 popravka: `potvrdaSesije` mapa je prazna, samo tekuci slot postoji.
    zapisiPotvrdu({ unit: 'fer', program: null, workType: null, sesija: 's-1', at: 9 });
    expect(potvrdaZaSesiju('s-1'), 'mapa jos nema zapis').toBeNull();
    const applyFaculty = vi.fn(() => true);
    expect(primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => obrazac, apply: vi.fn(), applyFaculty, confirm: vi.fn(),
    })).toBe('faculty');
    expect(applyFaculty).toHaveBeenCalledWith({ institution: 'unizg', unit: 'fer' });
    // Za drugu sesiju stari slot ne vrijedi.
    expect(primijeniPotvrduUlaza({
      sessionId: 's-2', sessionHasProfile: false, readForm: () => obrazac, apply: vi.fn(), applyFaculty: vi.fn(), confirm: vi.fn(),
    })).toBe('none');
  });
});

describe('Z32 fakultet potvrdjen na ulazu, na /rad/ (src/ui/confirmed-faculty.ts)', () => {
  afterEach(() => { zakljucajFakultet(undefined, undefined); });

  it('brava samo kad je obrazac prihvatio jedinicu; detekcija drugog fakulteta se odbija uz znacku', () => {
    document.body.innerHTML = '<div id="detectBadge" class="hidden"></div>';
    expect(zakljucajFakultet('fer', 'fpzg'), 'obrazac nije prihvatio').toBe(false);
    expect(detekcijaSmije('fpzg')).toBe(true);
    expect(zakljucajFakultet('fer', 'fer')).toBe(true);
    expect(detekcijaSmije('fer'), 'isti fakultet: detekcija smije (studij)').toBe(true);
    expect(document.getElementById('detectBadge')!.classList.contains('hidden')).toBe(true);
    expect(detekcijaSmije('fpzg'), 'drugi fakultet').toBe(false);
    const znacka = document.getElementById('detectBadge')!;
    expect(znacka.classList.contains('hidden')).toBe(false);
    expect(znacka.textContent).toContain(napomenaDrugiFakultet('fpzg', 'fer'));
  });

  it('nalaz pregleda Z32: znacka imenuje PREPOZNATI fakultet (FPZG) uz potvrdjen FER, i nudi prebacivanje jednim klikom', () => {
    document.body.innerHTML = '<select id="institutionSelect"><option value="unizg" selected>Sveučilište u Zagrebu</option></select><select id="unitSelect"><option value="fer" selected>FER</option><option value="fpzg">FPZG</option></select><div id="detectBadge" class="hidden"></div>';
    expect(zakljucajFakultet('fer', 'fer'), 'FER potvrdjen na ulazu').toBe(true);
    // Dokument (npr. lo-fpzg-zavrsni-uskladjen.docx) detekcija prepoznaje kao FPZG, drugi fakultet.
    expect(detekcijaSmije('fpzg')).toBe(false);
    const znacka = document.getElementById('detectBadge')!;
    expect(znacka.classList.contains('hidden'), 'znacka se pokazuje').toBe(false);
    const tekst = znacka.textContent ?? '';
    expect(tekst, 'imenuje prepoznati fakultet, ne "nisam prepoznao"').toContain('Fakultet političkih znanosti');
    expect(tekst).not.toContain('nisam prepoznao');
    const prebaciBtn = Array.from(znacka.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Prebaci'));
    expect(prebaciBtn, 'gumb za prebacivanje postoji').toBeTruthy();
    prebaciBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(potvrdjenFakultet(), 'jednim klikom prebaceno na prepoznati fakultet').toBe('fpzg');
    expect((document.getElementById('unitSelect') as HTMLSelectElement).value).toBe('fpzg');
    expect(znacka.classList.contains('hidden'), 'znacka se skriva nakon prebacivanja').toBe(true);
  });

  it('gumb "Zadrži" samo skriva znacku, potvrdjeni fakultet ostaje', () => {
    document.body.innerHTML = '<select id="institutionSelect"><option value="unizg" selected></option></select><select id="unitSelect"><option value="fer" selected></option><option value="fpzg"></option></select><div id="detectBadge" class="hidden"></div>';
    zakljucajFakultet('fer', 'fer');
    detekcijaSmije('fpzg');
    const znacka = document.getElementById('detectBadge')!;
    const zadrziBtn = Array.from(znacka.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Zadrži'));
    expect(zadrziBtn).toBeTruthy();
    zadrziBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(potvrdjenFakultet(), 'potvrdjen fakultet nepromijenjen').toBe('fer');
    expect(znacka.classList.contains('hidden')).toBe(true);
  });

  it('vrijedi za PRVI prihvaceni dokument; drugi dokument ili odbijen prvi skida bravu', () => {
    const prvi = new File(['a'], 'a.docx');
    zakljucajFakultet('fer', 'fer');
    emitAnalyzerDocumentSettled({ kind: 'accepted', file: prvi, verdict: { kind: 'ok' } as never });
    expect(potvrdjenFakultet()).toBe('fer');
    emitAnalyzerDocumentSettled({ kind: 'accepted', file: prvi, verdict: { kind: 'ok' } as never });
    expect(potvrdjenFakultet(), 'isti dokument ponovo').toBe('fer');
    emitAnalyzerDocumentSettled({ kind: 'accepted', file: new File(['b'], 'b.docx'), verdict: { kind: 'ok' } as never });
    expect(potvrdjenFakultet(), 'drugi rad').toBeNull();
    zakljucajFakultet('fer', 'fer');
    emitAnalyzerDocumentSettled({ kind: 'rejected', file: prvi, message: 'x' });
    expect(potvrdjenFakultet(), 'prvi dokument odbijen').toBeNull();
  });
});

/**
 * HAPPY-DOM (20.x) DRZI POVRATNI POZIV `MutationObserver`a SAMO KROZ `WeakRef`
 * (`MutationObserverListener`), pa ga GC zna pokupiti usred testa i promatrac tiho umre.
 * Izmjereno 2026-09-27: ciljani run cetiri datoteke ulaza pao je 2 od 10 puta upravo ovdje
 * ("Čitam" nije presao natrag), a prisilni `gc()` prije promjene atributa obara ga svaki put.
 * Preglednik promatrac drzi dok je cvor ziv, pa ovo nije kvar ulaza nego okoline testa; test zato
 * cvrsto drzi povratne pozive promatraca na cvoru dok traje.
 */
function zadrziPromatrace(cvor: Node): unknown[] {
  const drzi: unknown[] = [];
  for (const s of Object.getOwnPropertySymbols(cvor)) {
    const v = (cvor as unknown as Record<symbol, unknown>)[s];
    if (!Array.isArray(v)) continue;
    for (const l of v) {
      const cb = (l as { callback?: unknown } | null)?.callback;
      if (cb instanceof WeakRef) {
        const f: unknown = cb.deref();
        if (f) drzi.push(f);
      }
    }
  }
  return drzi;
}

function prisilniGc(): void {
  setFlagsFromString('--expose_gc');
  (runInNewContext('gc') as () => void)();
}

/** Stvarni markup ulaza u happy-dom-u, bez `<script>` oznaka. */
function ulaz(): Document {
  const tijelo = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>'));
  document.body.innerHTML = tijelo.slice(tijelo.indexOf('>') + 1).replace(/<script[\s\S]*?<\/script>/g, '');
  return document;
}

describe('Z32 zivi list nad stvarnim index.html', () => {
  const danas = () => new Date(2026, 8, 23, 12);
  let live: ReturnType<typeof mountIntakeLive> | null = null;

  beforeEach(() => {
    ocistiPohranu();
    document.documentElement.removeAttribute('data-motion');
  });
  afterEach(() => { live?.destroy(); live = null; vi.useRealTimers(); });

  const gumb = () => document.querySelector<HTMLElement>('.intake-paper__gumb')!;
  const hint = () => document.getElementById('intakeHint')!.textContent;
  const potvrdi = () => document.querySelector<HTMLButtonElement>('[data-intake-potvrdi]')!;
  const neznam = () => document.querySelector<HTMLInputElement>('[data-intake-rok-neznam]')!;
  const rokPolje = () => document.querySelector<HTMLInputElement>('[data-intake-rok]')!;
  const rokPecat = () => document.querySelector<HTMLElement>('[data-intake-rok-pecat]')!;
  const greska = () => document.getElementById('intakeError')!;

  it('bez roka vrata su zatvorena, a "Još ne znam rok" ih otvara i BEZ potvrde fakulteta', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ unit: 'fpzg', program: 'Politologija', workType: 'graduate' }));
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(gumb().getAttribute('aria-disabled')).toBe('true');
    expect(hint()).toBe('Prvo potvrdi rok');
    expect(live.canAccept()).toBe(false);
    neznam().checked = true;
    neznam().dispatchEvent(new Event('change'));
    expect(potvrdi().getAttribute('aria-pressed'), 'fakultet nije potvrdjen').toBe('false');
    expect(live.canAccept()).toBe(true);
    expect(gumb().getAttribute('aria-disabled')).toBe('false');
    expect(hint()).toBe('ili ispusti dokument ovdje');
    expect(rokPecat().hidden).toBe(false);
    expect(rokPecat().textContent).toBe('Rok nije zadan');
    expect(rokPolje().disabled).toBe(true);
    // Potvrda fakulteta i dalje radi kao prekidac i ne dira vrata.
    potvrdi().click();
    expect(potvrdi().getAttribute('aria-pressed')).toBe('true');
    expect(potvrdi().textContent).toBe('✓ Potvrđeno');
    expect(live.canAccept()).toBe(true);
  });

  it('PRVI POSJET (bez postavki i linka): kartica kaze da ce fakultet biti prepoznat, rad se moze ubaciti', async () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const napomena = document.querySelector<HTMLElement>('[data-intake-fakultet-napomena]')!;
    expect(napomena.hidden).toBe(false);
    expect(napomena.textContent).toBe('Prepoznat ćemo ga iz rada.');
    expect(document.querySelector<HTMLElement>('[data-intake-fakultet]')!.hidden, 'nema izmisljenog fakulteta').toBe(true);
    expect(potvrdi().hidden, 'nema sto potvrditi').toBe(true);
    expect(document.querySelector<HTMLElement>('[data-intake-promijeni]')!.hidden).toBe(true);
    expect(document.querySelector('[data-intake-fakultet-izvor]')!.textContent).toBe('');
    expect(hint()).toBe('Prvo potvrdi rok');
    neznam().click();
    expect(live.canAccept()).toBe(true);
    // Stvaran kontroler: ispustanje na list sada prima rad (`inspectFile` je pozvan).
    const inspectFile = vi.fn(async () => ({ kind: 'reject' as const, code: 'empty' as const, message: 'test' }));
    const kontroler = mountIntakeController(document, {
      maxUploadBytes: 1024 * 1024, inspectFile, createSession: vi.fn(),
      persistentStore: { put: vi.fn(), delete: vi.fn() }, navigate: vi.fn(),
      canAccept: live.canAccept, onBlocked: live.onBlocked,
    });
    document.getElementById('intakeDropzone')!.dispatchEvent(ispustanje(new File(['x'], 'rad.docx')));
    await vi.waitFor(() => expect(inspectFile).toHaveBeenCalledOnce());
    expect(procitajIzborUlaza().potvrda, 'bez potvrde nista nije potvrdjeno').toBeNull();
    kontroler.destroy();
  });

  it('izvor fakulteta: "prepoznato iz profila" samo za postavke, za ?unit= "s poveznice"', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '?unit=fer', danas });
    expect(document.querySelector('[data-intake-fakultet]')!.textContent).toBe('FER');
    expect(document.querySelector('[data-intake-fakultet-izvor]')!.textContent).toBe(' · s poveznice');
    potvrdi().click();
    expect(document.querySelector('[data-intake-fakultet-izvor]')!.textContent).toBe(' · potvrđeno');
    expect(procitajIzborUlaza().potvrda).toMatchObject({ unit: 'fer', program: null, sesija: null });
    const url = predodabirFakulteta('?unit=fer', null);
    const postavke = predodabirFakulteta('', { unit: 'fer', program: 'Računarstvo', workType: 'graduate' });
    expect(izvorFakulteta(url, false)).toBe(' · s poveznice');
    expect(izvorFakulteta(postavke, false)).toBe(' · prepoznato iz profila');
    expect(izvorFakulteta(null, false)).toBe('');
  });

  it('kartica i list: predodabir iz postavki, potvrda mijenja list i zapisuje sto je vidjeno', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ unit: 'fpzg', program: 'Politologija', workType: 'graduate' }));
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(document.querySelector('[data-intake-fakultet]')!.textContent).toBe('FPZG · Politologija · Dipl.');
    expect(document.querySelector('[data-intake-fakultet-izvor]')!.textContent).toBe(' · prepoznato iz profila');
    expect(document.querySelector('[data-intake-promijeni]')!.textContent).toBe('Promijeni');
    const papir = document.getElementById('intakeDropzone')!;
    expect(papir.hasAttribute('data-fakultet-potvrden')).toBe(false);
    potvrdi().click();
    expect(papir.hasAttribute('data-fakultet-potvrden')).toBe(true);
    expect(document.querySelector('[data-intake-list-fakultet]')!.textContent).toBe('FPZG · Dipl.');
    expect(document.querySelector('[data-intake-fakultet-izvor]')!.textContent).toBe(' · potvrđeno');
    expect(procitajIzborUlaza().potvrda).toMatchObject({ unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: null });
    // Drugi klik povlaci potvrdu: aria-pressed je prekidac, pa mora i vratiti.
    potvrdi().click();
    expect(procitajIzborUlaza().potvrda).toBeNull();
    expect(papir.hasAttribute('data-fakultet-potvrden')).toBe(false);
  });

  it('s predodabirom "Promijeni" vodi na odabir po fakultetu, a napomene nema', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ unit: 'fpzg', program: 'Politologija', workType: 'graduate' }));
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const a = document.querySelector<HTMLAnchorElement>('[data-intake-promijeni]')!;
    expect(a.hidden).toBe(false);
    expect(a.textContent).toBe('Promijeni');
    expect(a.getAttribute('href')).toBe('/fakulteti/');
    expect(potvrdi().hidden).toBe(false);
    expect(potvrdi().disabled).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-intake-fakultet-napomena]')!.hidden).toBe(true);
  });

  it('upis roka spusta pecat sa STVARNIM datumom i brojem dana, i pamti rok za /rad/', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(rokPecat().hidden).toBe(true);
    rokPolje().value = '2026-10-15';
    rokPolje().dispatchEvent(new Event('change'));
    expect(rokPecat().textContent).toBe('Rok 15. 10. · 22 dana');
    expect(procitajIzborUlaza().rok).toEqual({ datum: '2026-10-15', neznam: false });
    // Sljedeci dolazak na ulaz dobiva isti rok vec upisan (jos nije istekao), pa su vrata otvorena.
    live.destroy();
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(rokPolje().value).toBe('2026-10-15');
    expect(rokPecat().textContent).toBe('Rok 15. 10. · 22 dana');
    expect(hint()).toBe('ili ispusti dokument ovdje');
  });

  it('ISTEKAO rok iz pohrane ne otvara vrata sam po sebi', () => {
    zapisiRok({ datum: '2026-09-01', neznam: false });
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(rokPolje().value, 'istekao datum se ne vraca').toBe('');
    expect(rokPecat().hidden).toBe(true);
    expect(live.canAccept()).toBe(false);
    expect(hint()).toBe('Prvo potvrdi rok');
  });

  it('spremljena sesija dobiva rok tog rada, a potvrdu samo ako je fakultet potvrdjen', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '?unit=fer', danas });
    rokPolje().value = '2026-10-15';
    rokPolje().dispatchEvent(new Event('change'));
    live.onSessionStored('s-9');
    expect(rokZaSesiju('s-9')).toEqual({ datum: '2026-10-15', neznam: false });
    expect(procitajIzborUlaza().potvrda, 'fakultet nije potvrdjen').toBeNull();
    potvrdi().click();
    live.onSessionStored('s-10');
    expect(procitajIzborUlaza().potvrda).toMatchObject({ unit: 'fer', program: null, sesija: 's-10' });
    expect(rokZaSesiju('s-10')).toEqual({ datum: '2026-10-15', neznam: false });
  });

  it('pecat provjere prati stanje kontrolera: "Čeka provjeru" -> "Čitam"', async () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    // Zastita od happy-dom-a (vidi `zadrziPromatrace`), pa PRISILNI GC: bez zastite ovdje promatrac
    // umre i test pada svaki put, sa zastitom prolazi svaki put, neovisno o opterecenju stroja.
    const drzi = zadrziPromatrace(document.getElementById('intakeStage')!);
    expect(drzi.length, 'happy-dom vise ne drzi promatrace kroz WeakRef; provjeri treba li zastita').toBeGreaterThan(0);
    prisilniGc();
    const pecat = document.querySelector('[data-intake-pecat]')!;
    expect(pecat.textContent).toBe('Čeka provjeru');
    document.getElementById('intakeStage')!.dataset.intakeState = 'checking';
    await vi.waitFor(() => expect(pecat.textContent).toBe('Čitam'));
    prisilniGc();
    document.getElementById('intakeStage')!.dataset.intakeState = 'error';
    await vi.waitFor(() => expect(pecat.textContent).toBe('Čeka provjeru'));
    expect(drzi.length).toBeGreaterThan(0);
  });

  it('ime datoteke se upisuje slovo po slovo; pod prigusenim pokretom odmah cijelo', () => {
    vi.useFakeTimers();
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const ime = document.querySelector<HTMLElement>('[data-intake-ime]')!;
    live.onFileChosen('rad.docx');
    expect(ime.textContent).toBe('');
    vi.advanceTimersByTime(32 * 3);
    expect(ime.textContent).toBe('rad');
    vi.advanceTimersByTime(32 * 10);
    expect(ime.textContent).toBe('rad.docx');
    expect(ime.classList.contains('is-tipka')).toBe(false);
    document.documentElement.dataset.motion = 'reduce';
    live.onFileChosen('drugi.docx');
    expect(ime.textContent).toBe('drugi.docx');
  });

  it('vrata grizu i u kontroleru: klik ne otvara odabir, fokus ide na rok, uz poruku', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const input = document.getElementById('intakeFile') as HTMLInputElement;
    const otvori = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    const kontroler = mountIntakeController(document, {
      maxUploadBytes: 1024, inspectFile: vi.fn(), createSession: vi.fn(),
      persistentStore: { put: vi.fn(), delete: vi.fn() }, navigate: vi.fn(),
      canAccept: live.canAccept, onBlocked: live.onBlocked,
    });
    gumb().click();
    expect(otvori).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rokPolje());
    expect(greska().hidden).toBe(false);
    expect(greska().textContent).toBe(PORUKA_ODBIJENO);
    neznam().click();
    expect(greska().hidden, 'otvorena vrata brisu poruku o odbijenom radu').toBe(true);
    gumb().click();
    expect(otvori).toHaveBeenCalledOnce();
    kontroler.destroy();
  });

  /**
   * ISPUSTANJE KAD SU VRATA ZATVORENA (nalaz pregleda Z32): obje staze, NA list (kontroler) i
   * IZVAN lista (zivi list), odbijaju rad s porukom. Kontrola u istom testu: isti kontroler bez
   * kuke `canAccept` rad PRIMA, pa opazanje (`inspectFile`) stvarno razlikuje otvoreno od zatvorenog.
   */
  it('ispustanje na list i izvan lista bez roka: rad se odbija s porukom; bez vrata bi prosao', async () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const inspectFile = vi.fn(async () => ({ kind: 'reject' as const, code: 'empty' as const, message: 'test' }));
    const deps = {
      maxUploadBytes: 1024 * 1024, inspectFile, createSession: vi.fn(),
      persistentStore: { put: vi.fn(), delete: vi.fn() }, navigate: vi.fn(),
    };
    const kontroler = mountIntakeController(document, { ...deps, canAccept: live.canAccept, onBlocked: live.onBlocked });
    live.poveziOdabir((file) => { void kontroler.selectFile(file); });
    document.getElementById('intakeDropzone')!.dispatchEvent(ispustanje(new File(['x'], 'rad.docx')));
    expect(greska().textContent).toBe(PORUKA_ODBIJENO);
    expect(greska().hidden).toBe(false);
    expect(document.activeElement).toBe(rokPolje());
    greska().hidden = true;
    (document.querySelector('.site-footer') ?? document.body).dispatchEvent(ispustanje(new File(['x'], 'rad.docx')));
    expect(greska().hidden, 'ispustanje izvan lista nije odbijeno porukom').toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(inspectFile, 'zatvorena vrata su primila rad').not.toHaveBeenCalled();
    kontroler.destroy();

    // KONTROLA: bez kuke vrata isti tok rad prima, pa gornja tvrdnja nije prazna.
    const bezVrata = mountIntakeController(document, deps);
    document.getElementById('intakeDropzone')!.dispatchEvent(ispustanje(new File(['x'], 'rad.docx')));
    await vi.waitFor(() => expect(inspectFile).toHaveBeenCalledOnce());
    bezVrata.destroy();
  });
});

/** Dogadjaj ispustanja s datotekom, istim oblikom kao `tests/intake-controller.test.ts`. */
function ispustanje(file: File): Event {
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
  return e;
}

describe('Z32 ozicenje, pokret i redoslijed (baseline gardova)', () => {
  it('main.ts ulaza predaje kontroleru sve kuke zivog lista', () => {
    expect(ozicenjeUlazaProblemi(read('src/routes/intake/main.ts'))).toEqual([]);
  });

  it('tragovi olovke i linija skeniranja postuju prigusen pokret i pokret izvan pogleda', () => {
    expect(pokretProblemi(read('src/routes/intake/intake.css'), HTML, read('src/shared/ui-boot.ts'))).toEqual([]);
  });

  it('/rad/ primjenjuje potvrdu poslije obnove profila i prije detekcije iz dokumenta', () => {
    expect(redoslijedPotvrdeProblemi(read('src/routes/workspace/main.ts'))).toEqual([]);
  });

  it('ispustanje provjerava vrata na obje staze prije predaje dokumenta', () => {
    expect(ispustanjeProblemi(read('src/routes/intake/intake-controller.ts'), read('src/routes/intake/intake-live.ts'))).toEqual([]);
  });

  it('detekcija iz dokumenta na /rad/ ne gazi fakultet potvrdjen na ulazu', () => {
    expect(detekcijaFakultetaProblemi(read('src/ui/app.ts'))).toEqual([]);
  });

  it('sedam tragova olovke nosi doslovno nabrojane oznake iz naloga Z32', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.innerHTML = HTML.slice(HTML.indexOf('<body'));
    const tragovi = [...doc.querySelectorAll('.intake-tragovi .intake-trag')].map((t) => t.textContent?.trim());
    expect(tragovi).toEqual(['margine', 'prored', 'font', 'broj stranice', 'naslovi', 'literatura', 'opseg']);
    expect(doc.querySelector('.intake-tragovi')!.getAttribute('aria-hidden')).toBe('true');
  });
});
