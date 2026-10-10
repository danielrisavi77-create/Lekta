/* @ds-bundle: {"format":4,"namespace":"Lekta_76c193","components":[],"sourceHashes":{"explorations/ds-base.js":"569e82a686a8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.Lekta_76c193 = window.Lekta_76c193 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// explorations/ds-base.js
try { (() => {
// Loads this design system into the template. In a consuming project, point
// base at the bound DS folder relative to this file (e.g. '_ds/<folder>' at
// the project root, '../_ds/<folder>' one level down) — one line to edit.
(() => {
  const base = '../..';
  const s = document.createElement('script');
  s.src = base + '/_ds_bundle.js';
  s.onerror = () => console.error('ds-base.js: failed to load ' + s.src + ' — if this is a consuming project, point the base line in ds-base.js at the bound _ds/<folder> tree relative to this page (e.g. _ds/<folder> at the project root, ../_ds/<folder> one level down); in a fresh design system this can just mean the bundle is not compiled yet');
  document.head.appendChild(s);
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/ds-base.js", error: String((e && e.message) || e) }); }

})();
