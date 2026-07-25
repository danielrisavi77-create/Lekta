// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attachFacsimileZoom, clampZoom, createZoomControls } from '../src/preview/facsimile-zoom';

function fixture() {
  const pane = document.createElement('div');
  const root = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'lekta-fac-page';
  root.appendChild(page);
  pane.appendChild(root);
  document.body.appendChild(pane);
  Object.defineProperties(pane, { clientWidth: { value: 500 }, clientHeight: { value: 600 } });
  Object.defineProperties(root, {
    scrollWidth: { value: 800 }, offsetWidth: { value: 800 },
    scrollHeight: { value: 1200 }, offsetHeight: { value: 1200 },
  });
  Object.defineProperty(page, 'offsetWidth', { value: 800 });
  return { pane, root };
}

describe('facsimile zoom', () => {
  it('ogranicava zoom i podrzava fit-width, fit-page i obnovu stanja', () => {
    const { pane, root } = fixture();
    const zoom = attachFacsimileZoom(pane, root);
    expect(clampZoom(0)).toBe(0.25);
    expect(clampZoom(9)).toBe(2);
    zoom.fitWidth();
    expect(zoom.getZoom()).toBeCloseTo(0.595, 3);
    zoom.fitPage();
    expect(zoom.getZoom()).toBeCloseTo(0.48, 2);
    zoom.setState({ zoom: 1.25, scrollLeft: 44, scrollTop: 81 });
    expect(zoom.getState()).toEqual({ zoom: 1.25, scrollLeft: 44, scrollTop: 81 });
    zoom.destroy();
    expect(pane.style.touchAction).toBe('');
  });

  it('traka nudi sve kontrole i azurira postotak nakon programskog zooma', () => {
    const { pane, root } = fixture();
    const zoom = attachFacsimileZoom(pane, root);
    const controls = createZoomControls(document, [zoom]);
    const labels = [...controls.querySelectorAll('button')].map((button) => button.textContent);
    expect(labels).toEqual(['−', '+', 'Prilagodi širini', 'Cijela stranica']);
    zoom.setZoom(1.4);
    expect(controls.querySelector('.lekta-fac-zoomval')?.textContent).toBe('140 %');
  });

  it('pinch pointeri povecavaju zoom, a jedan dodir pomice dokument', () => {
    const { pane, root } = fixture();
    const zoom = attachFacsimileZoom(pane, root);
    const pointer = (type: string, id: number, x: number, y: number) =>
      pane.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    pointer('pointerdown', 1, 100, 100);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointermove', 2, 260, 100);
    expect(zoom.getZoom()).toBeGreaterThan(1);
    pointer('pointerup', 2, 260, 100);
    pane.scrollTop = 100;
    pointer('pointermove', 1, 100, 50);
    expect(pane.scrollTop).toBeGreaterThan(100);
  });
});
