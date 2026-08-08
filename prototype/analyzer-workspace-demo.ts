const demoVariants = ['editorial', 'blueprint', 'magazine', 'cockpit', 'tactile'] as const;
type DemoVariant = typeof demoVariants[number];
type WorkspaceState = 'upload' | 'ready' | 'progress' | 'result';

const demoSurface = document.querySelector<HTMLElement>('main[data-demo-surface="analyzer-workspace"]');
const requestedVariant = new URLSearchParams(location.search).get('variant');
const demoVariant: DemoVariant = demoVariants.includes(requestedVariant as DemoVariant)
  ? requestedVariant as DemoVariant
  : 'editorial';
const startView = document.getElementById('workspaceStart');
const progressView = document.getElementById('workspaceProgress');
const resultView = document.getElementById('workspaceResult');
const startButton = document.getElementById('workspaceStartButton');
const restartButton = document.getElementById('workspaceRestart');
const dropzone = document.getElementById('workspaceDropzone');
const stateLabel = document.getElementById('workspaceStateLabel');
const progressBar = document.getElementById('workspaceProgressBar');
const progressValue = document.getElementById('workspaceProgressValue');
const progressMessage = document.getElementById('workspaceProgressMessage');
const uploadStatus = document.getElementById('workspaceUploadStatus');
const uploadTitle = document.getElementById('workspaceUploadTitle');
const uploadDescription = document.getElementById('workspaceUploadDescription');
const actionHint = document.getElementById('workspaceActionHint');
const progressChecks = [
  document.getElementById('workspaceProgressCheckOne'),
  document.getElementById('workspaceProgressCheckTwo'),
  document.getElementById('workspaceProgressCheckThree'),
];
const railSteps = Array.from(document.querySelectorAll<HTMLElement>('[data-rail-step]'));

if (!(demoSurface instanceof HTMLElement)
  || !(startView instanceof HTMLElement)
  || !(progressView instanceof HTMLElement)
  || !(resultView instanceof HTMLElement)
  || !(startButton instanceof HTMLButtonElement)
  || !(restartButton instanceof HTMLButtonElement)
  || !(dropzone instanceof HTMLElement)
  || !(stateLabel instanceof HTMLElement)
  || !(uploadStatus instanceof HTMLElement)
  || !(uploadTitle instanceof HTMLElement)
  || !(uploadDescription instanceof HTMLElement)
  || !(actionHint instanceof HTMLElement)
  || !(progressBar instanceof HTMLElement)
  || !(progressValue instanceof HTMLElement)
  || !(progressMessage instanceof HTMLElement)
  || progressChecks.some((check) => !(check instanceof HTMLElement))) {
  throw new Error('Analyzer workspace demo markup is incomplete');
}

demoSurface.dataset.demoVariant = demoVariant;
demoSurface.setAttribute('data-demo-variant', demoVariant);
const checkedProgress = progressChecks as HTMLElement[];
const timers: number[] = [];
const stateLabels: Record<WorkspaceState, string> = {
  upload: 'Učitaj dokument',
  ready: 'Postavljanje konteksta',
  progress: 'Obrada dokumenta',
  result: 'Pregled rezultata',
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearTimers(): void {
  timers.splice(0).forEach((timer) => window.clearTimeout(timer));
}

function updateRail(state: WorkspaceState): void {
  const active = state === 'upload' || state === 'progress'
    ? 'document'
    : state === 'ready' ? 'context' : 'result';
  const activeIndex = state === 'upload' ? 0 : state === 'result' ? 2 : 1;
  railSteps.forEach((step, index) => {
    step.classList.toggle('is-active', step.dataset.railStep === active);
    step.classList.toggle('is-done', index < activeIndex);
  });
}

function showView(state: WorkspaceState): void {
  const isStart = state === 'upload' || state === 'ready';
  startView.hidden = !isStart;
  progressView.hidden = state !== 'progress';
  resultView.hidden = state !== 'result';
  demoSurface.dataset.demoState = state;
  stateLabel.textContent = stateLabels[state];
  updateRail(state);
}

function setProgress(value: number, message: string, completedIndex = -1): void {
  progressBar.style.width = `${value}%`;
  progressValue.textContent = `${value}%`;
  progressMessage.textContent = message;
  checkedProgress.forEach((check, index) => {
    check.classList.toggle('is-done', index <= completedIndex);
    if (index <= completedIndex) check.textContent = check.textContent?.replace('○', '✓') ?? check.textContent;
  });
}

function finishDemo(): void {
  clearTimers();
  setProgress(100, 'Analiza je spremna', 2);
  showView('result');
}

function activateDocument(): void {
  clearTimers();
  dropzone.classList.add('has-file');
  uploadStatus.textContent = 'Dokument spreman';
  uploadTitle.textContent = 'Primjer rada je učitan';
  uploadDescription.textContent = '1.8 MB · spremno za lokalnu provjeru';
  actionHint.textContent = 'Profil možeš promijeniti prije provjere.';
  showView('ready');
}

function startDemo(): void {
  clearTimers();
  if (demoSurface.dataset.demoState === 'upload') activateDocument();
  showView('progress');
  setProgress(8, 'Priprema dokumenta');

  if (prefersReducedMotion()) {
    finishDemo();
    return;
  }

  timers.push(window.setTimeout(() => setProgress(31, 'Čitanje strukture rada', 0), 420));
  timers.push(window.setTimeout(() => setProgress(58, 'Provjera citata i izvora', 1), 1_060));
  timers.push(window.setTimeout(() => setProgress(84, 'Usklađivanje oblikovanja', 2), 1_650));
  timers.push(window.setTimeout(finishDemo, 2_300));
}

function resetDemo(): void {
  clearTimers();
  checkedProgress.forEach((check, index) => {
    check.classList.remove('is-done');
    check.textContent = ['○ Struktura', '○ Citiranje', '○ Oblikovanje'][index];
  });
  dropzone.classList.remove('has-file');
  uploadStatus.textContent = 'Čeka upload';
  uploadTitle.textContent = 'Učitaj primjer rada';
  uploadDescription.textContent = '.docx / demo dokument, bez slanja sadržaja';
  actionHint.textContent = 'Klikni dokument da nastaviš.';
  setProgress(0, 'Priprema dokumenta');
  showView('upload');
}

startButton.addEventListener('click', startDemo);
restartButton.addEventListener('click', resetDemo);
dropzone.addEventListener('click', () => {
  if (demoSurface.dataset.demoState === 'upload') activateDocument();
});
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (demoSurface.dataset.demoState === 'upload') activateDocument();
  }
});

showView('upload');
