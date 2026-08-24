import { describe, expect, it } from 'vitest';
import { advanceDemo, initialDemoState, selectFinding, toggleAdvanced } from './demo-state';

describe('demo state', () => {
  it('progresses from upload through analysis to result', () => {
    const analyzing = advanceDemo(initialDemoState());
    expect(analyzing.stage).toBe('analyzing');
    expect(analyzing.analysisPhase).toBe(1);

    const result = advanceDemo({ ...analyzing, analysisPhase: 3 });
    expect(result.stage).toBe('result');
  });

  it('selects a finding without changing the current stage', () => {
    const state = selectFinding(initialDemoState(), 'margins');
    expect(state.selectedFindingId).toBe('margins');
    expect(state.stage).toBe('upload');
  });

  it('toggles advanced details independently from the stage', () => {
    const state = toggleAdvanced({ ...initialDemoState(), stage: 'result' });
    expect(state.advancedOpen).toBe(true);
    expect(toggleAdvanced(state).advancedOpen).toBe(false);
  });
});
