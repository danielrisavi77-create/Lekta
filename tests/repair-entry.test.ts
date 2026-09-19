import { describe, expect, it } from 'vitest';
import { defaultSelectedItems } from '../src/repair/default-selection';
import { buildRepairPlan, type PlanItemInput } from '../src/ui/results/repair-plan';
import { repairLanding } from '../src/ui/results/repair-entry';

/**
 * ULAZ IZ PLANA U POPRAVAK (sedma tocka, drugi dio).
 *
 * Dvije stvari se ovdje cuvaju:
 *   1. Plan slijece na ODLUKU, ne na vrh panela. Inace ulaz postoji samo formalno.
 *   2. Plan i panel se ne smiju razici oko toga sto ceka korisnika. Ugovorni test iz sedme tocke
 *      je tu granu propustao, jer njegov ulaz nikad nije imao stavku koja je ISTOVREMENO prekrsena
 *      i trazi potvrdu, a to je jedini slucaj u kojem se dvije strane mogu razici.
 */
function panel(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const GUMB = '<button class="lekta-repair-panel__download">Popravi sve jednim klikom</button>';

describe('gdje plan slijece', () => {
  it('na serverskom putu slijece na trenutak slanja, ne na vrh panela', () => {
    const m = panel(`<button class="prvi">Uredi...</button><div data-privacy-prijelaz></div>${GUMB}`);
    const l = repairLanding(m);
    expect(l.scroll.hasAttribute('data-privacy-prijelaz')).toBe(true);
    expect(l.focus?.className).toBe('lekta-repair-panel__download');
  });

  it('na lokalnom putu (nista se ne salje) odluka je sam gumb', () => {
    const m = panel(`<button class="prvi">Uredi...</button>${GUMB}`);
    expect(repairLanding(m).scroll).toBe(m.querySelector('.lekta-repair-panel__download'));
  });

  it('MUTACIJA: fokus NE SMIJE zavrsiti na prvom gumbu u panelu', () => {
    // Zateceno ponasanje: `querySelector('button:not(:disabled)')` je hvatao "Uredi..." iz popisa,
    // pa je korisnik koji je prihvatio plan zavrsio u uredivanju jedne stavke.
    const m = panel(`<button class="prvi">Uredi...</button>${GUMB}`);
    expect(repairLanding(m).focus?.className).not.toBe('prvi');
  });

  it('onemogucena glavna radnja ne postaje meta fokusa', () => {
    const m = panel('<button class="lekta-repair-panel__download" disabled>Popravi</button><a href="#x">Natrag</a>');
    expect(repairLanding(m).focus?.tagName).toBe('A');
  });

  it('panel bez ijedne radnje vraca `null`, umjesto da izmisli metu', () => {
    const m = panel('<p>Nema podrzanih popravaka.</p>');
    const l = repairLanding(m);
    expect(l.focus).toBeNull();
    expect(l.scroll).toBe(m);
  });
});

describe('plan i panel se ne razilaze oko toga sto ceka korisnika', () => {
  const STAVKA = (o: Partial<PlanItemInput> = {}): PlanItemInput => ({ ruleId: 'r', label: 'L', ...o });

  it('prekrseno I trazi potvrdu: plan to zove odlukom, panel ga predodabere', () => {
    /**
     * RUPA U MOM VLASTITOM UGOVORNOM TESTU, nadjena 2026-09-09 pri spajanju plana s panelom: test
     * "predodabrano u planu = odabrano u defaultSelectedItems" nikad nije imao ulaz s tom
     * kombinacijom, pa je prolazio vakuumski. Ovo je jedini slucaj u kojem se dvije strane
     * razlikuju, i zato se imenuje umjesto da se pretpostavi da ga nema.
     *
     * RAZLIKA JE NAMJERNA I NIJE KVAR: panel kucicu drzi oznacenom (`violated !== false`), ali
     * PRIJE primjene stane na `renderConfirmation` (`app.ts` za serverski put, `repair-panel.ts`
     * za lokalni). Korisnik dakle jest pitan. Plan to isto stanje prikazuje kao praznu kvacicu pod
     * "Treba tvoju odluku", jer za citatelja plana je istina "ovo se nece dogoditi bez tebe".
     *
     * Gard postoji da se ta druga kapija ne ukloni u nekom buducem ciscenju: ako nestane, plan
     * pocinje lagati, a `required-section-fixer` bi umetao naslov bez izricite potvrde, sto tvrdo
     * pravilo iz `CLAUDE.md` izricito zabranjuje.
     */
    const items = [STAVKA({ ruleId: 'sekcija', violated: true, requiresConfirmation: true, confirmationText: 'Potvrdi mjesto.' })];
    const plan = buildRepairPlan(items, [], true);
    const motor = defaultSelectedItems(items.map((i) => ({ ...i, fixerId: 'x', params: {} })) as never);

    expect(plan.sigurni, 'plan ga NE smije zvati sigurnim').toHaveLength(0);
    expect(plan.odluka).toHaveLength(1);
    expect(plan.odabrano).toBe(0);
    expect(motor.map((m) => m.ruleId), 'panel ga PREDODABERE, i to je zatecena istina').toEqual(['sekcija']);
  });

  it('bez potvrde se dvije strane moraju slagati u oba smjera', () => {
    const items = [
      STAVKA({ ruleId: 'a', violated: true }),
      STAVKA({ ruleId: 'b', violated: false }),
      STAVKA({ ruleId: 'c' }),
    ];
    const plan = buildRepairPlan(items, [], true);
    const motor = defaultSelectedItems(items.map((i) => ({ ...i, fixerId: 'x', params: {} })) as never);
    expect(plan.sigurni.map((s) => s.ruleId).sort()).toEqual(motor.map((m) => m.ruleId).sort());
  });
});
