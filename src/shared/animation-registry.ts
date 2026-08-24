export interface AnimationControl {
  stop?: () => void;
  cancel?: () => void;
}

export interface AnimationRegistry {
  track<T extends AnimationControl | null | undefined>(control: T): T;
  stopAll(): void;
  size(): number;
}

export function createAnimationRegistry(): AnimationRegistry {
  const active = new Set<AnimationControl>();

  return {
    track<T extends AnimationControl | null | undefined>(control: T): T {
      if (control && (typeof control.stop === 'function' || typeof control.cancel === 'function')) {
        active.add(control);
      }
      return control;
    },
    stopAll(): void {
      for (const control of active) {
        try {
          if (typeof control.stop === 'function') control.stop();
          else control.cancel?.();
        } catch {
          // Jedna neispravna kontrola ne smije sprijeciti zaustavljanje ostalih.
        }
      }
      active.clear();
    },
    size(): number {
      return active.size;
    },
  };
}
