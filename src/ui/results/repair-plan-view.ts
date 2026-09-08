/**
 * PLAN ISPRAVAKA: prikaz. Model je u `repair-plan.ts`.
 *
 * PLAN RADA, NE KONFIGURACIJSKI PANEL. Razlika je u tome sto redak TVRDI: panel nudi prekidace
 * ("ukljuci ovo"), plan tvrdi sto ce se dogoditi ("2,3 cm -> 3,0 cm"). Obecanje nije isto, pa
 * redak vodi vrijednoscu prije nego kontrolom.
 *
 * TRI SKUPINE, TRI GLAGOLA: Lekta radi / Lekta moze ali ne smije sama / Lekta ne moze. Zato rucne
 * stavke dobivaju TOCKU, ne praznu kvacicu: kvacica bi izgledala kao nesto sto se moze ukljuciti.
 */
import type { PlanStavka, RepairPlan } from './repair-plan';
import { pluralHr } from './plural-hr';

function stavkaHtml(s: PlanStavka, esc: (v: string) => string, kvacica: boolean, odabrana: boolean): string {
  // PRIJELAZ SE PISE SAMO KAD GA ZNAMO. Redak bez izmjerene i ciljane vrijednosti nosi samo naziv;
  // izmisljena strelica ("? -> ?") bila bi gore od izostanka.
  const prijelaz = s.prije && s.poslije
    ? `<span class="rp-prijelaz"><b>${esc(s.prije)}</b> <span aria-hidden="true">&#8594;</span> <b>${esc(s.poslije)}</b></span>`
    : '';
  const kutija = kvacica
    ? `<span class="rp-kvacica" data-odabrano="${odabrana ? 'da' : 'ne'}" aria-hidden="true">${odabrana ? '☑' : '☐'}</span>`
    : '<span class="rp-tocka" aria-hidden="true">•</span>';
  return '<li class="rp-stavka" data-rule="' + esc(s.ruleId) + '">'
    + kutija
    + '<span class="rp-tijelo"><span class="rp-naziv">' + esc(s.label) + '</span>'
    + prijelaz
    + (s.preporuka ? '<small class="rp-napomena">Preporuka fakulteta, ne uvjet.</small>' : '')
    + (s.potvrda ? '<small class="rp-napomena">' + esc(s.potvrda) + '</small>' : '')
    + '</span></li>';
}

function skupina(naslov: string, tijelo: string): string {
  return tijelo ? `<section class="rp-skupina"><h4 class="rp-naslov">${naslov}</h4>${tijelo}</section>` : '';
}


export function repairPlanHtml(plan: RepairPlan, esc: (v: string) => string): string {
  if (plan.prazan) {
    return '<div class="rp" data-repair-plan><p class="rp-prazno">Za ovaj rad nema automatskih zahvata.</p></div>';
  }
  const sigurni = plan.sigurni.map((s) => stavkaHtml(s, esc, true, true)).join('');
  const odluka = plan.odluka.map((s) => stavkaHtml(s, esc, true, false)).join('');
  const rucni = plan.rucni.map((r) => '<li class="rp-stavka"><span class="rp-tocka" aria-hidden="true">•</span>'
    + '<span class="rp-tijelo"><span class="rp-naziv">' + esc(r.naslov) + '</span>'
    + (r.razlog ? '<small class="rp-napomena">' + esc(r.razlog) + '</small>' : '') + '</span></li>').join('');

  // Mnozina ide kroz POSTOJECI `pluralHr`; cetvrta izvedba istog pravila u ovom repozitoriju
  // razisla bi se s ostale tri. Mijenja se i GLAGOL, ne samo imenica: "1 zahvat se moze",
  // "3 zahvata se mogu".
  const n = plan.sigurni.length;
  const uvod = n
    ? `<p class="rp-uvod"><b>${n}</b> ${pluralHr(n, ['siguran zahvat', 'sigurna zahvata', 'sigurnih zahvata'])}`
      + ` ${pluralHr(n, ['moze se', 'mogu se', 'moze se'])} primijeniti automatski.</p>`
    : '';

  return '<div class="rp" data-repair-plan>'
    + '<div class="rp-glava"><span class="rp-kicker">Plan ispravaka</span></div>'
    + uvod
    + skupina('Sigurni zahvati', sigurni ? `<ul class="rp-popis">${sigurni}</ul>` : '')
    + skupina('Treba tvoju odluku', odluka ? `<ul class="rp-popis">${odluka}</ul>` : '')
    + skupina('Ručno', rucni ? `<ul class="rp-popis rp-popis--rucno">${rucni}</ul>` : '')
    + '<div class="rp-podnozje">'
    + `<span class="rp-brojac" data-repair-plan-count>${plan.odabrano} `
    + `${pluralHr(plan.odabrano, ['automatski zahvat', 'automatska zahvata', 'automatskih zahvata'])} `
    + `${pluralHr(plan.odabrano, ['odabran', 'odabrana', 'odabrano'])}</span>`
    + '<button type="button" class="button button-primary" data-repair-plan-go>Izradi popravljenu kopiju .docx <span aria-hidden="true">&#8594;</span></button>'
    + '</div></div>';
}
