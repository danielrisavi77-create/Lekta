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
}

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

  ctx.items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'lekta-repair-panel__item';
    li.innerHTML = `
      <label>
        <input type="checkbox" checked data-idx="${idx}" />
        <span>${escapeHtml(item.label)}</span>
      </label>
      <span class="lekta-repair-panel__badge">Možemo ovo popraviti umjesto tebe</span>
    `;
    list.appendChild(li);
  });

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
    if (checkedItems.length === 0) return;

    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = 'Popravljam...';

    try {
      const { applyFixers } = await import('../repair/apply-fixers');
      const requests = checkedItems.map((item) => ({
        ruleId: item.ruleId,
        fixerId: item.fixerId,
        params: item.params,
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
  container.appendChild(downloadBtn);
  container.appendChild(summary);
  ctx.mountEl.appendChild(container);
}

function renderSummary(
  el: HTMLElement,
  changelog: { ruleId: string; beforeLabel: string; afterLabel: string }[],
  skippedLabels: string[],
): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Primijenjeno ${changelog.length} popravaka</strong>
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
