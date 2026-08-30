import { describe, expect, it } from 'vitest';
import { videoViewportAction } from './video-loading-policy';

describe('video viewport loading policy', () => {
  it('defers media loading until the user starts the video', () => {
    expect(videoViewportAction(false)).toBe('defer');
  });

  it('does not reload a video that has already started', () => {
    expect(videoViewportAction(true)).toBe('resume');
  });
});
