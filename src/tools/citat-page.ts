// DOM glue za besplatni citat generator (citat.html). Logika formatiranja je u citation.ts
// (opci stilovi), citations/faculty-styles.ts (vjeran po fakultetu) i citations/parse-reference.ts
// (prepoznavanje zalijepljene literature); ovdje samo vezanje na formu i ispis. Bez mreze.
import '../shared/ui-boot';
import './tool-analytics';
import { readFacultyContext, saveFacultyContext } from './faculty-context';
import { formatCitation, parseAuthors } from './citation';
import { bindCopyButton } from './tool-ui';
import { buildFacultyOptions, formatForFaculty, ensureFacultySpecsLoaded, type FacultyStyle } from '../citations/faculty-styles';
import { splitReferences, parseReference, type BulkStyle } from '../citations/parse-reference';
import { parseReferenceFile } from '../citations/import-references';
import { verifyReferences } from '../citations/verify-existence';
import { VERDICT_BADGE, summarizeVerification } from '../citations/verify-badges';
import { SOURCE_TYPES } from '../citations/citation-web';

const $ = (s: string): any => document.querySelector(s);
function esc(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Koja polja su relevantna za koji tip izvora (jedan izvor: ostala se sakriju da forma ostane cista).
// Izvedeno iz SOURCE_TYPES (citation-web.ts), koji sam cita kanonski SOURCE_TYPE_FIELDS
// (citation.ts) - isti popis kao bulk-kartica i "preporuceno dodati", bez odvojenog rucnog popisa.
const FIELDS_BY_TYPE: Record<string, string[]> = Object.fromEntries(
  SOURCE_TYPES.map((s) => [s.type, s.fields.map((f) => f.key)]),
);

// Sva opcionalna tekstualna polja (za readForm/clear/sample petlje).
const TEXT_FIELDS = ['authors', 'title', 'container', 'editor', 'year', 'publisher', 'place', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution'];

// Genericki izbor stila (kad fakultet nije odabran). Cuva se da se moze vratiti iz faculty-modea.
const GENERIC_STYLE_HTML = `<option value="autor-godina">Autor-godina (društvene znanosti)</option>
<option value="fusnota">Fusnota / bibliografija (pravno, humanističko)</option>`;

// Kad je fakultet odabran, #f-style nosi njegove stilove (value = indeks); inace je null (genericki mod).
let facultyStyles: FacultyStyle[] | null = null;

function activeFacultyStyle(): FacultyStyle | null {
  if (!facultyStyles) return null;
  const idx = Math.max(0, $('#f-style').selectedIndex);
  return facultyStyles[idx] || facultyStyles[0] || null;
}

// Jedan izvor iz kojeg formatiraju i pojedinacni citat i bulk: fakultetski spec ili opci stil.
function formatWithCurrent(inp: any) {
  const fs = activeFacultyStyle();
  return fs ? formatForFaculty(fs, inp) : formatCitation(inp, $('#f-style').value);
}

function readInp(): any {
  const inp: any = { type: $('#f-type').value };
  for (const key of TEXT_FIELDS) {
    const el = $('#f-' + key);
    if (el) inp[key] = el.value.trim();
  }
  return inp;
}

function syncVisibleFields() {
  const type = $('#f-type').value;
  const allowed = new Set(FIELDS_BY_TYPE[type] || []);
  document.querySelectorAll('#panel-single [data-field]').forEach((row: any) => {
    row.style.display = allowed.has(row.getAttribute('data-field')) ? '' : 'none';
  });
}

// Prikazi/sakrij in-text oblik (autor-godina); vrati ga za copy handler.
function renderInText(inText: string): void {
  const box = $('#out-intext'), val = $('#intextValue'), btn = $('#copyIntextBtn');
  if (val) val.textContent = inText || '';
  if (box) box.hidden = !inText;
  if (btn) btn.disabled = !inText;
}

// Info linija ispod izbornika fakulteta: provenijencija odabranog stila (posteno, s izvorom).
// Ziva iznad #tool-tabs (dijeli je "Jedan izvor" i "Cijela literatura"), pa mora prikazivati
// stil i u generickom modu (bez fakulteta): to je isti stil koji formatWithCurrent koristi
// za bulk izlaz, a #f-style zivi u panel-single, skrivenom dok je aktivan bulk tab.
function updateStyleInfo(): void {
  const info = $('#f-style-info');
  if (!info) return;
  const fs = activeFacultyStyle();
  if (!fs) {
    const label = $('#f-style')?.selectedOptions?.[0]?.textContent?.trim() || '';
    info.innerHTML = label ? `Stil: <strong>${esc(label)}</strong>. Vrijedi i za citat i za popis literature ("Cijela literatura").` : '';
    info.hidden = !label;
    return;
  }
  const src = fs.sourceLabel ? `„${esc(fs.sourceLabel)}”` : 'službenim uputama';
  const when = fs.verifiedAt ? `, provjereno ${esc(fs.verifiedAt)}` : '';
  info.innerHTML = fs.pin
    ? `Stil: <strong>${esc(fs.label)}</strong>. Propisan službenim uputama: ${src}${when}. Format: opći oblik stila ${esc(fs.label)}.`
    : `Vjeran format prema službenim uputama: ${src}${when}.`;
  info.hidden = false;
}

// Ziva linija ispod polja Autor(i): kako je slobodni unos stvarno rasclanjen (prezime/ime po
// autoru), da se krivo razdvajanje vidi ODMAH, a ne tek u finalnom citatu. parseAuthors ima
// dokumentirana ogranicenja (npr. engleski grupni autori bez zareza), pa je uvid vrijedan.
function renderAuthorsPreview(raw: string): void {
  const line = $('#f-authors-preview');
  if (!line) return;
  const authors = parseAuthors(raw);
  if (!raw.trim() || !authors.length) { line.hidden = true; line.textContent = ''; return; }
  const shown = authors.map((a) => (a.first ? `${a.last}, ${a.first}` : a.last)).join(' · ');
  line.textContent = `Prepoznato (${authors.length}): ${shown}`;
  line.hidden = false;
}

function render() {
  renderAuthorsPreview($('#f-authors')?.value || '');
  const { citation, inText, missing } = formatWithCurrent(readInp());
  const out = $('#out');
  const hint = $('#out-hint');
  const addBtn = $('#c-add-to-bulk');
  if (!citation) {
    out.textContent = 'Ispuni polja lijevo pa se citat pojavljuje ovdje.';
    out.classList.add('empty');
    hint.textContent = '';
    $('#copyBtn').disabled = true;
    if (addBtn) addBtn.disabled = true;
    $('#c-success-cta')?.classList.remove('is-visible');
    renderInText('');
    return;
  }
  out.textContent = citation;
  out.classList.remove('empty');
  $('#copyBtn').disabled = false;
  if (addBtn) addBtn.disabled = false;
  $('#c-success-cta')?.classList.add('is-visible');
  renderInText(inText);
  hint.textContent = missing.length ? 'Preporučeno dodati: ' + missing.join(', ') + '.' : 'Sva preporučena polja su ispunjena.';
  hint.className = missing.length ? 'out-hint warn' : 'out-hint ok';
}

// --- Izbornik fakulteta -----------------------------------------------------

function populateFaculties() {
  const facSel = $('#f-faculty');
  if (!facSel) return;
  const opts = buildFacultyOptions();
  const byInst = new Map<string, ReturnType<typeof buildFacultyOptions>>();
  for (const o of opts) {
    if (!byInst.has(o.instName)) byInst.set(o.instName, [] as any);
    (byInst.get(o.instName) as any).push(o);
  }
  const insts = [...byInst.keys()].sort((a, b) => a.localeCompare(b, 'hr'));
  let html = '';
  for (const inst of insts) {
    html += `<optgroup label="${esc(inst)}">` +
      (byInst.get(inst) as any).map((o: any) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('') +
      '</optgroup>';
  }
  facSel.insertAdjacentHTML('beforeend', html);
}

// Odabrani fakultet ide na glavni analizator kroz ?unit= (isti catalog unit ID prostor kao
// ZAGREB_CATALOG); index.html#analyzer to cita preko applyUnitFromUrl (src/ui/app.ts) i
// unaprijed postavi isti fakultet, umjesto da korisnik ponovno trazi ustanovu od nule.
function syncCtaAnalyzerLink() {
  const unitId = ($('#f-faculty')?.value || '').trim();
  const href = unitId ? `index.html?unit=${encodeURIComponent(unitId)}#analyzer` : 'index.html#analyzer';
  $('#cta-analyzer')?.setAttribute('href', href);
  $('#c-success-cta-link')?.setAttribute('href', href);
}

// Odabir fakulteta -> #f-style nosi njegove stilove; prazan -> vrati genericki izbor.
function onFacultyChange() {
  const facSel = $('#f-faculty');
  const styleSel = $('#f-style');
  const opt = buildFacultyOptions().find((o) => o.id === facSel.value) || null;
  if (!opt) {
    facultyStyles = null;
    styleSel.innerHTML = GENERIC_STYLE_HTML;
  } else {
    facultyStyles = opt.styles;
    styleSel.innerHTML = opt.styles.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join('');
  }
  saveFacultyContext({ unitId: facSel.value });
  syncCtaAnalyzerLink();
  updateStyleInfo();
  render();
}

// --- Cijela literatura (bulk): zalijepi -> prepoznaj -> UREDI po unosu -> formatiraj + sortiraj ---

function typeDef(t: string) {
  return SOURCE_TYPES.find((s) => s.type === t) || SOURCE_TYPES[0];
}

// Editabilna kartica po referenci: <select vrste> + polja te vrste (accessed se sakrije ako stil ne trazi datum).
function renderBulkCard(card: any, values: any) {
  values = values || {};
  const type = values.type || card.getAttribute('data-type') || SOURCE_TYPES[0].type;
  card.setAttribute('data-type', type);
  const accessOk = (activeFacultyStyle()?.spec?.accessDate) !== false;
  const opts = SOURCE_TYPES.map((s) => `<option value="${s.type}"${s.type === type ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
  const fieldsHtml = typeDef(type).fields
    .filter((f) => !(f.key === 'accessed' && !accessOk))
    .map((f) => {
      const v = values[f.key] != null ? values[f.key] : '';
      return `<label>${esc(f.label)}<input type="text" data-key="${esc(f.key)}" value="${esc(v)}"></label>`;
    }).join('');
  card.innerHTML = `<label>Vrsta izvora<select class="card-type">${opts}</select></label>${fieldsHtml}`;
  card.querySelector('.card-type').addEventListener('change', () => renderBulkCard(card, readBulkCard(card)));
}

function readBulkCard(card: any): any {
  const sel = card.querySelector('.card-type');
  if (!sel) return { type: SOURCE_TYPES[0].type };
  const out: any = { type: sel.value };
  card.setAttribute('data-type', out.type);
  card.querySelectorAll('input[data-key]').forEach((i: any) => { out[i.getAttribute('data-key')] = i.value; });
  return out;
}

function sortKeyOf(inp: any): string {
  const a = parseAuthors(inp.authors || '');
  return ((a.length ? a[0].last : (inp.title || '')) || '').toLowerCase();
}

function bulkStyle(): BulkStyle {
  return (($('#bulk-style')?.value as BulkStyle) || 'auto');
}

// Sazeta najava rezultata prepoznavanja/generiranja u sr-only aria-live status: sami
// spremnici (#bulk-entries/#bulk-output) NISU live regije (najava cijelog bloka bi brbljala),
// citac ekrana dobiva samo kratki sazetak sto se dogodilo.
function announceBulk(msg: string) {
  const live = $('#bulk-status');
  if (live) live.textContent = msg;
}

// Kartice dodane iz "Jedan izvor" (most single->bulk) nose data-origin="single". One NISU
// izvedene iz #bulk-input pa se iz njega ne mogu rekonstruirati: ponovno prepoznavanje ih
// zato ne brise nego CUVA i vraca iza prepoznatih. Kartice iz prethodnog prepoznavanja
// (origin "paste") se i dalje zamjenjuju, jer ih isti tekst ponovno proizvodi.
function detachManualCards(box: any): any[] {
  const kept: any[] = Array.from(box.querySelectorAll('.bulk-card[data-origin="single"]'));
  kept.forEach((c) => c.remove());
  return kept;
}

// Vrati sacuvane rucne kartice na kraj popisa i prenumeriraj im zaglavlja (numeracija mora
// pratiti stvaran redoslijed, inace bi dvije kartice nosile isti "Referenca 1").
function reattachManualCards(box: any, kept: any[], startIndex: number): void {
  kept.forEach((card, i) => {
    const head = card.querySelector('.bulk-card-head');
    if (head) head.textContent = `Referenca ${startIndex + i + 1} (iz kartice Jedan izvor)`;
    box.appendChild(card);
  });
}

// Brojka na tabu mora pratiti STVARAN broj kartica (prije ju je pisao samo most single->bulk,
// pa je nakon prepoznavanja ostajala zastarjela).
function updateBulkTabCount(): void {
  const tab = $('#tab-bulk');
  if (!tab) return;
  const n = $('#bulk-entries')?.querySelectorAll('.bulk-card').length || 0;
  tab.textContent = n ? `${_tabBulkBase} (${n})` : _tabBulkBase;
}

function parseBulk() {
  const refs = splitReferences($('#bulk-input').value);
  const box = $('#bulk-entries');
  const kept = detachManualCards(box);
  box.innerHTML = '';
  $('#bulk-copy').hidden = true;
  $('#bulk-output').innerHTML = '';
  if (!refs.length) {
    reattachManualCards(box, kept, 0);
    const hasAny = kept.length > 0;
    $('#bulk-generate').hidden = !hasAny;
    { const v = $('#bulk-verify'); if (v) v.hidden = !hasAny; }
    updateBulkTabCount();
    announceBulk(hasAny
      ? `U zalijepljenom tekstu nije prepoznata nijedna referenca. Ručno dodanih zadržano: ${kept.length}.`
      : 'Nije prepoznata nijedna referenca.');
    return;
  }
  const style = bulkStyle();
  refs.forEach((raw: string, i: number) => {
    const p = parseReference(raw, style);
    const card = document.createElement('div');
    card.className = 'bulk-card' + (p.lowConfidence ? ' low-conf' : '');
    const head = document.createElement('div');
    head.className = 'bulk-card-head';
    head.textContent = 'Referenca ' + (i + 1) + (p.lowConfidence ? ' (malo prepoznato, dopuni ručno)' : '');
    const fields = document.createElement('div');
    fields.className = 'bulk-card-fields';
    card.appendChild(head);
    card.appendChild(fields);
    box.appendChild(card);
    const values: any = { type: p.type };
    Object.keys(p.fields).forEach((k) => { values[k] = (p.fields as any)[k]; });
    renderBulkCard(fields, values);
  });
  reattachManualCards(box, kept, refs.length);
  $('#bulk-generate').hidden = false;
  { const v = $('#bulk-verify'); if (v) v.hidden = false; }
  updateBulkTabCount();
  const keptNote = kept.length ? ` Ručno dodanih zadržano: ${kept.length}.` : '';
  announceBulk(`Prepoznato referenci: ${refs.length}.${keptNote} Provjeri i dopuni polja po unosu, pa generiraj literaturu.`);
}

// --- Uvoz iz upravitelja referenci (Zotero/Mendeley): .bib / .ris / .json (CSL-JSON) ---
// Strukturirani formati se mapiraju DETERMINISTICKI u CitationInput (import-references.ts, bez
// mreze) i ubacuju u ISTI editabilni bulk tok, pa korisnik pregleda i dopuni prije generiranja.
// Zamjenjuje postojeci popis (isti ugovor kao "Prepoznaj reference": cijela datoteka = svjez popis).
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

async function importReferencesFromFile(file: File): Promise<void> {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    announceBulk('Datoteka je prevelika (ograničenje 2 MB). Podijeli izvoz na manje dijelove.');
    return;
  }
  let text = '';
  try { text = await file.text(); } catch { announceBulk('Datoteku nije moguće pročitati.'); return; }
  const refs = parseReferenceFile(text);
  const box = $('#bulk-entries');
  // Isti razlog kao u `parseBulk`: uvoz datoteke ne smije progutati kartice koje je korisnik
  // rucno prenio mostom iz "Jedan izvor". One ne dolaze iz uvezene datoteke, pa ih ponovni uvoz
  // ne moze reproducirati; bez ovoga bi nestale bez ijedne poruke.
  const kept = detachManualCards(box);
  box.innerHTML = '';
  $('#bulk-copy').hidden = true;
  $('#bulk-output').innerHTML = '';
  if (!refs.length) {
    reattachManualCards(box, kept, 0);
    const imaRucnih = kept.length > 0;
    $('#bulk-generate').hidden = !imaRucnih;
    { const v = $('#bulk-verify'); if (v) v.hidden = !imaRucnih; }
    updateBulkTabCount();
    announceBulk(imaRucnih
      ? `Nije prepoznata nijedna referenca iz datoteke. Zadržane su ručno dodane kartice: ${kept.length}. Podržani formati: BibTeX (.bib), RIS (.ris), CSL-JSON (.json).`
      : 'Nije prepoznata nijedna referenca. Podržani formati: BibTeX (.bib), RIS (.ris), CSL-JSON (.json).');
    return;
  }
  refs.forEach((ref, i) => {
    const card = document.createElement('div');
    card.className = 'bulk-card';
    const head = document.createElement('div');
    head.className = 'bulk-card-head';
    head.textContent = `Referenca ${i + 1} (uvezeno, ${ref.source})`;
    const fields = document.createElement('div');
    fields.className = 'bulk-card-fields';
    card.appendChild(head);
    card.appendChild(fields);
    box.appendChild(card);
    const values: any = { type: ref.type };
    Object.keys(ref.fields).forEach((k) => { values[k] = (ref.fields as any)[k]; });
    renderBulkCard(fields, values);
  });
  reattachManualCards(box, kept, refs.length);
  updateBulkTabCount();
  $('#bulk-generate').hidden = false;
  { const v = $('#bulk-verify'); if (v) v.hidden = false; }
  announceBulk(kept.length
    ? `Uvezeno referenci: ${refs.length}, uz ${kept.length} zadržanih iz kartice Jedan izvor. Provjeri i dopuni polja, pa generiraj literaturu.`
    : `Uvezeno referenci: ${refs.length}. Provjeri i dopuni polja, pa generiraj literaturu.`);
}

// --- Opt-in ONLINE provjera postojanja referenci (CrossRef) ---
// Salje SAMO strukturiranu referencu (autor/naslov/DOI/godina) javnom CrossRef-u; tijelo rada NIKAD.
// Okida se iskljucivo klikom na #bulk-verify (uz vidljivu disclosure). Nikad ne kaze "izmisljeno".
// VERDICT_BADGE je u ../citations/verify-badges (dijeljeno s analizatorom).

async function verifyBulk(): Promise<void> {
  const cards: any[] = Array.from($('#bulk-entries').querySelectorAll('.bulk-card'));
  if (!cards.length) return;
  const inputs = cards.map((c) => readBulkCard(c.querySelector('.bulk-card-fields')));
  const btn = $('#bulk-verify');
  const orig = btn ? btn.textContent : '';
  cards.forEach((c) => c.querySelector('.verify-badge')?.remove());
  if (btn) { btn.disabled = true; btn.textContent = 'Provjeravam…'; }
  announceBulk('Provjera postojanja izvora u tijeku…');
  try {
    const results = await verifyReferences(inputs, {
      onProgress: (done, total) => { if (btn) btn.textContent = `Provjeravam… ${done}/${total}`; },
    });
    results.forEach((res, i) => {
      const meta = VERDICT_BADGE[res.verdict];
      const badge = document.createElement('div');
      badge.className = 'verify-badge ' + meta.cls;
      const match = (res.verdict === 'found' || res.verdict === 'weak') && res.matchedTitle
        ? ` — podudara se s: „${res.matchedTitle}”` : '';
      badge.textContent = meta.text + match;
      cards[i].appendChild(badge);
    });
    // Dijeljeni sazetak (broji SVIH pet verdikta; bez lazne nule za sve-domace/slabe popise).
    announceBulk(summarizeVerification(results));
  } catch {
    announceBulk('Provjera nije uspjela (mreža). Pokušaj ponovno.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

function generateBulk() {
  const items: { key: string; text: string }[] = [];
  $('#bulk-entries').querySelectorAll('.bulk-card-fields').forEach((card: any) => {
    const inp = readBulkCard(card);
    const res = formatWithCurrent(inp);
    if (res.citation) items.push({ key: sortKeyOf(inp), text: res.citation });
  });
  // Redoslijed literature: abecedno, osim ako verificirani fakultetski spec propisuje pojavljivanje.
  const fs = activeFacultyStyle();
  const byAppearance = !!(fs && fs.spec && fs.spec.bibliography && fs.spec.bibliography.sort === 'appearance');
  if (!byAppearance) items.sort((a, b) => a.key.localeCompare(b.key, 'hr'));
  const listText = items.map((x) => x.text).join('\n');
  const label = byAppearance ? 'redoslijedom pojavljivanja' : 'abecedno';
  $('#bulk-output').innerHTML =
    `<label for="bulk-result">Literatura (${label}, ${items.length})</label>` +
    `<textarea id="bulk-result" rows="${Math.min(20, Math.max(4, items.length + 1))}"></textarea>`;
  $('#bulk-result').value = listText;
  $('#bulk-copy').hidden = items.length === 0;
  announceBulk(items.length
    ? `Literatura generirana: ${items.length} jedinica, ${label}.`
    : 'Nema jedinica za literaturu, dopuni polja po unosu.');
}

function showTab(which: 'single' | 'bulk') {
  $('#panel-single').hidden = which !== 'single';
  $('#panel-bulk').hidden = which !== 'bulk';
  // ARIA tab semantika: roditelj je role=tablist, pa AT ocekuje aria-selected + roving
  // tabindex na role=tab djeci (bez toga citac ekrana ne zna koji je tab aktivan).
  for (const [id, active] of [['#tab-single', which === 'single'], ['#tab-bulk', which === 'bulk']] as const) {
    const tab = $(id);
    if (!tab) continue;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}

// Tipkovnicka navigacija tablista (ARIA APG): strelice + Home/End sele fokus i aktiviraju tab.
function bindTablistKeys() {
  $('#tool-tabs')?.addEventListener('keydown', (e: KeyboardEvent) => {
    const order: Array<'single' | 'bulk'> = ['single', 'bulk'];
    const current = document.activeElement?.id === 'tab-bulk' ? 1 : 0;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % order.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current + order.length - 1) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    if (next < 0) return;
    e.preventDefault();
    showTab(order[next]);
    $(`#tab-${order[next]}`)?.focus();
  });
}

// --- Most "Jedan izvor" -> "Cijela literatura": trenutni strukturirani unos ide kao NOVA
// kartica u bulk tok (isti renderBulkCard/generateBulk mehanizam), bez ponovnog tipkanja.
// Kartica se oznacava s data-origin="single" jer je to jedini rucni rad u popisu koji se NE
// moze rekonstruirati iz #bulk-input; "Prepoznaj reference" ju zato cuva (v. parseBulk).
let _addFlashTimer = 0;
let _tabBulkBase = '';
function addSingleToBulk() {
  const inp = readInp();
  const box = $('#bulk-entries');
  if (!box) return;
  const idx = box.querySelectorAll('.bulk-card').length + 1;
  const card = document.createElement('div');
  card.className = 'bulk-card';
  card.setAttribute('data-origin', 'single');
  const head = document.createElement('div');
  head.className = 'bulk-card-head';
  head.textContent = `Referenca ${idx} (iz kartice Jedan izvor)`;
  const fields = document.createElement('div');
  fields.className = 'bulk-card-fields';
  card.appendChild(head);
  card.appendChild(fields);
  box.appendChild(card);
  renderBulkCard(fields, inp);
  $('#bulk-generate').hidden = false;
  { const v = $('#bulk-verify'); if (v) v.hidden = false; }
  updateBulkTabCount();
  const btn = $('#c-add-to-bulk');
  if (btn) {
    if (_addFlashTimer) clearTimeout(_addFlashTimer);
    btn.textContent = 'Dodano u popis ✓';
    _addFlashTimer = window.setTimeout(() => { btn.textContent = '+ Dodaj u popis literature'; _addFlashTimer = 0; }, 1400);
  }
}

// --- Popuni iz DOI-ja: JEDINI mrezni poziv u ovom alatu (v. hero napomena u citat.html) ---
// Salje se ISKLJUCIVO sam DOI, javnom Crossref REST API-ju (bez kljuca, CORS-otvoren); ostatak
// forme ostaje lokalan. Korisnik ga okida eksplicitnim klikom, ne automatski na unos.
const DOI_ENDPOINT = 'https://api.crossref.org/works/';

function normalizeDoiInput(raw: string): string {
  return (raw || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
}

// Crossref 'type' -> nas SourceType. Nepokriveni/nepoznati tipovi (dataset, standard...)
// namjerno NE diraju #f-type: bolje zadrzati korisnikov trenutni odabir nego nagadati krivi.
const CROSSREF_TYPE_MAP: Record<string, string> = {
  'journal-article': 'clanak',
  'proceedings-article': 'poglavlje',
  'book-chapter': 'poglavlje',
  book: 'knjiga',
  monograph: 'knjiga',
  dissertation: 'zavrsni',
};

function authorsFromCrossref(list: any): string {
  if (!Array.isArray(list)) return '';
  return list
    .map((a: any) => {
      const family = String(a?.family || '').trim();
      const given = String(a?.given || '').trim();
      if (!family && !given) return '';
      return given ? `${family}, ${given}` : family;
    })
    .filter(Boolean)
    .join('; ');
}

function yearFromCrossref(msg: any): string {
  const parts = msg?.issued?.['date-parts']?.[0]
    || msg?.['published-print']?.['date-parts']?.[0]
    || msg?.['published-online']?.['date-parts']?.[0];
  return parts && parts[0] ? String(parts[0]) : '';
}

async function fillFromDoi(): Promise<void> {
  const input = $('#f-doi');
  const status = $('#f-doi-status');
  const btn = $('#f-doi-fill');
  const doi = normalizeDoiInput(input?.value || '');
  if (!doi) { if (status) status.textContent = 'Upiši DOI prije popunjavanja.'; return; }
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Dohvaćam…'; }
  if (status) status.textContent = '';
  try {
    const res = await fetch(DOI_ENDPOINT + encodeURIComponent(doi), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(res.status === 404 ? 'DOI nije pronađen.' : 'Dohvat nije uspio.');
    const data = await res.json();
    const msg = data && data.message;
    if (!msg) throw new Error('Dohvat nije uspio.');
    const set = (id: string, v: string) => { if (!v) return; const el = $(id); if (el) el.value = v; };
    const mappedType = CROSSREF_TYPE_MAP[msg.type];
    if (mappedType && $('#f-type')) { $('#f-type').value = mappedType; syncVisibleFields(); }
    set('#f-authors', authorsFromCrossref(msg.author));
    set('#f-title', (Array.isArray(msg.title) && msg.title[0]) || '');
    set('#f-container', (Array.isArray(msg['container-title']) && msg['container-title'][0]) || '');
    set('#f-year', yearFromCrossref(msg));
    set('#f-publisher', msg.publisher || '');
    set('#f-volume', msg.volume || '');
    set('#f-issue', msg.issue || '');
    set('#f-pages', msg.page || '');
    input.value = doi;
    if (status) status.textContent = 'Polja popunjena iz Crossref metapodataka. Provjeri prije korištenja.';
    render();
  } catch (err: any) {
    if (status) status.textContent = err?.message || 'Dohvat nije uspio, popuni polja ručno.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function init() {
  if (!$('#f-type')) return; // stranica nije citat-alat; ne rusi se (kao ostali tool page-ovi)
  populateFaculties();
  // Prisjeti se fakulteta odabranog na prethodnom posjetu (semestar zna trajati mjesecima):
  // samo kad opcija stvarno postoji u izborniku (spisak fakulteta zna narasti/skratiti se).
  const savedFaculty = readFacultyContext().unitId || '';
  const facSel = $('#f-faculty');
  if (savedFaculty && facSel && [...facSel.options].some((o: any) => o.value === savedFaculty)) {
    facSel.value = savedFaculty;
  }
  // Promjena tipa samo prilagodi vidljiva polja; render okida opci change/input listener nize.
  $('#f-type').addEventListener('change', syncVisibleFields);
  $('#f-faculty')?.addEventListener('change', onFacultyChange);
  $('#f-style').addEventListener('change', updateStyleInfo);
  // Genericki listener veze SAMO staticka polja (bulk kartice nastaju kasnije i ne diraju #out).
  document.querySelectorAll('#panel-single input, #f-style, #f-faculty, #f-type, #bulk-input').forEach((el: any) => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  $('#tab-single')?.addEventListener('click', () => showTab('single'));
  $('#tab-bulk')?.addEventListener('click', () => showTab('bulk'));
  bindTablistKeys();
  _tabBulkBase = $('#tab-bulk')?.textContent?.trim() || 'Cijela literatura';
  $('#c-add-to-bulk')?.addEventListener('click', addSingleToBulk);
  $('#bulk-parse')?.addEventListener('click', parseBulk);
  $('#bulk-generate')?.addEventListener('click', generateBulk);
  $('#bulk-verify')?.addEventListener('click', () => { void verifyBulk(); });
  // Uvoz iz Zotera/Mendeleya (.bib/.ris/.json): lokalno citanje, bez slanja na mrezu.
  $('#bulk-import')?.addEventListener('change', (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (file) void importReferencesFromFile(file);
    input.value = ''; // dopusti ponovni uvoz iste datoteke
  });
  // Promjena stila ponovno prepozna vec zalijepljeni popis (bez ovoga picker ne bi imao ucinak).
  $('#bulk-style')?.addEventListener('change', () => { if ($('#bulk-input').value.trim()) parseBulk(); });

  // Kopira samo kad citat/literatura postoji (gumbi su inace onemoguceni/skriveni).
  // Zajednicki sr-only #copy-status (aria-live): ishod kopiranja se najavljuje i citacu
  // ekrana, ne samo vizualnom promjenom teksta gumba (WCAG 4.1.3).
  const copyStatus = { statusEl: $('#copy-status') };
  bindCopyButton($('#copyBtn'), () => ($('#copyBtn').disabled ? '' : ($('#out').textContent || '')), copyStatus);
  bindCopyButton($('#copyIntextBtn'), () => ($('#copyIntextBtn').disabled ? '' : ($('#intextValue').textContent || '')), copyStatus);
  bindCopyButton($('#bulk-copy'), () => ($('#bulk-copy').hidden ? '' : ($('#bulk-result')?.value || '')), copyStatus);

  $('#c-sample')?.addEventListener('click', () => {
    const set = (id: string, v: string) => { const el = $(id); if (el) el.value = v; };
    // primjer koristi genericki stil: vrati izbornik fakulteta na prazno
    if ($('#f-faculty')) $('#f-faculty').value = '';
    facultyStyles = null;
    $('#f-style').innerHTML = GENERIC_STYLE_HTML;
    updateStyleInfo();
    set('#f-type', 'knjiga'); set('#f-style', 'autor-godina');
    set('#f-authors', 'Ivić, Ivan; Horvat, Ana');
    set('#f-title', 'Ustavno pravo Republike Hrvatske');
    set('#f-year', '2020'); set('#f-place', 'Zagreb'); set('#f-publisher', 'Narodne novine');
    for (const key of ['container', 'editor', 'volume', 'issue', 'pages', 'url', 'doi', 'accessed', 'institution']) set('#f-' + key, '');
    syncVisibleFields();
    render();
    $('#f-authors')?.focus();
  });

  $('#c-clear')?.addEventListener('click', () => {
    $('#f-type').selectedIndex = 0;
    if ($('#f-faculty')) $('#f-faculty').value = '';
    facultyStyles = null;
    $('#f-style').innerHTML = GENERIC_STYLE_HTML;
    updateStyleInfo();
    for (const key of TEXT_FIELDS) {
      const el = $('#f-' + key); if (el) el.value = '';
    }
    syncVisibleFields();
    render();
    $('#f-authors')?.focus();
  });

  $('#f-doi-fill')?.addEventListener('click', () => { void fillFromDoi(); });

  // Tema se sinkronizira preko lekta.theme (inline skripta u citat.html), ne ovdje. onFacultyChange
  // primjenjuje spremljeni odabir postavljen gore (ili genericki izbor, ako ga nema): puni #f-style,
  // sinkronizira CTA link i renderira, pa odvojeni updateStyleInfo()/render() ovdje vise ne trebaju.
  syncVisibleFields();
  onFacultyChange();
  // Puni specovi (custom-spec formatFromSpec) su lijeno ucitani (faculty-styles.ts, perf);
  // pokreni dohvat ODMAH (fire-and-forget, ne blokira init) i korigiraj prikaz cim stignu -
  // dotad je vec render()irano s obiteljskim motorom kao privremenom aproksimacijom.
  void ensureFacultySpecsLoaded().then(() => render());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
