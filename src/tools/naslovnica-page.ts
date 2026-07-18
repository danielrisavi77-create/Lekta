// DOM glue za besplatni generator naslovnice (naslovnica.html). Logika slaganja je u
// title-page.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
// Kaskada ustanova -> fakultet -> studij puni se iz kataloga i bira predlozak fakulteta
// (data/title-pages); tekstualna polja ostaju editabilna (kaskada ih samo auto-popunjava).
import '../shared/ui-boot';
import { buildTitlePage, titlePageText, type TitlePageModel } from './title-page';
import { titlePageDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, downloadBlob } from './tool-ui';
import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { selectTemplate, type TemplateSelection } from '../title-pages/template-loader';
import { workTypeLabel } from '../config/config-loader';
import { parseTitlePageParams, serializeTitlePageParams } from '../title-pages/title-page-params';
import { defaultWorkTypeForProgram } from '../ui/work-selection';
import type { WorkType } from '../profiles/profile-schema';
import type { TitleLineStyle } from './title-page';

const $ = (s: string): any => document.querySelector(s);

const FIELDS = {
  university: '#tp-university', faculty: '#tp-faculty', study: '#tp-study',
  author: '#tp-author', title: '#tp-title', subtitle: '#tp-subtitle',
  workType: '#tp-worktype', mentor: '#tp-mentor', comentor: '#tp-comentor',
  place: '#tp-place', year: '#tp-year',
};

const SAMPLE: any = {
  university: 'Sveučilište u Zagrebu',
  faculty: 'Fakultet političkih znanosti',
  study: 'Diplomski studij Politologije',
  author: 'Ana Anić',
  title: 'Uloga civilnog društva u lokalnoj samoupravi',
  subtitle: '',
  workType: 'graduate', // value kljuc opcije, ne label
  mentor: 'izv. prof. dr. sc. Ivan Ivić',
  comentor: '',
  place: 'Zagreb',
  year: '2026',
};

function readInput() {
  const out: any = {};
  for (const [key, sel] of Object.entries(FIELDS)) out[key] = $(sel)?.value || '';
  // Opcije vrste rada nose value KLJUC (graduate...); tekst retka je vidljivi label opcije.
  const wt = $('#tp-worktype');
  out.workType = wt?.selectedOptions?.[0]?.textContent?.trim() || '';
  out.mentorLabel = $('#tp-mentor-label')?.value || '';
  out.comentorLabel = $('#tp-comentor-label')?.value || '';
  return out;
}

/** Trenutna vrsta rada kao WorkType kljuc (value atribut opcije). */
function currentLevel(): string {
  return $('#tp-worktype')?.value || '';
}

/** Predlozak za trenutni izbor kaskade (prazan/rucni unos daje genericki raspored). */
function currentSelection(): TemplateSelection {
  return selectTemplate($('#tp-unit')?.value || null, currentLevel());
}

// --- Pregled ---

/** Web nema fakultetske fontove; pregled aproksimira, .docx nosi pravi w:rFonts. */
const SANS_FONTS = /arial|calibri|helvetica|verdana|tahoma/i;
const PREVIEW_PX_PER_PT = 1.15;

/** Inline stil retka pregleda iz predloska; sve vrijednosti sanitizirane (broj/whitelist). */
function lineStyleCss(style: TitleLineStyle | undefined): string {
  if (!style) return '';
  const css: string[] = [];
  const size = Number(style.sizePt);
  if (Number.isFinite(size) && size > 0) css.push(`font-size:${Math.round(size * PREVIEW_PX_PER_PT)}px`);
  if (style.bold) css.push('font-weight:800');
  if (style.italic) css.push('font-style:italic');
  css.push(`text-transform:${style.uppercase ? 'uppercase' : 'none'}`);
  if (style.align === 'left' || style.align === 'right') css.push(`text-align:${style.align}`);
  if (style.font) css.push(SANS_FONTS.test(style.font) ? 'font-family:Arial,Helvetica,sans-serif' : 'font-family:var(--ink-serif)');
  return css.join(';');
}

/** Pregled po predlosku: retci grupirani u .tp-group zone, tipografija inline iz modela. */
function renderTemplateSheet(model: TitlePageModel): string {
  const groups: { group: number | undefined; html: string[] }[] = [];
  let prev: number | undefined;
  for (const line of model.lines) {
    if (!groups.length || line.group !== prev) groups.push({ group: line.group, html: [] });
    const css = lineStyleCss(line.style);
    groups[groups.length - 1].html.push(
      // tp-${role}, NE tp-t-${role}: dijeli CSS s genericnim rasporedom (.tp-study/.tp-author/...
      // u naslovnica.html), koji "t-" prefiks nikad nije imao pravilo za sebe. lineStyleCss ispod
      // postavlja samo font-size/bold/italic/uppercase/align/font-family, nikad color, pa nema sudara.
      `<div class="tp-line tp-${line.role}"${css ? ` style="${css}"` : ''}>${escapeHtml(line.text)}</div>`,
    );
    prev = line.group;
  }
  return groups.map((g) => `<div class="tp-group">${g.html.join('')}</div>`).join('');
}

// Ograda o preuzetom rasporedu ide u VIDLJIVI #tp-badge-note, ne (samo) u title tooltip:
// title nije dostupan na dodir (mobitel/tablet), ne fokusira se tipkovnicom i citaci ekrana
// ga nepouzdano izgovaraju, a bas ta napomena kaze da raspored NIJE sluzbeni predlozak za
// odabranu vrstu rada. Bez napomene element je skriven.
function setBadgeNote(text: string) {
  const el = $('#tp-badge-note');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

function renderBadge(sel: TemplateSelection) {
  const badge = $('#tp-template-badge');
  if (!badge) return;
  const note = sel.template?.provenance.sourceNote || '';
  if (sel.provenance === 'generic') {
    badge.className = 'tp-badge generic';
    badge.textContent = 'Generički raspored';
    badge.title = note;
    setBadgeNote('');
    return;
  }
  if (sel.levelReused) {
    // Predlozak je preuzet iz druge vrste rada istog fakulteta: posteno kazemo da je
    // fakultetski raspored prilagodjen, ne da je sluzbeni propis bas za ovu vrstu rada.
    badge.className = sel.provenance === 'official' ? 'tp-badge official' : 'tp-badge derived';
    badge.textContent = 'Raspored tvog fakulteta';
    // workTypeLabel daje puni HR naziv ("Zavrsni rad"); ovdje treba mala pocetnica jer je
    // umetnut usred recenice ("za zavrsni rad", ne "za Zavrsni rad rad" - LEVEL_SLUGS je ASCII
    // URL-slug tablica namijenjena ?razina= parametru, nikad prikaznom tekstu).
    const from = sel.reusedFromLevel ? workTypeLabel(sel.reusedFromLevel).toLowerCase() : '';
    const reuseNote =
      `Preuzet iz fakultetskog rasporeda za ${from} i prilagođen odabranoj vrsti rada.` +
      (note ? ` ${note}` : '');
    badge.title = reuseNote;
    setBadgeNote(reuseNote);
    return;
  }
  if (sel.provenance === 'official') {
    badge.className = 'tp-badge official';
    badge.textContent = 'Službeni predložak fakulteta';
  } else {
    badge.className = 'tp-badge derived';
    badge.textContent = 'Raspored izveden iz javnih radova';
  }
  badge.title = note;
  setBadgeNote('');
}

// #tp-hint je aria-live=polite: pisanje na svaki keystroke tjera citac ekrana da istu poruku
// ponavlja uz svaki utipkani znak. Debounce nakon pauze u tipkanju + changed-guard (textContent
// na istu vrijednost i dalje mijenja text node pa SR zna ponoviti najavu). Isti obrazac kao
// scheduleSrSummary u kartice-page.ts; vizualni pregled naslovnice ostaje trenutan.
let _hintTimer: any = 0;
function scheduleHint(missing: string[]) {
  const hint = $('#tp-hint');
  if (!hint) return;
  clearTimeout(_hintTimer);
  _hintTimer = setTimeout(() => {
    const cls = missing.length ? 'out-hint warn' : 'out-hint ok';
    const text = missing.length ? `Preporučeno dodati: ${missing.join(', ')}.` : 'Sva preporučena polja su ispunjena.';
    if (hint.className !== cls) hint.className = cls;
    if (hint.textContent !== text) hint.textContent = text;
  }, 600);
}

// Rezultat zadnjeg render()-a, ponovno koristen u copy/docx handlerima umjesto da svaki
// klik nanovo cita DOM i gradi model (render() ga vec izgradio prije klika).
let lastModel: TitlePageModel | null = null;

function render() {
  const input = readInput();
  const sel = currentSelection();
  const model = buildTitlePage(input, sel.template ?? undefined);
  lastModel = model;

  const sheet = $('#tp-sheet');
  if (sheet) {
    if (!model.lines.length) {
      sheet.innerHTML = '<div class="tp-empty">Ispuni polja lijevo pa se naslovnica slaže ovdje.</div>';
    } else if (model.templateId) {
      sheet.innerHTML = renderTemplateSheet(model);
    } else {
      sheet.innerHTML = model.lines.map(l => `<div class="tp-line tp-${l.role}">${escapeHtml(l.text)}</div>`).join('');
    }
  }

  renderBadge(sel);
  scheduleHint(model.missing);

  const hasContent = model.lines.length > 0;
  const copy = $('#tp-copy'), print = $('#tp-print'), docx = $('#tp-docx');
  if (copy) copy.disabled = !hasContent;
  if (print) print.disabled = !hasContent;
  if (docx) docx.disabled = !hasContent;
}

// --- Kaskada ustanova -> fakultet -> studij (auto-popuna, polja ostaju editabilna) ---

const hrSort = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'hr');

function fillSelect(el: any, placeholder: string, items: Array<{ id?: string; name: string }>, useName = false) {
  if (!el) return;
  el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items
    .map((it) => `<option value="${escapeHtml(useName ? it.name : it.id || '')}">${escapeHtml(it.name)}</option>`)
    .join('');
}

function populateInstitutions() {
  fillSelect($('#tp-institution'), 'Slobodan unos / nije na popisu', [...ZAGREB_CATALOG].sort(hrSort));
}

/** Prijedlozi za slobodni unos #tp-university, izvedeni iz kataloga (isti izvor kao kaskada). */
function populateUniversityDatalist() {
  const dl = $('#dl-university');
  if (!dl) return;
  const names = [...new Set(ZAGREB_CATALOG.map((i) => i.name))].sort((a, b) => a.localeCompare(b, 'hr'));
  dl.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">`).join('');
}

function populateUnits(institutionId: string) {
  const inst = ZAGREB_CATALOG.find((i) => i.id === institutionId);
  const units = inst ? [...inst.units].sort(hrSort) : [];
  fillSelect($('#tp-unit'), inst ? 'Odaberi fakultet' : 'Prvo odaberi ustanovu', units);
  const unitSel = $('#tp-unit');
  if (unitSel) unitSel.disabled = !inst;
}

function populatePrograms(unitId: string) {
  const inst = ZAGREB_CATALOG.find((i) => i.units.some((u) => u.id === unitId));
  const unit = inst?.units.find((u) => u.id === unitId);
  const programs = (unit?.programs || []).map((name) => ({ name }));
  fillSelect($('#tp-program'), unit ? 'Odaberi studij (opcionalno)' : 'Prvo odaberi fakultet', programs, true);
  const programSel = $('#tp-program');
  if (programSel) programSel.disabled = !unit || !programs.length;
}

/** Upisi izbor kaskade u URL (deep-link), bez unosa u povijest preglednika. */
function syncUrl() {
  const unitId = $('#tp-unit')?.value || '';
  const qs = serializeTitlePageParams({
    unitId: unitId || undefined,
    level: unitId ? (currentLevel() as WorkType) : undefined,
    program: (unitId && $('#tp-program')?.value) || undefined,
  });
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

function onInstitutionChange() {
  const instId = $('#tp-institution')?.value || '';
  populateUnits(instId);
  populatePrograms('');
  const inst = ZAGREB_CATALOG.find((i) => i.id === instId);
  if (inst) $(FIELDS.university).value = inst.name;
  syncUrl();
  render();
}

function onUnitChange() {
  const unitId = $('#tp-unit')?.value || '';
  populatePrograms(unitId);
  const inst = ZAGREB_CATALOG.find((i) => i.units.some((u) => u.id === unitId));
  const unit = inst?.units.find((u) => u.id === unitId);
  if (unit) {
    // Samostalne ustanove (npr. Sveuciliste Sjever) u katalogu imaju jedinicu istog
    // imena; tada fakultet ostaje prazan da se redak na naslovnici ne duplicira.
    $(FIELDS.faculty).value = inst && unit.name === inst.name ? '' : unit.name;
    if (inst && !$(FIELDS.university).value) $(FIELDS.university).value = inst.name;
  }
  syncUrl();
  render();
}

/** Kataloski nazivi programa znaju nositi sufiks u zagradama ("(zavrsni rad, ...)");
 *  za redak studija na naslovnici sufiks se skida (prezentacijski, katalog ostaje). */
function studyTextForProgram(program: string): string {
  return program.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function onProgramChange() {
  const program = $('#tp-program')?.value || '';
  if (program) {
    $(FIELDS.study).value = studyTextForProgram(program);
    const wt = defaultWorkTypeForProgram(program, new Set(), currentLevel());
    const wtSel = $('#tp-worktype');
    if (wtSel && [...wtSel.options].some((o: any) => o.value === wt)) wtSel.value = wt;
  }
  syncUrl();
  render();
}

/** Postavi kaskadu iz URL parametara (?fakultet=&razina=&smjer=). */
function applyUrlParams() {
  const params = parseTitlePageParams(location.search);
  if (params.level) {
    const wtSel = $('#tp-worktype');
    if (wtSel && [...wtSel.options].some((o: any) => o.value === params.level)) wtSel.value = params.level;
  }
  if (!params.unitId) return;
  const inst = ZAGREB_CATALOG.find((i) => i.units.some((u) => u.id === params.unitId));
  if (!inst) return;
  $('#tp-institution').value = inst.id;
  populateUnits(inst.id);
  $('#tp-unit').value = params.unitId;
  populatePrograms(params.unitId);
  const unit = inst.units.find((u) => u.id === params.unitId)!;
  $(FIELDS.university).value = inst.name;
  $(FIELDS.faculty).value = unit.name === inst.name ? '' : unit.name;
  if (params.program && unit.programs.includes(params.program)) {
    $('#tp-program').value = params.program;
    $(FIELDS.study).value = studyTextForProgram(params.program);
  }
}

// Titula mentora/komentora (izvan FIELDS jer se ne kopira u model kao tekstualna vrijednost).
const LABEL_SELECTS = ['#tp-mentor-label', '#tp-comentor-label'];
const CASCADE_SELECTS = ['#tp-institution', '#tp-unit', '#tp-program'];

function init() {
  if (!$('#tp-sheet')) return;
  populateInstitutions();
  populateUniversityDatalist();
  populateUnits('');
  populatePrograms('');
  applyUrlParams();

  for (const sel of Object.values(FIELDS)) {
    const el = $(sel);
    if (el) el.addEventListener('input', render);
  }
  for (const sel of LABEL_SELECTS) { const el = $(sel); if (el) el.addEventListener('change', render); }
  $('#tp-institution')?.addEventListener('change', onInstitutionChange);
  $('#tp-unit')?.addEventListener('change', onUnitChange);
  $('#tp-program')?.addEventListener('change', onProgramChange);
  $('#tp-worktype')?.addEventListener('change', syncUrl);
  render();

  $('#tp-sample')?.addEventListener('click', () => {
    for (const [key, sel] of Object.entries(FIELDS)) { const el = $(sel); if (el) el.value = SAMPLE[key] || ''; }
    render();
  });

  $('#tp-clear')?.addEventListener('click', () => {
    // Selecti (vrsta rada, kaskada) nemaju smislen value='' za prikaz, pa se vracaju na
    // prvu opciju; tekstualna polja se prazne (kao izjava).
    for (const sel of Object.values(FIELDS)) {
      const el = $(sel); if (!el) continue;
      if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
    }
    for (const sel of LABEL_SELECTS) { const el = $(sel); if (el) el.selectedIndex = 0; }
    for (const sel of CASCADE_SELECTS) { const el = $(sel); if (el) el.selectedIndex = 0; }
    populateUnits('');
    populatePrograms('');
    history.replaceState(null, '', location.pathname);
    render();
    $('#tp-university')?.focus();
  });

  bindCopyButton($('#tp-copy'), () => {
    const model = lastModel;
    return model && model.lines.length ? titlePageText(model) : '';
  }, { statusEl: $('#tp-copy-status') });

  $('#tp-print')?.addEventListener('click', () => window.print());

  // Preuzmi gotov .docx (docx-writer): s predloskom fakulteta kad postoji, inace genericki.
  $('#tp-docx')?.addEventListener('click', () => {
    const template = currentSelection().template ?? undefined;
    const model = lastModel;
    if (!model || !model.lines.length) return;
    try {
      downloadBlob(docxBlob(titlePageDoc(model, template)), 'naslovnica.docx');
    } catch {
      // .docx nije uspio (rijetko): pregled i ispis su i dalje tu.
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
