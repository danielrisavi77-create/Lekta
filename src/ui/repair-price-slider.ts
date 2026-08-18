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
import { priorityOrder, itemsForBudgetFraction, fractionForItems } from '../repair/repair-pricing';
import { trapModal, releaseModal } from './modal-utils';

export interface PriceSliderItem {
  fixerId: FixerId;
  label?: string;
  /** Za scrollToRepairPanel (skok s kartice nalaza) i za oznaku retka u ledgeru. */
  ruleId?: string;
  /** Institucijska preporuka (nije bodovano, uvijek opt-in) - ledger redak dobiva bedz. */
  recommended?: boolean;
}

/**
 * Za stavke koje nose naprednu formu (literatura, citati, fusnote...) - kako ledger redak
 * ponudi uvid/uredjivanje bez da unaprijed odmota sve retke te forme u glavni popis.
 * `render*Controls` funkcije u repair-panel.ts ostaju izvor markupa; ovaj deskriptor samo kaze
 * GDJE (Tier A: poseban modal, Tier B: inline <details>) i KAKO (render callback) se pozivaju.
 */
export interface AdvancedFormDescriptor {
  tier: 'A' | 'B';
  /** Naziv sekcije za gumb/summary, npr. "Literatura". */
  label: string;
  /** Broj zapisa/redaka, za "Uredi {label} ({count}) →". */
  count: number;
  /** Gradi postojeci markup forme (poziva odgovarajuci render*Controls) unutar dane posude. */
  render: (container: HTMLElement) => void;
}

export interface PriceSliderOptions<T extends PriceSliderItem> {
  /** Isti niz i isti poredak/indeksi kao popis checkboxova (data-idx). */
  items: T[];
  /** Roditelj koji sadrzi `<input type="checkbox" data-idx="N">` po stavci, isti poredak indeksa
   *  kao `items` (isti obrazac kao getCheckedItems u repair-panel.ts / app.ts). */
  listEl: HTMLElement;
  /** Samo za renderRepairLedgerModal: opisuje naprednu formu stavke, ako postoji. Izostavljeno
   *  (ili null povrat) znaci "obican checkbox redak", isto ponasanje kao danas. */
  advancedFormFor?: (item: T) => AdvancedFormDescriptor | null;
}

const STEPS = 1000;

/**
 * DOKAZNI CIP: odakle stavka crpi autoritet.
 *
 * Izostanak oznake ZNACI opcu preporuku: stavka koja nije izgradjena iz fakultetskog `ruleEntry`
 * po definiciji nije nista sto fakultet propisuje (univerzalna higijena, npr. prazni odlomci ili
 * hrvatska tipografija). Zato je default ovdje, na jednom mjestu, umjesto da se rucno oznacava
 * desetak univerzalnih graditelja i da se na prvi zaboravljeni tiho tvrdi vise nego sto smijemo.
 */
const AUTHORITY_CHIP: Record<string, { text: string; cls: string }> = {
  'faculty-rule': { text: 'Pravilo fakulteta', cls: 'is-rule' },
  'faculty-recommendation': { text: 'Preporuka fakulteta, ne ulazi u ocjenu', cls: 'is-faculty-tip' },
  'lekta-recommendation': { text: 'Opća preporuka Lekte, nije pravilo fakulteta', cls: 'is-lekta-tip' },
};

function authorityChip(item: { authority?: string }): HTMLElement {
  const meta = AUTHORITY_CHIP[item.authority ?? 'lekta-recommendation'] ?? AUTHORITY_CHIP['lekta-recommendation'];
  const chip = document.createElement('small');
  chip.className = `lekta-repair-ledger-authority ${meta.cls}`;
  chip.textContent = meta.text;
  return chip;
}

/** Naslov zone u ledgeru (nije stavka: `role=presentation` da ga citac ekrana ne broji kao izbor). */
function zoneHeading(title: string, explanation: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'lekta-repair-ledger-zone';
  li.setAttribute('role', 'presentation');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = explanation;
  li.append(strong, small);
  return li;
}

function pluralPopravaka(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'popravak';
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return 'popravka';
  return 'popravaka';
}

/** Oznaka na modalu ovog panela, da re-render (nova analiza) ukloni STARI modal iz <body>
 *  prije nego doda novi - inace bi se modali gomilali izvan mountEl-a koji se prazni drugdje. */
const LEDGER_MODAL_ATTR = 'data-lekta-repair-ledger-modal';

/**
 * Puna "koliko platis, toliko popravaka" prezentacija: kompaktan sazetak (cijena + broj) UMJESTO
 * checkbox popisa, s gumbom koji otvara modal s ledger-stilom (redak po stavci, tockasta linija do
 * cijene, klik pali/gasi). Isti checkboxovi u `listEl` ostaju jedini izvor istine (getCheckedItems
 * u pozivatelju ih i dalje cita neovisno o ovome); ova funkcija ih samo VODI.
 *
 * Stavke s naprednom formom (literatura, citati, fusnote...) dobivaju dodatnu "Uredi... →" akciju
 * (Tier A: poseban modal) ili inline <details> (Tier B), preko `opts.advancedFormFor` - vidi
 * AdvancedFormDescriptor. Bez tog callbacka (ili null povrat po stavci) redak ostaje obican
 * checkbox, isto ponasanje kao danas. Ne mijenja default odabir (i dalje "prekrseno je
 * predodabrano"), samo prezentaciju.
 */
export function renderRepairLedgerModal<T extends PriceSliderItem>(opts: PriceSliderOptions<T>): HTMLElement {
  const { items, listEl, advancedFormFor } = opts;
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
  totalLabel.textContent = 'Opseg popravka';
  const totalNum = document.createElement('span');
  const totalPrice = document.createElement('b');
  const totalCount = document.createElement('small');
  totalNum.append(totalPrice, totalCount);
  totalRow.append(totalLabel, totalNum);
  body.appendChild(totalRow);

  // Disclaimer "Procjena. Konačna cijena je i dalje ista..." je uklonjen zajedno s iznosom:
  // nema sto opravdavati kad se cijena vise ne prikazuje. Cijena se navodi jednom, na checkoutu,
  // gdje je i stvarna.
  const note = document.createElement('p');
  note.className = 'lekta-repair-ledger-note';
  note.textContent = 'Odaberi koliko popravaka uključiti. Cijena ne ovisi o odabiru.';
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

  const ordered = priorityOrder(items);
  const rowByItem = new Map<T, HTMLButtonElement>();
  /**
   * DVIJE ZONE umjesto jednog ravnog popisa.
   *
   * Korisnik je dotad morao istovremeno drzati u glavi sedam usporednih taksonomija (auto/assisted/
   * manual, blocker/dorada/rucno, prekrseno/preporuceno, dubinsko, strop popravka, status profila).
   * Jedina razlika koja mu MIJENJA odluku je: mogu li ovo pustiti bez razmisljanja, ili moram
   * pogledati sto ce se tocno dogoditi.
   *
   * Granica je `requiresConfirmation`, ista zastavica koju panel vec koristi da prisili potvrdni
   * korak prije primjene (`needsConfirm` u repair-panel.ts), pa zone ne uvode novu klasifikaciju
   * nego imenuju onu koja vec postoji.
   */
  const isAdvanced = (item: T): boolean => (item as { requiresConfirmation?: boolean }).requiresConfirmation === true;
  const safeCount = ordered.filter((item) => !isAdvanced(item)).length;
  const advancedCount = ordered.length - safeCount;
  /** Zone se prikazuju samo kad OBJE postoje: jedan naslov nad jedinim popisom je sum. */
  const showZones = safeCount > 0 && advancedCount > 0;
  const zoned = showZones ? [...ordered.filter((i) => !isAdvanced(i)), ...ordered.filter(isAdvanced)] : ordered;
  let zoneRendered = { safe: false, advanced: false };

  for (const item of zoned) {
    if (showZones) {
      const advanced = isAdvanced(item);
      if (!advanced && !zoneRendered.safe) {
        zoneRendered = { ...zoneRendered, safe: true };
        listOl.appendChild(zoneHeading(`Sigurni automatski popravci (${safeCount})`, 'Primjenjujemo ih bez mijenjanja akademskog sadržaja.'));
      } else if (advanced && !zoneRendered.advanced) {
        zoneRendered = { ...zoneRendered, advanced: true };
        listOl.appendChild(zoneHeading(`Napredni popravci (${advancedCount})`, 'Traže tvoju potvrdu jer mijenjaju strukturu, numeriranje, naslovnicu ili literaturu.'));
      }
    }
    const idx = items.indexOf(item);
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lekta-repair-ledger-row';
    row.setAttribute('role', 'checkbox');
    if (item.ruleId) row.dataset.ruleId = item.ruleId;
    row.innerHTML =
      '<span class="lekta-repair-ledger-mark" aria-hidden="true">—</span>' +
      '<span class="lekta-repair-ledger-fill-label"></span>' +
      (item.recommended ? '<span class="lekta-repair-ledger-badge">Preporučeno</span>' : '') +
      '<span class="lekta-repair-ledger-fill"></span>' +
      '<span class="lekta-repair-ledger-price"></span>';
    (row.querySelector('.lekta-repair-ledger-fill-label') as HTMLElement).textContent = item.label ?? '';
    row.addEventListener('click', () => {
      const cb = checkboxes().find((c) => Number(c.dataset.idx) === idx);
      if (cb) cb.checked = !cb.checked;
      renderAll();
    });
    li.appendChild(row);
    // Cip ide ISPOD retka: redak je gumb (role=checkbox), pa cip u njemu ne smije biti jer bi
    // postao dio klikabilne oznake i citac ekrana bi ga procitao kao dio izbora.
    li.appendChild(authorityChip(item as { authority?: string }));

    // Napredna forma (literatura, citati, fusnote...): Tier A = zaseban modal ("Uredi... →"),
    // Tier B = inline <details> tu u retku. Bez descriptora ostaje obican checkbox redak.
    const descriptor = advancedFormFor?.(item) ?? null;
    if (descriptor?.tier === 'A') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'lekta-repair-ledger-row-edit';
      editBtn.textContent = `${descriptor.label} (${descriptor.count}) →`;
      editBtn.addEventListener('click', () => {
        closeLedger();
        openItemModal(descriptor, () => openLedger());
      });
      li.appendChild(editBtn);
    } else if (descriptor?.tier === 'B') {
      const details = document.createElement('details');
      details.className = 'lekta-repair-panel__more';
      const summary = document.createElement('summary');
      summary.textContent = `${descriptor.label} (${descriptor.count})`;
      details.appendChild(summary);
      let built = false;
      details.addEventListener('toggle', () => {
        if (details.open && !built) {
          built = true;
          descriptor.render(details);
        }
      });
      li.appendChild(details);
    }

    listOl.appendChild(li);
    rowByItem.set(item, row);
  }

  /** Tier A: zaseban, fokusirani modal SAMO za jednu naprednu formu (npr. 23 zapisa literature).
   *  Gradi se LIJENO na klik (ne unaprijed), i uvijek ZAMIJENI ledger (ne slaze se preko njega) -
   *  "‹ Natrag" zatvara ovaj modal i ponovno otvara ledger. */
  function openItemModal(descriptor: AdvancedFormDescriptor, onBack: () => void): void {
    const itemBackdrop = document.createElement('div');
    itemBackdrop.className = 'modal-backdrop';
    const itemModal = document.createElement('div');
    itemModal.className = 'modal';
    itemModal.setAttribute('role', 'dialog');
    itemModal.setAttribute('aria-modal', 'true');
    const itemHead = document.createElement('div');
    itemHead.className = 'modal-head';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'lekta-repair-ledger-back';
    backBtn.textContent = '‹ Natrag';
    const itemTitle = document.createElement('h3');
    itemTitle.textContent = descriptor.label;
    const itemClose = document.createElement('button');
    itemClose.type = 'button';
    itemClose.className = 'modal-close';
    itemClose.setAttribute('aria-label', 'Zatvori');
    itemClose.textContent = '×';
    itemHead.append(backBtn, itemTitle, itemClose);
    const itemBody = document.createElement('div');
    itemBody.className = 'modal-body';
    descriptor.render(itemBody);
    itemModal.append(itemHead, itemBody);
    itemBackdrop.appendChild(itemModal);
    document.body.appendChild(itemBackdrop);
    trapModal(itemBackdrop);
    function closeItem(goBack: boolean): void {
      releaseModal(itemBackdrop);
      itemBackdrop.remove();
      if (goBack) onBack();
    }
    backBtn.addEventListener('click', () => closeItem(true));
    itemClose.addEventListener('click', () => closeItem(false));
    itemBackdrop.addEventListener('click', (e) => {
      if (e.target === itemBackdrop) closeItem(false);
    });
    itemBackdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeItem(false);
    });
  }

  function renderAll(): void {
    const selected = new Set(selectedItems());
    rowByItem.forEach((row, item) => {
      const isOn = selected.has(item);
      row.classList.toggle('on', isOn);
      row.setAttribute('aria-checked', String(isOn));
    });
    // Prikazuje se OPSEG, nikad iznos. Ledger je jedini vidljivi popis stavki (checkbox lista je
    // skrivena), pa bi iznos u eurima ovdje bio primarno sucelje za cijenu koja nije stvarna:
    // checkout naplacuje fiksni tier po vrsti rada (src/report/pricing.ts) bez obzira na odabir.
    // Tezine iz repair-pricing.ts i dalje odredjuju REDOSLIJED i korak klizaca, samo se vise ne
    // prevode u novac.
    const countTxt = `${selected.size} od ${items.length} ${pluralPopravaka(items.length)}`;
    totalPrice.textContent = String(selected.size);
    totalCount.textContent = countTxt;
    infoEl.innerHTML = '';
    const scopeSpan = document.createElement('span');
    scopeSpan.className = 'lekta-repair-trigger__price';
    scopeSpan.textContent = countTxt;
    infoEl.appendChild(scopeSpan);
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

  // trapModal/releaseModal (modal-utils.ts) daju pravi focus-trap + inertnu pozadinu, isti obrazac
  // kao svaki drugi modal u appu (prije je ovo bio bespoke openModal/closeModal bez toga).
  function openLedger(): void {
    backdrop.classList.remove('hidden');
    trapModal(backdrop);
  }
  function closeLedger(): void {
    releaseModal(backdrop);
    backdrop.classList.add('hidden');
  }
  openBtn.addEventListener('click', openLedger);
  closeBtn.addEventListener('click', closeLedger);
  doneBtn.addEventListener('click', closeLedger);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeLedger();
  });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLedger();
  });

  return trigger;
}
