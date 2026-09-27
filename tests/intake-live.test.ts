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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  danaDoRoka, daniRijecju, normalizirajRok, pecatRoka, razloziDatum, rokOdlucen,
} from '../src/routes/intake/deadline-stamp';
import {
  potvrdaVrijediZaSesiju, predodabirFakulteta, procitajIzborUlaza, spremnostUlaza,
  veziPotvrduZaSesiju, zapisiPotvrdu, zapisiRok, type PotvrdaUlaza,
} from '../src/shared/intake-choice';
import { safeStorageSet, STORAGE_KEYS } from '../src/shared/browser-storage';
import { mountIntakeLive, tekstPecataProvjere } from '../src/routes/intake/intake-live';
import { mountIntakeController } from '../src/routes/intake/intake-controller';
import { primijeniPotvrduUlaza } from '../src/routes/workspace/intake-confirmation';
import type { SelectionIds } from '../src/ui/profile-selection-ids';
import {
  ozicenjeUlazaProblemi, pecatRokaProblemi, pokretProblemi, potvrdaSesijeProblemi, redoslijedPotvrdeProblemi,
  vrataProblemi,
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

  it('natpis kaze STO nedostaje, a otvorena vrata nose natpis predloska', () => {
    const r = (f: boolean, rok: { datum: string | null; neznam: boolean }) => spremnostUlaza({ fakultetPotvrden: f, rok });
    expect(r(false, { datum: null, neznam: false }).natpis).toBe('Prvo potvrdi fakultet i rok');
    expect(r(true, { datum: null, neznam: false }).natpis).toBe('Prvo potvrdi rok');
    expect(r(false, { datum: null, neznam: true }).natpis).toBe('Prvo potvrdi fakultet');
    expect(r(true, { datum: null, neznam: true })).toEqual({ spremno: true, natpis: 'ili ispusti dokument ovdje' });
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

  it('potvrda se veze za sesiju tek kad postoji; bez potvrde nema sto vezati', () => {
    expect(veziPotvrduZaSesiju('s-1')).toBe(false);
    zapisiPotvrdu({ unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: null, at: 5 });
    expect(veziPotvrduZaSesiju('s-1')).toBe(true);
    expect(veziPotvrduZaSesiju('s-1'), 'drugi prolaz nije no-op').toBe(false);
    expect(procitajIzborUlaza().potvrda?.sesija).toBe('s-1');
  });
});

describe('Z32 potvrda na /rad/', () => {
  const potvrda: PotvrdaUlaza = { unit: 'fpzg', program: 'Politologija', workType: 'graduate', sesija: 's-1', at: 42 };
  const obrazac: SelectionIds = {
    institution: 'unizg', unit: 'fpzg', program: 'Politologija', workType: 'graduate',
    variant: 'default', department: 'general', methodology: 'auto', citation: 'apa7',
  };

  it('vrijedi SAMO za svoju sesiju, sa studijem, uz isti obrazac i bez vlastitog profila sesije', () => {
    const s = { id: 's-1', imaProfil: false };
    expect(potvrdaVrijediZaSesiju(potvrda, s, obrazac)).toBe(true);
    expect(potvrdaVrijediZaSesiju(potvrda, { id: 's-2', imaProfil: false }, obrazac), 'tudja sesija').toBe(false);
    expect(potvrdaVrijediZaSesiju(potvrda, { id: 's-1', imaProfil: true }, obrazac), 'sesija vec ima profil').toBe(false);
    expect(potvrdaVrijediZaSesiju({ ...potvrda, program: null }, s, obrazac), 'bez studija (link)').toBe(false);
    expect(potvrdaVrijediZaSesiju(potvrda, s, { ...obrazac, program: 'Novinarstvo' }), 'drugi studij').toBe(false);
    expect(potvrdaVrijediZaSesiju(potvrda, s, { ...obrazac, workType: 'final' }), 'druga razina').toBe(false);
    expect(potvrdaVrijediZaSesiju(null, s, obrazac)).toBe(false);
  });

  it('BASELINE garda: stvarna funkcija vezanja prolazi sve slucajeve', () => {
    expect(potvrdaSesijeProblemi(potvrdaVrijediZaSesiju)).toEqual([]);
  });

  it('primjena ide ISTIM putem kao obnova sesije: apply pa confirm sa snimkom', () => {
    const apply = vi.fn(() => 'fpzg-politologija-diplomski');
    const confirm = vi.fn();
    const ishod = primijeniPotvrduUlaza({
      sessionId: 's-1', sessionHasProfile: false, readForm: () => obrazac, apply, confirm,
      read: () => ({ rok: { datum: null, neznam: true }, potvrda }),
    });
    expect(ishod).toBe('applied');
    expect(apply).toHaveBeenCalledWith({ ...obrazac });
    expect(confirm).toHaveBeenCalledWith({ profileDefinitionId: 'fpzg-politologija-diplomski', selectionIds: obrazac, confirmedAt: 42 });
  });

  it('bez vazece potvrde /rad/ ostaje netaknut; nerazrijesen profil se ne zapisuje', () => {
    const apply = vi.fn(() => null);
    const confirm = vi.fn();
    const base = { sessionHasProfile: false, readForm: () => obrazac, apply, confirm };
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-2', read: () => ({ rok: { datum: null, neznam: false }, potvrda }) })).toBe('none');
    expect(apply).not.toHaveBeenCalled();
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', read: () => ({ rok: { datum: null, neznam: false }, potvrda }) })).toBe('unresolved');
    expect(confirm).not.toHaveBeenCalled();
    expect(primijeniPotvrduUlaza({ ...base, sessionId: 's-1', readForm: () => { throw new Error('nema obrasca'); }, read: () => ({ rok: { datum: null, neznam: false }, potvrda }) })).toBe('none');
  });
});

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

  it('bez fakulteta i roka vrata su zatvorena, a "Još ne znam rok" uz potvrdu ih otvara', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ unit: 'fpzg', program: 'Politologija', workType: 'graduate' }));
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(gumb().getAttribute('aria-disabled')).toBe('true');
    expect(hint()).toBe('Prvo potvrdi fakultet i rok');
    expect(live.canAccept()).toBe(false);
    potvrdi().click();
    expect(potvrdi().getAttribute('aria-pressed')).toBe('true');
    expect(potvrdi().textContent).toBe('✓ Potvrđeno');
    expect(hint()).toBe('Prvo potvrdi rok');
    neznam().checked = true;
    neznam().dispatchEvent(new Event('change'));
    expect(live.canAccept()).toBe(true);
    expect(gumb().getAttribute('aria-disabled')).toBe('false');
    expect(hint()).toBe('ili ispusti dokument ovdje');
    expect(rokPecat().hidden).toBe(false);
    expect(rokPecat().textContent).toBe('Rok nije zadan');
    expect(rokPolje().disabled).toBe(true);
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

  it('bez predodabira: nema izmisljenog fakulteta, "Potvrdi" je onemogucen, vodi na odabir', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(document.querySelector<HTMLElement>('[data-intake-fakultet]')!.hidden).toBe(true);
    expect(potvrdi().disabled).toBe(true);
    const a = document.querySelector<HTMLAnchorElement>('[data-intake-promijeni]')!;
    expect(a.textContent).toBe('Odaberi profil');
    expect(a.getAttribute('href')).toBe('/fakulteti/');
  });

  it('upis roka spusta pecat sa STVARNIM datumom i brojem dana, i pamti rok za /rad/', () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(rokPecat().hidden).toBe(true);
    rokPolje().value = '2026-10-15';
    rokPolje().dispatchEvent(new Event('change'));
    expect(rokPecat().textContent).toBe('Rok 15. 10. · 22 dana');
    expect(procitajIzborUlaza().rok).toEqual({ datum: '2026-10-15', neznam: false });
    // Sljedeci dolazak na ulaz dobiva isti rok vec upisan, a fakultet ponovno trazi potvrdu.
    live.destroy();
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    expect(rokPolje().value).toBe('2026-10-15');
    expect(rokPecat().textContent).toBe('Rok 15. 10. · 22 dana');
    expect(hint()).toBe('Prvo potvrdi fakultet');
  });

  it('pecat provjere prati stanje kontrolera: "Čeka provjeru" -> "Čitam"', async () => {
    ulaz();
    live = mountIntakeLive(document, { search: '', danas });
    const pecat = document.querySelector('[data-intake-pecat]')!;
    expect(pecat.textContent).toBe('Čeka provjeru');
    document.getElementById('intakeStage')!.dataset.intakeState = 'checking';
    await vi.waitFor(() => expect(pecat.textContent).toBe('Čitam'));
    document.getElementById('intakeStage')!.dataset.intakeState = 'error';
    await vi.waitFor(() => expect(pecat.textContent).toBe('Čeka provjeru'));
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

  it('vrata grizu i u kontroleru: klik ne otvara odabir, fokus ide na ono sto nedostaje', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ unit: 'fpzg', program: 'Politologija', workType: 'graduate' }));
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
    expect(document.activeElement).toBe(potvrdi());
    potvrdi().click();
    gumb().click();
    expect(otvori).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rokPolje());
    neznam().click();
    gumb().click();
    expect(otvori).toHaveBeenCalledOnce();
    kontroler.destroy();
  });
});

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

  it('sedam tragova olovke nosi doslovno nabrojane oznake iz naloga Z32', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.innerHTML = HTML.slice(HTML.indexOf('<body'));
    const tragovi = [...doc.querySelectorAll('.intake-tragovi .intake-trag')].map((t) => t.textContent?.trim());
    expect(tragovi).toEqual(['margine', 'prored', 'font', 'broj stranice', 'naslovi', 'literatura', 'opseg']);
    expect(doc.querySelector('.intake-tragovi')!.getAttribute('aria-hidden')).toBe('true');
  });
});
