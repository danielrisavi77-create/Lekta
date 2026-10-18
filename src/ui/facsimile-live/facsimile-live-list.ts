/**
 * LIST FAKSIMILA Z35: tekst stranice kao HTML. Dijele ga faksimil preko prozora (`facsimile-live.ts`)
 * i lijevi pano stola Z8 (`stol-stranice.ts`), da ista stranica rada nema dvije izvedbe koje bi se
 * razisle u velicini, proredu, poravnanju ili razmacima (odluka vlasnika 2026-10-18, F51 a: Z9 samo
 * iza `?resultRenderer=legacy`). Mjere su u `cqw` lista, pa list prati sirinu stupca bez zooma.
 */
import type { IzgledStranice } from '../result-live/result-live-model';
import type { FxOdlomak, FxPreview } from './facsimile-live-model';

export const PT_PO_CM = 72 / 2.54;
const ZADANA_STRANICA = { w: 21, h: 29.7 };
const CSS_PORAVNANJE: Readonly<Record<string, string>> = { lijevo: 'left', desno: 'right', 'u sredini': 'center', obostrano: 'justify' };
const SERIFNO = ['times', 'serif', 'georgia', 'garamond', 'minion', 'cambria', 'book antiqua', 'palatino'];

/** CSS stog pisma; ime koje nije cisto ime pisma pada na pismo dokumenta. */
function pismoCss(ime: string | null): string {
  if (!ime || !/^[\p{L}\p{N} .-]{1,40}$/u.test(ime)) return 'var(--font-doc)';
  const serif = SERIFNO.some((h) => ime.toLowerCase().includes(h));
  return `'${ime}', ${serif ? "'Liberation Serif', Georgia, 'Times New Roman', serif" : "Carlito, 'Liberation Sans', Arial, sans-serif"}`;
}

export const zaokruzi = (n: number): string => (Math.round(n * 1000) / 1000).toString();

export interface MjeraLista {
  /** Sirina i visina stranice u cm (iz dokumenta, inace A4). */
  readonly W: number;
  readonly H: number;
  /** Centimetri dokumenta u `cqw` lista. */
  readonly cqw: (cm: number) => string;
  /** Jedan tipografski bod u `cqw` lista. */
  readonly ptu: string;
}

export function mjeraLista(preview: FxPreview | null): MjeraLista {
  const velicina = preview?.page && typeof preview.page.size === 'object' && preview.page.size !== null
    ? preview.page.size as { w?: unknown; h?: unknown } : null;
  const W = typeof velicina?.w === 'number' && velicina.w > 5 && velicina.w < 60 ? velicina.w : ZADANA_STRANICA.w;
  const H = typeof velicina?.h === 'number' && velicina.h > 5 && velicina.h < 90 ? velicina.h : ZADANA_STRANICA.h;
  return { W, H, cqw: (cm) => `${zaokruzi((cm / W) * 100)}cqw`, ptu: `${zaokruzi((100 / (W * PT_PO_CM)))}cqw` };
}

function stilOdlomka(p: FxOdlomak): string {
  return [
    p.pt !== null ? `--fl-pt:${zaokruzi(p.pt)}` : '',
    p.prored !== null ? `--fl-lh:${zaokruzi(p.prored * 1.15)}` : '',
    p.poravnanje ? `text-align:${CSS_PORAVNANJE[p.poravnanje]}` : '',
    p.prije !== null ? `margin-top:calc(${zaokruzi(p.prije)} * var(--fl-ptu))` : '',
    p.poslije !== null ? `margin-bottom:calc(${zaokruzi(p.poslije)} * var(--fl-ptu))` : '',
    p.podebljano ? 'font-weight:700' : '',
    p.kurziv ? 'font-style:italic' : '',
    p.font ? `font-family:${pismoCss(p.font)}` : '',
  ].filter(Boolean).join(';');
}

/**
 * Tekst jednog lista. `sloj` "now" nosi `data-fl-p` (sidro tocke, biljeske i oznake stola), "after"
 * je gornji sloj klizaca. `oznake` je odlomak -> vrsta oznake (`data-fl-hit`).
 */
export function tekstHtml(
  odlomci: readonly FxOdlomak[],
  margine: IzgledStranice['margine'],
  oznake: ReadonlyMap<number, string>,
  sloj: 'now' | 'after',
  sada: Pick<IzgledStranice, 'font' | 'velicinaPt'>,
  mjera: MjeraLista,
  esc: (v: string) => string,
): string {
  const m = margine;
  const pad = m ? `padding:${mjera.cqw(m.top)} ${mjera.cqw(m.right)} ${mjera.cqw(m.bottom)} ${mjera.cqw(m.left)}` : '';
  const font = `font-family:${pismoCss(sada.font)}`;
  const base = sada.velicinaPt ?? 12;
  return `<div class="fl-text${sloj === 'after' ? ' fl-text--after' : ''}" data-fl-text="${sloj}" lang="hr" style="--fl-ptu:${mjera.ptu};--fl-pt:${zaokruzi(base)};${font};${pad}">`
    + odlomci.map((p) => {
      const hit = oznake.get(p.index);
      return `<p data-fx-par="${p.razina !== null ? 'h' : 'p'}"${sloj === 'now' ? ` data-fl-p="${p.index}"` : ''}`
        + `${hit ? ` data-fl-hit="${hit}"` : ''} style="${stilOdlomka(p)}">${esc(p.text)}</p>`;
    }).join('')
    + '</div>';
}
