export function scrollRange(scrollHeight: number, viewportHeight: number): number {
  return Math.max(0, scrollHeight - viewportHeight);
}

export function progressPercent(scrollTop: number, range: number): number {
  if (range <= 0) return 0;
  return Math.min(100, Math.max(0, (scrollTop / range) * 100));
}
