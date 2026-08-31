// Hero: sloj dubine i atmosfere (Korektorski stol).
//
// Jedna ideja nosi cijeli hero: LAMPA I SKENER SU ISTI SNOP. Papir lezi u svjetlu lampe,
// prasina pluta u tom snopu, sjene padaju od njega, a plavi sken iz hero-demo.ts je taj isti
// snop kad Lekta cita dokument. Zato se sve ovdje vezuje na JEDNU tocku svjetla.
//
// Podjela posla je stroga i namjerna:
//   hero-demo.ts  = SEKVENCA (papiri sjedaju, sken, korekture, brojac). Ne dira se.
//   hero-depth.ts = PROSTOR  (dubina, svjetlo, sjena, prasina, potez olovke).
// Dodirna tocka je jedna: hero-demo.ts pise `scale` (neovisno svojstvo) umjesto `transform`,
// pa `transform` na .hd-stage ostaje slobodan za naginjanje odavde. Dubina pojedinih slojeva
// ide u `translate`, takoder neovisno svojstvo, pa se WAAPI animacijama nikad ne otima.
//
// Sve animirano je transform/opacity/filter; nijedno layout svojstvo (Vercel Web Interface
// Guidelines). Bez pokreta se gasi rAF, naginjanje i prasina, a staticni kadar ostaje tocan.

import './hero-depth.css';

const TILT_MAX_DEG = 1.8;
const SHADOW_REACH_PX = 26;
const MOTE_COUNT = 90;

function prefersReduced(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---- Crvena olovka ISPISUJE podcrtu ---------------------------------------
   Podcrta ispod "spreman" je potez ruke, ne crtez. Duljinu mjerimo iz same putanje
   (getTotalLength), pa poteg radi neovisno o tome kako se SVG kasnije mijenja.
   Bez JS-a i bez pokreta ostaje gotova podcrta: bazno stanje je uvijek ispravno. */
function drawPencilStroke(): void {
  const wrap = document.querySelector<HTMLElement>('.h1-crta');
  const path = wrap?.querySelector('path');
  if (!wrap || !(path instanceof SVGPathElement)) return;
  let length = 0;
  try { length = path.getTotalLength(); } catch { return; }
  if (!Number.isFinite(length) || length <= 0) return;
  wrap.style.setProperty('--crta-len', `${Math.ceil(length)}`);
  wrap.dataset.draw = '';
}

/* ---- WebGL prasina u snopu -------------------------------------------------
   Rucni shader, ne biblioteka: CSP zabranjuje vanjske skripte, a entry budzet (960 KB)
   ne trpi Three.js. Ovo je ~3 KB i radi isti posao za ovu jednu namjenu.
   gl.POINTS + aditivno mijesanje: nema fill-rate cijene fullscreen shadera. */
const VERT = `
attribute vec4 a_seed;   // x0, y0, brzina, dubina (0..1)
uniform float u_time;
uniform vec2  u_light;   // pozicija svjetla u istom 0..1 prostoru
uniform float u_aspect;
varying float v_glow;
void main() {
  float depth = a_seed.w;
  // Sporo dizanje uvis (topli zrak iznad lampe) uz bocno njihanje; fract() omota prolaz.
  float y = fract(a_seed.y - u_time * a_seed.z * 0.012);
  float x = fract(a_seed.x + sin((u_time * 0.35 + a_seed.y * 26.0)) * 0.012 * (0.3 + depth));
  vec2 p = vec2(x, y);
  // Cestica svijetli samo dok je u snopu: pad po udaljenosti od izvora svjetla.
  vec2 d = (p - u_light) * vec2(u_aspect, 1.0);
  float reach = 1.0 - smoothstep(0.05, 0.62, length(d));
  v_glow = reach * (0.25 + depth * 0.75);
  gl_PointSize = (1.0 + depth * 2.6) * (0.7 + reach * 1.4);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying float v_glow;
void main() {
  // Mekana okrugla cestica: bez teksture, bez dodatnog zahtjeva.
  float r = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.12, 0.5, r)) * v_glow;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(1.0, 0.90, 0.72, a * 0.5);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
  return sh;
}

interface DustHandle { render: (lx: number, ly: number) => void; resize: () => void; dispose: () => void }

function createDust(canvas: HTMLCanvasElement): DustHandle | null {
  const gl = (canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false })
    ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const seeds = new Float32Array(MOTE_COUNT * 4);
  for (let i = 0; i < MOTE_COUNT; i += 1) {
    seeds[i * 4] = Math.random();
    seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = 0.5 + Math.random() * 1.6;
    seeds[i * 4 + 3] = Math.random();
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_seed');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uLight = gl.getUniformLocation(prog, 'u_light');
  const uAspect = gl.getUniformLocation(prog, 'u_aspect');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform1f(uAspect, w / h);
  };
  resize();

  const start = performance.now();
  return {
    resize,
    render: (lx, ly) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uLight, lx, ly);
      gl.drawArrays(gl.POINTS, 0, MOTE_COUNT);
    },
    dispose: () => { gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); },
  };
}

function setup(): void {
  drawPencilStroke();

  const host = document.getElementById('paperCover');
  const demo = document.querySelector<HTMLElement>('.hero-demo');
  const stage = document.querySelector<HTMLElement>('.hd-stage');
  if (!host || !demo) return;

  const atmos = document.createElement('div');
  atmos.className = 'hero-atmos';
  atmos.setAttribute('aria-hidden', 'true');
  const beam = document.createElement('div');
  beam.className = 'hero-atmos__beam';
  atmos.append(beam);
  host.prepend(atmos);

  // Mirno stanje: svjetlo gore desno, sjena pada dolje lijevo. Isti brojevi su i CSS fallback.
  let lightX = 0.78, lightY = 0.06;
  let targetX = lightX, targetY = lightY;
  let pointerInside = false;

  const applyLight = (): void => {
    atmos.style.setProperty('--lamp-x', `${(lightX * 100).toFixed(2)}%`);
    atmos.style.setProperty('--lamp-y', `${(lightY * 100).toFixed(2)}%`);
    // Sjena je suprotna od svjetla: sto je lampa dalje udesno, to papir baca sjenu vise ulijevo.
    const sx = (0.5 - lightX) * 2 * SHADOW_REACH_PX;
    const sy = (0.5 - lightY) * 2 * SHADOW_REACH_PX + 10;
    demo.style.setProperty('--sh-x', `${sx.toFixed(1)}px`);
    demo.style.setProperty('--sh-y', `${sy.toFixed(1)}px`);
    // Paralaksa ide kroz ociste: slojevi se razmicu razmjerno svojoj dubini, a layout miruje.
    demo.style.setProperty('--po-x', `${(50 + (lightX - 0.5) * 44).toFixed(1)}%`);
    demo.style.setProperty('--po-y', `${(42 + (lightY - 0.5) * 30).toFixed(1)}%`);
    if (stage) {
      // Natruha nagiba PREMA svjetlu. Drzi se malenom: transform-origin je `top center`
      // (traži ga fit-scale), pa svaki stupanj ovdje zavrti dno pozornice.
      const ry = (lightX - 0.5) * 2 * TILT_MAX_DEG;
      const rx = (0.5 - lightY) * 2 * (TILT_MAX_DEG * 0.5);
      stage.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    }
  };
  applyLight();

  const reduced = prefersReduced();
  const dust = reduced ? null : createDustLayer(atmos);
  atmos.dataset.ready = '';

  if (reduced) {
    // Bez pokreta: jedan tocan kadar, nikakva petlja, nikakvo pracenje kursora.
    return;
  }

  let raf = 0;
  let visible = true;
  const frame = (): void => {
    raf = 0;
    // Svjetlo stize do kursora s inercijom: lampa ima masu, ne teleportira se.
    const ease = pointerInside ? 0.08 : 0.03;
    lightX += (targetX - lightX) * ease;
    lightY += (targetY - lightY) * ease;
    applyLight();
    dust?.render(lightX, lightY);
    if (visible) raf = window.requestAnimationFrame(frame);
  };
  const wake = (): void => { if (!raf && visible) raf = window.requestAnimationFrame(frame); };
  const sleep = (): void => { if (raf) window.cancelAnimationFrame(raf); raf = 0; };

  const surface = host.closest<HTMLElement>('.lek-top-grid') ?? host;
  surface.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerInside = true;
    targetX = Math.min(1.15, Math.max(-0.15, (event.clientX - rect.left) / rect.width));
    targetY = Math.min(1.15, Math.max(-0.15, (event.clientY - rect.top) / rect.height));
    wake();
  }, { passive: true });
  surface.addEventListener('pointerleave', () => { pointerInside = false; targetX = 0.78; targetY = 0.06; wake(); }, { passive: true });

  // Baterija: petlja stoji kad je hero izvan vidnog polja ili je kartica skrivena.
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) wake(); else sleep();
    }, { threshold: 0.05 }).observe(host);
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) wake(); else sleep();
  });
  window.addEventListener('resize', () => { dust?.resize(); wake(); }, { passive: true });
  wake();
}

function createDustLayer(atmos: HTMLElement): DustHandle | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-atmos__dust';
  atmos.append(canvas);
  const handle = createDust(canvas);
  // Tiha degradacija: bez WebGL-a canvas se uklanja pa ostaje samo gradijentni snop,
  // koji sam po sebi izgleda namjerno. Nikakva poruka, nikakav prazan okvir.
  if (!handle) { canvas.remove(); return null; }
  return handle;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
else setup();

export {};
