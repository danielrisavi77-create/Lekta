/**
 * Cisti HTML sloj za triage prikaz (Faza 2). Bez DOM-a i globalnog stanja: prima triage model
 * (details.triage) + opcije i vraca HTML string; app.ts ga mountira i vjesa dogadjaje. Time je
 * generiranje prikaza testabilno bez bootanja cijelog app.ts monolita (isti obrazac kao
 * repair-items.ts / repair-panel.ts).
 *
 * BESPLATNO (dijagnoza): brojaci + naslov + lokacija ("odlomak N"). Doslovni isjecak (title
 * atribut) samo kad je recept otkljucan (unlocked), po WS-1 granici recipeUnlocked.
 */
import type { TriageModel, TriageFinding, TriageLocation, Fixability } from '../analysis/triage';

export interface TriageViewOptions {
  /** Je li recept otkljucan (demo/puni izvjestaj): tek tada se prikazuje doslovni isjecak. */
  unlocked: boolean;
  /** Aktivni filter razine ili null za sve. */
  filter: Fixability | null;
  /**
   * Je li placeni popravak dostupan na ovom rezultatu (repair panel ima sadrzaj koji korisnik moze
   * pokrenuti). Tek tada triage nudi CTA "Popravi automatski (N)" koji vodi na taj panel. Brojac
   * auto nalaza je vec vidljiv u besplatnoj dijagnozi, pa CTA ne otkriva nista novo (WS-1 granica).
   */
  repairAvailable?: boolean;
}

interface LevelMeta {
  label: string;
  ico: string;
  chip: string;
}
export const TRIAGE_LEVELS: Record<Fixability, LevelMeta> = {
  auto: { label: 'Popravljam automatski', ico: 'wand-2', chip: 'Automatski' },
  assisted: { label: 'Popravi uz pregled', ico: 'list-checks', chip: 'Uz tvoju potvrdu' },
  manual: { label: 'Tvoja odluka', ico: 'user-check', chip: 'Tvoja odluka' },
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Hrvatska sklonidba za "nalaz". */
function nalazWord(n: number): string {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return 'nalaz';
  return 'nalaza';
}

function locLabel(l: TriageLocation): string {
  return l.footnoteId != null ? `bilješka ${l.footnoteId}` : `odlomak ${l.paragraphIndex}`;
}
function locJumpValue(l: TriageLocation): string {
  return l.footnoteId != null ? 'f' + l.footnoteId : 'p' + l.paragraphIndex;
}

/** Lijevak za manual nalaze: uputa (alat) prvo, rucna usluga kao opcija. */
export function triageFunnelHtml(f: TriageFinding): string {
  if (f.category === 'citations') {
    return `<div class="triage-funnel">Provjeri u alatima <a href="citat.html">Citati</a> i <a href="literatura.html">Literatura</a>, ili <button type="button" data-triage-order>ovo riješi ručna usluga</button>.</div>`;
  }
  return `<div class="triage-funnel"><button type="button" data-triage-order>Ovo rješava ručna usluga →</button></div>`;
}

function findingHtml(f: TriageFinding, unlocked: boolean): string {
  const lvl = TRIAGE_LEVELS[f.fixability] ?? TRIAGE_LEVELS.manual;
  const locs = (f.locations || [])
    .slice(0, 12)
    .map((l) => {
      const title = unlocked && l.excerpt ? ` title="${esc(l.excerpt)}"` : '';
      return `<button type="button" class="triage-jump" data-triage-jump="${locJumpValue(l)}"${title}>${esc(locLabel(l))} →</button>`;
    })
    .join('');
  const locHtml = locs ? `<div class="triage-locs">${locs}</div>` : '';
  const funnel = f.fixability === 'manual' ? triageFunnelHtml(f) : '';
  return `<li class="triage-item triage-item--${f.fixability}"><div class="triage-item-top"><span class="triage-lvl"><i data-lucide="${lvl.ico}"></i>${esc(lvl.label)}</span><span class="triage-title">${esc(f.title)}</span></div>${locHtml}${funnel}</li>`;
}

/** Sastavi cijeli HTML triage panela iz modela. Vraca '' kad nema nalaza (panel se skriva). */
export function triagePanelHtml(triage: TriageModel | null | undefined, opts: TriageViewOptions): string {
  if (!triage || !triage.counts || !triage.counts.total) return '';
  const c = triage.counts;
  const chip = (lvl: Fixability, n: number) =>
    `<button type="button" class="triage-chip" data-triage-level="${lvl}" aria-pressed="${opts.filter === lvl}"${n ? '' : ' disabled'}><span class="triage-dot triage-dot--${lvl}"></span>${esc(TRIAGE_LEVELS[lvl].chip)} <span class="tc-n">${n}</span></button>`;
  const findings = (triage.findings || []).filter((f) => !opts.filter || f.fixability === opts.filter);
  const list = findings.length
    ? `<ul class="triage-list">${findings.map((f) => findingHtml(f, opts.unlocked)).join('')}</ul>`
    : '<p class="triage-empty">Nema nalaza u ovom filtru.</p>';
  // Teaser -> placeni popravak: kad je repair dostupan i ima auto nalaza, ponudi jedan CTA na
  // panel "Popravi sve". Broj = auto bucket (isti kao chip), pa je obecanje posteno i bez recepta.
  const cta =
    opts.repairAvailable && c.auto > 0
      ? `<button type="button" class="triage-repair-cta" data-triage-repair><i data-lucide="wand-2"></i>Popravi automatski (${c.auto}) <span aria-hidden="true">→</span></button>`
      : '';
  return `<h3 class="triage-head">${c.total} ${nalazWord(c.total)}: podijeljeni po tome kako se rješavaju</h3><div class="triage-filters">${chip('auto', c.auto)}${chip('assisted', c.assisted)}${chip('manual', c.manual)}</div>${cta}${list}`;
}
