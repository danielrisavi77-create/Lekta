/**
 * SAZETAK RAZLIKE DVIJU VERZIJA RADA (plan T12). Cist HTML iz `RevisionDelta` (T11), bez DOM-a i bez sadrzaja rada:
 * imenuju se PROVJERE (nasi naslovi), nikad odlomci.
 *
 * Cetiri skupine ostaju odvojene (rijeseno, ostalo, novo, neizvjesno) i nijedna se ne zbraja u "napredak": nestanak
 * nalaza bez potvrde prolaza je NEIZVJESNO, ne rijeseno (to odlucuje `compareFindingRevisions`). Kad usporedba nije
 * moguca (drugi profil, druga pravila, drugi ugovor analize), sazetak kaze zasto i NE prikazuje deltu ocjene kao
 * ucinak uredjivanja.
 */
import type { RevisionDelta } from '../../history/finding-revisions';

export interface RevisionSummaryInput {
  delta: RevisionDelta;
  /** Naslov provjere po kljucu `ruleId@scope`; nepoznat kljuc se ispisuje kako jest. */
  titleOf: (key: string) => string;
  /** Kad je prethodna verzija analizirana (za "u odnosu na verziju od ..."). */
  previousAt: number;
  /** Ima li nova verzija jos ijedan `fail` (blokator): tada se ne pise "Spremno za predaju". */
  hasOpenBlocker: boolean;
}

function lista(keys: readonly string[], titleOf: (k: string) => string, esc: (v: string) => string): string {
  return keys.length ? `<ul>${keys.map((k) => `<li>${esc(titleOf(k))}</li>`).join('')}</ul>` : '<p class="muted">nema</p>';
}

function datum(ms: number): string {
  try { return new Date(ms).toLocaleString('hr-HR'); } catch { return String(ms); }
}

export function revisionSummaryHtml(input: RevisionSummaryInput, esc: (v: string) => string): string {
  const d = input.delta;
  const glava = `<p class="rs-kicker">Usporedba s verzijom od ${esc(datum(input.previousAt))}</p>`;
  if (!d.comparable) {
    return `<section class="rs" data-revision-comparable="ne"><div>${glava}<p><strong>Usporedba nije moguća:</strong> ${esc(d.reason ?? 'snimke nisu usporedive')}.</p><p class="muted">Promjena ocjene između verzija u ovom slučaju nije učinak tvojih izmjena, nego drugog skupa pravila, pa se ne prikazuje kao napredak.</p></div></section>`;
  }
  const zavrsno = input.hasOpenBlocker
    ? '<p class="muted">Ostaju otvoreni nalazi; nova verzija još nije bez blokatora.</p>'
    : '<p class="muted">U ovoj verziji nema otvorenih blokatora među provjerenim pravilima.</p>';
  return `<section class="rs" data-revision-comparable="da" data-revision-resolved="${d.resolved.length}" data-revision-introduced="${d.introduced.length}"><div>${glava}`
    + `<div class="rs-grid">`
    + `<div class="rs-skupina rs-skupina--rijeseno"><h4>Riješeno (${d.resolved.length})</h4>${lista(d.resolved, input.titleOf, esc)}</div>`
    + `<div class="rs-skupina"><h4>I dalje otvoreno (${d.persisting.length})</h4>${lista(d.persisting, input.titleOf, esc)}</div>`
    + `<div class="rs-skupina rs-skupina--novo"><h4>Novi problemi (${d.introduced.length})</h4>${lista(d.introduced, input.titleOf, esc)}</div>`
    + `<div class="rs-skupina"><h4>Neizvjesno (${d.uncertain.length})</h4>${lista(d.uncertain, input.titleOf, esc)}<p class="muted">Nalaz je nestao ili se više ne može izmjeriti; to nije dokaz da je riješen.</p></div>`
    + `</div>${zavrsno}</div></section>`;
}

/** Pitanje o povezivanju verzija kad identitet rada nije siguran (slab pogodak) ili je razlicit. */
export function revisionLinkPromptHtml(verdict: 'weak' | 'different', esc: (v: string) => string): string {
  const tekst = verdict === 'weak'
    ? 'Nova datoteka izgleda slično, ali ne sasvim kao prethodni rad (drugi naslov ili drukčiji naslovi poglavlja).'
    : 'Nova datoteka ne izgleda kao isti rad (drugi naslov, autor i poglavlja).';
  return `<section class="rs rs--pitanje" data-revision-link="${esc(verdict)}"><p><strong>${esc(tekst)}</strong> Povezati je kao novu verziju istog rada i usporediti nalaze?</p>`
    + `<p><button type="button" class="btn btn-primary btn-sm" data-revision-link-yes>Da, ista je to verzija rada</button> `
    + `<button type="button" class="btn btn-secondary btn-sm" data-revision-link-no>Ne, ovo je drugi rad</button></p></section>`;
}
