import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import rawWorkTypeLabels from '../../data/work-type-labels.json';
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from './browser-storage';
import { defaultWorkTypeForProgram, visibleProgramsForUnit } from '../ui/work-selection';

type Preferences = Record<string, unknown>;

const PROFILE_KEYS = ['institution', 'unit', 'program', 'workType', 'variant'] as const;
const WORK_TYPE_LABELS = rawWorkTypeLabels as Record<string, string>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('hr');
}

function preferences(): Preferences {
  const value: unknown = safeStorageGet(STORAGE_KEYS.preferences, {});
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Preferences : {};
}

function option(select: HTMLSelectElement, value: string, label: string): HTMLOptionElement {
  const element = select.ownerDocument.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

/**
 * The profile picker is loaded only after the profile plate is opened. It uses the same catalog
 * and routing helpers as the workspace, then writes the shared preference record.
 */
export function openSiteProfileDrawer(
  doc: Document,
  trigger: HTMLElement,
  onSaved: (selection: { unit: string; program: string; workType: string } | null) => void,
): void {
  const existing = doc.querySelector<HTMLDialogElement>('[data-site-profile-dialog]');
  if (existing) {
    if (!existing.open) existing.showModal();
    return;
  }

  const dialog = doc.createElement('dialog');
  dialog.className = 'site-profile-dialog';
  dialog.dataset.siteProfileDialog = '';
  dialog.setAttribute('aria-labelledby', 'siteProfileTitle');
  dialog.innerHTML = `
    <div class="site-profile-dialog__sheet">
      <header class="site-profile-dialog__head">
        <div><span class="site-profile-dialog__eyebrow">LEKTA · PROFIL</span><h2 id="siteProfileTitle">Odaberi profil</h2></div>
          <button class="site-profile-dialog__close" type="button" data-profile-close aria-label="Zatvori izbor profila">×</button>
      </header>
      <p class="site-profile-dialog__intro">Profil usmjerava provjeru na dostupna pravila ustanove. Rad možeš učitati i bez odabira profila.</p>
      <label class="site-profile-dialog__search" for="siteProfileSearch">Pretraži fakultete
        <input id="siteProfileSearch" type="search" autocomplete="off" placeholder="Upiši naziv ili kraticu">
      </label>
      <div class="site-profile-dialog__fields">
        <fieldset><legend>01 · Fakultet</legend>
          <label for="siteProfileInstitution">Sveučilište</label><select id="siteProfileInstitution"></select>
          <label for="siteProfileUnit">Fakultet ili akademija</label><select id="siteProfileUnit"></select>
        </fieldset>
        <fieldset><legend>02 · Studij</legend>
          <label for="siteProfileProgram">Studij</label><select id="siteProfileProgram"></select>
        </fieldset>
        <fieldset><legend>03 · Vrsta rada</legend>
          <label for="siteProfileWorkType">Vrsta rada</label><select id="siteProfileWorkType"></select>
          <small class="site-profile-dialog__field-note">Dostupnost pravila i posebne varijante potvrđuju se u radnom prostoru.</small>
        </fieldset>
      </div>
      <p class="site-profile-dialog__note" data-profile-note role="status" aria-live="polite"></p>
      <footer class="site-profile-dialog__actions">
        <button class="site-profile-dialog__remove" type="button" data-profile-remove>Ukloni profil s ovog preglednika</button>
        <button class="site-profile-dialog__save" type="button" data-profile-save>Spremi profil</button>
      </footer>
    </div>`;
  doc.body.append(dialog);

  const institution = dialog.querySelector<HTMLSelectElement>('#siteProfileInstitution')!;
  const unit = dialog.querySelector<HTMLSelectElement>('#siteProfileUnit')!;
  const program = dialog.querySelector<HTMLSelectElement>('#siteProfileProgram')!;
  const workType = dialog.querySelector<HTMLSelectElement>('#siteProfileWorkType')!;
  const search = dialog.querySelector<HTMLInputElement>('#siteProfileSearch')!;
  const note = dialog.querySelector<HTMLElement>('[data-profile-note]')!;
  const institutions = [...ZAGREB_CATALOG].sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  const saved = preferences();
  const url = new URL(doc.defaultView?.location.href ?? 'https://lekta.invalid/');
  const query = url.searchParams;
  const savedUnit = text(saved.unit) || text(query.get('unit'));
  const savedWorkType = text(saved.workType) || text(query.get('work'));
  let searchValue = '';

  institution.replaceChildren(
    option(institution, '', 'Odaberi sveučilište'),
    ...institutions.map((item) => option(institution, item.id, item.name)),
  );
  const institutionForUnit = (unitId: string): string => institutions.find((item) => item.units.some((entry) => entry.id === unitId))?.id ?? '';
  const savedInstitution = text(saved.institution);
  institution.value = institutionForUnit(savedUnit)
    || (institutions.some((item) => item.id === savedInstitution) ? savedInstitution : '');

  const selectedInstitution = () => institutions.find((item) => item.id === institution.value);
  const allVisibleUnits = () => {
    const selected = selectedInstitution();
    const candidates = searchValue
      ? institutions.flatMap((owner) => owner.units.map((item) => ({ item, owner })))
      : selected ? selected.units.map((item) => ({ item, owner: selected })) : [];
    return candidates
      .filter(({ item, owner }) => !searchValue || normalizeSearch(`${item.name} ${item.id} ${owner.name}`).includes(searchValue))
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'hr') || a.owner.name.localeCompare(b.owner.name, 'hr'));
  };
  const fillUnits = (preferred = unit.value || savedUnit): void => {
    const visible = allVisibleUnits();
    let emptyLabel = 'Najprije odaberi sveučilište';
    if (searchValue) emptyLabel = 'Nema rezultata';
    else if (selectedInstitution()) emptyLabel = 'Nema dostupnih fakulteta';
    if (visible.length) emptyLabel = 'Odaberi fakultet ili akademiju';
    const placeholder = option(unit, '', emptyLabel);
    unit.replaceChildren(placeholder, ...visible.map(({ item, owner }) => option(unit, item.id, searchValue ? `${item.name} · ${owner.name}` : item.name)));
    unit.value = visible.some(({ item }) => item.id === preferred) ? preferred : '';
    unit.disabled = visible.length === 0;
  };

  const fillPrograms = (preferred = program.value || text(saved.program)): void => {
    const pickedUnit = selectedInstitution()?.units.find((item) => item.id === unit.value);
    const values = pickedUnit ? visibleProgramsForUnit([], pickedUnit) : [];
    program.replaceChildren(option(program, '', values.length ? 'Odaberi studij' : 'Odaberi fakultet za popis studija'), ...values.map((value) => option(program, value, value)));
    program.value = values.includes(preferred) ? preferred : values[0] ?? '';
    program.disabled = !pickedUnit || values.length === 0;
  };

  const fillWorkTypes = (preferred = workType.value || text(saved.workType)): void => {
    const current = defaultWorkTypeForProgram(program.value, new Set(), preferred || 'graduate');
    const all = Object.entries(WORK_TYPE_LABELS).sort((a, b) => a[1].localeCompare(b[1], 'hr'));
    workType.replaceChildren(...all.map(([key, label]) => option(workType, key, label)));
    workType.value = all.some(([key]) => key === current) ? current : all[0]?.[0] ?? '';
    workType.disabled = all.length === 0;
  };

  fillUnits(savedUnit);
  fillPrograms(text(saved.program));
  fillWorkTypes(savedWorkType);

  institution.addEventListener('change', () => { fillUnits(''); fillPrograms(''); fillWorkTypes(''); });
  unit.addEventListener('change', () => {
    const owner = institutions.find((item) => item.units.some((entry) => entry.id === unit.value));
    if (owner) institution.value = owner.id;
    fillPrograms(''); fillWorkTypes('');
  });
  program.addEventListener('change', () => { fillWorkTypes(''); });
  search.addEventListener('input', () => {
    searchValue = normalizeSearch(search.value.trim());
    fillUnits(''); fillPrograms(''); fillWorkTypes('');
  });

  const zatvori = (): void => dialog.close();
  dialog.querySelector<HTMLButtonElement>('[data-profile-close]')!.addEventListener('click', zatvori);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) zatvori(); });
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    dialog.remove();
    trigger.focus();
  }, { once: true });

  dialog.querySelector<HTMLButtonElement>('[data-profile-save]')!.addEventListener('click', () => {
    if (!institution.value || !unit.value || !program.value || !workType.value) {
      note.textContent = 'Odaberi dostupne vrijednosti za fakultet, studij i vrstu rada.';
      return;
    }
    const previous = preferences();
    const next = { ...previous };
    delete next.variant;
    const stored = safeStorageSet(STORAGE_KEYS.preferences, {
      ...next,
      institution: institution.value,
      unit: unit.value,
      program: program.value,
      workType: workType.value,
    });
    if (!stored) {
      safeStorageSet(STORAGE_KEYS.preferences, previous);
      note.textContent = 'Preglednik ne dopušta trajno spremanje. Profil nije spremljen; možeš nastaviti bez njega ili zatvoriti ovaj izbor.';
      return;
    }
    query.delete('unit');
    query.delete('work');
    doc.defaultView?.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    onSaved({ unit: unit.value, program: program.value, workType: workType.value });
    zatvori();
  });

  dialog.querySelector<HTMLButtonElement>('[data-profile-remove]')!.addEventListener('click', () => {
    const previous = preferences();
    const next = { ...previous };
    for (const key of PROFILE_KEYS) delete next[key];
    const stored = safeStorageSet(STORAGE_KEYS.preferences, next);
    if (!stored) {
      safeStorageSet(STORAGE_KEYS.preferences, previous);
      note.textContent = 'Preglednik nije dopustio trajno uklanjanje. Raniji profil ostaje spremljen; pokušaj ponovno nakon oslobađanja prostora.';
      return;
    }
    const url = new URL(doc.defaultView?.location.href ?? 'https://lekta.invalid/');
    url.searchParams.delete('unit');
    url.searchParams.delete('work');
    doc.defaultView?.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    onSaved(null);
    zatvori();
  });

  trigger.setAttribute('aria-expanded', 'true');
  dialog.showModal();
  search.focus();
}
