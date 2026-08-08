type DemoState = 'intro' | 'scanning' | 'marked' | 'result';

const stage = document.getElementById('demoStage');
const status = document.getElementById('demoStatus');
const replay = document.getElementById('demoReplay');
const uploadCta = document.getElementById('demoUploadCta');
const analyzerPreview = document.getElementById('demoAnalyzerPreview');

if (!(stage instanceof HTMLElement)
  || !(status instanceof HTMLElement)
  || !(replay instanceof HTMLButtonElement)
  || !(uploadCta instanceof HTMLButtonElement)
  || !(analyzerPreview instanceof HTMLElement)) {
  throw new Error('Analyzer hero demo markup is incomplete');
}

const timers: number[] = [];
const messages: Record<DemoState, string> = {
  intro: 'Dokument ceka na prvi prolaz',
  scanning: 'Skeniranje forme i strukture',
  marked: 'Nalazi se slažu na papir',
  result: 'Demo rezultat je spreman za pregled',
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clearTimers(): void {
  timers.splice(0).forEach((timer) => window.clearTimeout(timer));
}

function setState(nextState: DemoState): void {
  stage.dataset.demoState = nextState;
  status.textContent = messages[nextState];
}

function runDemo(): void {
  clearTimers();
  setState('intro');

  if (prefersReducedMotion()) {
    setState('result');
    return;
  }

  timers.push(window.setTimeout(() => setState('scanning'), 260));
  timers.push(window.setTimeout(() => setState('marked'), 1_850));
  timers.push(window.setTimeout(() => setState('result'), 2_450));
}

function resetDemo(): void {
  clearTimers();
  setState('intro');
  runDemo();
}

replay.addEventListener('click', resetDemo);
uploadCta.addEventListener('click', () => {
  analyzerPreview.focus({ preventScroll: true });
  analyzerPreview.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  status.textContent = 'Sljedeći korak je stvarni upload dokumenta';
});

runDemo();
