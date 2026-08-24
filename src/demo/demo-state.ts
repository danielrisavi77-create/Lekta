export type DemoStage = 'upload' | 'analyzing' | 'result';

export type DemoState = {
  stage: DemoStage;
  analysisPhase: number;
  selectedFindingId: string | null;
  advancedOpen: boolean;
};

export function initialDemoState(): DemoState {
  return { stage: 'upload', analysisPhase: 0, selectedFindingId: null, advancedOpen: false };
}

export function advanceDemo(state: DemoState): DemoState {
  if (state.stage === 'upload') return { ...state, stage: 'analyzing', analysisPhase: 1 };
  if (state.stage === 'analyzing' && state.analysisPhase < 3) {
    return { ...state, analysisPhase: state.analysisPhase + 1 };
  }
  if (state.stage === 'analyzing') return { ...state, stage: 'result' };
  return state;
}

export function selectFinding(state: DemoState, id: string): DemoState {
  return { ...state, selectedFindingId: id };
}

export function toggleAdvanced(state: DemoState): DemoState {
  return { ...state, advancedOpen: !state.advancedOpen };
}
