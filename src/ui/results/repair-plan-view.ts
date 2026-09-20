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
import { defaultPlanSelection, planSelectionSummary, type PlanStavka, type RepairPlan } from './repair-plan';
import { pluralHr } from './plural-hr';

function stavkaHtml(s: PlanStavka, esc: (v: string) => string, kvacica: boolean, odabrana: boolean): string {
  // PRIJELAZ SE PISE SAMO KAD GA ZNAMO. Redak bez izmjerene i ciljane vrijednosti nosi samo naziv;
  // izmisljena strelica ("? -> ?") bila bi gore od izostanka.
  const prijelaz = s.prije && s.poslije
    ? `<span class="rp-prijelaz"><b>${esc(s.prije)}</b> <span aria-hidden="true">&#8594;</span> <b>${esc(s.poslije)}</b></span>`
    : '';
  // T09: kvacica je STVARNA kontrola (checkbox + label), vezana na jedan `ruleId`. Do sada je bila `span
  // aria-hidden`, pa je "Treba tvoju odluku" nudila odluku koju se nije moglo donijeti. Rucne stavke i dalje
  // nose tocku bez kontrole: nepodrzana radnja nema privid interaktivnosti.
  const id = 'rp-' + s.ruleId.replace(/[^a-z0-9_-]/gi, '-');
  const kutija = kvacica
    ? `<input type="checkbox" class="rp-kvacica" id="${esc(id)}" data-repair-plan-item="${esc(s.ruleId)}" data-odabrano="${odabrana ? 'da' : 'ne'}"${odabrana ? ' checked' : ''} />`
    : '<span class="rp-tocka" aria-hidden="true">•</span>';
  const naziv = kvacica
    ? `<label class="rp-naziv" for="${esc(id)}">${esc(s.label)}</label>`
    : `<span class="rp-naziv">${esc(s.label)}</span>`;
  return '<li class="rp-stavka" data-rule="' + esc(s.ruleId) + '">'
    + kutija
    + '<span class="rp-tijelo">' + naziv
    + prijelaz
    + (s.preporuka ? '<small class="rp-napomena">Preporuka fakulteta, ne uvjet.</small>' : '')
    // Razlog zasto stavka nije predodabrana (uvjet, potvrda lokacije) stoji uz nju, ne tek na kraju.
    + (s.potvrda ? '<small class="rp-napomena">' + esc(s.potvrda) + '</small>' : '')
    + '</span></li>';
}

/** Podnozje plana: brojac i sazetak odabranog. Izdvojeno da ga `desk-mount` moze ponovno iscrtati pri promjeni odabira. */
export function repairPlanFooterHtml(plan: RepairPlan, selectedRuleIds: Iterable<string>, esc: (v: string) => string): string {
  const sazetak = planSelectionSummary(plan, selectedRuleIds);
  const n = sazetak.count;
  const popis = sazetak.labels.length
    ? `<ul class="rp-sazetak" data-repair-selected-summary data-testid="repair-selected-summary">${sazetak.labels.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '<p class="rp-sazetak rp-sazetak--prazno" data-repair-selected-summary data-testid="repair-selected-summary">Nijedan zahvat nije odabran.</p>';
  const potvrde = sazetak.needsConfirmation.length
    ? `<p class="rp-napomena">Prije slanja traži se potvrda za: ${sazetak.needsConfirmation.map((s) => esc(s.label)).join(', ')}.</p>`
    : '';
  return `<span class="rp-brojac" data-repair-plan-count="${n}">${n} `
    + `${pluralHr(n, ['automatski zahvat', 'automatska zahvata', 'automatskih zahvata'])} `
    + `${pluralHr(n, ['odabran', 'odabrana', 'odabrano'])}</span>`
    + popis + potvrde
    + `<button type="button" class="button button-primary" data-repair-plan-go data-testid="repair-plan-continue"${n ? '' : ' disabled'}>Izradi popravljenu kopiju .docx <span aria-hidden="true">&#8594;</span></button>`;
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
    + '<div class="rp-podnozje" data-repair-plan-footer>'
    + repairPlanFooterHtml(plan, defaultPlanSelection(plan), esc)
    + '</div></div>';
}
