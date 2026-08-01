// src/ui/repair-price-slider.ts
//
// "Koliko platis, toliko popravaka": vizualni preplet nad VEC POSTOJECIM checkbox popisom
// (repair-panel.ts i renderServerRepairPanel u app.ts). NE mijenja naplatu - checkout i
// repair-docx i dalje rade kao danas (fiksna cijena po vrsti rada, sve stavke ukljucene). Ovo je
// preview/UX sloj: kad checkout kasnije prihvati promjenjivi iznos, ista aritmetika
// (src/repair/repair-pricing.ts) postaje stvarna naplata, ne samo procjena.
//
// Slider NE zamjenjuje checkboxove nego ih vodi: povlacenje slidera (de)oznaci checkboxove po
// prioritetu (najvazniji popravci prvi), a rucno (de)oznacavanje pojedinog checkboxa vraca poziciju
// slidera da odgovara stvarno odabranom skupu. Checkbox ostaje jedini izvor istine za ono sto se
// stvarno salje na popravak (getCheckedItems u pozivatelju).

import type { FixerId } from '../repair/apply-fixers';
import { priceRepairItems, priorityOrder, itemsForBudgetFraction, fractionForItems } from '../repair/repair-pricing';

export interface PriceSliderItem {
  fixerId: FixerId;
  label?: string;
}

export interface PriceSliderOptions<T extends PriceSliderItem> {
  /** Isti niz i isti poredak/indeksi kao popis checkboxova (data-idx). */
  items: T[];
  /** Stropna cijena za ovu vrstu rada (WORK_TYPE_TIERS/livePriceEur), ili null kad nije poznata
   *  (npr. besplatna beta bez konfiguriranog checkouta) - tada se prikazuje samo broj stavki. */
  ceilingPriceEur: number | null;
  /** Roditelj koji sadrzi `<input type="checkbox" data-idx="N">` po stavci, isti poredak indeksa
   *  kao `items` (isti obrazac kao getCheckedItems u repair-panel.ts / app.ts). */
  listEl: HTMLElement;
}

const STEPS = 1000;

function pluralPopravaka(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'popravak';
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return 'popravka';
  return 'popravaka';
}

function eur(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} €`;
}

/** Vraca prazan div (bez sadrzaja) kad nema stavki za odabir - pozivatelj ga slobodno mountira
 *  bezuvjetno, isti obrazac kao renderRepairPanel koji rano izlazi kad items.length===0. */
export function renderRepairPriceSlider<T extends PriceSliderItem>(opts: PriceSliderOptions<T>): HTMLElement {
  const { items, ceilingPriceEur, listEl } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'lekta-repair-price-slider';
  if (items.length === 0) return wrap;

  const row = document.createElement('div');
  row.className = 'lekta-repair-price-slider__row';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(STEPS);
  range.className = 'lekta-repair-price-slider__range';
  range.setAttribute('aria-label', 'Koliko popravaka uključiti');
  row.appendChild(range);
  wrap.appendChild(row);

  const label = document.createElement('div');
  label.className = 'lekta-repair-price-slider__label';
  wrap.appendChild(label);

  function checkboxes(): HTMLInputElement[] {
    // Heading plan ima vlastite checkboxe za svako mapiranje. Slider smije upravljati samo
    // glavnim checkboxom stavke, koji jedini nosi data-idx prema ctx.items.
    return Array.from(listEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-idx]'));
  }

  function selectedItems(): T[] {
    const sel: T[] = [];
    checkboxes().forEach((cb) => {
      if (cb.checked) sel.push(items[Number(cb.dataset.idx)]);
    });
    return sel;
  }

  // Cijena se raspodjeljuje nad SVIM ponudjenim stavkama (puni strop), ne samo nad odabranima:
  // priceRepairItems(selected, ceiling) bi ponovno normalizirao cijeli strop na uzi skup, pa bi
  // svaki odabir (i od jedne stavke) ispao pun iznos. Ovdje se svaka stavka cijeni JEDNOM nad
  // punim popisom, a prikaz samo zbraja cijene onih koje su trenutno oznacene.
  const allPriced = priceRepairItems(items, ceilingPriceEur ?? 0);
  function updateLabel(selected: T[]): void {
    const selectedSet = new Set(selected);
    const sum = allPriced.reduce((s, p) => s + (selectedSet.has(p.item) ? p.priceEur : 0), 0);
    const countTxt = `${selected.length} od ${items.length} ${pluralPopravaka(items.length)} uključeno`;
    label.textContent = ceilingPriceEur != null ? `${countTxt} · procjena ${eur(sum)}` : countTxt;
  }

  function applyFraction(fraction: number): void {
    const picked = new Set(itemsForBudgetFraction(items, fraction).map((i) => items.indexOf(i)));
    checkboxes().forEach((cb) => {
      cb.checked = picked.has(Number(cb.dataset.idx));
    });
    updateLabel(selectedItems());
  }

  range.addEventListener('input', () => {
    applyFraction(Number(range.value) / STEPS);
  });

  // Delegiran listener na cijeli popis: hvata i rucne (de)oznake checkboxova unutar liste bez
  // dodavanja zasebnog listenera po stavci (pozivatelj vec ima vlastite listenere na istoj listi;
  // 'change' burblja pa oba mirno supostoje).
  listEl.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const fraction = fractionForItems(items, selectedItems());
    range.value = String(Math.round(fraction * STEPS));
    updateLabel(selectedItems());
  });

  // Pocetno stanje = ono sto je vec oznaceno (danasnji default: prekrseno predodabrano), ne
  // prisilno "sve" - slider se pojavljuje vec usklađen s postojecim opt-out ponasanjem.
  applyFractionFromCurrentSelection();
  function applyFractionFromCurrentSelection(): void {
    const fraction = fractionForItems(items, selectedItems());
    range.value = String(Math.round(fraction * STEPS));
    updateLabel(selectedItems());
  }

  return wrap;
}

/** Oznaka na modalu ovog panela, da re-render (nova analiza) ukloni STARI modal iz <body>
 *  prije nego doda novi - inace bi se modali gomilali izvan mountEl-a koji se prazni drugdje. */
const LEDGER_MODAL_ATTR = 'data-lekta-repair-ledger-modal';

/**
 * Puna "koliko platis, toliko popravaka" prezentacija: kompaktan sazetak (cijena + broj) UMJESTO
 * checkbox popisa, s gumbom koji otvara modal s ledger-stilom (redak po stavci, tockasta linija do
 * cijene, klik pali/gasi). Isti checkboxovi u `listEl` ostaju jedini izvor istine (getCheckedItems
 * u pozivatelju ih i dalje cita neovisno o ovome); ova funkcija ih samo VODI, kao i
 * `renderRepairPriceSlider`, ali s bogatijom prezentacijom.
 *
 * NAMJERNO se koristi samo kad SVE stavke u panelu nemaju prikljucenu naprednu formu (title page,
 * bibliografija i sl.) - pozivatelj (repair-panel.ts / app.ts) odlucuje kad je taj uvjet ispunjen.
 * Ne mijenja default odabir (i dalje "prekrseno je predodabrano"), samo prezentaciju.
 */
export function renderRepairLedgerModal<T extends PriceSliderItem>(opts: PriceSliderOptions<T>): HTMLElement {
  const { items, ceilingPriceEur, listEl } = opts;
  const trigger = document.createElement('div');
  trigger.className = 'lekta-repair-trigger';
  if (items.length === 0) return trigger;

  // Re-render (nova analiza) prije nove liste ukloni stari modal ove vrste iz <body>.
  document.querySelectorAll(`[${LEDGER_MODAL_ATTR}]`).forEach((el) => el.remove());

  const infoEl = document.createElement('div');
  infoEl.className = 'lekta-repair-trigger__info';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'lekta-repair-trigger__btn';
  openBtn.textContent = 'Prilagodi popravke →';
  trigger.append(infoEl, openBtn);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop hidden';
  backdrop.setAttribute(LEDGER_MODAL_ATTR, '');
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const head = document.createElement('div');
  head.className = 'modal-head';
  const title = document.createElement('h3');
  title.textContent = 'Prilagodi popravke';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Zatvori');
  closeBtn.textContent = '×';
  head.append(title, closeBtn);
  const body = document.createElement('div');
  body.className = 'modal-body';
  modal.append(head, body);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const lead = document.createElement('p');
  lead.textContent = `${items.length} ${pluralPopravaka(items.length)}, poredano po važnosti. Klizač pali odozgo prema dolje; klik na redak radi isto.`;
  body.appendChild(lead);

  const listOl = document.createElement('ol');
  listOl.className = 'lekta-repair-ledger-list';
  body.appendChild(listOl);

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(STEPS);
  range.className = 'lekta-repair-ledger-range';
  range.setAttribute('aria-label', 'Koliko popravaka uključiti');
  body.appendChild(range);

  const totalRow = document.createElement('div');
  totalRow.className = 'lekta-repair-ledger-total';
  const totalLabel = document.createElement('span');
  totalLabel.className = 'lekta-repair-ledger-total-label';
  totalLabel.textContent = 'Tvoja cijena';
  const totalNum = document.createElement('span');
  const totalPrice = document.createElement('b');
  const totalCount = document.createElement('small');
  totalNum.append(totalPrice, totalCount);
  totalRow.append(totalLabel, totalNum);
  body.appendChild(totalRow);

  const note = document.createElement('p');
  note.className = 'lekta-repair-ledger-note';
  note.textContent = 'Procjena. Konačna cijena je i dalje ista dok se odabir ne uključi u plaćanje.';
  body.appendChild(note);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'lekta-repair-ledger-done';
  doneBtn.textContent = 'Gotovo';
  body.appendChild(doneBtn);

  function checkboxes(): HTMLInputElement[] {
    return Array.from(listEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-idx]'));
  }
  function selectedItems(): T[] {
    const sel: T[] = [];
    checkboxes().forEach((cb) => {
      if (cb.checked) sel.push(items[Number(cb.dataset.idx)]);
    });
    return sel;
  }

  const allPriced = priceRepairItems(items, ceilingPriceEur ?? 0);
  const ordered = priorityOrder(items);
  const rowByItem = new Map<T, HTMLButtonElement>();
  for (const item of ordered) {
    const idx = items.indexOf(item);
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lekta-repair-ledger-row';
    row.setAttribute('role', 'checkbox');
    row.innerHTML =
      '<span class="lekta-repair-ledger-mark" aria-hidden="true">—</span>' +
      '<span class="lekta-repair-ledger-fill-label"></span>' +
      '<span class="lekta-repair-ledger-fill"></span>' +
      '<span class="lekta-repair-ledger-price"></span>';
    (row.querySelector('.lekta-repair-ledger-fill-label') as HTMLElement).textContent = item.label ?? '';
    row.addEventListener('click', () => {
      const cb = checkboxes().find((c) => Number(c.dataset.idx) === idx);
      if (cb) cb.checked = !cb.checked;
      renderAll();
    });
    li.appendChild(row);
    listOl.appendChild(li);
    rowByItem.set(item, row);
  }

  function renderAll(): void {
    const selected = new Set(selectedItems());
    let sum = 0;
    rowByItem.forEach((row, item) => {
      const isOn = selected.has(item);
      row.classList.toggle('on', isOn);
      row.setAttribute('aria-checked', String(isOn));
      const priced = allPriced.find((p) => p.item === item);
      const price = priced ? priced.priceEur : 0;
      (row.querySelector('.lekta-repair-ledger-price') as HTMLElement).textContent = ceilingPriceEur != null ? eur(price) : '';
      if (isOn) sum += price;
    });
    const countTxt = `${selected.size} od ${items.length} ${pluralPopravaka(items.length)}`;
    totalPrice.textContent = ceilingPriceEur != null ? eur(sum) : '—';
    totalCount.textContent = countTxt;
    infoEl.innerHTML = '';
    const priceSpan = document.createElement('span');
    priceSpan.className = 'lekta-repair-trigger__price';
    priceSpan.textContent = ceilingPriceEur != null ? eur(sum) : countTxt;
    infoEl.appendChild(priceSpan);
    if (ceilingPriceEur != null) infoEl.appendChild(document.createTextNode(` · ${countTxt}`));
    range.value = String(Math.round(fractionForItems(items, [...selected]) * STEPS));
  }

  range.addEventListener('input', () => {
    const picked = new Set(itemsForBudgetFraction(items, Number(range.value) / STEPS));
    checkboxes().forEach((cb) => {
      cb.checked = picked.has(items[Number(cb.dataset.idx)]);
    });
    renderAll();
  });

  // Pocetno stanje = ono sto je vec oznaceno (danasnji opt-out default: prekrseno predodabrano).
  renderAll();

  let lastFocused: HTMLElement | null = null;
  function openModal(): void {
    lastFocused = document.activeElement as HTMLElement | null;
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function closeModal(): void {
    backdrop.classList.add('hidden');
    document.body.style.overflow = '';
    lastFocused?.focus?.();
  }
  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  return trigger;
}
