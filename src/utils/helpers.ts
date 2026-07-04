/**
 * Ciste pomocne funkcije izvucene iz monolita (src/main.ts), korak 1 porta enginea.
 *
 * Framework-agnosticno: nema globalnog stanja ni pristupa `document` ($/$$ ostaju u UI
 * sloju). Ponasanje je IDENTICNO originalu (izrazi prepisani 1:1, dodani su samo tipovi)
 * pa golden snapshoti ostaju nepromijenjeni. XML pomocnici rade nad cvorovima koje im
 * pozivatelj preda (u pregledniku DOM, u testu @xmldom/xmldom), bez globalnih ovisnosti.
 */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape za sigurno umetanje u markup (pokriva i jednostruki navodnik radi atributa). */
export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

/**
 * Sigurna href vrijednost: dopusta samo http(s), mailto i relativne/sidrene putanje.
 * Sve ostalo (npr. `javascript:`) svede na `#`, da otrovana konfiguracija ili buduci
 * podatkovni izvor ne mogu ubaciti izvrsivu shemu. NIJE zamjena za escapeHtml u atributu.
 */
export const safeHref = (url: unknown): string => {
  const s = String(url ?? '').trim();
  if (!s) return '#';
  if (/^(?:https?:|mailto:)/i.test(s)) return s;
  if (/^[/#?]/.test(s) || /^[\w.\-]+(?:[/?#]|$)/.test(s)) return s; // relativno/sidro/upit
  return '#';
};

/** Ogranici broj na [a, b]. */
export const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n));

/** Formatiraj broj u hr-HR lokalu. */
export const fmt = (n?: number): string => new Intl.NumberFormat('hr-HR').format(n || 0);

/** Normaliziraj tekst za usporedbu bez dijakritike i interpunkcije (NFD, lowercase, alfanumerik). */
export const normalize = (s: unknown): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Normalizirano ime sekcije bez vodecih brojeva ("2.1. Uvod" -> "uvod"). */
export const sectionName = (s: unknown): string =>
  normalize(String(s || '').replace(/^\s*\d+(?:\.\d+)*\.?\s*/, ''));

/** Atribut elementa uz fallback na lokalno ime bez namespace prefiksa. */
export const attr = (el: Element | null | undefined, name: string): string | null =>
  el?.getAttribute(name) ??
  el?.getAttribute(name.includes(':') ? name.split(':')[1] : name) ??
  null;

/** Svi potomci po tag imenu, kao polje (prazno za null cvor). */
export const els = (node: Element | Document | null | undefined, name: string): Element[] =>
  node ? [...node.getElementsByTagName(name)] : [];

/** Prvi potomak po tag imenu, ili null. */
export const first = (node: Element | Document | null | undefined, name: string): Element | null =>
  node?.getElementsByTagName(name)?.[0] || null;

/** Tekstualni sadrzaj cvora, ili prazan string. */
export const textOf = (node: Node | null | undefined): string => node?.textContent || '';

/** Izravni djeca-element po imenu (nodeName ili localName bez prefiksa), ne potomci. */
export const direct = (node: Element | null | undefined, name: string): Element | null =>
  node
    ? ([...node.childNodes].find(
        (n) => n.nodeType === 1 && (n.nodeName === name || (n as Element).localName === name.split(':').pop()),
      ) as Element | undefined) || null
    : null;
