/**
 * Vitest reporter napretka: jedan redak po zavrsenoj datoteci, "[12/342] ok tests/a.test.ts 1,2 s".
 *
 * Zasto: zadani reporter u ne-TTY ispisu (gate pod omotacem) ne pokazuje datoteke koje su prosle,
 * pa nitko ne zna koliko je checku ostalo. Uključuje ga `with-gate-lock.mjs` kroz
 * `LEKTA_GATE_PROGRESS=1` (vitest.config.ts), pa se `check:inner` ne mijenja. Ispis ide na stderr
 * uz zadani reporter; ne mijenja ishod testova.
 */
export function formatProgressLine({ done, total, state, path, durationMs }) {
  const oznaka = state === 'passed' ? 'ok' : state === 'failed' ? 'PAO' : state === 'skipped' ? 'preskoceno' : String(state);
  const sek = Number.isFinite(durationMs) ? ` ${(durationMs / 1000).toFixed(1).replace('.', ',')} s` : '';
  return `[${done}/${total}] ${oznaka} ${path}${sek}`;
}

export default class ProgressReporter {
  total = 0;
  done = 0;
  root = process.cwd();

  onInit(vitest) {
    this.root = vitest.config.root ?? this.root;
  }

  onTestRunStart(specifications) {
    this.done = 0;
    this.total = specifications.length;
    process.stderr.write(`[napredak] ${this.total} testnih datoteka\n`);
  }

  onTestModuleEnd(testModule) {
    this.done += 1;
    const rel = String(testModule.moduleId ?? '').replace(/\\/g, '/');
    const path = rel.startsWith(this.root.replace(/\\/g, '/')) ? rel.slice(this.root.length + 1) : rel;
    process.stderr.write(`${formatProgressLine({
      done: this.done,
      total: this.total,
      state: testModule.state(),
      path,
      durationMs: testModule.diagnostic?.().duration,
    })}\n`);
  }
}
