// DOM glue za besplatni generator naslovnice (naslovnica.html). Logika slaganja je u
// title-page.ts (tipizirano, testabilno); ovdje samo vezanje forme, pregled i ispis. Bez mreze.
// Kaskada ustanova -> fakultet -> studij puni se iz kataloga i bira predlozak fakulteta
// (data/title-pages); tekstualna polja ostaju editabilna (kaskada ih samo auto-popunjava).
import '../shared/ui-boot';
import './tool-analytics';
import { buildTitlePage, titlePageText, type TitlePageModel } from './title-page';
import { titlePageDoc, docxBlob } from '../docx/docx-writer';
import { escapeHtml } from '../utils/helpers';
import { bindCopyButton, bindDownloadButton, defaultSelectedIndex } from './tool-ui';
import { readToolDraft, saveToolDraft } from './draft-share';
import { ZAGREB_CATALOG } from '../catalog/catalog-loader';
import { selectTemplate, TITLE_PAGE_TEMPLATES, ensureTemplatesHeavy, templatesHeavyLoaded, type TemplateSelection } from '../title-pages/template-loader';
import { workTypeLabel } from '../config/config-loader';
import { parseTitlePageParams, serializeTitlePageParams } from '../title-pages/title-page-params';
import { readFacultyContext, saveFacultyContext } from './faculty-context';
import { defaultWorkTypeForProgram } from '../ui/work-selection';
import type { WorkType } from '../profiles/profile-schema';
import { renderTemplateSheet } from '../title-pages/render-sheet';

const $ = (s: string): any => document.querySelector(s);

const FIELDS = {
  university: '#tp-university', faculty: '#tp-faculty', study: '#tp-study',
  author: '#tp-author', studentId: '#tp-studentid', course: '#tp-course',
  title: '#tp-title', subtitle: '#tp-subtitle',
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
  // Prazna value (placeholder "Odaberi vrstu rada") mora ostati prazan workType, ne njegov
  // vidljivi tekst - inace placeholder tiho postaje "vrsta rada" ispisana na naslovnici.
  const wt = $('#tp-worktype');
  out.workType = wt?.value ? wt.selectedOptions?.[0]?.textContent?.trim() || '' : '';
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
// renderTemplateSheet/lineStyleCss su izdvojeni u ../title-pages/render-sheet.ts (cist, bez
// DOM ovisnosti) da ih i scripts/generate-title-page-tools.mjs (B5) moze koristiti bajt-vjerno.

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

/** Urednicke napomene predloska (template.notes): sto sluzbeni predlozak trazi a generator
 *  jos ne podrzava (dvojezicna naslovnica, zasebne korice, logotip...). Prikazuju se kao
 *  prosirivi <details> ispod badgea; bez napomena blok je skriven. escapeHtml + textContent
 *  (napomena je cisti tekst iz naseg JSON-a, ali granica prema podacima ostaje ista). */
function renderTemplateNotes(sel: TemplateSelection) {
  const box = $('#tp-notes');
  if (!box) return;
  const notes = (sel.template?.notes || '').trim();
  const body = $('#tp-notes-text');
  if (body) body.textContent = notes;
  box.hidden = !notes;
  if (!notes) box.removeAttribute('open');
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

// Predlosci su LIJENO ucitani (perf split, v. template-loader.ts): dok je stvaran fakultet
// odabran a heavy chunk jos ne stigne, currentSelection() bi vratila NEPOTPUN predlozak (bez
// elements). Ako je vec ucitan (uobicajen slucaj: cim se stranica otvori, ensureTemplatesHeavy
// se pokrene fire-and-forget), render() ostaje potpuno sinkron - nikakav await, nikakav mikrotask
// tik. Genericki odabir (bez fakulteta) ionako nikad ne treba heavy podatke.
async function render(): Promise<void> {
  const unitId = $('#tp-unit')?.value || '';
  if (unitId && !templatesHeavyLoaded()) {
    // Onemoguci izvoz ODMAH (sinkrono, prije awaita): sprijeci klik s nepotpunim predloskom
    // u tom kratkom prozoru dok chunk ne stigne.
    const copy0 = $('#tp-copy'), print0 = $('#tp-print'), docx0 = $('#tp-docx'), share0 = $('#tp-share');
    if (copy0) copy0.disabled = true;
    if (print0) print0.disabled = true;
    if (docx0) docx0.disabled = true;
    if (share0) share0.disabled = true;
    await ensureTemplatesHeavy();
  }
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
  renderTemplateNotes(sel);
  scheduleHint(model.missing);

  const hasContent = model.lines.length > 0;
  const copy = $('#tp-copy'), print = $('#tp-print'), docx = $('#tp-docx');
  if (copy) copy.disabled = !hasContent;
  if (print) print.disabled = !hasContent;
  if (docx) docx.disabled = !hasContent;
  $('#tp-success-cta')?.classList.toggle('is-visible', hasContent);
  const ctaUnitId = $('#tp-unit')?.value || '';
  $('#tp-success-cta-link')?.setAttribute('href', ctaUnitId ? `index.html?unit=${encodeURIComponent(ctaUnitId)}#analyzer` : 'index.html#analyzer');
  // Poveznica ima smisla samo kad kaskada nosi konkretan fakultet (syncUrl vec upisao ?fakultet=
  // u adresnu traku); prazan/rucni unos bez odabira daje golu pocetnu adresu, nista za dijeliti.
  const share = $('#tp-share');
  if (share) share.disabled = !$('#tp-unit')?.value;
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

// Broj fakulteta/odsjeka s vlastitim predloskom (hero recenica), racunato iz zivih podataka
// (ne rucno upisan broj) da se ne raziđe od data/title-pages/templates.json kako raste.
function renderCoverageCount(): void {
  const el = $('#tp-coverage-count');
  if (!el) return;
  const units = new Set(TITLE_PAGE_TEMPLATES.map((t: any) => t.unitId));
  el.textContent = String(units.size);
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

// Prati je li #tp-university/#tp-faculty/#tp-study TRENUTNO popunila kaskada (institucija/
// fakultet/studij select) ili je korisnik rucno upisao svoju vrijednost. Kaskada smije
// isprazniti/prepisati polje SAMO dok je "auto" (vidi onInstitutionChange/onUnitChange/
// onProgramChange dolje); rucni unos (input event, ne programsko postavljanje .value) gasi
// odgovarajucu zastavicu pa ga kaskada vise ne dira. Bez ovoga: promjena ustanove/fakulteta
// na placeholder ili na drugi izbor ostavlja STARI naziv fakulteta/studija u polju bez ikakvog
// upozorenja, i on tiho zavrsi u pregledu/kopiji/ispisu/.docx.
let universityAuto = false;
let facultyAuto = false;
let studyAuto = false;

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

// Dijeljeni fakultetski kontekst (faculty-context.ts): isti unitId/program/level koje citat
// generator vec cita/pise. Prazan unitId je eksplicitni reset (vidi saveFacultyContext).
function persistFacultyContext(): void {
  const unitId = $('#tp-unit')?.value || '';
  if (!unitId) { saveFacultyContext({ unitId: '' }); return; }
  saveFacultyContext({
    unitId,
    program: $('#tp-program')?.value || undefined,
    level: (currentLevel() || undefined) as WorkType | undefined,
  });
}

function onInstitutionChange() {
  const instId = $('#tp-institution')?.value || '';
  populateUnits(instId);
  populatePrograms('');
  const inst = ZAGREB_CATALOG.find((i) => i.id === instId);
  if (inst) {
    $(FIELDS.university).value = inst.name;
    universityAuto = true;
  } else if (universityAuto) {
    // Ustanova vracena na placeholder: sveuciliste vise ne odgovara nikakvom odabiru,
    // isprazni GA SAMO ako ga je popunila kaskada (rucni unos ostaje netaknut).
    $(FIELDS.university).value = '';
    universityAuto = false;
  }
  // Fakultet/studij su ovisili o (staroj) ustanovi; populateUnits/populatePrograms su vec
  // resetirali selecte, pa tekstualna polja moraju pratiti AKO ih je popunila kaskada.
  if (facultyAuto) { $(FIELDS.faculty).value = ''; facultyAuto = false; }
  if (studyAuto) { $(FIELDS.study).value = ''; studyAuto = false; }
  syncUrl();
  persistFacultyContext();
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
    facultyAuto = true;
    if (inst && !$(FIELDS.university).value) { $(FIELDS.university).value = inst.name; universityAuto = true; }
  } else if (facultyAuto) {
    // Fakultet vracen na placeholder: vise ne odgovara nikakvom odabiru.
    $(FIELDS.faculty).value = '';
    facultyAuto = false;
  }
  // Studij je ovisio o (starom) fakultetu; populatePrograms je vec resetirao select, pa
  // tekstualno polje mora pratiti AKO ga je popunila kaskada (rucni unos ostaje netaknut).
  if (studyAuto) { $(FIELDS.study).value = ''; studyAuto = false; }
  syncUrl();
  persistFacultyContext();
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
    studyAuto = true;
    const wt = defaultWorkTypeForProgram(program, new Set(), currentLevel());
    const wtSel = $('#tp-worktype');
    if (wtSel && [...wtSel.options].some((o: any) => o.value === wt)) wtSel.value = wt;
  } else if (studyAuto) {
    // Studij vracen na placeholder (opcionalan odabir): vise ne odgovara, isprazni GA SAMO
    // ako ga je popunila kaskada.
    $(FIELDS.study).value = '';
    studyAuto = false;
  }
  syncUrl();
  persistFacultyContext();
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
  universityAuto = true;
  $(FIELDS.faculty).value = unit.name === inst.name ? '' : unit.name;
  facultyAuto = true;
  if (params.program && unit.programs.includes(params.program)) {
    $('#tp-program').value = params.program;
    $(FIELDS.study).value = studyTextForProgram(params.program);
    studyAuto = true;
  }
}

/** Prefill kaskade iz dijeljenog fakultetskog konteksta (samo ako ?fakultet= nije vec nesto
 *  postavio preko applyUrlParams - eksplicitni link uvijek ima prednost). */
function applyFacultyContext(): void {
  if ($('#tp-unit')?.value) return;
  const ctx = readFacultyContext();
  if (!ctx.unitId) return;
  const inst = ZAGREB_CATALOG.find((i) => i.units.some((u) => u.id === ctx.unitId));
  if (!inst) return;
  $('#tp-institution').value = inst.id;
  populateUnits(inst.id);
  $('#tp-unit').value = ctx.unitId;
  populatePrograms(ctx.unitId);
  const unit = inst.units.find((u) => u.id === ctx.unitId)!;
  $(FIELDS.university).value = inst.name;
  universityAuto = true;
  $(FIELDS.faculty).value = unit.name === inst.name ? '' : unit.name;
  facultyAuto = true;
  if (ctx.program && unit.programs.includes(ctx.program)) {
    $('#tp-program').value = ctx.program;
    $(FIELDS.study).value = studyTextForProgram(ctx.program);
    studyAuto = true;
  }
  if (ctx.level) {
    const wtSel = $('#tp-worktype');
    if (wtSel && [...wtSel.options].some((o: any) => o.value === ctx.level)) wtSel.value = ctx.level;
  }
}

// Titula mentora/komentora (izvan FIELDS jer se ne kopira u model kao tekstualna vrijednost).
const LABEL_SELECTS = ['#tp-mentor-label', '#tp-comentor-label'];
const CASCADE_SELECTS = ['#tp-institution', '#tp-unit', '#tp-program'];

// Draft dijeljen s izjavom o izvornosti (sessionStorage): puni SAMO prazna polja pri
// ucitavanju, sprema se na svaki rucni unos (vidljivi label vrste rada, ne value kljuc).
function applySharedDraft(): void {
  const d = readToolDraft();
  const fillIfEmpty = (sel: string, v?: string) => {
    const el = $(sel);
    if (el && v && !el.value.trim()) el.value = v;
  };
  fillIfEmpty(FIELDS.author, d.author);
  fillIfEmpty(FIELDS.title, d.title);
  fillIfEmpty(FIELDS.place, d.place);
  const wt = $('#tp-worktype');
  if (wt && d.workTypeLabel) {
    const opt = Array.from(wt.options as any[]).find((o: any) => o.textContent?.trim() === d.workTypeLabel);
    if (opt) wt.value = opt.value;
  }
}

function persistSharedDraft(): void {
  const wt = $('#tp-worktype');
  saveToolDraft({
    author: $(FIELDS.author)?.value || '',
    title: $(FIELDS.title)?.value || '',
    workTypeLabel: wt?.value ? wt.selectedOptions?.[0]?.textContent?.trim() || '' : '',
    place: $(FIELDS.place)?.value || '',
  });
}

function init() {
  if (!$('#tp-sheet')) return;
  renderCoverageCount();
  populateInstitutions();
  populateUniversityDatalist();
  populateUnits('');
  populatePrograms('');
  applyUrlParams();
  applyFacultyContext();
  applySharedDraft();

  for (const sel of Object.values(FIELDS)) {
    const el = $(sel);
    if (el) el.addEventListener('input', () => { render(); persistSharedDraft(); });
  }
  $('#tp-worktype')?.addEventListener('change', persistSharedDraft);
  $('#tp-worktype')?.addEventListener('change', persistFacultyContext);
  // Rucni unos (stvarni input event, ne programsko postavljanje .value iz kaskade) gasi
  // odgovarajucu "auto" zastavicu: kaskada vise ne smije tiho prepisati/isprazniti dok
  // korisnik sam uredjuje polje.
  $(FIELDS.university)?.addEventListener('input', () => { universityAuto = false; });
  $(FIELDS.faculty)?.addEventListener('input', () => { facultyAuto = false; });
  $(FIELDS.study)?.addEventListener('input', () => { studyAuto = false; });
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
    // HTML default ('selected' atribut; #tp-worktype je Diplomski, ne prva opcija);
    // tekstualna polja se prazne (kao izjava).
    for (const sel of Object.values(FIELDS)) {
      const el = $(sel); if (!el) continue;
      if (el.tagName === 'SELECT') el.selectedIndex = defaultSelectedIndex(el); else el.value = '';
    }
    for (const sel of LABEL_SELECTS) { const el = $(sel); if (el) el.selectedIndex = 0; }
    for (const sel of CASCADE_SELECTS) { const el = $(sel); if (el) el.selectedIndex = 0; }
    universityAuto = false; facultyAuto = false; studyAuto = false;
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

  // Deep-link na trenutni predlozak: syncUrl() vec upisuje ?fakultet=&razina=&smjer= u adresnu
  // traku na svaku promjenu kaskade (applyUrlParams cita to natrag); ovaj gumb samo cini tu
  // vec postojecu infrastrukturu vidljivom i djeljivom.
  bindCopyButton($('#tp-share'), () => ($('#tp-unit')?.value ? location.href : ''), {
    statusEl: $('#tp-copy-status'),
    okStatus: 'Poveznica na predložak kopirana u međuspremnik.',
  });

  $('#tp-print')?.addEventListener('click', () => window.print());

  // Preuzmi gotov .docx (docx-writer): s predloskom fakulteta kad postoji, inace genericki.
  bindDownloadButton($('#tp-docx'), () => {
    const template = currentSelection().template ?? undefined;
    const model = lastModel;
    return model && model.lines.length ? docxBlob(titlePageDoc(model, template)) : null;
  }, 'naslovnica.docx', {
    statusEl: $('#tp-hint'),
    failStatus: 'Preuzimanje .docx nije uspjelo, pokušaj kopirati tekst ili spremiti kao PDF.',
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
