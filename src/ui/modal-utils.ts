/**
 * Fokus u modalima (a11y): zarobi Tab unutar modala i vrati fokus na okidac pri zatvaranju.
 * Izdvojeno iz app.ts da ga repair-panel.ts/repair-price-slider.ts mogu koristiti bez
 * cikličkog uvoza (app.ts vec uvozi rendere iz tih datoteka).
 */
let _modalReturnFocus: HTMLElement | null = null;
let _modalDepth = 0;

/**
 * ZADNJI ELEMENT NA KOJI JE KORISNIK KLIKNUO, GLOBALNO PRACEN (korak D, 2026-09-13).
 *
 * WebKit gumbe NE fokusira na klik misem (samo tekstualna polja i slicno; poznato, namjerno
 * ponasanje Safarija bez "Full Keyboard Access"). Okidac modala (npr. gumb "Promijeni") je
 * skoro uvijek `<button>`, pa `trapModal` u WebKitu zna zateci `document.activeElement` na
 * `<body>` umjesto na stvarnom okidacu, i `releaseModal` poslije nema kamo vratiti fokus.
 *
 * IZMJERENO 2026-09-13 (`tests/ux/workspace-entry.spec.ts`, "list profila", webkit): nakon klika
 * na `[data-change-profile]` i otvaranja `#profileSheet`, `document.activeElement` je bio
 * `<body>` (`tagName: "BODY"`), a poslije Escapea fokus se NIJE vratio na "Promijeni". U
 * Chromiumu isti tok prolazi, jer ondje klik na gumb i fokusira gumb.
 *
 * PRVI POKUSAJ POPRAVKA (padao je): koristiti ovaj zapis SAMO kad je `document.activeElement`
 * bas `<body>`. Nedovoljno, jer aktivni element zna biti neki DRUGI, STAR ostatak (npr.
 * `#fileInput` s ranijeg koraka), ne bas `<body>` - `active !== document.body` je tad tocno, pa bi
 * kod zadrzao krivi, zastarjeli element umjesto stvarnog okidaca.
 *
 * DRUGI POKUSAJ POPRAVKA (i on je padao, otkriveno na CI-ju 2026-09-13, ne lokalno): "svjez klik"
 * mjeren PROTEKLIM VREMENOM (`Date.now() - _lastPointerAt < 500`) je utrka, ne popravak. Traka
 * privole u `beforeEach` (`tests/ux/workspace-a11y.spec.ts`) klikne "#analyticsDecline" NAKON
 * `page.goto`, sto ostavi zapis. Ako sve sljedece (upload, cekanje koraka 2, fokus na
 * `[data-change-profile]`, Enter) na BRZOM stroju stane u tih 500 ms, `trapModal` je zapis od
 * TRAKE PRIVOLE tumacio kao svjez klik na "Promijeni" i njega spremio kao okidac; Escape je poslije
 * fokus vratio na (vec uklonjeni) gumb trake, ne na "Promijeni". Na sporijem Windows stroju isti
 * niz koraka traje dulje od 500 ms, prozor istekne, i test prolazi - otud CI crven/lokalno zeleno.
 * Popravak je isti FER pilot bez sata: zapis vrijedi dok ga ne potrosi TOCNO JEDAN modal ILI dok se
 * ne dogodi SLJEDECI `focusin` (stvaran pomak fokusa dokazuje da je zapis vec odradio svoje, ili da
 * dolazi od nepovezane interakcije). Tipkovnicki put je time siguran bez ijednog mjerenja vremena:
 * da bi se `Enter` uopce pritisnuo na okidacu, okidac je prije toga MORAO primiti fokus, sto je vec
 * jedan `focusin` koji je obrisao stariji zapis. Slusac je na `document` s capture:true da uhvati
 * klik i kad ga ciljni rukovatelj poslije zaustavi (`stopPropagation`).
 */
let _lastPointerTarget: HTMLElement | null = null;
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.target instanceof HTMLElement) _lastPointerTarget = e.target;
  },
  true,
);
/**
 * TRECI ISPRAVAK (2026-09-23): "sljedeci focusin" NIJE uvijek dokaz da je zapis odradio svoje.
 *
 * WebKit gumbe ne fokusira na klik, ali fokus ne ostavlja ni na miru: fokusira NAJBLIZEG
 * fokusabilnog PRETKA kliknutog elementa. Na `/rad/` je to `<main id="workspace">`, koji je
 * fokusabilan (`tabindex="-1"`) jer je meta preskocne poveznice (`src/shared/skip-link.ts`).
 *
 * IZMJERENO 2026-09-23 (`mobile-webkit`, sonda nad `/rad/`, capture slusaci na dokumentu):
 *
 *     17358 ms  pointerdown  BUTTON  (unutar [data-change-profile])
 *     17358 ms  focusin      MAIN#workspace
 *     17370 ms  click        BUTTON  (unutar [data-change-profile])
 *
 * Taj `focusin` dolazi iz ISTE geste kao i `pointerdown`, i to PRIJE `click`-a, pa je brisao
 * zapis prije nego ga je `trapModal` uopce stigao procitati. `_modalReturnFocus` je zatim padao
 * na `document.activeElement`, dakle na `<main>`, i Escape je fokus vracao na `<main>` umjesto
 * na "Promijeni". Mjereno nad zatecenim masterom: 9 od 10 prolaza
 * `tests/ux/workspace-entry.spec.ts` ("list profila") palo je na toj tvrdnji.
 *
 * PRAVILO JE ZATO SUZENO, NE UKINUTO: zapis se trosi na svaki stvaran pomak fokusa, OSIM kad je
 * novo fokusirano cvoriste PREDAK zapisanog elementa. Samo taj slucaj je WebKitova zamjena za
 * fokus na gumbu i samo on dolazi iz iste geste. Tipkovnicki put ostaje siguran bez sata: fokus
 * na samom okidacu je pomak na element koji NIJE predak starijeg zapisa, pa ga brise.
 */
document.addEventListener('focusin', (e) => {
  const cilj = e.target;
  if (
    _lastPointerTarget
    && cilj instanceof Node
    && cilj !== _lastPointerTarget
    && cilj.contains(_lastPointerTarget)
  ) return;
  _lastPointerTarget = null;
});

export function modalFocusables(el: HTMLElement): HTMLElement[] {
  return [
    ...el.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ].filter((x) => x.offsetWidth || x.offsetHeight || x.getClientRects().length);
}

export function setBackgroundInert(on: boolean): void {
  ['header.topbar', 'main', 'footer'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (on) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  });
}

export function trapModal(el: HTMLElement | null): void {
  if (!el) return;
  const active = document.activeElement;
  _modalReturnFocus = _lastPointerTarget
    ? _lastPointerTarget
    : active instanceof HTMLElement && active !== document.body
      ? active
      : null;
  _lastPointerTarget = null;
  if (++_modalDepth === 1) setBackgroundInert(true);
  (el as any)._trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = modalFocusables(el);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', (el as any)._trap);
  setTimeout(() => {
    (el.querySelector<HTMLElement>('.modal-close') || modalFocusables(el)[0])?.focus();
  }, 30);
}

/**
 * FOKUS VRACA SAMO MODAL KOJI GA JE I UZEO, i to TEK nakon sto pozadina prestane biti inertna.
 *
 * Do 2026-09-07 je vracanje fokusa stajalo IZVAN provjere `_trap`, pa ga je trosio prvi poziv
 * bez obzira je li taj modal uopce bio otvoren. Globalni Escape rukovatelj zove SVE zatvarace
 * redom (`closeOrder(); closeHistory(); closeLegal(); ...`), pa je `_modalReturnFocus` potrosio
 * `closeOrder`, i to dok je `main` jos `inert`: `.focus()` na element u inertnom podstablu tiho
 * ne uspije, a zastavica se ipak obrise, pa pravi modal poslije nema sto vratiti.
 *
 * Posljedica je bila da se fokus gubi na SVAKOM modalu zatvorenom Escapeom, a ne samo na jednom.
 * Izmjereno na zatecenom `#legalModal`, bez ijedne izmjene u njegovu putu:
 *     X gumb   fokus se vraca na [data-legal] poveznicu
 *     Escape   fokus zavrsi na <body>
 * Gard: `tests/ux/workspace-entry.spec.ts` (list profila) mjeri oba puta.
 *
 * Svi pozivatelji prosljedjuju element koji su prethodno i zarobili, pa rani izlaz nista ne gubi.
 */
export function releaseModal(el: HTMLElement | null): void {
  if (!el || !(el as any)._trap) return;
  el.removeEventListener('keydown', (el as any)._trap);
  (el as any)._trap = null;
  if (--_modalDepth <= 0) {
    _modalDepth = 0;
    setBackgroundInert(false);
  }
  if (_modalReturnFocus) {
    try {
      _modalReturnFocus.focus();
    } catch {
      /* element vise nije u DOM-u ili nije fokusabilan, sigurno preskoci */
    }
    _modalReturnFocus = null;
  }
}
