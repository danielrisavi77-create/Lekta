/**
 * RED CEKANJA NALAZA: kompaktan popis umjesto zoološkog vrta kartica.
 *
 * Brif vlasnika (2026-09-08): "Nalazi ne smiju izgledati kao 25 jednakih kartica. Najbolji prikaz
 * nije 'card zoo'. Desno bi bila kompaktna queue lista. Kliknes 03 i samo se njegov detalj otvori.
 * Odmah je vidljivo: sto prvo, sto Lekta moze rijesiti, sto mora student."
 *
 *     01  KRITICNO   Lijeva margina              AUTO
 *     02  VAZNO      Nedostaje izvor             RUCNO
 *     03  VAZNO      Preskocena razina naslova   AUTO
 *
 * DVIJE OSI U ISTOM RETKU, i to je cijela poanta prikaza. Lijevo stoji OZBILJNOST (sto prvo),
 * desno POPRAVLJIVOST (tko to radi). To su dvije NEZAVISNE particije istog skupa, sto
 * `finding-summary.ts` vec objasnjava: blokator moze biti automatski popravljiv, a sitnica ne mora.
 * Popis ih zato drzi u odvojenim stupcima; da su pomijesani u jednu oznaku, korisnik bi ih citao
 * kao jednu ljestvicu i pitao se zasto "kriticno" ponekad znaci "gotovo samo".
 *
 * RIJECI SU IZ SAZETKA, ne nove. Sazetak vec kaze "blokira predaju / treba doraditi / trebas
 * provjeriti sam"; popis nosi njihove kratke oblike (KRITICNO / VAZNO / PROVJERI), pa je vidljivo
 * da je rijec o ISTOJ podjeli, samo zbijenoj u redak.
 *
 * REDNI BROJ JE POLOZAJ NA STOLU, isti onaj iz "3 / 9". Kad se dvije brojke na istom ekranu ne
 * slazu, korisnik to cita kao kvar.
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
