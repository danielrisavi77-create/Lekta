import { escapeHtml } from '../../utils/helpers';
import { pluralHr } from './technical-compliance-halo';
import type { RepairOutlookModel } from './repair-outlook';

/**
 * PRIJE POPRAVKA. Prikazuje se ISKLJUCIVO ono sto je determinisicko: koliko je predodabrano,
 * dokle automatika najvise moze, i sto ne smije dirati. Procijenjene ocjene nakon odabranih
 * popravaka NEMA i ne smije je biti (vidi repair-outlook.ts).
 *
 * Strop se imenuje kao GRANICA, ne kao ishod: "najvise moze doseci", nikad "dobit ces".
 */
export function repairOutlookHtml(model: RepairOutlookModel): string {
  if (model.kind === 'unavailable') {
    return '<section class="cockpit-outlook cockpit-outlook--unavailable" data-cockpit-outlook>'
      + '<div class="cockpit-section-heading"><span class="cockpit-kicker">Prije popravka</span>'
      + '<h2>Sto automatika moze</h2></div>'
      + `<p class="outlook__note">${escapeHtml(model.reason)}</p></section>`;
  }

  const { counts } = model;
  const tiles = ([
    ['auto', counts.auto, ['popravak bez tvoje odluke', 'popravka bez tvoje odluke', 'popravaka bez tvoje odluke']],
    ['assisted', counts.assisted, ['popravak uz tvoju potvrdu', 'popravka uz tvoju potvrdu', 'popravaka uz tvoju potvrdu']],
    ['manual', counts.manual, ['samo za tebe', 'samo za tebe', 'samo za tebe']],
  ] as const).map(([kind, n, forms]) =>
    `<div class="outlook__tile outlook__tile--${kind}"><strong>${escapeHtml(n)}</strong>`
    + `<span>${escapeHtml(pluralHr(n, forms))}</span></div>`).join('');

  // Strop se pokazuje samo kad ima sto reci: dosegnut strop je zasebna, iskrenija poruka.
  const ceiling = model.atCeiling
    ? '<p class="outlook__ceiling">Automatika je dosegla svoj strop za ovaj dokument. Sve dalje trazi tvoju prosudbu.</p>'
    : model.currentScore !== null
      ? `<p class="outlook__ceiling"><strong>${escapeHtml(model.ceilingScore)}/100</strong> je najvise sto automatski popravak moze doseci za ovaj profil`
        + (model.headroom ? `, dakle do ${escapeHtml(model.headroom)} ${escapeHtml(pluralHr(model.headroom, ['boda', 'boda', 'bodova']))} iznad sadasnjih ${escapeHtml(model.currentScore)}` : '')
        + '. To je granica, ne obecanje: svaki popravak se provjerava ponovnom analizom.</p>'
      : `<p class="outlook__ceiling"><strong>${escapeHtml(model.ceilingScore)}/100</strong> je najvise sto automatski popravak moze doseci za ovaj profil. To je granica, ne obecanje.</p>`;

  const manual = model.manualItems.length
    ? '<div class="outlook__manual"><span class="cockpit-kicker">Nije moguce sigurno automatizirati</span><ul>'
      + model.manualItems.map((item) =>
        `<li>${escapeHtml(item.title)} <span>&minus;${escapeHtml(item.lostPoints)}</span></li>`).join('')
      + '</ul></div>'
    : '';

  const preselected = model.preselected > 0
    ? `<p class="outlook__note">Klikom na Popravi predodabire se ${escapeHtml(model.preselected)} `
      + `${escapeHtml(pluralHr(model.preselected, ['stavka', 'stavke', 'stavki']))}; svaku mozes iskljuciti prije pokretanja.</p>`
    : '';

  return '<section class="cockpit-outlook" data-cockpit-outlook aria-labelledby="cockpitOutlookTitle">'
    + '<div class="cockpit-section-heading"><span class="cockpit-kicker">Prije popravka</span>'
    + '<h2 id="cockpitOutlookTitle">Sto automatika moze</h2></div>'
    + `<div class="outlook__tiles">${tiles}</div>`
    + ceiling + manual + preselected
    + '</section>';
}
