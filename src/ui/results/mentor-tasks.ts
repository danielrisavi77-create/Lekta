/**
 * MENTOROVI KOMENTARI KAO LOKALNI ZADACI (plan T13).
 *
 * Klasicni Word komentari iz `word/comments.xml` postaju popis zadataka: izvorni tekst komentara (puni, sastavljen iz
 * svih `w:t` odlomaka komentara, ne skraceni XML isjecak inspektora), autor, ima li pouzdano sidro, i DVA odvojena
 * statusa: korisnikov ("obradjeno") i strojni ("formalna provjera prolazi"). Sadrzajni komentar korisnik smije
 * oznaciti obradjenim, ali sucelje NIKAD ne tvrdi da je sadrzaj time potvrdjen: `verification` ostaje `not-verified`
 * dok komentar nije povezan s formalnom provjerom koja stvarno prolazi. Bez LLM-a, bez slanja komentara ikamo, bez
 * automatskih odgovora. Sve zivi u pregledniku, u memoriji ove stranice.
 *
 * Povezivanje s formalnim nalazom je PRIJEDLOG (podudaranje rijeci iz naslova provjere u tekstu komentara), a potvrda
 * je korisnikova (`confirmLinks`). Nepodrzane strukture (odgovori u niti, extended) se oznacavaju, ne tumace.
 */
import {
  confirmLinks,
  extractCommentTasks,
  markAddressed,
  verifyAgainstChecks,
  type CommentTask,
  type FormalCheckState,
} from '../../mentor/comment-tasks';
import { readZip } from '../../repair/zip-codec';

export interface MentorCheckLike { id?: string | null; title?: string; status?: string; earned?: number; max?: number }

export interface MentorTasksInput {
  commentsXml: string;
  documentXml: string;
  commentsExtendedXml?: string | null;
  checks: readonly MentorCheckLike[];
}

export interface MentorTaskView extends CommentTask {
  /** Predlozene provjere (id, naslov) po podudaranju rijeci; korisnik potvrdjuje. */
  suggestions: { id: string; title: string }[];
}

function toFormal(checks: readonly MentorCheckLike[]): FormalCheckState[] {
  const out: FormalCheckState[] = [];
  for (const c of checks) {
    if (!c.id) continue;
    const status: FormalCheckState['status'] = c.status === 'unmeasurable' ? 'unmeasurable' : ((c.max ?? 0) > 0 && (c.earned ?? 0) < (c.max ?? 0)) || c.status === 'fail' ? 'fail' : 'pass';
    out.push({ id: c.id, status });
  }
  return out;
}

const STOP = new Set(['mora', 'biti', 'treba', 'ovdje', 'nije', 'ili', 'koji', 'koja', 'ovaj', 'ovom', 'rada', 'rad', 'tekst', 'teksta']);

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g)?.filter((t) => !STOP.has(t)) ?? []);
}

/** Prijedlog veze: provjera cije se dvije ili vise znacajnih rijeci naslova pojave u komentaru. */
export function suggestLinks(task: CommentTask, checks: readonly MentorCheckLike[]): { id: string; title: string }[] {
  const t = tokens(task.text);
  const out: { id: string; title: string }[] = [];
  for (const c of checks) {
    if (!c.id || !c.title) continue;
    const words = [...tokens(c.title)];
    const hits = words.filter((w) => t.has(w) || [...t].some((x) => x.startsWith(w.slice(0, 5)) && w.length >= 5));
    if (hits.length >= Math.min(2, words.length) && hits.length > 0) out.push({ id: c.id, title: c.title });
  }
  return out;
}

export function buildMentorTasks(input: MentorTasksInput): MentorTaskView[] {
  const tasks = extractCommentTasks({ commentsXml: input.commentsXml, documentXml: input.documentXml, commentsExtendedXml: input.commentsExtendedXml ?? null });
  return tasks.map((t) => ({ ...t, suggestions: suggestLinks(t, input.checks) }));
}

/** Procitaj dijelove paketa potrebne za zadatke; `null` kad dokument nema komentara. */
export async function readCommentParts(bytes: Uint8Array): Promise<Omit<MentorTasksInput, 'checks'> | null> {
  const entries = await readZip(bytes);
  const text = (name: string) => {
    const e = entries.find((x) => x.name === name);
    return e ? new TextDecoder().decode(e.data) : null;
  };
  const commentsXml = text('word/comments.xml');
  const documentXml = text('word/document.xml');
  if (!commentsXml || !documentXml || !/<w:comment\b/i.test(commentsXml)) return null;
  return { commentsXml, documentXml, commentsExtendedXml: text('word/commentsExtended.xml') };
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function taskHtml(t: MentorTaskView, titleOf: (id: string) => string): string {
  const status = t.userStatus === 'addressed' ? 'Označeno kao obrađeno' : 'Otvoreno';
  const verif = t.verification === 'formal-check-passed'
    ? 'Povezana formalna provjera prolazi.'
    : t.linkedFindingIds.length
      ? 'Povezana formalna provjera još ne prolazi.'
      : 'Nije strojno provjereno: sadržajnu primjedbu može potvrditi samo mentor.';
  const sidro = t.anchorKey ? '' : '<small class="mt-napomena">Mjesto u dokumentu nije pouzdano pronađeno; komentar se prikazuje bez označavanja.</small>';
  const nepodrzano = t.unsupported ? '<small class="mt-napomena">Odgovor u niti komentara: prikazan, ali se ne tumači kao zaseban zadatak.</small>' : '';
  const prijedlozi = t.suggestions.filter((s) => !t.linkedFindingIds.includes(s.id));
  const veze = t.linkedFindingIds.length ? `<p class="mt-veze">Povezano s: ${t.linkedFindingIds.map((id) => esc(titleOf(id))).join(', ')}</p>` : '';
  const ponuda = prijedlozi.length && !t.unsupported
    ? `<p class="mt-prijedlog">Izgleda povezano s provjerom: ${prijedlozi.map((s) => `<button type="button" class="btn btn-ghost btn-sm" data-mentor-link="${esc(t.id)}" data-check-id="${esc(s.id)}">${esc(s.title)}</button>`).join(' ')} <small>(potvrdi klikom)</small></p>`
    : '';
  return `<li class="mt-zadatak" data-mentor-task="${esc(t.id)}" data-user-status="${t.userStatus}" data-verification="${t.verification}" data-unsupported="${t.unsupported ? 'da' : 'ne'}">`
    + `<p class="mt-tekst"><strong>${esc(t.authorLabel ?? 'Komentar')}:</strong> ${esc(t.text)}</p>`
    + sidro + nepodrzano + veze + ponuda
    + `<p class="mt-status"><span class="mt-korisnik" data-mentor-user-status>${status}</span> · <span class="mt-strojno" data-mentor-verification>${verif}</span></p>`
    + (t.userStatus === 'open' && !t.unsupported ? `<button type="button" class="btn btn-secondary btn-sm" data-mentor-address="${esc(t.id)}">Označi kao obrađeno</button>` : '')
    + '</li>';
}

export function mentorTasksHtml(tasks: readonly MentorTaskView[], titleOf: (id: string) => string): string {
  if (!tasks.length) return '';
  const open = tasks.filter((t) => t.userStatus === 'open' && !t.unsupported).length;
  return `<div class="mt"><p class="mt-kicker">Komentari mentora u dokumentu (${tasks.length})</p>`
    + `<p class="muted">Izvorni komentari ostaju u radnoj kopiji. Tvoja oznaka "obrađeno" je tvoj zapis; Lekta ne ocjenjuje je li sadržajna primjedba riješena.</p>`
    + `<ul class="mt-popis">${tasks.map((t) => taskHtml(t, titleOf)).join('')}</ul>`
    + `<p class="muted" data-mentor-open="${open}">Otvoreno: ${open}.</p></div>`;
}

/**
 * Montaza u rutu: cita paket, gradi zadatke i vodi stanje u memoriji. Vraca `false` kad dokument nema komentara (mount
 * ostaje skriven), pa pozivatelj ne mora sam provjeravati.
 */
export async function mountMentorTasks(mount: HTMLElement, bytes: Uint8Array, checks: readonly MentorCheckLike[]): Promise<boolean> {
  const parts = await readCommentParts(bytes);
  if (!parts) { mount.innerHTML = ''; mount.classList.add('hidden'); return false; }
  let tasks = buildMentorTasks({ ...parts, checks });
  const formal = toFormal(checks);
  const titleOf = (id: string) => checks.find((c) => c.id === id)?.title ?? id;
  const render = () => {
    mount.innerHTML = mentorTasksHtml(tasks, titleOf);
    mount.classList.toggle('hidden', tasks.length === 0);
  };
  mount.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-mentor-address],[data-mentor-link]');
    if (!el) return;
    if (el.dataset.mentorAddress) {
      tasks = tasks.map((t) => (t.id === el.dataset.mentorAddress ? { ...t, ...markAddressed(t) } : t));
    } else if (el.dataset.mentorLink && el.dataset.checkId) {
      tasks = tasks.map((t) => (t.id === el.dataset.mentorLink ? { ...t, ...verifyAgainstChecks(confirmLinks(t, [...t.linkedFindingIds, el.dataset.checkId!]), formal) } : t));
    }
    render();
  });
  render();
  return true;
}
