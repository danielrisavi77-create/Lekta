export function shouldDeferReveal(element: Pick<HTMLElement, 'dataset'>): boolean {
  return element.dataset.revealMode === 'deferred';
}
