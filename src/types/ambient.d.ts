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

// Side-effect importi paketa bez tipova (ui-boot.ts ih uvozi samo radi nuspojave: ucitavanje
// fonta/easinga u bundle). TypeScript 7 (native compiler) je strozi i bez ovih deklaracija javlja
// TS2882 ("Cannot find module or type declarations for side-effect import"); TS 5.9 ih je tiho
// propustao. Prazna deklaracija je dovoljna i forward-kompatibilna (bezopasna pod 5.9).
declare module '@fontsource-variable/source-serif-4';
declare module '@fontsource-variable/inter-tight';
declare module '@fontsource-variable/newsreader/opsz.css';
declare module '@fontsource-variable/newsreader/opsz-italic.css';
declare module '@fontsource/ibm-plex-mono/400.css';
declare module '@fontsource/ibm-plex-mono/500.css';
declare module '@fontsource/ibm-plex-mono/600.css';
declare module 'open-props/easings';

// Build-flag (vite/vitest define): dev alati (QA konzola, setup modal) postoje samo kad je true.
declare const __DEV_TOOLS__: boolean;
