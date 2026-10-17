/**
 * Petlja ucenja: brojac rasipnih poziva konteksta u transkriptima Claude Code sesija.
 *
 * Rasipan poziv je onaj koji u kontekst sesije dovuce puno teksta, a postojao je jeftiniji oblik:
 *   citanje-cijele-datoteke   Read bez `limit`, ili cat/Get-Content bez reza, s izlazom iznad 200 redaka
 *   gh-view-bez-filtra        `gh pr view` ili `gh run view` bez --jq/--log-failed i bez reza izlaza
 *   git-log-bez-granice       `git log` bez -n/-<broj>/--max-count i bez reza izlaza
 *   codex-pregled-u-cijelosti izlaz Codex poziva iznad 60 redaka (HEURISTIKA: ne zna je li procitana
 *                             tablica nalaza ili cijeli pregled, mjeri samo velicinu)
 *   poruka-dulja-od-5-redaka  SendMessage s porukom duljom od 5 redaka
 *
 * Prag buke: naredbe (gh, git log) broje se tek kad izlaz prelazi 40 redaka, da kratki
 * `git log a..b` nije nalaz. Cijena je procjena: znakovi izlaza / 4.
 *
 * Privatnost: zapis nosi vrstu, alat, broj redaka, procjenu tokena i oznaku. Oznaka je ime
 * datoteke bez putanje (Read) ili fiksni naziv naredbe; nikad sadrzaj datoteke ni tekst naredbe.
 */
import { localDay, sessionLabel } from '../agents/usage-daily.mjs';

export const PRAG_DATOTEKA_REDAKA = 200;
export const PRAG_NAREDBA_REDAKA = 40;
export const PRAG_CODEX_REDAKA = 60;
export const PRAG_PORUKA_REDAKA = 5;

/**
 * Cista klasifikacija jednog poziva. Sve sto treba je u tijelu funkcije, da je mutacije mogu
 * izvesti iz izvora bez ostatka modula.
 * @param {string} tool ime alata
 * @param {Record<string, unknown>} input ulaz alata
 * @param {number} redaka broj redaka izlaza (za SendMessage: redaka poruke)
 * @returns {null | { vrsta: string, oznaka: string }}
 */
export function classifyWaste(tool, input, redaka) {
  const zadnji = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '?';
  if (tool === 'SendMessage') {
    return redaka > 5 ? { vrsta: 'poruka-dulja-od-5-redaka', oznaka: 'SendMessage' } : null;
  }
  if (tool === 'Read') {
    if (input?.limit != null || redaka <= 200) return null;
    return { vrsta: 'citanje-cijele-datoteke', oznaka: zadnji(input?.file_path ?? '?') };
  }
  if (tool === 'Agent' || tool === 'Task') {
    const tip = String(input?.subagent_type ?? '');
    return tip.startsWith('codex') && redaka > 60 ? { vrsta: 'codex-pregled-u-cijelosti', oznaka: 'codex' } : null;
  }
  if (tool !== 'Bash' && tool !== 'PowerShell') return null;
  const c = String(input?.command ?? '');
  // Rez izlaza u istoj naredbi: poziv je vec ogranicen, ma koliko izvor bio velik.
  const rez = /\|\s*(head|tail|grep|rg|wc|jq|sed|awk|cut|sort|uniq|Select-Object|Select-String|Measure-Object|findstr)\b|-TotalCount\b|-Tail\b|-First\b|-Last\b/i.test(c);
  if (/\bcodex(-companion)?\b/i.test(c) && /\b(exec|task|review)\b/i.test(c)) {
    return redaka > 60 ? { vrsta: 'codex-pregled-u-cijelosti', oznaka: 'codex' } : null;
  }
  const gh = c.match(/\bgh\s+(pr|run)\s+view\b/);
  if (gh) {
    if (rez || /--jq\b|\s-q\s|--log-failed\b/.test(c) || redaka <= 40) return null;
    return { vrsta: 'gh-view-bez-filtra', oznaka: `gh ${gh[1]} view` };
  }
  if (/\bgit\s+(?:-C\s+\S+\s+)?log\b/.test(c)) {
    if (rez || /\s-n\s*\d+|\s-\d+\b|--max-count\b/.test(c) || redaka <= 40) return null;
    return { vrsta: 'git-log-bez-granice', oznaka: 'git log' };
  }
  // Samo `cat` i `Get-Content`: aliasi `gc` i `type` se sudaraju s `git gc` i `-type f`.
  const cita = c.match(/(?:^|[;&|(]\s*|\s)(cat|Get-Content)\s+[^|;&]+/i);
  if (cita) {
    if (rez || redaka <= 200) return null;
    return { vrsta: 'citanje-cijele-datoteke', oznaka: cita[1] };
  }
  return null;
}

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n');
  return '';
}

const brojRedaka = (t) => (t === '' ? 0 : t.split('\n').length);

/**
 * Cita jedan transkript (vec razbijen na retke) i vraca rasipne pozive. Ista deduplikacija kao
 * kod kvarova: redak roditelja i podagenta s istim `uuid` i `tool_use_id` broji se jednom.
 * @param {string[]} lines
 * @param {{ seenWaste: Set<string>, stats: { malformedLines: number } }} ctx
 */
export function wasteFromLines(lines, ctx) {
  const pozivi = new Map();
  const out = [];
  const dodaj = (j, kljuc, tool, input, redaka, znakova) => {
    if (ctx.seenWaste.has(kljuc)) return;
    const nalaz = classifyWaste(tool, input, redaka);
    if (!nalaz) return;
    const day = localDay(j.timestamp);
    if (!day) return;
    ctx.seenWaste.add(kljuc);
    out.push({
      day,
      sessionId: j.sessionId ?? '?',
      session: sessionLabel(j.sessionId, j.cwd),
      vrsta: nalaz.vrsta,
      oznaka: nalaz.oznaka,
      alat: tool,
      redaka,
      tokeni: Math.round(znakova / 4),
    });
  };
  for (const line of lines) {
    if (!line.includes('"tool_use"') && !line.includes('"tool_result"')) continue;
    let j;
    try { j = JSON.parse(line); } catch { ctx.stats.malformedLines += 1; continue; }
    const content = j?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === 'tool_use' && b.id) {
        pozivi.set(b.id, { name: b.name ?? '?', input: b.input ?? {} });
        if (b.name === 'SendMessage') {
          const poruka = String(b.input?.message ?? '');
          dodaj(j, `${j.uuid ?? ''}|${b.id}`, 'SendMessage', b.input ?? {}, brojRedaka(poruka), poruka.length);
        }
        continue;
      }
      if (b?.type !== 'tool_result' || b.is_error === true) continue;
      const poziv = pozivi.get(b.tool_use_id);
      if (!poziv || poziv.name === 'SendMessage') continue;
      const tekst = resultText(b);
      dodaj(j, `${j.uuid ?? ''}|${b.tool_use_id ?? ''}`, poziv.name, poziv.input, brojRedaka(tekst), tekst.length);
    }
  }
  return out;
}

/** Sazetak za jedan dan po sesiji: broj, procjena tokena, raspodjela po vrsti i tri najskuplja primjera. */
export function summarizeWaste(records, day) {
  const map = new Map();
  for (const r of records) {
    if (r.day !== day) continue;
    const s = map.get(r.sessionId) ?? { session: r.session, broj: 0, tokeni: 0, poVrsti: {}, primjeri: [] };
    s.broj += 1;
    s.tokeni += r.tokeni;
    s.poVrsti[r.vrsta] = (s.poVrsti[r.vrsta] ?? 0) + 1;
    s.primjeri.push({ vrsta: r.vrsta, oznaka: r.oznaka, alat: r.alat, redaka: r.redaka, tokeni: r.tokeni });
    map.set(r.sessionId, s);
  }
  const sesije = [...map.values()].map((s) => ({
    ...s,
    primjeri: s.primjeri.sort((a, b) => b.tokeni - a.tokeni || a.vrsta.localeCompare(b.vrsta)).slice(0, 3),
  })).sort((a, b) => b.tokeni - a.tokeni || a.session.localeCompare(b.session));
  return {
    day,
    sesije,
    ukupno: sesije.reduce((a, s) => a + s.broj, 0),
    tokeni: sesije.reduce((a, s) => a + s.tokeni, 0),
  };
}

const md = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
const fmt = (n) => Math.round(n).toLocaleString('hr-HR');

export function renderWasteMarkdown(sum) {
  const L = [];
  L.push(`## Rasipni pozivi konteksta ${sum.day}`, '');
  L.push(`Ukupno: ${sum.ukupno} poziva, procjena ${fmt(sum.tokeni)} tokena (znakovi / 4). "codex-pregled-u-cijelosti" je heuristika po velicini izlaza.`, '');
  if (!sum.sesije.length) { L.push('- nema', ''); return L.join('\n'); }
  for (const s of sum.sesije) {
    const vrste = Object.entries(s.poVrsti).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v, n]) => `${v} ${n}`).join(', ');
    L.push(`- ${md(s.session)}: ${s.broj} poziva, ~${fmt(s.tokeni)} tokena (${vrste})`);
    for (const p of s.primjeri) L.push(`  - ${p.vrsta}: ${md(p.oznaka)} (${p.alat}), ${p.redaka} redaka, ~${fmt(p.tokeni)} tokena`);
  }
  L.push('');
  return L.join('\n');
}
