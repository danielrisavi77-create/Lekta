// Ambient tipovi za module bez ugradjenih deklaracija koje monolit koristi.
// canvas-confetti (dependencies-05, BL-P3-13): paket ne nosi vlastite tipove ni @types, pa je
// prije bio `any`. Minimalna deklaracija tipizira poziv (hvata tipfelere u opcijama, npr. na
// app.ts confetti pozivu) bez dodavanja devDependencyja.
declare module 'canvas-confetti' {
  interface ConfettiOptions {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    flat?: boolean;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    shapes?: Array<'square' | 'circle' | 'star'>;
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  }
  type ConfettiFn = (options?: ConfettiOptions) => Promise<null> | null;
  const confetti: ConfettiFn & {
    reset(): void;
    create(canvas: HTMLCanvasElement, options?: { resize?: boolean; useWorker?: boolean }): ConfettiFn;
  };
  export default confetti;
  export type { ConfettiOptions };
}

// Build-flag (vite/vitest define): dev alati (QA konzola, setup modal) postoje samo kad je true.
declare const __DEV_TOOLS__: boolean;
