/**
 * VEZA KONTROLERA TOKA POPRAVKA NA PANEL (plan T08).
 *
 * Do sada su odabir i zivotni ciklus popravka imali TRI vlasnika: skrivena lista checkboxova (`getCheckedItems`
 * ju je citala u trenutku klika), ledger modal (`repair-price-slider.ts`, pise `cb.checked` izravno) i lokalne
 * zastavice `inFlight`/`lockButton` u svakom panelu zasebno. Plan popravka (`repair-plan-view.ts`) je imao
 * cetvrti, samo vizualni odabir koji se pri klik na "Izradi" odbacivao.
 *
 * Od sada je vlasnik `RepairWorkflowController` (`src/repair/workflow-controller.ts`): on drzi odabir i fazu,
 * dopusta `running` samo iz `ready`, zamrzava odabir dok popravak traje i odbacuje zakasnjeli rezultat stare
 * sesije. Ova veza radi samo dvije stvari: prevodi promjene checkboxova u `setSelected` (i vraca checkbox kad
 * kontroler odbije, npr. tijekom izvrsenja) i prevodi odabir iz plana natrag u checkboxove. Poslovna pravila
 * (privola, prava pristupa, serverski autoritet, redoslijed obrade) OSTAJU u panelima, u adapteru `run`.
 *
 * Skrivena lista ostaje kao DOM ODRAZ odabira, jer je cita ledger modal (`selectedItems` u price-slideru) i
 * postojeci testovi; izvor istine za ono sto se salje je kontroler.
 */
import {
  RepairWorkflowController,
  type RepairSelection,
  type RepairWorkflowState,
} from '../repair/workflow-controller';

export interface WorkflowItemLike {
  ruleId: string;
  violated?: boolean;
}

export interface RepairWorkflowBindingOptions<TResult> {
  items: readonly WorkflowItemLike[];
  /** Skrivena lista s `input[type=checkbox][data-idx]` (indeks u `items`). */
  listEl: HTMLElement;
  /** Identitet sesije dokumenta; promjena dokumenta ili profila daje novi panel, dakle novi token. */
  sessionToken: string;
  /** Postojeci servis popravka; prima `ruleId`-eve u redoslijedu `items`. */
  run: (ruleIds: string[]) => Promise<TResult>;
  /** Provjera ishoda prije proglasenja `complete` (T10). */
  verify: (result: TResult) => Promise<{ ok: boolean; error?: string }>;
}

export interface RepairWorkflowBinding<TResult> {
  readonly controller: RepairWorkflowController<string[], TResult>;
  /** Stavke koje kontroler trenutno drzi odabranima, u redoslijedu `items`. */
  selectedItems<T extends WorkflowItemLike>(items: readonly T[]): T[];
  /** Odabir iz plana (T09): kontroler prvi, checkboxovi kao odraz. Vraca koliko je stavki stvarno postavljeno. */
  applySelection(ruleIds: Iterable<string>): number;
  /** Uskladi checkboxove s kontrolerom (npr. nakon sto je ledger pisao `checked` bez dogadjaja). */
  syncFromList(): void;
  getState(): RepairWorkflowState;
  /**
   * Javlja se TOCNO JEDNOM po stvarnoj promjeni skupa odabranih (usporedba serijaliziranog skupa),
   * i NIJEDNOM kad se postavi ista vrijednost. Pokriva sve tri povrsine koje pisu odabir: skrivenu
   * listu (`change`), ledger (salje bubbling `change` na checkbox, repair-price-slider) i plan
   * (`applySelection`); `syncFromList` isto javlja, jer ledger zna pisati `checked` bez dogadjaja.
   * Vraca odjavu. Poslije `dispose()` se vise ne javlja.
   */
  onSelectionChanged(cb: () => void): () => void;
  dispose(): void;
}

function checkboxes(listEl: HTMLElement): HTMLInputElement[] {
  return Array.from(listEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-idx]'));
}

export function bindRepairWorkflow<TResult>(opts: RepairWorkflowBindingOptions<TResult>): RepairWorkflowBinding<TResult> {
  const { items, listEl } = opts;
  const byIdx = (cb: HTMLInputElement): WorkflowItemLike | undefined => items[Number(cb.dataset.idx)];

  const controller = new RepairWorkflowController<string[], TResult>(
    {
      buildRequest: (selection: RepairSelection) => items.map((i) => i.ruleId).filter((id) => selection.has(id)),
      run: opts.run,
      verify: opts.verify,
    },
    opts.sessionToken,
  );
  // Zadani odabir je isti kao dosadasnji DOM default: prekrseno je predodabrano, ostalo opt-in.
  controller.plan(items.map((i) => i.ruleId), items.filter((i) => i.violated !== false).map((i) => i.ruleId));

  // C6: promjena se javlja po USPOREDBI serijaliziranog skupa, ne po dogadjaju. Ledger salje
  // `change` i kad kontroler odbije (izvrsenje u tijeku) pa se checkbox vrati, a `applySelection`
  // zna postaviti isto sto vec jest; ni jedno ni drugo nije promjena i ne smije pisati u sesiju.
  const listeners = new Set<() => void>();
  const serialize = (): string => items.map((i) => i.ruleId).filter((id) => controller.getState().selection.has(id)).join('\n');
  let lastSerialized = serialize();
  function notifyIfChanged(): void {
    const now = serialize();
    if (now === lastSerialized) return;
    lastSerialized = now;
    for (const cb of [...listeners]) cb();
  }

  function reflect(): void {
    const sel = controller.getState().selection;
    for (const cb of checkboxes(listEl)) {
      const item = byIdx(cb);
      if (item) cb.checked = sel.has(item.ruleId);
    }
    // Ledger (repair-price-slider) slusa ovaj dogadjaj i ponovno crta brojac i retke.
    listEl.dispatchEvent(new Event('lekta-repair-selection', { bubbles: true }));
  }

  function syncFromList(): void {
    for (const cb of checkboxes(listEl)) {
      const item = byIdx(cb);
      if (!item) continue;
      // Kad kontroler odbije (izvrsenje u tijeku), checkbox se vraca na stanje kontrolera: odabir je zamrznut.
      if (!controller.setSelected(item.ruleId, cb.checked)) cb.checked = controller.getState().selection.has(item.ruleId);
    }
    notifyIfChanged();
  }

  const onChange = (event: Event) => {
    const cb = event.target as HTMLInputElement | null;
    if (!cb || cb.type !== 'checkbox' || !cb.dataset.idx) return;
    const item = byIdx(cb);
    if (!item) return;
    if (!controller.setSelected(item.ruleId, cb.checked)) cb.checked = controller.getState().selection.has(item.ruleId);
    notifyIfChanged();
  };
  listEl.addEventListener('change', onChange);

  return {
    controller,
    selectedItems<T extends WorkflowItemLike>(list: readonly T[]): T[] {
      // Ledger pise `checked` bez dogadjaja `change`, pa se prije citanja lista jednom uskladi.
      syncFromList();
      const sel = controller.getState().selection;
      return list.filter((i) => sel.has(i.ruleId));
    },
    applySelection(ruleIds: Iterable<string>): number {
      const wanted = new Set(ruleIds);
      let applied = 0;
      for (const item of items) {
        if (controller.setSelected(item.ruleId, wanted.has(item.ruleId)) && wanted.has(item.ruleId)) applied += 1;
      }
      reflect();
      notifyIfChanged();
      return applied;
    },
    syncFromList,
    getState: () => controller.getState(),
    onSelectionChanged(cb: () => void): () => void {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    dispose: () => {
      listEl.removeEventListener('change', onChange);
      // Bez brisanja pretplata bi stari panel, kroz `applySelection` iz plana, i dalje javljao
      // promjene i prepisivao odabir novog panela u sesiji.
      listeners.clear();
    },
  };
}
