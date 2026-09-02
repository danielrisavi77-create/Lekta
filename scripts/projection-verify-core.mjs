// scripts/projection-verify-core.mjs
//
// Ciste funkcije iza `npm run projection-verify`. Odvojene da budu testirljive: sam skript barata
// worktreeom, gitom i pokretanjem generatora.
//
// ODNOS PREMA `projection-freshness`: to je SCREENING (redoslijed commita, sekunde, lazno
// pozitivan), ovo je PRESUDA (regeneriraj pa usporedi bajtove, desetak minuta po projekciji).
// Screening bira kandidate, presuda odlucuje. Jedno bez drugoga ne valja: screening sam tvrdi
// vise nego sto zna, a presuda nad SVIME je preskupa da bi je itko pokretao.
//
// ZASTO POSTOJI: 2026-09-01 je screening prijavio tri ustajale projekcije, a regeneracija je dala
// BAJT-IDENTICAN sadrzaj u sva tri slucaja. Bez sadrzajne provjere nije se moglo znati je li to
// lazan alarm ili stvaran kvar, a upravo ta razlika odlucuje treba li itko isto trositi sat vremena.
//
// ZAMKA KOJU OVAJ MODUL POSTOJI DA IZBJEGNE: `git status` NIJE mjerodavan za "je li se artefakt
// promijenio". Isti dan je u regeneracijskom worktreeu prijavio SEST izmijenjenih datoteka, dok je
// sha256 istih datoteka bio identican commitanom sadrzaju. Generator ih je prepisao (mtime se
// pomakao, EOL se mogao razlikovati), a git je to prikazao kao izmjenu. Zato se ovdje usporedjuju
// BAJTOVI koje sami procitamo, i to u dvije razine, da se razlika u zavrsecima redaka nikad ne
// prijavi kao razlika u sadrzaju, ali se ni ne sakrije.

/** \r\n i osamljeni \r svode se na \n. Generirani tekstualni artefakti nemaju semantiku u EOL-u. */
export function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Presuda za JEDAN artefakt, iz sadrzaja prije i poslije regeneracije.
 *
 * Tri ishoda, namjerno razdvojena: `samo-eol` NIJE nalaz (ne mijenja znacenje), ali se ni ne
 * preslucava u `identican`, jer bi inace tiho objasnio zasto `git status` vristi a nista ne valja.
 */
export function classifyArtifact(before, after) {
  if (before === after) return 'identican';
  if (normalizeEol(before) === normalizeEol(after)) return 'samo-eol';
  return 'sadrzaj';
}

/**
 * Presuda za projekciju iz presuda njezinih artefakata.
 *
 * `neprovjereno` (regeneracija pala ili artefakt nedostaje) NIKAD ne prelazi u cisto: provjera
 * koja nije uspjela nije provjera koja je prosla.
 */
export function projectionVerdict(id, artifacts) {
  const failed = artifacts.filter((a) => a.status === 'neprovjereno');
  if (failed.length) {
    return { id, status: 'neprovjereno', drifted: [], reason: failed[0].reason ?? 'regeneracija nije uspjela' };
  }
  const drifted = artifacts.filter((a) => a.status === 'sadrzaj').map((a) => a.path);
  if (drifted.length) {
    return { id, status: 'raskorak', drifted, reason: `${drifted.length} artefakt(a) se sadrzajno razlikuje` };
  }
  const eolOnly = artifacts.filter((a) => a.status === 'samo-eol').map((a) => a.path);
  if (eolOnly.length) {
    return { id, status: 'cisto', drifted: [], reason: `identicno (${eolOnly.length} razlika samo u zavrsecima redaka)` };
  }
  return { id, status: 'cisto', drifted: [], reason: 'regeneracija dala bajt-identican sadrzaj' };
}

export function formatVerdict(v) {
  const oznaka = v.status === 'raskorak' ? 'RASKORAK ' : v.status === 'neprovjereno' ? 'NEPROVJER' : 'cisto    ';
  return `  ${oznaka} ${v.id.padEnd(20)} ${v.reason}`;
}

/** Pada SAMO na stvarnom sadrzajnom raskoraku i na neuspjeloj provjeri. EOL nikad ne obara. */
export function exitCodeFor(verdicts) {
  return verdicts.some((v) => v.status === 'raskorak' || v.status === 'neprovjereno') ? 1 : 0;
}
