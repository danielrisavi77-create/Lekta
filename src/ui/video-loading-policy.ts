export type VideoViewportAction = 'defer' | 'resume';

/** Viewport visibility alone must not start media work. */
export function videoViewportAction(userInitiated: boolean): VideoViewportAction {
  return userInitiated ? 'resume' : 'defer';
}
