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
  /** Trazi izricitu potvrdu lokacije prije primjene (K6: umetanje sekcije prije Uvoda je
   * semanticka odluka o mjestu prijeloma). Kad je bar jedna odabrana stavka ovakva, prvi
   * klik na "Preuzmi" prikaze potvrdni korak umjesto da odmah popravi. */
  requiresConfirmation?: boolean;
  /** Tekst potvrde (sto ce se tocno napraviti i gdje); prikazuje se u potvrdnom koraku. */
  confirmationText?: string;
}

/** Fixeri koji podrzavaju v2 dubinsko ciscenje izravnog formatiranja u tekstu. */
const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'footnote-spacing-fixer',
] as FixerId[]);

/** Bodovna slika (ukupni score + po kategorijama) za usporedbu prije/poslije popravka. */
export interface RepairScoreSnapshot {
  score: number | null;
  categories: Record<string, { earned: number; max: number }>;
}

export interface RepairPanelContext {
  items: RepairableItem[];
  /** Lijeno cita originalni dokument tek na klik (ne drzi kopiju bajtova po
   * svakom re-renderu checkliste). */
  getDocxBytes: () => Promise<Uint8Array>;
  originalFileName: string;
  mountEl: HTMLElement;
  /** Bodovna slika PRIJE popravka (iz analize koja je otvorila panel). Uz reanalyze
   *  omogucuje prikaz "spremnost prije -> poslije" nakon preuzimanja. */
  beforeScore?: RepairScoreSnapshot;
  /** Ponovna analiza POPRAVLJENIH bajtova istim profilom/postavkama. Vraca null ako
   *  profil nije bodovan; smije baciti (npr. korupcija), sto hvatamo. Radi u Web Workeru
   *  (ne blokira nit) i NIKAD ne smije sprijeciti ni ponistiti preuzimanje. */
  reanalyze?: (repairedBytes: Uint8Array) => Promise<RepairScoreSnapshot | null>;
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
      <span>Ukloni i izravno formatiranje u tekstu (dubinsko usklađivanje). Netaknuti ostaju: naslovi i stilizirani dijelovi, podebljano/kurziv, centrirano, veće naslovne veličine, formule, tablice (prored/poravnanje), simbolski fontovi, tekstualni okviri i citatne kontrole (npr. Zotero/Mendeley). Tekst pisan drugim fontom uskladit će se s fontom profila.</span>
    `;
    deepToggle = deepRow.querySelector('input');
  }

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'lekta-repair-panel__download';
  downloadBtn.textContent = 'Preuzmi popravljeni dokument';

  // Potvrdni korak (K6): kad je odabrana stavka koja trazi potvrdu lokacije (umetanje sekcije),
  // klik na "Preuzmi" prikaze ovaj okvir umjesto da odmah popravi; strukturna izmjena krece tek
  // iz onConfirm callbacka. Bez trajne zastavice: potvrda se trazi na SVAKOJ takvoj primjeni, pa
  // se strukturni popravak nikad ne dogodi bez svjesnog pristanka bas na toj primjeni.
  const confirmBox = document.createElement('div');
  confirmBox.className = 'lekta-repair-panel__confirm-box';
  confirmBox.hidden = true;

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

  downloadBtn.addEventListener('click', () => {
    const checkedItems = getCheckedItems();
    if (checkedItems.length === 0) {
      // Tihi no-op zbunjuje: reci sto treba (i ocisti eventualni stari sazetak).
      confirmBox.hidden = true;
      summary.hidden = false;
      summary.innerHTML = '<strong>Odaberi barem jednu stavku za popravak.</strong>';
      return;
    }
    // Potvrda lokacije (K6): ako je odabrana stavka koja to trazi, prvo pokazi potvrdni korak.
    // Trazi se SVAKI put (nema trajne zastavice), pa uzastopni "Preuzmi" nakon prve potvrde ne
    // preskacu potvrdu za novu strukturnu primjenu. Popravak krece tek iz onConfirm callbacka.
    const needsConfirm = checkedItems.filter((i) => i.requiresConfirmation);
    if (needsConfirm.length > 0) {
      renderConfirmation(confirmBox, needsConfirm, async () => {
        confirmBox.hidden = true;
        confirmBox.innerHTML = '';
        await performRepair();
      });
      return;
    }
    void performRepair();
  });

  async function performRepair(): Promise<void> {
    const checkedItems = getCheckedItems();
    if (checkedItems.length === 0) return;

    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = 'Popravljam...';

    let repairedBytes: Uint8Array | null = null;
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

      // RE-36/41: "vec uskladjeno" (nema se sto popraviti) i "nije bilo moguce" izgledaju
      // identicno kad se ne razdvoje, pa uredan rad u "uskladi sve" toku djeluje kao kvar.
      const reasons = result.skippedReasons ?? {};
      const alreadyOk: string[] = [];
      const cannotFix: string[] = [];
      for (const ruleId of result.skipped) {
        const label = ctx.items.find((i) => i.ruleId === ruleId)?.label || ruleId;
        (reasons[ruleId] === 'already-ok' ? alreadyOk : cannotFix).push(label);
      }
      if (result.changelog.length === 0) {
        // Nijedan popravak nije primijenjen: NE isporucuj "popravljeni" dokument,
        // reci iskreno sto se dogodilo (fail-safe skip, npr. atribut ne postoji).
        renderNothingApplied(summary, alreadyOk, cannotFix);
        return;
      }
      renderSummary(summary, result.changelog, alreadyOk, cannotFix);
      triggerDownload(result.docxBytes, buildFixedFileName(ctx.originalFileName));
      repairedBytes = result.docxBytes;
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

    // Re-check (spremnost prije -> poslije): tek NAKON preuzimanja, kao dopuna. Preuzimanje
    // se vec dogodilo pa ovo ne blokira korisnika; ako ponovna analiza padne, panel ostaje.
    if (repairedBytes) await renderRecheck(summary, repairedBytes, ctx);
  }

  container.appendChild(list);
  if (deepToggle) container.appendChild(deepRow);
  container.appendChild(downloadBtn);
  container.appendChild(confirmBox);
  container.appendChild(summary);
  ctx.mountEl.appendChild(container);
}

/**
 * Potvrdni korak za stavke koje traze potvrdu lokacije (K6 umetanje sekcije). Prikazuje sto
 * ce se tocno napraviti i gdje, pa trazi izricit klik prije primjene. onConfirm se poziva
 * tek na "Potvrdi i popravi"; "Odustani" samo zatvori okvir (nista se ne mijenja).
 */
export function renderConfirmation(box: HTMLElement, items: RepairableItem[], onConfirm: () => void): void {
  box.hidden = false;
  const texts = items.map((i) => i.confirmationText || `Potvrdi popravak: ${i.label}`);
  box.innerHTML =
    '<p><strong>Potvrdi lokaciju prije popravka:</strong></p>' +
    texts.map((t) => `<p>${escapeHtml(t)}</p>`).join('');

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'lekta-repair-panel__confirm';
  confirmBtn.textContent = 'Potvrdi i popravi';
  confirmBtn.addEventListener('click', onConfirm);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'lekta-repair-panel__cancel';
  cancelBtn.textContent = 'Odustani';
  cancelBtn.addEventListener('click', () => {
    box.hidden = true;
    box.innerHTML = '';
  });

  box.appendChild(confirmBtn);
  box.appendChild(cancelBtn);
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
  alreadyOk: string[],
  cannotFix: string[],
): void {
  el.hidden = false;
  el.innerHTML = `
    <strong>Primijenjeno ${pluralRepairs(changelog.length)}</strong>
    <ul>
      ${changelog
        .map((c) => `<li>${escapeHtml(c.beforeLabel)} &rarr; ${escapeHtml(c.afterLabel)}</li>`)
        .join('')}
    </ul>
    ${alreadyOk.length ? `<p>Već usklađeno, nije trebalo mijenjati: ${alreadyOk.map(escapeHtml).join(', ')}.</p>` : ''}
    ${cannotFix.length ? `<p>Nije bilo moguće automatski primijeniti: ${cannotFix.map(escapeHtml).join(', ')}. Za to i dalje vrijede ručne upute iznad.</p>` : ''}
  `;
}

const CATEGORY_LABELS: Record<string, string> = {
  formatting: 'Oblikovanje',
  structure: 'Struktura',
  citations: 'Citatnice',
  elements: 'Elementi',
};

/** Postotak kategorije (earned/max), ili null kad kategorija nije bodovana. */
function categoryPct(cat: { earned: number; max: number } | undefined): number | null {
  if (!cat || !cat.max) return null;
  return Math.round((cat.earned / cat.max) * 100);
}

/**
 * Dopuna sazetku nakon uspjesnog popravka: ponovno analizira POPRAVLJENE bajtove istim
 * profilom i prikazuje "spremnost prije -> poslije". Read-only (ne pise u povijest).
 * Nikad ne baca: analiza koja padne daje tihu uputu; preuzimanje je vec gotovo.
 */
async function renderRecheck(el: HTMLElement, bytes: Uint8Array, ctx: RepairPanelContext): Promise<void> {
  const before = ctx.beforeScore;
  const reanalyze = ctx.reanalyze;
  if (!reanalyze || !before) return; // lokalni const: narrowing prezivi await ispod
  const pending = document.createElement('p');
  pending.className = 'lekta-repair-panel__recheck-pending';
  pending.textContent = 'Računam spremnost popravljenog dokumenta...';
  el.appendChild(pending);

  let after: RepairScoreSnapshot | null = null;
  let failed = false;
  try {
    after = await reanalyze(bytes);
  } catch {
    failed = true; // analiza popravljenog nije uspjela (rijetko); preuzimanje je vec gotovo
  }
  pending.remove();

  if (failed) {
    const note = document.createElement('p');
    note.textContent =
      'Novi rezultat nije bilo moguće izračunati. Učitaj popravljeni dokument ponovno da vidiš ažuriran score.';
    el.appendChild(note);
    return;
  }
  if (after === null) {
    const note = document.createElement('p');
    note.textContent = 'Ovaj profil ne daje bodovnu ocjenu, pa se popravak prikazuje samo kao popis iznad.';
    el.appendChild(note);
    return;
  }
  el.appendChild(buildBeforeAfter(before, after));
}

function buildBeforeAfter(before: RepairScoreSnapshot, after: RepairScoreSnapshot): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'lekta-repair-panel__recheck';

  if (before.score == null || after.score == null) {
    const p = document.createElement('p');
    p.textContent = 'Ovaj profil ne daje bodovnu ocjenu, pa se popravak prikazuje samo kao popis iznad.';
    wrap.appendChild(p);
    return wrap;
  }

  const delta = after.score - before.score;
  const deltaTxt = delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : '';
  const head = document.createElement('p');
  head.innerHTML = `<strong>Spremnost: ${before.score} &rarr; ${after.score}${escapeHtml(deltaTxt)}</strong>`;
  wrap.appendChild(head);

  const keys = Object.keys(CATEGORY_LABELS).filter(
    (k) => categoryPct(before.categories?.[k]) != null || categoryPct(after.categories?.[k]) != null,
  );
  if (keys.length) {
    const ul = document.createElement('ul');
    for (const k of keys) {
      const b = categoryPct(before.categories?.[k]);
      const a = categoryPct(after.categories?.[k]);
      const li = document.createElement('li');
      li.textContent = `${CATEGORY_LABELS[k]}: ${b ?? '-'}% → ${a ?? '-'}%`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

function renderNothingApplied(el: HTMLElement, alreadyOk: string[], cannotFix: string[]): void {
  el.hidden = false;
  // RE-36: kad je SVE odabrano vec uskladjeno, "nista nije primijenjeno" izgleda kao kvar iako je
  // rad uredan; naslov se preokrene u pozitivnu poruku samo u tom slucaju.
  const allAlreadyOk = alreadyOk.length > 0 && cannotFix.length === 0;
  el.innerHTML = `
    <strong>${allAlreadyOk ? 'Odabrano je već usklađeno, nije bilo potrebno ništa mijenjati.' : 'Nijedan odabrani popravak nije bilo moguće automatski primijeniti.'}</strong>
    ${alreadyOk.length ? `<p>Već usklađeno: ${alreadyOk.map(escapeHtml).join(', ')}.</p>` : ''}
    ${cannotFix.length ? `<p>Nije bilo moguće automatski primijeniti: ${cannotFix.map(escapeHtml).join(', ')}.</p>` : ''}
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
