// src/ui/repair-panel.ts
//
// Prosirenje ekrana 5 "Puna lista popravaka" (UX_PRINCIPLES.md). Prikazuje se
// SAMO ako postoji barem jedna autoFixable stavka (scored && autoFixable &&
// verified, REPAIR_ENGINE.md sekcija 3). Checkboxovi su PREDODABRANI (opt-out).

import type { FixerId } from '../repair/apply-fixers';

export interface RepairableItem {
  ruleId: string;
  fixerId: FixerId;
  label: string; // npr. "Desna margina", citljivo, ne interni checkId
  params: Record<string, unknown>;
  /** Je li dimenzija prekrsena u analizi. Prekrsene su predodabrane (opt-out);
   * neprekrsene (Feature B "uskladi sve") su opt-in i default NEodabrane. */
  violated?: boolean;
}

/** Fixeri koji podrzavaju v2 dubinsko ciscenje izravnog formatiranja u tekstu. */
const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
] as FixerId[]);

export interface RepairPanelContext {
  items: RepairableItem[];
  /** Lijeno cita originalni dokument tek na klik (ne drzi kopiju bajtova po
   * svakom re-renderu checkliste). */
  getDocxBytes: () => Promise<Uint8Array>;
  originalFileName: string;
  mountEl: HTMLElement;
}

export function renderRepairPanel(ctx: RepairPanelContext): void {
  if (ctx.items.length === 0) return; // nema autoFixable stavki za ovaj rad

  const container = document.createElement('div');
  container.className = 'lekta-repair-panel';

  const list = document.createElement('ul');
  list.className = 'lekta-repair-panel__list';

  // Prekrsene dimenzije prve (predodabrane); neprekrsene iza podnaslova kao
  // opt-in "uskladi cijeli dokument" (Feature B).
  const ordered = [...ctx.items].sort((a, b) => Number(b.violated !== false) - Number(a.violated !== false));
  const firstExtraIdx = ordered.findIndex((i) => i.violated === false);

  ordered.forEach((item, orderIdx) => {
    const idx = ctx.items.indexOf(item);
    const isViolated = item.violated !== false;
    if (orderIdx === firstExtraIdx && firstExtraIdx !== -1) {
      const sub = document.createElement('li');
      sub.className = 'lekta-repair-panel__subtitle';
      // Kad NISTA nije prekrseno (uredan rad), "i ostalo" nema smisla: preokreni
      // u pozitivnu poruku. Inace: dodatne dimenzije ispod prekrsenih.
      sub.textContent =
        firstExtraIdx === 0
          ? 'Sve prepoznato je usklađeno. Po želji dodatno uskladi:'
          : 'Uskladi i ostalo (trenutno nije prekršeno):';
      list.appendChild(sub);
    }
    const li = document.createElement('li');
    li.className = 'lekta-repair-panel__item';
    li.innerHTML = `
      <label>
        <input type="checkbox" ${isViolated ? 'checked' : ''} data-idx="${idx}" />
        <span>${escapeHtml(item.label)}</span>
      </label>
      <span class="lekta-repair-panel__badge">${isViolated ? 'Možemo ovo popraviti umjesto tebe' : 'Uskladi s profilom'}</span>
    `;
    list.appendChild(li);
  });

  // v2 dubinsko ciscenje: uklanja izravno formatiranje u tekstu (font, prored,
  // poravnanje po runovima/odlomcima) da popravljeni stilovi stvarno pobijede.
  const deepAvailable = ctx.items.some((i) => DEEP_CAPABLE.has(i.fixerId));
  let deepToggle: HTMLInputElement | null = null;
  const deepRow = document.createElement('label');
  if (deepAvailable) {
    deepRow.className = 'lekta-repair-panel__deep';
    deepRow.innerHTML = `
      <input type="checkbox" checked />
      <span>Ukloni i izravno formatiranje u tekstu (dubinsko usklađivanje). Netaknuti ostaju: naslovi i stilizirani dijelovi, podebljano/kurziv, centrirano, veće naslovne veličine, formule, tablice (prored/poravnanje), simbolski fontovi i tekstualni okviri. Tekst pisan drugim fontom uskladit će se s fontom profila.</span>
    `;
    deepToggle = deepRow.querySelector('input');
  }

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'lekta-repair-panel__download';
  downloadBtn.textContent = 'Preuzmi popravljeni dokument';

  const summary = document.createElement('div');
  summary.className = 'lekta-repair-panel__summary';
  summary.hidden = true;

  function getCheckedItems(): RepairableItem[] {
    const checkboxes = list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const checked: RepairableItem[] = [];
    checkboxes.forEach((input) => {
      if (input.checked) checked.push(ctx.items[Number(input.dataset.idx)]);
    });
    return checked;
  }

  downloadBtn.addEventListener('click', async () => {
    const checkedItems = getCheckedItems();
    if (checkedItems.length === 0) {
      // Tihi no-op zbunjuje: reci sto treba (i ocisti eventualni stari sazetak).
      summary.hidden = false;
      summary.innerHTML = '<strong>Odaberi barem jednu stavku za popravak.</strong>';
      return;
    }

    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = 'Popravljam...';

    try {
      const { applyFixers } = await import('../repair/apply-fixers');
      const deep = deepToggle?.checked === true;
      const requests = checkedItems.map((item) => ({
        ruleId: item.ruleId,
        fixerId: item.fixerId,
        params: deep && DEEP_CAPABLE.has(item.fixerId) ? { ...item.params, deep: true } : item.params,
      }));
      const docxBytes = await ctx.getDocxBytes();
      const result = await applyFixers(docxBytes, requests);

      const skippedLabels = result.skipped
        .map((ruleId) => ctx.items.find((i) => i.ruleId === ruleId)?.label || ruleId);
      if (result.changelog.length === 0) {
        // Nijedan popravak nije primijenjen: NE isporucuj "popravljeni" dokument,
        // reci iskreno sto se dogodilo (fail-safe skip, npr. atribut ne postoji).
        renderNothingApplied(summary, skippedLabels);
        return;
      }
      renderSummary(summary, result.changelog, skippedLabels);
      triggerDownload(result.docxBytes, buildFixedFileName(ctx.originalFileName));
    } catch (err) {
      // Fail-safe: ne rusi ekran. Rucne upute iznad ove sekcije (postojeci
      // tekstualni popravci iz UX_PRINCIPLES.md ekrana 5) i dalje vrijede.
      console.error('Repair Engine: neuspjela primjena popravaka', err);
      summary.hidden = false;
      summary.textContent = 'Nažalost, automatski popravak nije uspio. Ručne upute iznad i dalje vrijede.';
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }
  });

  container.appendChild(list);
  if (deepToggle) container.appendChild(deepRow);
  container.appendChild(downloadBtn);
  container.appendChild(summary);
  ctx.mountEl.appendChild(container);
}

// Hrvatska sklonidba uz broj: 1 popravak, 2-4 popravka, 5+ popravaka
// (iznimka 11-14 -> popravaka). Isti obrazac kao renderIssues drugdje u appu.
function pluralRepairs(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} popravak`;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return `${n} popravka`;
  return `${n} popravaka`;
}

function renderSummary(
  el: HTMLElement,
  changelog: { ruleId: string; beforeLabel: string; afterLabel: string }[],
  skippedLabels: string[],
): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Primijenjeno ${pluralRepairs(changelog.length)}</strong>
    <ul>
      ${changelog
        .map((c) => `<li>${escapeHtml(c.beforeLabel)} &rarr; ${escapeHtml(c.afterLabel)}</li>`)
        .join('')}
    </ul>
    ${skippedLabels.length ? `<p>Nije bilo moguće automatski primijeniti: ${skippedLabels.map(escapeHtml).join(', ')}. Za to i dalje vrijede ručne upute iznad.</p>` : ''}
    <p>Učitaj popravljeni dokument ponovno da vidiš novi score.</p>
  `;
}

function renderNothingApplied(el: HTMLElement, skippedLabels: string[]): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Nijedan odabrani popravak nije bilo moguće automatski primijeniti.</strong>
    ${skippedLabels.length ? `<p>Preskočeno: ${skippedLabels.map(escapeHtml).join(', ')}.</p>` : ''}
    <p>Dokument nije mijenjan. Ručne upute iznad i dalje vrijede.</p>
  `;
}

function buildFixedFileName(originalName: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  if (dotIdx === -1) return `${originalName}-popravljeno`;
  return `${originalName.slice(0, dotIdx)}-popravljeno${originalName.slice(dotIdx)}`;
}

function triggerDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Odgodjena revokacija kao downloadBlob u app.ts: sinkroni revoke zna
  // povremeno prekinuti download u nekim preglednicima.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
