/**
 * RED CEKANJA NALAZA: kompaktan popis umjesto zoološkog vrta kartica.
 *
 *     01  KRITICNO   Lijeva margina              AUTO
 *     02  VAZNO      Nedostaje izvor             RUCNO
 *
 * DVIJE OSI U ISTOM RETKU: lijevo OZBILJNOST (sto prvo), desno POPRAVLJIVOST (tko radi posao).
 * Nezavisne su particije istog skupa (vidi `finding-summary.ts`) - blokator zna biti automatski
 * popravljiv, sitnica ne mora - pa stoje u ODVOJENIM stupcima. Spojene u jednu oznaku citale bi se
 * kao jedna ljestvica.
 *
 * RIJECI SU IZ SAZETKA, ne nove: KRITICNO / VAZNO / PROVJERI su kratki oblici onoga sto sazetak
 * vec kaze. REDNI BROJ je polozaj iz "3 / 9"; dvije brojke koje se ne slazu citaju se kao kvar.
 */
import type { DeskItem } from './desk-model';
import type { VisualFindingModel } from './visual-result-model';

export type QueueTon = 'blok' | 'dorada' | 'provjera';

export interface QueueRedak {
  readonly redni: number;
  readonly id: string;
  readonly naslov: string;
  readonly ton: QueueTon;
  readonly oznaka: string;
  /**
   * `null` kad popravak na ovoj ruti uopce nije ponudjen. Tada se stupac NE crta, umjesto da sve
   * bude "RUCNO": to bi tvrdilo da student mora sam, a istina je da ponude nema. Ista razlika koju
   * `finding-summary.ts` cuva kroz `automatski: null`.
   */
  readonly automatski: boolean | null;
}

function ton(severity: VisualFindingModel['severity']): QueueTon {
  if (severity === 'error') return 'blok';
  if (severity === 'warning') return 'dorada';
  return 'provjera';
}

const OZNAKA: Readonly<Record<QueueTon, string>> = {
  blok: 'KRITIČNO',
  dorada: 'VAŽNO',
  provjera: 'PROVJERI',
};

export function queueRedci(
  items: readonly DeskItem<VisualFindingModel>[],
  popravakDostupan: boolean,
): QueueRedak[] {
  return items.map((it, i) => {
    const t = ton(it.finding.severity);
    return {
      redni: i + 1,
      id: it.finding.id,
      naslov: it.finding.title,
      ton: t,
      oznaka: OZNAKA[t],
      automatski: popravakDostupan ? it.finding.capabilities.repair === true : null,
    };
  });
}

/**
 * Popis. `data-desk-go` je ISTI atribut koji koristi navigacija, pa klik na redak ide kroz
 * postojecu delegaciju u `mountDesk` i ne trazi drugi put kroz kod.
 *
 * `aria-expanded` i `aria-current` nisu ukras: bez njih citac ekrana najavljuje devet gumba koji
 * zvuce jednako, a upravo je razlika medju njima ono sto ovaj prikaz nudi.
 */
export function queueHtml(
  redci: readonly QueueRedak[],
  odabrani: number,
  esc: (v: string) => string,
  detalj = '',
): string {
  if (!redci.length) return '';
  const stavke = redci.map((r) => {
    const jeOdabran = r.redni - 1 === odabrani;
    const auto = r.automatski === null
      ? ''
      : `<span class="dq-fix" data-fix="${r.automatski ? 'auto' : 'rucno'}">${r.automatski ? 'AUTO' : 'RUČNO'}</span>`;
    return `<li class="dq-item${jeOdabran ? ' dq-item--open' : ''}" data-ton="${r.ton}">`
      + `<button type="button" class="dq-btn" data-desk-go="${r.redni - 1}"`
      + ` aria-expanded="${jeOdabran ? 'true' : 'false'}"${jeOdabran ? ' aria-current="true"' : ''}>`
      + `<span class="dq-num">${String(r.redni).padStart(2, '0')}</span>`
      + `<span class="dq-sev">${esc(r.oznaka)}</span>`
      + `<span class="dq-title">${esc(r.naslov)}</span>`
      + auto
      + '</button>'
      // DETALJ SAMO ZA ODABRANI, doslovno po brifu ("kliknes 03 i samo se njegov detalj otvori").
      // Ostali retci ne nose skriven sadrzaj: sakriven detalj u svih devet redaka bio bi isti onaj
      // "card zoo", samo pod `display:none`, i placao bi se pri svakom ponovnom crtanju.
      + (jeOdabran && detalj ? `<div class="dq-detalj">${detalj}</div>` : '')
      + '</li>';
  }).join('');
  return `<ol class="dq" data-desk-queue>${stavke}</ol>`;
}
