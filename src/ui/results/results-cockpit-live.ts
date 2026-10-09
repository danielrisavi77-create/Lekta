import type { LiveHandle, LiveStanje, mountResultLive } from '../result-live/result-live';
import type { ResultsCockpitAction, ResultsCockpitDesk, ResultsCockpitOptions } from './results-cockpit';
import type { VisualResultModel } from './visual-result-model';
import { escapeHtml } from '../../utils/helpers';

const ROK_UVOZA_STOLA = 6_000;
type RazlogPovratka = 'rok' | 'uvoz' | 'montaza';

type CockpitWithLive = HTMLElement & {
  _desk?: { dispose(): void; index: number } | null;
  _live?: LiveHandle | null;
  _rlStanje?: LiveStanje;
  _rlToken?: number;
  _rlPao?: { readonly kljuc: string; readonly razlog: RazlogPovratka };
};

export interface UpgradeResultCockpitArgs {
  mount: HTMLElement;
  domacin: HTMLElement;
  model: VisualResultModel;
  options: ResultsCockpitOptions;
  desk: ResultsCockpitDesk;
  live: NonNullable<ResultsCockpitDesk['live']>;
  key: string;
  previousIndex: number;
  ceiling: number | null;
  loadedMount: typeof mountResultLive | null;
  timeoutMs?: number;
  cacheOnly?: boolean;
  isCurrent: () => boolean;
  setLoadedMount: (mount: typeof mountResultLive) => void;
  rerender: () => void;
}

/** Vraca fokus na element kokpita; naslov presude nije fokusabilan sam od sebe pa dobiva tabindex. */
function fokusirajCilj(mount: HTMLElement, selector: string): void {
  const target = mount.querySelector<HTMLElement>(selector);
  if (target?.matches('[data-cockpit-verdict-title]') && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  target?.focus({ preventScroll: true });
}

/** Z34 zivi u lijenom modulu; puna Z8 montaza ostaje aktivna dok se modul ucitava. */
export function upgradeResultCockpit(args: UpgradeResultCockpitArgs): void {
  if (args.cacheOnly) {
    if (!args.loadedMount) {
      void import('../result-live/result-live').then((mod) => args.setLoadedMount(mod.mountResultLive), () => {});
    }
    return;
  }
  const { mount, domacin, model, options, desk, live, key, previousIndex } = args;
  const drzac = mount as CockpitWithLive;
  let odustao = false;
  let rok = 0;

  const smjerFokusa = (): 'next' | 'prev' | null => {
    const a = mount.ownerDocument.activeElement as HTMLElement | null;
    if (!a || !domacin.contains(a)) return null;
    if (a.matches('.desk-nav__btn--next')) return 'next';
    if (a.matches('.desk-nav__btn--prev')) return 'prev';
    return null;
  };
  const fokusKokpita = (): string | null => {
    const a = mount.ownerDocument.activeElement;
    if (!a || !mount.contains(a)) return null;
    return [
      '[data-cockpit-verdict-title]',
      '[data-cockpit-primary]',
      '[data-cockpit-action="open-findings"]',
      '[data-cockpit-advanced]',
      '[data-desk-go].desk-nav__btn--next:not([disabled])',
      '[data-desk-go].desk-nav__btn--prev:not([disabled])',
    ].find((sel) => a.matches(sel)) ?? null;
  };
  const fallback = (reason: RazlogPovratka, redraw = true, preferredFocus: string | null = null): void => {
    if (odustao || !args.isCurrent()) return;
    odustao = true;
    mount.ownerDocument.defaultView?.clearTimeout(rok);
    drzac._rlPao = { kljuc: key, razlog: reason };
    delete mount.dataset.rlPending;
    if (!redraw) {
      // Potpuni Z8 vec je vidljiv; oznaka razloga ne smije zamijeniti aktivnu karticu.
      mount.dataset.rlPovratak = reason;
      return;
    }
    const focus = preferredFocus ?? fokusKokpita();
    args.rerender();
    if (focus) {
      fokusirajCilj(mount, focus);
    }
  };
  const stanjeZaZ34 = (): LiveStanje => {
    if (drzac._rlStanje?.kljuc === key) return drzac._rlStanje;
    const index = drzac._desk?.index ?? previousIndex;
    return { kljuc: key, selId: desk.items[index]?.finding.id ?? null, cat: 'all', odabir: null, mode: 'now', odigrano: false };
  };
  const mountLive = (mountFn: typeof mountResultLive): void => {
    if (odustao || !args.isCurrent()) return;
    mount.ownerDocument.defaultView?.clearTimeout(rok);
    const direction = smjerFokusa();
    try {
      const handle = mountFn(mount, domacin, {
        items: desk.items,
        planItems: desk.planItems ?? [],
        repairAvailable: options.repairAvailable,
        authoritative: model.readiness.authoritative,
        score: model.score.kind === 'scored' ? model.score.value : null,
        ceiling: args.ceiling,
        preview: live.preview,
        storedPages: live.storedPages,
        checks: live.checks,
        kljuc: key,
        stanje: stanjeZaZ34(),
        esc: escapeHtml,
        onAction: (action: ResultsCockpitAction, opener?: HTMLElement) => opener
          ? options.onAction?.(action, opener)
          : options.onAction?.(action),
      });
      drzac._desk?.dispose();
      drzac._desk = null;
      drzac._live = handle;
      delete mount.dataset.rlPending;
      delete mount.dataset.rlPovratak;
      if (direction) {
        const other = direction === 'next' ? 'prev' : 'next';
        (domacin.querySelector<HTMLElement>('.desk-nav__btn--' + direction + ':not([disabled])')
          ?? domacin.querySelector<HTMLElement>('.desk-nav__btn--' + other + ':not([disabled])'))?.focus();
      }
    } catch {
      const selector = direction ? '[data-desk-go].desk-nav__btn--' + direction + ':not([disabled])' : null;
      fallback('montaza', true, selector);
      if (selector && !args.isCurrent()) mount.querySelector<HTMLElement>(selector)?.focus();
    }
  };

  if (args.loadedMount) {
    mountLive(args.loadedMount);
    return;
  }

  const timeoutMs = Math.max(0, args.timeoutMs ?? ROK_UVOZA_STOLA);
  rok = mount.ownerDocument.defaultView?.setTimeout(() => fallback('rok', false), timeoutMs) ?? 0;
  void import('../result-live/result-live').then((mod) => {
    // Kasni modul ostaje u cacheu, ali nakon isteka roka ne preuzima Z8 pod prstima.
    args.setLoadedMount(mod.mountResultLive);
    if (odustao || !args.isCurrent()) return;
    mount.ownerDocument.defaultView?.clearTimeout(rok);
    const direction = smjerFokusa();
    const focus = fokusKokpita();
    args.rerender();
    if (focus) {
      fokusirajCilj(mount, focus);
    } else if (direction) {
      const other = direction === 'next' ? 'prev' : 'next';
      (mount.querySelector<HTMLElement>('.desk-nav__btn--' + direction + ':not([disabled])')
        ?? mount.querySelector<HTMLElement>('.desk-nav__btn--' + other + ':not([disabled])'))?.focus();
    }
  }, () => fallback('uvoz', false));
}
