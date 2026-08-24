import '@fontsource-variable/inter-tight';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource/caveat/500.css';
import './demo.css';
import {
  advanceDemo,
  initialDemoState,
  selectFinding,
  toggleAdvanced,
  type DemoState,
} from './demo-state';

type Finding = {
  id: string;
  severity: 'important' | 'warning' | 'info';
  label: string;
  title: string;
  where: string;
  why: string;
  action: string;
  rule: string;
  evidence: string;
};

const findings: Finding[] = [
  {
    id: 'margins',
    severity: 'important',
    label: 'Važno',
    title: 'Lijeva margina je preuska',
    where: 'Stranica 1, cijeli rad',
    why: 'Profil traži 3 cm lijevo zbog uveza. U dokumentu je pronađeno 2 cm.',
    action: 'Postavi lijevu marginu na 3 cm i ponovno provjeri rad.',
    rule: 'FPZG, tehničke upute, margine',
    evidence: 'Pronađeno: 2 cm · Očekivano: 3 cm',
  },
  {
    id: 'heading',
    severity: 'warning',
    label: 'Provjeri',
    title: 'Naslov poglavlja nije ujednačen',
    where: 'Stranica 4, naslov „Metodologija“',
    why: 'Naslov ima drugačiji prored od ostalih naslova iste razine.',
    action: 'Uskladi stil s ostalim naslovima razine 1.',
    rule: 'FPZG, struktura rada, naslovi',
    evidence: 'Prored: 1,0 · Ostali naslovi: 1,15',
  },
  {
    id: 'citation',
    severity: 'info',
    label: 'Informativno',
    title: 'Jedan citat traži ručnu provjeru',
    where: 'Stranica 8, bilješka 12',
    why: 'Format izgleda ispravno, ali iz izvora nije moguće automatski potvrditi sve podatke.',
    action: 'Usporedi bilješku s izvornom publikacijom.',
    rule: 'Priručnik citiranja, bilješke',
    evidence: 'Automatska provjera: djelomična',
  },
];

const phases = [
  { title: 'Čitam dokument', copy: 'Prepoznajem stranice, odlomke i strukturu rada.' },
  { title: 'Uspoređujem pravila', copy: 'Provjeravam rad prema odabranom profilu fakulteta.' },
  { title: 'Slažem nalaz', copy: 'Razvrstavam probleme prema važnosti i načinu rješavanja.' },
];

let state: DemoState = initialDemoState();
let analysisTimer: number | null = null;

function findingById(id: string | null): Finding {
  return findings.find((finding) => finding.id === id) ?? findings[0];
}

function phaseMarkup(active: number): string {
  return phases.map((phase, index) => `
    <button class="phase ${index < active - 1 ? 'is-done' : ''} ${index === active - 1 ? 'is-active' : ''}" type="button" data-phase="${index + 1}" aria-current="${index === active - 1 ? 'step' : 'false'}">
      <span class="phase-dot">${index < active - 1 ? '✓' : String(index + 1)}</span>
      <span><strong>${phase.title}</strong><small>${phase.copy}</small></span>
    </button>
  `).join('');
}

function stageRail(): string {
  const active = state.stage === 'upload' ? 1 : state.stage === 'analyzing' ? 2 : 3;
  return `<nav class="stage-rail" aria-label="Tijek demo provjere">
    ${['Dokument', 'Provjera', 'Nalaz'].map((label, index) => `
      <span class="rail-step ${index + 1 <= active ? 'is-active' : ''}"><i>${index + 1}</i>${label}</span>
      ${index < 2 ? '<span class="rail-line" aria-hidden="true"></span>' : ''}
    `).join('')}
  </nav>`;
}

function deskHeader(): string {
  return `<header class="demo-header">
    <a class="demo-brand" href="/" aria-label="Lekta, natrag na glavnu stranicu"><span class="brand-mark">L</span><span>Lekta</span><em>demo</em></a>
    <div class="header-note"><span class="status-dot"></span> Lokalna provjera · podaci ostaju na uređaju</div>
    <button class="restart-button" type="button" data-action="reset">Počni ispočetka</button>
  </header>`;
}

function uploadView(): string {
  return `<section class="demo-view upload-view" aria-labelledby="uploadTitle">
    <div class="view-intro">
      <p class="eyebrow">Korak 01 · dokument na stolu</p>
      <h1 id="uploadTitle">Stavi rad na stol.<br><em>Mi ćemo ga pažljivo pregledati.</em></h1>
      <p class="lede">Ovo je interaktivni prikaz Lektine provjere forme rada. Ne čitamo tvoje rečenice, nego tražimo ono što treba biti tehnički usklađeno.</p>
    </div>
    <div class="upload-layout">
      <article class="paper-upload" aria-label="Demo dokument">
        <div class="paper-topline"><span>LEKTA / RADNI PRIMJER</span><span>01</span></div>
        <div class="paper-copy"><span class="paper-kicker">Seminarski rad</span><h2>Utjecaj digitalnih alata na akademsko pisanje</h2><p>Primjer dokumenta spreman je za lokalnu provjeru prema profilu fakulteta.</p></div>
        <div class="paper-lines"><i></i><i></i><i></i><i></i></div>
        <span class="paper-clip" aria-hidden="true"></span><span class="hand-note">provjeri formu ↘</span>
      </article>
      <aside class="upload-action">
        <div class="file-badge"><span class="file-icon">DOCX</span><span><strong>seminarski-rad.docx</strong><small>2,4 MB · spreman za provjeru</small></span><b>✓</b></div>
        <div class="privacy-seal"><span>LOKALNO</span><strong>Dokument ne napušta uređaj</strong><small>Analiza radi u pregledniku. Ovo je demo s izmišljenim podacima.</small></div>
        <button class="primary-action" type="button" data-action="start"><span>Pokreni demo provjeru</span><b>→</b></button>
        <p class="action-hint">Trajanje prikaza: oko 5 sekundi</p>
      </aside>
    </div>
  </section>`;
}

function analyzingView(): string {
  const current = Math.min(Math.max(state.analysisPhase, 1), 3);
  const phase = phases[current - 1];
  return `<section class="demo-view analyzing-view" aria-labelledby="analyzingTitle">
    <div class="view-intro compact"><p class="eyebrow">Korak 02 · transparentna provjera</p><h1 id="analyzingTitle">Rad je na stolu.<br><em>Vidiš što upravo provjeravamo.</em></h1></div>
    <div class="analysis-layout">
      <article class="scan-stage">
        <div class="scan-toolbar"><span><i class="toolbar-dot red"></i><i class="toolbar-dot yellow"></i><i class="toolbar-dot green"></i></span><strong>LEKTA / ANALIZA U TIJEKU</strong><small>${current} / 3</small></div>
        <div class="scan-paper"><div class="scan-glow"></div><span class="scan-stamp">PROVJERAVAM</span><div class="scan-title"></div><div class="scan-paragraphs"><i></i><i></i><i></i><i></i><i></i></div><span class="scan-cursor"></span></div>
        <div class="scan-caption"><span class="pulse-dot"></span><strong>${phase.title}</strong><span>${phase.copy}</span></div>
      </article>
      <div class="phase-list">${phaseMarkup(current)}<button class="skip-action" type="button" data-action="skip">Preskoči na nalaz <span>→</span></button></div>
    </div>
  </section>`;
}

function findingCard(finding: Finding): string {
  const selected = state.selectedFindingId === finding.id;
  return `<button class="finding-card ${selected ? 'is-selected' : ''} finding-${finding.severity}" type="button" data-finding="${finding.id}" aria-pressed="${selected}">
    <span class="finding-number">${findings.indexOf(finding) + 1}</span><span class="finding-card-body"><small>${finding.label} · ${finding.where}</small><strong>${finding.title}</strong><em>${finding.action}</em></span><span class="finding-arrow">${selected ? '↓' : '↗'}</span>
  </button>`;
}

function evidenceMarkup(finding: Finding): string {
  return `<section class="evidence-chain" aria-labelledby="evidenceTitle"><div class="section-label" id="evidenceTitle">Lanac dokaza</div><div class="evidence-steps">
    <div class="evidence-step"><small>01 · PRAVILO</small><strong>${finding.rule}</strong></div><span class="evidence-arrow">→</span>
    <div class="evidence-step"><small>02 · MJESTO</small><strong>${finding.where}</strong></div><span class="evidence-arrow">→</span>
    <div class="evidence-step"><small>03 · DOKAZ</small><strong>${finding.evidence}</strong></div><span class="evidence-arrow">→</span>
    <div class="evidence-step final"><small>04 · RADNJA</small><strong>${finding.action}</strong></div>
  </div></section>`;
}

function documentMarkup(selected: Finding): string {
  return `<article class="document-board" aria-label="Dokument s označenim nalazima"><div class="doc-board-head"><span><i class="toolbar-dot red"></i><i class="toolbar-dot yellow"></i><i class="toolbar-dot green"></i></span><strong>seminarski-rad.docx</strong><small>Pregled forme</small></div><div class="document-paper">
    <div class="doc-meta"><span>SEMINARSKI RAD</span><span>1 / 12</span></div><h3>Utjecaj digitalnih alata<br>na akademsko pisanje</h3><p class="doc-author">Ime Prezime · Fakultet društvenih znanosti</p><div class="doc-rule"></div><p>Akademski rad mora imati jasnu strukturu i dosljedno oblikovanje. Ovaj prikaz pokazuje kako Lekta povezuje tehničko pravilo s konkretnim mjestom u dokumentu.</p><p>Provjera ne ocjenjuje kvalitetu ideja ni argumentacije. Ona mjeri formu prema odabranom službenom profilu.</p>
    <button class="annotation annotation-margins ${selected.id === 'margins' ? 'is-active' : ''}" type="button" data-finding="margins" aria-label="Nalaz: lijeva margina">01</button><button class="annotation annotation-heading ${selected.id === 'heading' ? 'is-active' : ''}" type="button" data-finding="heading" aria-label="Nalaz: naslov poglavlja">02</button><button class="annotation annotation-citation ${selected.id === 'citation' ? 'is-active' : ''}" type="button" data-finding="citation" aria-label="Nalaz: citat">03</button>
    <span class="doc-margin-mark"></span><span class="doc-pencil">ovdje počinje dokaz</span>
  </div></article>`;
}

function resultView(): string {
  const selected = findingById(state.selectedFindingId);
  return `<section class="demo-view result-view" aria-labelledby="resultTitle">
    <div class="result-heading"><div><p class="eyebrow">Korak 03 · nalaz koji možeš provjeriti</p><h1 id="resultTitle">Tvoj rad nije izgubljen.<br><em>Sada znaš što treba popraviti.</em></h1></div><div class="trust-result"><span class="trust-stamp">PROVJERENO</span><small>3 važna mjesta<br>jasno objašnjena</small></div></div>
    <div class="result-layout">${documentMarkup(selected)}<aside class="findings-panel"><div class="panel-top"><div><span class="section-label">Otvoreni nalazi</span><h2>Što prvo provjeriti</h2></div><span class="finding-count">03</span></div><p class="panel-intro">Klikni oznaku na dokumentu ili nalaz s popisa. Svaki rezultat ima objašnjenje i dokaz.</p><div class="finding-list">${findings.map(findingCard).join('')}</div><div class="selected-explanation"><div class="selected-head"><span class="severity-dot dot-${selected.severity}"></span><span>${selected.label}</span></div><h3>${selected.title}</h3><p>${selected.why}</p><div class="next-action"><small>ŠTO SADA?</small><strong>${selected.action}</strong></div></div></aside></div>
    ${evidenceMarkup(selected)}
    <div class="result-footer-actions"><button class="secondary-action" type="button" data-action="toggle-advanced">${state.advancedOpen ? 'Sakrij napredne detalje' : 'Otvori napredne detalje'} <span>${state.advancedOpen ? '↑' : '↓'}</span></button><button class="primary-action small" type="button" data-action="reset"><span>Ponovi demo</span><b>↻</b></button></div>
    ${state.advancedOpen ? `<section class="advanced-drawer"><div><span class="section-label">Napredna provjera</span><h2>Detalji za one koji žele znati više</h2></div><div class="advanced-grid"><div><small>TEHNIČKA OCJENA</small><strong>87<span>/100</span></strong><p>Ocjena forme, odvojena od spremnosti za predaju.</p></div><div><small>KATEGORIJE</small><strong>3 / 4</strong><p>Oblikovanje, struktura i citati imaju dostupne nalaze.</p></div><div><small>METODOLOGIJA</small><strong>Lokalna provjera</strong><p>Dokument se analizira u pregledniku prema odabranom profilu.</p></div></div></section>` : ''}
  </section>`;
}

function render(): void {
  const root = document.querySelector<HTMLElement>('#demoApp');
  if (!root) return;
  const view = state.stage === 'upload' ? uploadView() : state.stage === 'analyzing' ? analyzingView() : resultView();
  root.innerHTML = `<div class="demo-shell">${deskHeader()}${stageRail()}${view}<footer class="demo-footer"><span>LEKTA / KOREKTORSKI STOL</span><span>Demo prototip · sadržaj je izmišljen</span></footer></div>`;
  bindEvents();
}

function startAnalysis(): void {
  if (analysisTimer !== null) window.clearTimeout(analysisTimer);
  state = advanceDemo(state);
  render();
  const tick = () => {
    if (state.stage !== 'analyzing') return;
    state = advanceDemo(state);
    if (state.stage === 'result' && state.selectedFindingId === null) {
      state = { ...state, selectedFindingId: findings[0].id };
    }
    render();
    if (state.stage === 'analyzing') analysisTimer = window.setTimeout(tick, 950);
    else analysisTimer = null;
  };
  analysisTimer = window.setTimeout(tick, 950);
}

function bindEvents(): void {
  document.querySelectorAll<HTMLElement>('[data-action="start"]').forEach((button) => button.addEventListener('click', startAnalysis));
  document.querySelectorAll<HTMLElement>('[data-action="skip"]').forEach((button) => button.addEventListener('click', () => {
    if (analysisTimer !== null) window.clearTimeout(analysisTimer);
    state = { ...state, stage: 'result', analysisPhase: 3, selectedFindingId: findings[0].id };
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-action="reset"]').forEach((button) => button.addEventListener('click', () => {
    if (analysisTimer !== null) window.clearTimeout(analysisTimer);
    analysisTimer = null;
    state = initialDemoState();
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-finding]').forEach((button) => button.addEventListener('click', () => {
    state = selectFinding(state, button.dataset.finding || findings[0].id);
    render();
    document.querySelector<HTMLElement>('.selected-explanation')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  document.querySelectorAll<HTMLElement>('[data-phase]').forEach((button) => button.addEventListener('click', () => {
    const phase = Number(button.dataset.phase);
    if (state.stage !== 'analyzing' || !Number.isInteger(phase) || phase > state.analysisPhase) return;
    state = { ...state, analysisPhase: phase };
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-action="toggle-advanced"]').forEach((button) => button.addEventListener('click', () => {
    state = toggleAdvanced(state);
    render();
  }));
}

render();
