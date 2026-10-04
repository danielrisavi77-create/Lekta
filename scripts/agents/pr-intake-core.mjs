// Sazetak PR-a za koordinatora (odluka vlasnika 3. 10. 2026, skripta 1 od 3).
//
// Cist modul: `summarizePr` radi nad vec dohvacenim JSON-om iz `gh api` i ne dira mrezu ni git.
// Mrezu ima samo tanki CLI `scripts/agents/pr-intake.mjs`. Testovi: `tests/pr-intake.test.ts` i
// mutacije u `tests/gate-mutations.test.ts`.
//
// Pravilo CI-ja: nad head SHA-om za svako ime check-runa mjerodavan je samo najnoviji run, tj.
// onaj s najvecim `id`. Rerun istog imena tako zamjenjuje stariji pad, a stariji zeleni run ne
// skriva noviji pad.
//
// Pregledi drugog providera se traze i u komentarima (`issues/N/comments`) i u reviewima
// (`pulls/N/reviews`), jer `.claude/skills/codex-review/SKILL.md` objavljuje kroz
// `gh pr review --comment`, sto zavrsava medu reviewima, ne medu komentarima.

/** Najvise redaka tekstualnog ispisa. */
export const MAX_REDAKA = 20;

/** Model pregleda drugog providera (vidi `.claude/skills/codex-review/SKILL.md`). */
export const MODEL_PREGLEDA = 'gpt-6-sol';
/** Model pregleda kad PR dira zasticenu stazu iz `config/agent-routing.json`. */
export const MODEL_PREGLEDA_ZASTICENO = 'gpt-6.1-sol';

const OZNAKA_PREGLEDA = 'Pregled drugog providera';

const ZELENI_ZAKLJUCCI = new Set(['success', 'skipped', 'neutral']);
const NETO_RE = /Neto redaka:\s*`?\s*\+(\d+)\s*\/\s*-(\d+)/;
const OVISNOSTI_RE = /Nove ovisnosti:[ \t]*([^\r\n]*)/;
const RUNDA_RE = /Runda\s+(\d+)/i;
const MODEL_RE = /\b(?:gpt|claude|grok|o\d)-[\w.]+(?:-[\w.]+)*/i;

/**
 * Za svako ime check-runa vraca run s najvecim `id` (najnoviji). Redoslijed izlaza prati ime.
 * @param {ReadonlyArray<{ id: number, name: string }>} runs
 */
export function latestCheckRunsByName(runs) {
  /** @type {Map<string, (typeof runs)[number]>} */
  const poImenu = new Map();
  for (const run of runs) {
    const prethodni = poImenu.get(run.name);
    if (!prethodni || run.id > prethodni.id) poImenu.set(run.name, run);
  }
  return [...poImenu.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Zasticene staze koje PR dira. Usporedba po prefiksu putanje: `src/repair` pogada
 * `src/repair/x.ts`, ali ne `src/repair-old/x.ts`. Gleda i staru putanju preimenovane datoteke.
 * @param {ReadonlyArray<{ filename: string, previous_filename?: string }>} files
 * @param {ReadonlyArray<string>} protectedPaths
 * @returns {string[]}
 */
export function touchedProtectedPaths(files, protectedPaths) {
  const pogodjene = new Set();
  for (const f of files) {
    const putanje = [f.filename, f.previous_filename].filter((p) => typeof p === 'string');
    for (const zasticena of protectedPaths) {
      const prefiks = zasticena.replace(/\/+$/, '');
      if (putanje.some((p) => p === prefiks || p.startsWith(`${prefiks}/`))) pogodjene.add(zasticena);
    }
  }
  return protectedPaths.filter((p) => pogodjene.has(p));
}

/**
 * Skuplja sve stranice paginiranog poziva. Staje kad stranica ima manje od `perPage` stavki.
 * Prekoracenje `maxPages` baca gresku: djelomican dohvat mora srusiti mjerenje.
 * @template T
 * @param {(page: number) => Promise<T[]> | T[]} fetchPage
 * @param {{ perPage?: number, maxPages?: number }} [opcije]
 * @returns {Promise<T[]>}
 */
export async function collectPages(fetchPage, opcije = {}) {
  const perPage = opcije.perPage ?? 100;
  const maxPages = opcije.maxPages ?? 50;
  /** @type {T[]} */
  const sve = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const stavke = await fetchPage(page);
    if (!Array.isArray(stavke)) throw new TypeError(`collectPages: stranica ${page} nije niz`);
    sve.push(...stavke);
    if (stavke.length < perPage) return sve;
  }
  throw new Error(`collectPages: vise od ${maxPages} stranica, dohvat bi bio djelomican`);
}

/** @param {string | null | undefined} sha */
function kratki(sha) {
  return typeof sha === 'string' && sha.length > 0 ? sha.slice(0, 8) : 'nepoznat';
}

/** @param {string} tekst */
function jedanRedak(tekst) {
  return tekst.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} body
 * @param {number} additions
 * @param {number} deletions
 */
function procitajOpis(body, additions, deletions) {
  const tekst = body.replace(/\r/g, '');
  const neto = NETO_RE.exec(tekst);
  const ovisnosti = OVISNOSTI_RE.exec(tekst);
  const opisPlus = neto ? Number(neto[1]) : null;
  const opisMinus = neto ? Number(neto[2]) : null;
  return {
    netoPrisutan: neto !== null,
    netoPlus: opisPlus,
    netoMinus: opisMinus,
    netoSlaze: neto !== null && opisPlus === additions && opisMinus === deletions,
    ovisnostiPrisutne: ovisnosti !== null,
    ovisnosti: ovisnosti ? ovisnosti[1].replace(/`/g, '').trim() : null,
  };
}

/** @param {{ status?: string, conclusion?: string | null }} run */
function stanjeRuna(run) {
  if (run.status !== 'completed') return 'u tijeku';
  return ZELENI_ZAKLJUCCI.has(run.conclusion ?? '') ? 'zeleni' : 'crveni';
}

/**
 * @typedef {{ user?: { login?: string } | null, body?: string | null, created_at?: string, submitted_at?: string }} Komentar
 */

/** @param {Komentar} k */
function vrijemeKomentara(k) {
  return k.created_at ?? k.submitted_at ?? '';
}

/** @param {string} body */
function procitajPregled(body) {
  const tekst = body.replace(/\r/g, '');
  const runda = RUNDA_RE.exec(tekst);
  const redakOznake = tekst.split('\n').find((r) => r.includes(OZNAKA_PREGLEDA)) ?? '';
  // Model se trazi prvo u zagradi retka s oznakom, pa u ostatku tog retka. Stvarni pregledi
  // pisu i `Codex gpt-6.1-sol (zasticena staza ...)`, gdje zagrada nije model.
  const zagrade = [...redakOznake.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  let model = null;
  for (const dio of [...zagrade, redakOznake]) {
    const m = MODEL_RE.exec(dio);
    if (m) {
      model = m[0];
      break;
    }
  }
  const retciTablice = tekst.split('\n').filter((r) => r.trim().startsWith('|'));
  return {
    runda: runda ? Number(runda[1]) : null,
    model,
    blocker: retciTablice.filter((r) => /blocker/i.test(r)).length,
    major: retciTablice.filter((r) => /major/i.test(r)).length,
  };
}

/**
 * @typedef {{
 *   pr: {
 *     number: number, title: string, draft?: boolean, body?: string | null,
 *     user?: { login?: string } | null, mergeable_state?: string | null,
 *     additions: number, deletions: number, changed_files: number,
 *     head: { sha: string }, base: { sha: string, ref: string },
 *   },
 *   compare?: { behind_by?: number, ahead_by?: number, base_commit?: { sha?: string } } | null,
 *   files: ReadonlyArray<{ filename: string, previous_filename?: string, additions: number, deletions: number }>,
 *   checkRuns: ReadonlyArray<{ id: number, name: string, status?: string, conclusion?: string | null }>,
 *   comments: ReadonlyArray<Komentar>,
 *   reviews?: ReadonlyArray<Komentar>,
 *   protectedPaths: ReadonlyArray<string>,
 * }} PrIntakeInput
 */

/**
 * Sazima vec dohvaceni PR. `opcije` sluze samo mutacijskim testovima za zamjenu pravila.
 * @param {PrIntakeInput} input
 * @param {{ latestByName?: typeof latestCheckRunsByName, protectedTouched?: typeof touchedProtectedPaths }} [opcije]
 */
export function summarizePr(input, opcije = {}) {
  const latestByName = opcije.latestByName ?? latestCheckRunsByName;
  const protectedTouched = opcije.protectedTouched ?? touchedProtectedPaths;
  const { pr, files, checkRuns, protectedPaths } = input;

  /** @type {Map<string, { datoteka: number, plus: number, minus: number }>} */
  const poDirektoriju = new Map();
  let zbrojPlus = 0;
  let zbrojMinus = 0;
  for (const f of files) {
    const kosa = f.filename.indexOf('/');
    const dir = kosa === -1 ? '.' : f.filename.slice(0, kosa);
    const s = poDirektoriju.get(dir) ?? { datoteka: 0, plus: 0, minus: 0 };
    s.datoteka += 1;
    s.plus += f.additions;
    s.minus += f.deletions;
    poDirektoriju.set(dir, s);
    zbrojPlus += f.additions;
    zbrojMinus += f.deletions;
  }
  const direktoriji = [...poDirektoriju.entries()]
    .sort((a, b) => b[1].datoteka - a[1].datoteka || a[0].localeCompare(b[0]))
    .map(([dir, s]) => ({ dir, ...s }));

  const zasticene = protectedTouched(files, protectedPaths);
  const najnoviji = latestByName(checkRuns);
  const zeleni = najnoviji.filter((r) => stanjeRuna(r) === 'zeleni').length;
  const crveniRuni = najnoviji.filter((r) => stanjeRuna(r) === 'crveni');
  const uTijeku = najnoviji.filter((r) => stanjeRuna(r) === 'u tijeku').length;

  const sviKomentari = [...input.comments, ...(input.reviews ?? [])]
    .filter((k) => vrijemeKomentara(k) !== '')
    .sort((a, b) => vrijemeKomentara(a).localeCompare(vrijemeKomentara(b)));
  const pregledi = sviKomentari.filter((k) => (k.body ?? '').includes(OZNAKA_PREGLEDA));
  const zadnjiPregled = pregledi.length > 0 ? procitajPregled(pregledi[pregledi.length - 1].body ?? '') : null;
  const zadnji = sviKomentari.length > 0 ? sviKomentari[sviKomentari.length - 1] : null;

  const behind = input.compare?.behind_by;
  return {
    broj: pr.number,
    naslov: jedanRedak(pr.title),
    autor: pr.user?.login ?? 'nepoznat',
    draft: pr.draft === true,
    headSha: kratki(pr.head.sha),
    baseSha: kratki(pr.base.sha),
    baseRef: pr.base.ref,
    masterSha: kratki(input.compare?.base_commit?.sha),
    izaMastera: typeof behind === 'number' ? behind > 0 : null,
    izaMasteraCommita: typeof behind === 'number' ? behind : null,
    mergeableState: pr.mergeable_state ?? 'nepoznat',
    datoteke: {
      broj: files.length,
      prijavljeno: pr.changed_files,
      potpune: files.length === pr.changed_files && zbrojPlus === pr.additions && zbrojMinus === pr.deletions,
      plus: pr.additions,
      minus: pr.deletions,
      poDirektoriju: direktoriji,
    },
    zasticeneStaze: zasticene,
    modelPregleda: zasticene.length > 0 ? MODEL_PREGLEDA_ZASTICENO : MODEL_PREGLEDA,
    prOpis: procitajOpis(pr.body ?? '', pr.additions, pr.deletions),
    ci: {
      ukupnoRunova: checkRuns.length,
      najnovijihPoImenu: najnoviji.length,
      zeleni,
      crveni: crveniRuni.length,
      uTijeku,
      imenaCrvenih: crveniRuni.map((r) => r.name),
    },
    pregledi: {
      broj: pregledi.length,
      zadnjaRunda: zadnjiPregled?.runda ?? null,
      zadnjiModel: zadnjiPregled?.model ?? null,
      blocker: zadnjiPregled?.blocker ?? null,
      major: zadnjiPregled?.major ?? null,
    },
    zadnjiKomentar: zadnji
      ? {
          autor: zadnji.user?.login ?? 'nepoznat',
          datum: vrijemeKomentara(zadnji),
          pocetak: jedanRedak(zadnji.body ?? '').slice(0, 120),
        }
      : null,
  };
}

/** @param {boolean} b */
function dane(b) {
  return b ? 'da' : 'ne';
}

/**
 * Tekstualni ispis, najvise `MAX_REDAKA` redaka.
 * @param {ReturnType<typeof summarizePr>} s
 * @returns {string[]}
 */
export function formatSummary(s) {
  const d = s.datoteke;
  const o = s.prOpis;
  const retci = [
    `PR #${s.broj}: ${s.naslov}`,
    `Autor: ${s.autor} | draft: ${dane(s.draft)} | head: ${s.headSha} | mergeable_state: ${s.mergeableState}`,
    `Baza: ${s.baseSha} (${s.baseRef} ${s.masterSha}) | iza mastera: ${
      s.izaMastera === null ? 'nepoznato' : `${dane(s.izaMastera)} (${s.izaMasteraCommita} commita)`
    }`,
    `Datoteke: ${d.broj}, +${d.plus}/-${d.minus}${d.potpune ? '' : ` | UPOZORENJE: dohvat nepotpun (prijavljeno ${d.prijavljeno})`}`,
    `Po direktoriju: ${d.poDirektoriju.map((x) => `${x.dir} ${x.datoteka} (+${x.plus}/-${x.minus})`).join(', ') || 'nema'}`,
    `Zasticene staze: ${s.zasticeneStaze.length > 0 ? s.zasticeneStaze.join(', ') : 'nema'} | model pregleda: ${s.modelPregleda}`,
    `pr-opis Neto redaka: ${
      !o.netoPrisutan
        ? 'NEDOSTAJE'
        : o.netoSlaze
          ? `+${o.netoPlus}/-${o.netoMinus}, slaze se`
          : `+${o.netoPlus}/-${o.netoMinus}, NE SLAZE SE s PR-om +${d.plus}/-${d.minus}`
    }`,
    `pr-opis Nove ovisnosti: ${o.ovisnostiPrisutne ? o.ovisnosti || '(prazno)' : 'NEDOSTAJE'}`,
    `CI: ${s.ci.zeleni} zelenih, ${s.ci.crveni} crvenih, ${s.ci.uTijeku} u tijeku (najnoviji po imenu ${s.ci.najnovijihPoImenu} od ${s.ci.ukupnoRunova} runova)`,
  ];
  if (s.ci.imenaCrvenih.length > 0) retci.push(`Crveni: ${s.ci.imenaCrvenih.join(', ')}`);
  const p = s.pregledi;
  retci.push(
    p.broj === 0
      ? 'Pregledi drugog providera: 0'
      : `Pregledi drugog providera: ${p.broj} | zadnja runda: ${p.zadnjaRunda ?? 'nepoznata'} (${p.zadnjiModel ?? 'model nepoznat'}) | blocker: ${p.blocker}, major: ${p.major}`,
  );
  const z = s.zadnjiKomentar;
  retci.push(z ? `Zadnji komentar: ${z.autor}, ${z.datum}: ${z.pocetak}` : 'Zadnji komentar: nema');
  return retci.slice(0, MAX_REDAKA);
}
