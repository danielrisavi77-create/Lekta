import { escapeHtml } from '../../utils/helpers';
import { pluralHr } from './technical-compliance-halo';
import type { DnaBucket, DocumentDnaModel } from './document-dna-model';

/**
 * DNA rada: prikaz. Model je u `document-dna-model.ts` i cist je; ovdje je samo crtanje.
 *
 * CSS GRID, NE SVG. Traka je pravokutna, pa SVG ne donosi nikakvu geometriju, a odnio bi
 * nativni focus ring i nativni `disabled`, uz viewBox koji se tuce s responzivnom sirinom.
 * Grid je i lokalni idiom (`.cockpit-category-grid` je vec grid).
 *
 * JEDAN TAB STOP ZA CIJELU TRAKU (roving tabindex). Dvadeset i cetiri zasebna tab stopa
 * unistila bi red obilaska cockpita; strelice, Home i End pomicu unutar trake.
 *
 * SVAKI GUMB NOSI PUNU RECENICU u `aria-label`, pa se podatak ne mora citati iz piksela.
 */

export type DocumentDnaAction =
  | { kind: 'preview-location'; paragraphIndex: number; footnoteId?: number }
  | { kind: 'open-findings' };

const SEVERITY_WORD: Record<string, [string, string, string]> = {
  error: ['blokator', 'blokatora', 'blokatora'],
  warning: ['dorada', 'dorade', 'dorada'],
  info: ['ručna provjera', 'ručne provjere', 'ručnih provjera'],
};

function bucketLabel(bucket: DnaBucket): string {
  return bucket.from === bucket.to ? `Odlomak ${bucket.from}` : `Odlomci ${bucket.from} do ${bucket.to}`;
}

function bucketSentence(bucket: DnaBucket): string {
  const parts: string[] = [bucketLabel(bucket) + '.'];
  const found = (['error', 'warning', 'info'] as const)
    .filter((s) => bucket.counts[s] > 0)
    .map((s) => `${bucket.counts[s]} ${pluralHr(bucket.counts[s], SEVERITY_WORD[s])}`);
  parts.push(found.length ? found.join(', ') + '.' : 'Bez nalaza.');
  if (bucket.headings.length) parts.push('Naslov: ' + bucket.headings[0].excerpt + '.');
  if (bucket.beyondPreview) parts.push('Izvan skraćenog pregleda, skok nije dostupan.');
  else if (bucket.jumpParagraphIndex !== null) parts.push(`Otvori odlomak ${bucket.jumpParagraphIndex}.`);
  return parts.join(' ');
}

function bucketHtml(bucket: DnaBucket): string {
  const jumpable = bucket.jumpParagraphIndex !== null;
  const attrs = [
    'type="button"',
    'class="dna__bar"',
    `style="--dna-h:${bucket.heightRatio.toFixed(3)};--dna-i:${bucket.ordinal}"`,
    `data-dna-bucket="${bucket.ordinal}"`,
    bucket.dominantSeverity ? `data-dna-severity="${bucket.dominantSeverity}"` : '',
    jumpable ? `data-dna-paragraph="${bucket.jumpParagraphIndex}"` : 'disabled aria-disabled="true"',
    'tabindex="-1"',
    `aria-label="${escapeHtml(bucketSentence(bucket))}"`,
  ].filter(Boolean).join(' ');
  return `<li class="dna__slot"><button ${attrs}><i aria-hidden="true"></i></button></li>`;
}

export function documentDnaHtml(model: DocumentDnaModel): string {
  if (model.kind === 'unavailable') {
    return '<section class="cockpit-dna cockpit-dna--unavailable" data-cockpit-dna>'
      + '<div class="cockpit-section-heading"><span class="cockpit-kicker">Gdje su nalazi</span><h2>DNA rada</h2></div>'
      + `<p class="dna__note">${escapeHtml(model.reason)}</p></section>`;
  }

  const bars = model.buckets.map(bucketHtml).join('');
  const anyPlaced = model.buckets.some((b) => b.locationCount > 0);

  // Nalazi za CIJELI rad idu u vlastitu, prugastu traku preko svih kanti. Rasuti ih po traci
  // znacilo bi izmisliti im mjesto; ovako se cita "svugdje", sto je istina.
  const wide = model.documentWide.findingIds.length
    ? '<button type="button" class="dna__wide" data-dna-wide>'
      + `<span class="dna__wide-label">${escapeHtml(model.documentWide.findingIds.length)} `
      + `${escapeHtml(pluralHr(model.documentWide.findingIds.length, ['nalaz vrijedi', 'nalaza vrijede', 'nalaza vrijedi']))} za cijeli dokument</span>`
      + '<small>Font, margine, prored i razmaci nemaju jedno mjesto.</small></button>'
    : '';

  // Fusnote su ZASEBAN koordinatni prostor i ne projiciraju se na os odlomaka.
  const footnotes = model.footnotes.length
    ? '<div class="dna__footnotes"><span class="dna__rail-label">Fusnote</span>'
      + model.footnotes.map((f) =>
        `<button type="button" class="dna__chip" data-dna-footnote="${f.footnoteId}"`
        + ` data-dna-severity="${f.dominantSeverity}"`
        + ` aria-label="Bilješka ${f.footnoteId}, ${f.findingIds.length} ${escapeHtml(pluralHr(f.findingIds.length, ['nalaz', 'nalaza', 'nalaza']))}. Otvori bilješku.">`
        + `bilj. ${f.footnoteId}</button>`).join('')
      + '</div>'
    : '';

  const notes: string[] = [];
  if (!anyPlaced && !model.documentWide.findingIds.length && !model.footnotes.length) {
    notes.push('Nijedan nalaz nije vezan uz konkretan odlomak.');
  }
  if (!model.headingsAvailable) {
    notes.push('Wordovi stilovi naslova nisu prepoznati, pa traka nema naslovnih oznaka.');
  }
  if (model.previewTruncated) {
    notes.push('Pregled je skraćen, pa skok u kasnije dijelove rada nije dostupan. Gustoća nalaza ostaje točna.');
  }
  if (model.unplaced.findingIds.length) {
    const n = model.unplaced.findingIds.length;
    notes.push(`${n} ${pluralHr(n, ['nalaz nema', 'nalaza nema', 'nalaza nema'])} pouzdanu lokaciju u dokumentu.`);
  }
  if (model.provisional) {
    notes.push('Profil nije potvrđen, pa su ovo moguća odstupanja, ne potvrđeni zahtjevi.');
  }

  const scale = `<div class="dna__scale" aria-hidden="true"><span>1</span><span>${model.totalParagraphs} odlomaka</span></div>`;

  return '<section class="cockpit-dna" data-cockpit-dna aria-labelledby="cockpitDnaTitle"'
    + (model.provisional ? ' data-dna-provisional="true"' : '') + '>'
    + '<div class="cockpit-section-heading"><span class="cockpit-kicker">Gdje su nalazi</span>'
    + '<h2 id="cockpitDnaTitle">DNA rada</h2></div>'
    + `<ol class="dna__track" style="--dna-buckets:${model.buckets.length}" data-dna-track`
    + ' aria-label="Nalazi kroz dokument, po odlomcima">' + bars + '</ol>'
    + scale + wide + footnotes
    + (notes.length ? `<p class="dna__note">${escapeHtml(notes.join(' '))}</p>` : '')
    + '</section>';
}

/**
 * Roving tabindex: prvi dohvatljiv gumb nosi jedini tab stop, strelice ga premjestaju.
 * Onemoguceni gumbi (izvan pregleda) preskacu se pri kretanju, jer bi inace tipkovnica
 * vodila na metu koja nista ne radi.
 */
export function bindDocumentDna(root: HTMLElement, onAction: (action: DocumentDnaAction) => void): void {
  const track = root.querySelector<HTMLElement>('[data-dna-track]');
  if (track) {
    const bars = [...track.querySelectorAll<HTMLButtonElement>('.dna__bar')];
    const focusable = bars.filter((b) => !b.disabled);
    if (focusable.length) focusable[0].tabIndex = 0;

    const move = (from: HTMLButtonElement, delta: number): void => {
      const i = focusable.indexOf(from);
      if (i < 0) return;
      const next = focusable[Math.min(focusable.length - 1, Math.max(0, i + delta))];
      if (!next || next === from) return;
      from.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    };

    track.addEventListener('keydown', (event) => {
      const target = event.target as HTMLButtonElement | null;
      if (!target || !target.classList.contains('dna__bar')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(target, 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(target, -1); }
      else if (event.key === 'Home') { event.preventDefault(); move(target, -focusable.length); }
      else if (event.key === 'End') { event.preventDefault(); move(target, focusable.length); }
    });

    for (const bar of bars) {
      bar.addEventListener('click', () => {
        const paragraphIndex = Number(bar.dataset.dnaParagraph);
        if (Number.isInteger(paragraphIndex) && paragraphIndex >= 1) onAction({ kind: 'preview-location', paragraphIndex });
      });
    }
  }

  root.querySelector<HTMLButtonElement>('[data-dna-wide]')?.addEventListener('click', () => onAction({ kind: 'open-findings' }));

  root.querySelectorAll<HTMLButtonElement>('[data-dna-footnote]').forEach((chip) => chip.addEventListener('click', () => {
    const footnoteId = Number(chip.dataset.dnaFootnote);
    // Fusnota je vlastiti prostor: paragraphIndex 0 je dogovor postojeceg `openPreviewAt`.
    if (Number.isInteger(footnoteId) && footnoteId >= 0) onAction({ kind: 'preview-location', paragraphIndex: 0, footnoteId });
  }));
}
