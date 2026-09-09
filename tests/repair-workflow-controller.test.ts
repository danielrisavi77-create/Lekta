import { describe, expect, it } from 'vitest';
import { RepairWorkflowController, transition, type RepairWorkflowAdapter } from '../src/repair/workflow-controller';

/** T08: jedan vlasnik odabira i zivotnog ciklusa; servis se zove tocno jednom po pokretanju. */
type Req = { ids: string[]; token: string };
type Res = { ok: true; ids: string[] };

function adapter(opts: { verifyOk?: boolean; fail?: boolean; gate?: () => Promise<void> } = {}) {
  let calls = 0;
  const a: RepairWorkflowAdapter<Req, Res> = {
    buildRequest: (selection, token) => ({ ids: [...selection].sort(), token }),
    async run(req) {
      calls += 1;
      if (opts.gate) await opts.gate();
      if (opts.fail) throw new Error('server 500');
      return { ok: true, ids: req.ids };
    },
    async verify() { return { ok: opts.verifyOk ?? true, error: opts.verifyOk === false ? 'regresija' : undefined }; },
  };
  return { a, calls: () => calls };
}

describe('RepairWorkflowController', () => {
  it('ready -> running -> verifying -> complete, servis pozvan tocno jednom', async () => {
    const { a, calls } = adapter();
    const controller = new RepairWorkflowController(a, 'sess-1');
    expect(controller.plan(['spacing', 'font'])).toBe(true);
    expect(controller.getState().phase).toBe('ready');
    const state = await controller.start();
    expect(state.phase).toBe('complete');
    expect(calls()).toBe(1);
  });

  it('running je dopusten samo iz ready; drugo pokretanje tijekom rada ne zove servis', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { a, calls } = adapter({ gate: () => gate });
    const controller = new RepairWorkflowController(a, 's');
    controller.plan(['spacing']);
    const first = controller.start();
    expect(controller.getState().phase).toBe('running');
    const second = await controller.start();
    expect(second.phase).toBe('running');
    expect(controller.setSelected('spacing', false), 'odabir je zamrznut tijekom izvrsenja').toBe(false);
    release();
    await first;
    expect(calls()).toBe(1);
    const idle = new RepairWorkflowController(a, 's2');
    expect((await idle.start()).phase).toBe('idle');
  });

  it('prazan odabir se ne salje', async () => {
    const { a, calls } = adapter();
    const controller = new RepairWorkflowController(a, 's');
    controller.plan(['spacing'], []);
    const state = await controller.start();
    expect(state.phase).toBe('ready');
    expect(state.lastError).toMatch(/odabran/);
    expect(calls()).toBe(0);
  });

  it('promjena sesije ponistava plan i odbacuje zakasnjeli rezultat stare sesije', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { a } = adapter({ gate: () => gate });
    const controller = new RepairWorkflowController(a, 'old');
    controller.plan(['spacing']);
    const pending = controller.start();
    controller.resetForSession('new');
    expect(controller.getState().phase).toBe('idle');
    release();
    const stale = await pending;
    expect(stale.phase, 'stari rezultat ne smije promijeniti novu sesiju').toBe('idle');
    expect(stale.result).toBeNull();
    expect(controller.getState().sessionToken).toBe('new');
  });

  it('povratak na plan cuva odabir; neuspjela provjera ishoda daje failed', async () => {
    const { a } = adapter({ verifyOk: false });
    const controller = new RepairWorkflowController(a, 's');
    controller.plan(['spacing', 'font'], ['spacing']);
    controller.setSelected('font', true);
    const failed = await controller.start();
    expect(failed.phase).toBe('failed');
    expect(failed.lastError).toBe('regresija');
    expect(controller.backToPlan()).toBe(true);
    expect([...controller.getState().selection].sort()).toEqual(['font', 'spacing']);
    expect(controller.setSelected('nepoznat', true)).toBe(false);
  });

  it('greska servisa daje failed s porukom, bez drugog poziva', async () => {
    const { a, calls } = adapter({ fail: true });
    const controller = new RepairWorkflowController(a, 's');
    controller.plan(['spacing']);
    const state = await controller.start();
    expect(state.phase).toBe('failed');
    expect(state.lastError).toBe('server 500');
    expect(calls()).toBe(1);
  });

  it('tablica prijelaza: nedozvoljen prijelaz je null (mutacija: switch koji sve propusta bi pao ovdje)', () => {
    expect(transition('idle', 'running')).toBeNull();
    expect(transition('complete', 'running')).toBeNull();
    expect(transition('running', 'ready')).toBeNull();
    expect(transition('ready', 'running')).toBe('running');
    expect(transition('verifying', 'complete')).toBe('complete');
  });
});
