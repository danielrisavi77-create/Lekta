/**
 * Lokalni korpus za razinu A-pdf (Codex #229): oai_discover -> harvest (staging + private) -> corpus-ingest
 * --source-kind public-pdf-converted -> repair-real-corpus --only-root -> attest-real-corpus --source-kind
 * public-pdf-converted.
 *
 * Mreza i pdf2docx se ovdje ne koriste: harvest se pokrece kroz `main()` s laznim transportom, satom i
 * pretvorbom (Python podproces), a CLI putanje koje padaju prije ikakvog dohvata kroz stvarnu skriptu. Nijedan
 * stvaran rad, PID ni URL ne ulazi u repozitorij: svi korijeni su privremene mape izvan njega, a DOCX za
 * lanac ingest -> mjerenje -> ovjera je commitana anonimna fixture.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(__dirname, '..');
const SKRIPTA = join(REPO, 'scripts', 'pdf-corpus', 'harvest_pdf_corpus.py');
const OAI = join(REPO, 'scripts', 'title-pages', 'oai_discover.py');
const UA = 'Lekta corpus tool (lekta.kontakt@gmail.com)';

/** python3 ili python s verzijom 3; null kad ga nema (tada se Python dio preskace uz razlog u naslovu). */
const PYTHON = ['python3', 'python'].find((cmd) => {
  const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '3';
}) ?? null;
const RAZLOG = PYTHON ? '' : ' [PRESKOCENO: python3 nije na PATH-u, Python skripta se ne moze pokrenuti]';
if (!PYTHON) console.warn(`pdf-corpus-harvest.test.ts:${RAZLOG}`);

const tmpDirs: string[] = [];
function tmp(prefix = 'lekta-pdf-korpus-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
});

/** Lazni transport, sat i pretvorba; ucitava harvest i oai_discover kao module (bez mreze). */
const PRELUDE = String.raw`
import importlib.util, io, json, os, sys, zipfile
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
h = load("harvest", os.environ["SKRIPTA"])
PDF = b"%PDF-1.7\n" + b"lazni pdf " * 20
class Resp:
    def __init__(self, status=200, headers=None, body=b"", chunks=None):
        self.status_code = status
        self.headers = dict(headers or {})
        self.chunks = chunks if chunks is not None else [body]
    def iter_content(self, n):
        for c in self.chunks:
            yield c
    def close(self):
        pass
def pdf(body=PDF, ctype="application/pdf"):
    return lambda: Resp(200, {"Content-Type": ctype}, body)
def redirect(to, status=302):
    return lambda: Resp(status, {"Location": to})
class Clock:
    def __init__(self):
        self.t = 1000.0
        self.sleeps = []
    def now(self):
        return self.t
    def sleep(self, s):
        self.sleeps.append(round(s, 3))
        self.t += s
class Transport:
    def __init__(self, routes, clock, cost=0.0):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls = []
        self.clock = clock
        self.cost = cost
    def __call__(self, url, headers, timeout):
        self.calls.append({"url": url, "t": self.clock.t, "ua": headers.get("User-Agent")})
        self.clock.t += self.cost
        q = self.routes.get(url)
        if not q:
            return Resp(404)
        f = q.pop(0) if len(q) > 1 else q[0]
        return f()
def fake_convert(pdf_path, docx_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document>" + h.sha256(open(pdf_path, "rb").read()) + "</w:document>")
        z.writestr("docProps/core.xml", "<cp:coreProperties><dc:creator>Ana Anic</dc:creator><dc:title>Tajni naslov</dc:title></cp:coreProperties>")
        z.writestr("docProps/app.xml", "<Properties><Company>Sveuciliste</Company></Properties>")
    open(docx_path, "wb").write(buf.getvalue())
def broken_convert(pdf_path, docx_path):
    raise h.ConvertError("skenirani PDF")
HOST = "repozitorij.unizd.hr"
def rec(n, level="diplomski", host=HOST, unit="unizd"):
    return {"pid": f"unizd:{n}", "repository": host, "unitId": unit, "level": level}
def url(n, host=HOST, form=0):
    return h.candidate_urls(f"unizd:{n}", host)[form]
def discovery(path, picked, host=HOST, unit="unizd"):
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"unitId": unit, "host": host, "pages": 1, "stats": {"scanned": len(picked), "open": len(picked), "byLevel": {}}, "picked": picked}, f)
    return path
D = os.environ.get("DIR", "")
STAGING, PRIVATE = os.path.join(D, "staging"), os.path.join(D, "private")
def run(files, routes, extra=(), clock=None, convert=fake_convert, converter="fake/1", cost=0.0):
    clock = clock or Clock()
    t = Transport(routes, clock, cost)
    argv = [a for f in files for a in ("--pids-file", f)] + ["--staging-dir", STAGING, "--private-dir", PRIVATE, "--report", os.path.join(D, "report.json"), "--per-cell", "10"] + list(extra)
    code = h.main(argv, transport=t, convert=convert, converter=converter, clock=clock.now, sleep=clock.sleep,
                  wall=lambda: 1_800_000_000.0, now=lambda: "2026-09-28T00:00:00+00:00")
    rep = json.load(open(os.path.join(D, "report.json"), encoding="utf-8")) if os.path.exists(os.path.join(D, "report.json")) else None
    return {"code": code, "calls": t.calls, "sleeps": clock.sleeps, "report": rep}
def tree(root):
    out = []
    for base, dirs, files in os.walk(root):
        for f in files:
            out.append(os.path.relpath(os.path.join(base, f), root).replace(os.sep, "/"))
    return sorted(out)
def out(obj):
    print("@@" + json.dumps(obj))
`;

function py(body: string, dir = ''): any {
  const r = spawnSync(PYTHON as string, ['-c', `${PRELUDE}\n${body}`], {
    encoding: 'utf8',
    env: { ...process.env, SKRIPTA, OAI, DIR: dir, PYTHONDONTWRITEBYTECODE: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = r.stdout.split('\n').find((l) => l.startsWith('@@'));
  if (r.status !== 0 || !line) throw new Error(`python izlaz ${r.status}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(line.slice(2));
}

function cli(args: string[]) {
  return spawnSync(PYTHON as string, [SKRIPTA, ...args], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
}

/** Stvarni izlaz oai_discover.py --out nad laznim OAI odgovorom (fetch je jedina mrezna tocka modula). */
const OAI_XML = `
<OAI-PMH><ListRecords>
<record><header><identifier>oai:repozitorij.unizd.hr:unizd_101</identifier></header><metadata><dc:type>info:eu-repo/semantics/masterThesis</dc:type><dc:type>Diplomski rad</dc:type><dc:date>2024</dc:date><dc:rights>info:eu-repo/semantics/openAccess</dc:rights></metadata></record>
<record><header><identifier>oai:repozitorij.unizd.hr:unizd_102</identifier></header><metadata><dc:type>Diplomski rad</dc:type><dc:date>2023</dc:date><dc:rights>info:eu-repo/semantics/openAccess</dc:rights></metadata></record>
<record><header><identifier>oai:repozitorij.unizd.hr:unizd_103</identifier></header><metadata><dc:type>Zavrsni rad</dc:type><dc:date>2024</dc:date><dc:rights>info:eu-repo/semantics/openAccess</dc:rights></metadata></record>
<record><header><identifier>oai:repozitorij.unizd.hr:unizd_104</identifier></header><metadata><dc:type>Diplomski rad</dc:type><dc:date>2024</dc:date><dc:rights>info:eu-repo/semantics/closedAccess</dc:rights></metadata></record>
</ListRecords></OAI-PMH>`;

describe.skipIf(!PYTHON)(`PDF korpus: harvest_pdf_corpus.py${RAZLOG}`, () => {
  it('samoprovjera prolazi bez mreze i bez pdf2docx', () => {
    const r = cli(['--selftest']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('selftest: ok');
  });

  it('stvarni izlaz oai_discover.py (objekt s picked) prolazi do staginga; PID, URL i PDF ostaju izvan njega', () => {
    const dir = tmp();
    const res = py(String.raw`
oai = load("oai", os.environ["OAI"])
oai.fetch = lambda url, retries=3: ${JSON.stringify(OAI_XML)}
sys.argv = ["oai_discover.py", HOST, "unizd", "--n", "12", "--out", os.path.join(D, "unizd.json")]
oai.main()
disc = json.load(open(os.path.join(D, "unizd.json"), encoding="utf-8"))
routes = {url(101): [pdf(PDF + b"101")], url(102): [pdf(PDF + b"102")], url(103, form=2): [pdf(PDF + b"103")]}
r = run([os.path.join(D, "unizd.json")], routes)
staging_bytes = []
for name in tree(STAGING):
    data = open(os.path.join(STAGING, name), "rb").read()
    if name.endswith(".docx"):
        z = zipfile.ZipFile(io.BytesIO(data))
        staging_bytes.append(b"".join(z.read(n) for n in z.namelist()))
        core = z.read("docProps/core.xml")
    else:
        staging_bytes.append(data)
blob = b"".join(staging_bytes)
rec_path = os.path.join(PRIVATE, "records", "unizd", "diplomski", "unizd_101.json")
out({"discovery": {k: disc[k] for k in ("unitId", "host", "picked")}, "discoveryKeys": sorted(disc), "code": r["code"],
     "statuses": [(e["pid"], e["status"]) for e in r["report"]["records"]], "staging": tree(STAGING), "private": tree(PRIVATE),
     "marker": open(os.path.join(STAGING, ".lekta-corpus-kind")).read(), "coreEmpty": core == h.EMPTY_CORE_XML,
     "leaks": [s for s in ("unizd", "Ana Anic", "Tajni naslov", "Sveuciliste", "https://") if s.encode() in blob],
     "record": json.load(open(rec_path, encoding="utf-8")), "uas": sorted({c["ua"] for c in r["calls"]}),
     "pdfSha": h.sha256(PDF + b"101")})
`, dir);
    // Oblik koji oai_discover.py stvarno pise: objekt, ne niz.
    expect(res.discoveryKeys).toEqual(['host', 'pages', 'picked', 'stats', 'unitId']);
    expect(res.discovery.picked.map((p: { pid: string }) => p.pid)).toEqual(['unizd:101', 'unizd:103', 'unizd:102']);
    expect(res.code).toBe(0);
    expect(res.statuses).toEqual([['unizd:101', 'ok'], ['unizd:103', 'ok'], ['unizd:102', 'ok']]);
    // Staging nosi samo neutralne id-ove i oznaku vrste; bez PID-a, URL-a i metapodataka pretvorbe.
    expect(res.staging).toHaveLength(4);
    expect(res.staging.filter((n: string) => n !== '.lekta-corpus-kind').every((n: string) => /^pdf-[0-9a-f]{16}\.docx$/.test(n))).toBe(true);
    expect(res.marker.trim()).toBe('public-pdf-converted');
    expect(res.coreEmpty).toBe(true);
    expect(res.leaks).toEqual([]);
    // Private mapa: zapisi s PID-om, URL-om i sha256, izvjestaji; PDF je obrisan (nema --keep-pdf).
    expect(res.private.filter((n: string) => n.endsWith('.pdf'))).toEqual([]);
    expect(res.private.filter((n: string) => n.startsWith('records/'))).toEqual([
      'records/unizd/diplomski/unizd_101.json', 'records/unizd/diplomski/unizd_102.json', 'records/unizd/zavrsni/unizd_103.json',
    ]);
    expect(res.record).toMatchObject({
      pid: 'unizd:101', repository: 'repozitorij.unizd.hr', sourceKind: 'public-pdf-converted', pdfKept: false, converter: 'fake/1',
      id: `pdf-${res.pdfSha.slice(0, 16)}`, pdfSha256: res.pdfSha, finalUrl: 'https://repozitorij.unizd.hr/islandora/object/unizd:101/datastream/PDF',
    });
    expect(res.uas).toEqual([UA]);
    expect(existsSync(join(dir, 'report.json'))).toBe(true);
  });

  it('odbija stari oblik (niz) i objekt bez picked s izlazom 2, prije ikakvog dohvata', () => {
    const dir = tmp();
    const korijeni = ['--staging-dir', join(dir, 'staging'), '--private-dir', join(dir, 'private')];
    writeFileSync(join(dir, 'niz.json'), JSON.stringify([{ pid: 'unizd:1', repository: 'repozitorij.unizd.hr', unitId: 'unizd', level: 'diplomski' }]));
    const niz = cli(['--pids-file', join(dir, 'niz.json'), ...korijeni]);
    expect(niz.status).toBe(2);
    expect(niz.stderr).toMatch(/objekt s listom 'picked'; dobiven list/);
    writeFileSync(join(dir, 'bez.json'), JSON.stringify({ host: 'repozitorij.unizd.hr', records: [] }));
    const bez = cli(['--pids-file', join(dir, 'bez.json'), ...korijeni]);
    expect(bez.status).toBe(2);
    expect(bez.stderr).toMatch(/picked/);
    writeFileSync(join(dir, 'kvar.json'), '{"picked": [');
    expect(cli(['--pids-file', join(dir, 'kvar.json'), ...korijeni]).status).toBe(2);
    expect(existsSync(join(dir, 'staging'))).toBe(false);
  });

  it('nevaljani zapisi (pid, host sa shemom ili portom, unitId apsolutan ili .., razina) daju izlaz 2 bez dohvata', () => {
    const dir = tmp();
    const res = py(String.raw`
bad = [
  {"pid": "UNIZD:1", "repository": HOST, "unitId": "unizd", "level": "diplomski"},
  {"pid": "unizd:2", "repository": "https://" + HOST, "unitId": "unizd", "level": "diplomski"},
  {"pid": "unizd:3", "repository": HOST + ":8443", "unitId": "unizd", "level": "diplomski"},
  {"pid": "unizd:4", "repository": HOST + "/oai", "unitId": "unizd", "level": "diplomski"},
  {"pid": "unizd:5", "repository": HOST, "unitId": "/etc", "level": "diplomski"},
  {"pid": "unizd:6", "repository": HOST, "unitId": "..", "level": "diplomski"},
  {"pid": "unizd:7", "repository": HOST, "unitId": "unizd", "level": "seminar"},
  "nije objekt",
]
f = os.path.join(D, "bad.json")
json.dump({"unitId": "unizd", "host": HOST, "picked": [rec(100)] + bad}, open(f, "w"))
r = run([f], {url(100): [pdf()]})
out({"code": r["code"], "calls": len(r["calls"]), "report": r["report"], "staging": os.path.exists(STAGING)})
`, dir);
    expect(res.code).toBe(2);
    expect(res.calls).toBe(0);
    expect(res.staging).toBe(false);
    const invalid = res.report.records.filter((e: { status: string }) => e.status === 'invalid');
    expect(invalid.map((e: { index: number }) => e.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const razlozi = invalid.map((e: { reason: string }) => e.reason).join('\n');
    for (const dio of ["pid 'UNIZD:1'", "repository 'https://", ":8443'", "/oai'", "unitId '/etc'", "unitId '..'", "level 'seminar'", 'zapis nije objekt']) {
      expect(razlozi).toContain(dio);
    }
  });

  it('prazan izbor daje izlaz 2', () => {
    const dir = tmp();
    const res = py(String.raw`
r = run([discovery(os.path.join(D, "prazno.json"), [])], {})
out({"code": r["code"], "calls": len(r["calls"])})
`, dir);
    expect(res).toEqual({ code: 2, calls: 0 });
  });

  it('odbija korijen unutar repozitorija, preklapanje staginga i private mape te --per-cell i --max-total izvan raspona', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'd.json'), JSON.stringify({ host: 'repozitorij.unizd.hr', unitId: 'unizd', picked: [] }));
    const baza = (staging: string, priv: string, ...extra: string[]) =>
      cli(['--pids-file', join(dir, 'd.json'), '--staging-dir', staging, '--private-dir', priv, ...extra]);
    const uRepo = baza(join(REPO, 'tmp-pdf-korpus'), join(dir, 'p'));
    expect(uRepo.status).toBe(2);
    expect(uRepo.stderr).toMatch(/--staging-dir: .*unutar repozitorija/);
    expect(baza(join(dir, 's'), join(REPO, 'tmp-pdf-private')).stderr).toMatch(/--private-dir: .*unutar repozitorija/);
    expect(baza(join(dir, 's'), join(dir, 'p'), '--report', join(REPO, 'izvjestaj.json')).stderr).toMatch(/--report: .*unutar repozitorija/);
    expect(baza(join(dir, 's'), join(dir, 's', 'private')).stderr).toMatch(/preklapaju/);
    expect(baza(join(dir, 's'), join(dir, 'p'), '--report', join(dir, 's', 'r.json')).stderr).toMatch(/staging/);
    for (const [flag, v] of [['--per-cell', '0'], ['--per-cell', '11'], ['--max-total', '0'], ['--max-total', '501']]) {
      const r = baza(join(dir, 's'), join(dir, 'p'), flag, v);
      expect(r.status, `${flag} ${v}`).toBe(2);
      expect(r.stderr).toContain(flag);
    }
    expect(existsSync(join(REPO, 'tmp-pdf-korpus'))).toBe(false);
    expect(existsSync(join(REPO, 'tmp-pdf-private'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('simbolicka poveznica u izlazu obara zapis, a cilj poveznice ostaje netaknut', () => {
    const dir = tmp();
    const cilj = tmp('lekta-pdf-cilj-');
    mkdirSync(join(dir, 'private'), { recursive: true });
    symlinkSync(cilj, join(dir, 'private', 'records'));
    const privat = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {url(1): [pdf()]})
out({"code": r["code"], "records": r["report"]["records"]})
`, dir);
    expect(privat.code).toBe(1);
    expect(privat.records[0]).toMatchObject({ pid: 'unizd:1', status: 'failed', stage: 'path' });
    expect(privat.records[0].reason).toMatch(/simbolicka poveznica/);
    expect(readdirSync(cilj)).toEqual([]);

    // Poveznica na mjestu staging DOCX-a: upis se odbija, datoteka na koju pokazuje se ne mijenja.
    const dir2 = tmp();
    const meta = join(cilj, 'meta.docx');
    writeFileSync(meta, 'izvorno');
    const id = py('out("pdf-" + h.sha256(PDF)[:16])');
    mkdirSync(join(dir2, 'staging'), { recursive: true });
    symlinkSync(meta, join(dir2, 'staging', `${id}.docx`));
    const stag = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {url(1): [pdf()]})
out({"code": r["code"], "records": r["report"]["records"]})
`, dir2);
    expect(stag.code).toBe(1);
    expect(stag.records[0]).toMatchObject({ status: 'failed', stage: 'path' });
    expect(readFileSync(meta, 'utf8')).toBe('izvorno');

    // Poveznica UNUTAR korijena (records -> druga mapa u istom korijenu) prolazi provjeru razrijesene putanje;
    // hvata je tek provjera svake komponente.
    const dir4 = tmp();
    mkdirSync(join(dir4, 'private', 'druga'), { recursive: true });
    symlinkSync(join(dir4, 'private', 'druga'), join(dir4, 'private', 'records'));
    const unutra = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {url(1): [pdf()]})
out({"code": r["code"], "records": r["report"]["records"]})
`, dir4);
    expect(unutra.code).toBe(1);
    expect(unutra.records[0]).toMatchObject({ status: 'failed', stage: 'path' });
    expect(readdirSync(join(dir4, 'private', 'druga'))).toEqual([]);

    // Sam korijen kao poveznica: izlaz 2 prije dohvata.
    const dir3 = tmp();
    symlinkSync(cilj, join(dir3, 'staging'));
    const korijen = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {url(1): [pdf()]})
out({"code": r["code"], "calls": len(r["calls"])})
`, dir3);
    expect(korijen).toEqual({ code: 2, calls: 0 });
  });

  it('segmenti putanja: apsolutna putanja, .., kosa crta i rezervirana imena se odbijaju prije upisa', () => {
    const res = py(String.raw`
import tempfile
root = tempfile.mkdtemp()
bad = []
for seg in ("/etc/passwd", "..", "a/b", "a\\b", "", "CON", "nul.docx", ".."):
    try:
        h.safe_write(root, ("records", seg), b"x")
    except h.PathError:
        bad.append(seg)
out({"bad": bad, "tree": tree(root)})
`);
    expect(res.bad).toEqual(['/etc/passwd', '..', 'a/b', 'a\\b', '', 'CON', 'nul.docx', '..']);
    expect(res.tree).toEqual([]);
  });

  describe('mrezni odgovori (lazni transport)', () => {
    it('429 s Retry-After (sekunde i HTTP datum) ceka zadano vrijeme i ponavlja', () => {
      const dir = tmp();
      const res = py(String.raw`
from email.utils import formatdate
routes = {url(1): [lambda: Resp(429, {"Retry-After": "7"}), pdf()],
          url(2): [lambda: Resp(503, {"Retry-After": formatdate(1_800_000_000 + 30, usegmt=True)}), pdf(PDF + b"2")]}
r = run([discovery(os.path.join(D, "d.json"), [rec(1), rec(2)])], routes)
out({"code": r["code"], "sleeps": r["sleeps"], "statuses": [e["status"] for e in r["report"]["records"]]})
`, dir);
      expect(res.code).toBe(0);
      expect(res.statuses).toEqual(['ok', 'ok']);
      expect(res.sleeps).toContain(7);
      expect(res.sleeps).toContain(30);
    });

    it('Retry-After iznad gornje granice obara zapis bez daljnjih pokusaja', () => {
      const dir = tmp();
      const res = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {url(1): [lambda: Resp(429, {"Retry-After": "3600"})]})
out({"code": r["code"], "calls": len(r["calls"]), "sleeps": r["sleeps"], "rec": r["report"]["records"][0]})
`, dir);
      expect(res.code).toBe(1);
      expect(res.calls).toBe(1);
      expect(res.sleeps).toEqual([]);
      expect(res.rec.reason).toMatch(/iznad granice/);
    });

    it('prevelik odgovor (Content-Length i strujno citanje), pogresan Content-Type i ne-PDF se odbijaju', () => {
      const dir = tmp();
      const res = py(String.raw`
mb = b"%PDF-" + b"x" * (1024 * 1024 - 5)
routes = {
  url(1): [lambda: Resp(200, {"Content-Type": "application/pdf", "Content-Length": str(70 * 1024 * 1024)}, PDF)],
  url(2): [lambda: Resp(200, {"Content-Type": "application/pdf"}, chunks=[mb] * 61)],
  url(3): [pdf(ctype="text/html")],
  url(4): [pdf(body=b"<html>prijava</html>")],
  url(5): [pdf(ctype="application/pdf; charset=binary")],
}
r = run([discovery(os.path.join(D, "d.json"), [rec(i) for i in range(1, 6)])], routes)
out({"code": r["code"], "recs": [(e["pid"], e["status"], e.get("reason", "")) for e in r["report"]["records"]], "staging": tree(STAGING)})
`, dir);
      expect(res.code).toBe(1);
      const po = Object.fromEntries(res.recs.map(([pid, status, reason]: string[]) => [pid, { status, reason }]));
      expect(po['unizd:1'].reason).toMatch(/prevelik odgovor \(Content-Length/);
      expect(po['unizd:2'].reason).toMatch(/prevelik odgovor \(> 62914560/);
      expect(po['unizd:3'].reason).toMatch(/Content-Type text\/html nije PDF/);
      expect(po['unizd:4'].reason).toMatch(/ne pocinje s %PDF/);
      expect(po['unizd:5'].status).toBe('ok');
      expect(res.staging).toHaveLength(2);
    });

    it('najvise 5 preusmjeravanja, samo https, cekanje po STVARNOM hostu i posten User-Agent', () => {
      const dir = tmp();
      const res = py(String.raw`
cdn = "https://cdn.unizd.hr/f/"
routes = {url(1): [redirect(cdn + "1")], cdn + "1": [pdf(PDF + b"1")],
          url(2): [redirect(cdn + "2")], cdn + "2": [pdf(PDF + b"2")],
          url(3): [redirect(cdn + "3a")]}
for i, nxt in enumerate(["3b", "3c", "3d", "3e"]):
    routes[cdn + "3" + "abcd"[i]] = [redirect(cdn + nxt)]
routes[cdn + "3e"] = [pdf(PDF + b"3")]
routes[url(4)] = [redirect(url(4) + "/x")]
for i in range(6):
    routes[url(4) + "/" + "xyzuvw"[i]] = [redirect(url(4) + "/" + "xyzuvwq"[i + 1])]
routes[url(5)] = [redirect("http://cdn.unizd.hr/f/5")]
r = run([discovery(os.path.join(D, "d.json"), [rec(i) for i in range(1, 6)])], routes)
by_host = {}
for c in r["calls"]:
    by_host.setdefault(c["url"].split("/")[2], []).append(c["t"])
gaps = {k: min([b - a for a, b in zip(v, v[1:])] or [999]) for k, v in by_host.items()}
out({"code": r["code"], "recs": [(e["pid"], e["status"], e.get("reason", "")) for e in r["report"]["records"]], "gaps": gaps,
     "uas": sorted({c["ua"] for c in r["calls"]}), "first": [c["t"] for c in r["calls"][:2]], "hosts": sorted(by_host)})
`, dir);
      const po = Object.fromEntries(res.recs.map(([pid, status, reason]: string[]) => [pid, { status, reason }]));
      expect(po['unizd:1'].status).toBe('ok');
      expect(po['unizd:2'].status).toBe('ok');
      // Tocno 5 preusmjeravanja (3 -> 3a ... 3e) je dopusteno, sesto (zapis 4) nije.
      expect(po['unizd:3'].status).toBe('ok');
      expect(po['unizd:4'].reason).toMatch(/previse preusmjeravanja/);
      expect(po['unizd:5'].reason).toMatch(/ne-https/);
      expect(res.code).toBe(1);
      expect(res.hosts).toEqual(['cdn.unizd.hr', 'repozitorij.unizd.hr']);
      // Isti host nikad cesce od HOST_DELAY_S; drugi host (CDN) ne ceka na prvi.
      expect(res.gaps['cdn.unizd.hr']).toBeGreaterThanOrEqual(3);
      expect(res.gaps['repozitorij.unizd.hr']).toBeGreaterThanOrEqual(3);
      expect(res.first[0]).toBe(res.first[1]);
      expect(res.uas).toEqual([UA]);
    });

    it('ukupni timeout po zapisu prekida i preostale oblike URL-a', () => {
      const dir = tmp();
      const res = py(String.raw`
r = run([discovery(os.path.join(D, "d.json"), [rec(1)])], {}, cost=200.0)
out({"code": r["code"], "calls": len(r["calls"]), "rec": r["report"]["records"][0]})
`, dir);
      expect(res.code).toBe(1);
      expect(res.calls).toBe(2);
      expect(res.rec.reason).toMatch(/ukupni timeout zapisa/);
    });
  });

  it('djelomican pad: izlaz 1, izvjestaj imenuje svaki zapis, pala pretvorba ne ostavlja ni PDF ni DOCX', () => {
    const dir = tmp();
    const res = py(String.raw`
routes = {url(1): [pdf(PDF + b"1")], url(3): [pdf(PDF + b"3")]}
def convert(pdf_path, docx_path):
    if h.sha256(open(pdf_path, "rb").read()) == h.sha256(PDF + b"3"):
        raise h.ConvertError("skenirani PDF")
    fake_convert(pdf_path, docx_path)
r = run([discovery(os.path.join(D, "d.json"), [rec(1), rec(2), rec(3)])], routes, convert=convert)
out({"code": r["code"], "recs": [(e["pid"], e["status"], e.get("stage")) for e in r["report"]["records"]],
     "summary": r["report"]["summary"], "staging": tree(STAGING), "private": tree(PRIVATE)})
`, dir);
    expect(res.code).toBe(1);
    expect(res.recs).toEqual([['unizd:1', 'ok', null], ['unizd:2', 'failed', 'fetch'], ['unizd:3', 'failed', 'convert']]);
    expect(res.summary).toEqual({ ok: 1, failed: 2 });
    expect(res.staging).toHaveLength(2);
    expect(res.private).toEqual(['records/unizd/diplomski/unizd_1.json']);
  });

  it('preskace samo kad zapis i staging DOCX postoje i sha256 odgovara; inace ponovo preuzima', () => {
    const dir = tmp();
    const res = py(String.raw`
f = discovery(os.path.join(D, "d.json"), [rec(1), rec(2)])
routes = {url(1): [pdf(PDF + b"1")], url(2): [pdf(PDF + b"2")]}
first = run([f], routes)
second = run([f], routes)
ident = "pdf-" + h.sha256(PDF + b"1")[:16]
with open(os.path.join(STAGING, ident + ".docx"), "ab") as fh:
    fh.write(b"izmjena")
third = run([f], routes)
os.remove(os.path.join(PRIVATE, "records", "unizd", "diplomski", "unizd_2.json"))
fourth = run([f], routes)
fifth = run([f], routes, converter="fake/2")
st = lambda r: [e["status"] for e in r["report"]["records"]]
out({"first": [first["code"], st(first)], "second": [second["code"], st(second), len(second["calls"])],
     "third": st(third), "fourth": st(fourth), "fifth": st(fifth)})
`, dir);
    expect(res.first).toEqual([0, ['ok', 'ok']]);
    // Drugi prolaz je no-op: nijedan zahtjev.
    expect(res.second).toEqual([0, ['skipped', 'skipped'], 0]);
    expect(res.third).toEqual(['ok', 'skipped']);
    expect(res.fourth).toEqual(['skipped', 'ok']);
    // DOCX je vezan uz verziju alata: druga verzija pretvara ponovo.
    expect(res.fifth).toEqual(['ok', 'ok']);
  });

  it('--keep-pdf zadrzava izvorni PDF samo u private mapi; --per-cell i --max-total ogranicavaju izbor', () => {
    const dir = tmp();
    const res = py(String.raw`
f = discovery(os.path.join(D, "d.json"), [rec(1), rec(2), rec(3, "zavrsni"), rec(4, "zavrsni"), rec(5, "doktorski")])
routes = {url(i): [pdf(PDF + str(i).encode())] for i in range(1, 6)}
r = run([f], routes, extra=["--keep-pdf", "--per-cell", "1", "--max-total", "2"])
ident = "pdf-" + h.sha256(PDF + b"1")[:16]
out({"code": r["code"], "recs": [(e["pid"], e["status"], e.get("reason")) for e in r["report"]["records"]],
     "kept": open(os.path.join(PRIVATE, "pdf", ident + ".pdf"), "rb").read() == PDF + b"1",
     "stagingPdf": [n for n in tree(STAGING) if n.endswith(".pdf")]})
`, dir);
    expect(res.code).toBe(0);
    expect(res.recs).toEqual([
      ['unizd:1', 'ok', null], ['unizd:3', 'ok', null],
      ['unizd:2', 'not-selected', '--per-cell 1'], ['unizd:4', 'not-selected', '--per-cell 1'], ['unizd:5', 'not-selected', '--max-total 2'],
    ]);
    expect(res.kept).toBe(true);
    expect(res.stagingPdf).toEqual([]);
  });

  it('pretvorba u podprocesu: vremensko ogranicenje i (POSIX) ogranicenje memorije obaraju zapis', () => {
    const res = py(String.raw`
import time
r = {}
t0 = time.monotonic()
try:
    h.run_limited([sys.executable, "-c", "while True: pass"], timeout=1)
except h.ConvertError as e:
    r["timeout"] = str(e)
r["elapsed"] = time.monotonic() - t0
if os.name == "posix":
    try:
        h.run_limited([sys.executable, "-c", "b = bytearray(8 * 1024 ** 3)"], timeout=30)
    except h.ConvertError as e:
        r["memory"] = str(e)
out(r)
`);
    expect(res.timeout).toMatch(/prekinuta nakon 1 s/);
    expect(res.elapsed).toBeLessThan(10);
    if (process.platform !== 'win32') expect(res.memory).toMatch(/pretvorba pala \(izlaz 1\).*MemoryError/);
  });
});

/**
 * Lanac nakon harvesta, bez Pythona: ingest upisuje vrstu izvora u sidecar, mjerenje --only-root je prenosi u
 * svaki rezultat, a ovjera odbija mjesovitu vrstu. DOCX je commitana anonimna fixture, ne stvaran rad.
 */
describe('PDF korpus: corpus-ingest -> repair-real-corpus --only-root -> attest-real-corpus', () => {
  const VITE_NODE = join(REPO, 'node_modules', '.bin', process.platform === 'win32' ? 'vite-node.cmd' : 'vite-node');
  const viteNode = (script: string, args: string[]) =>
    spawnSync(VITE_NODE, [join(REPO, 'scripts', script), '--', ...args], { encoding: 'utf8', cwd: REPO, shell: process.platform === 'win32' });
  const attest = (input: string, kind: string, out: string) =>
    spawnSync(process.execPath, ['scripts/attest-real-corpus.mjs', '--source-kind', kind], {
      encoding: 'utf8',
      cwd: REPO,
      env: { ...process.env, LEKTA_ATTEST_INPUT: input, LEKTA_ATTEST_OUTPUT: out },
    });

  it('vrsta izvora ide od ingesta do ovjere, a mjesavina se odbija', () => {
    const dir = tmp();
    const staging = join(dir, 'staging');
    mkdirSync(staging);
    writeFileSync(join(staging, '.lekta-corpus-kind'), 'public-pdf-converted\n');
    copyFileSync(join(REPO, 'tests', 'fixtures', 'docx', 'fer-diplomski-uskladjen.docx'), join(staging, 'pdf-0123456789abcdef.docx'));
    const consent = join(dir, 'consent.json');
    writeFileSync(consent, JSON.stringify({
      consentId: 'test-a-pdf', scope: 'local-testing', grantedAt: '2026-09-28', verifiedBy: 'test', covers: { mode: 'directory', path: staging },
    }));
    const ingest = (out: string, ...kind: string[]) => viteNode('corpus-ingest.mts', ['--in', staging, '--out', join(dir, out), '--consent', consent, ...kind]);

    // Ingest: vrsta je obavezna i mora se slagati s oznakom staging mape.
    const bezVrste = ingest('i0');
    expect(bezVrste.status).toBe(2);
    expect(bezVrste.stderr).toMatch(/obavezno --source-kind/);
    const kriva = ingest('i1', '--source-kind', 'source-docx');
    expect(kriva.status).toBe(2);
    expect(kriva.stderr).toMatch(/izjasnjava kao "public-pdf-converted"/);
    const ok = ingest('ingest', '--source-kind', 'public-pdf-converted');
    expect(ok.status, ok.stderr).toBe(0);
    const sidecari = readdirSync(join(dir, 'ingest')).filter((n) => n.endsWith('.json'));
    expect(sidecari).toHaveLength(1);
    const sidecarPut = join(dir, 'ingest', sidecari[0]);
    const sidecar = JSON.parse(readFileSync(sidecarPut, 'utf8'));
    expect(sidecar.sourceKind).toBe('public-pdf-converted');

    // Bez oznake izvora PDF vrsta se ne prihvaca (rucno sastavljena mapa nije PDF korpus).
    const bezOznake = join(dir, 'bez-oznake');
    mkdirSync(bezOznake);
    const bo = viteNode('corpus-ingest.mts', ['--in', bezOznake, '--out', join(dir, 'i2'), '--consent', consent, '--source-kind', 'public-pdf-converted']);
    expect(bo.status).toBe(2);
    expect(bo.stderr).toMatch(/trazi izvor s oznakom/);

    // Fixture nema prepoznatljivu naslovnicu; profil se dodjeljuje rucno, kao sto ingest i trazi.
    writeFileSync(sidecarPut, JSON.stringify({ ...sidecar, profileId: 'fer-diplomski' }));
    const report = join(dir, 'mjerenje.json');
    const mj = viteNode('repair-real-corpus.mts', ['--only-root', join(dir, 'ingest'), '--report', report]);
    expect(mj.status, mj.stderr).toBe(0);
    const mjerenje = JSON.parse(readFileSync(report, 'utf8'));
    expect(mjerenje.scope).toMatchObject({ root: '--only-root', onlyRoot: true });
    // SAMO zadani korijen: nijedna commitana fixture ni drugi korijen.
    expect(mjerenje.results.map((r: { documentId: string; sourceKind: string }) => [r.documentId, r.sourceKind])).toEqual([
      [sidecari[0].replace(/\.json$/, ''), 'public-pdf-converted'],
    ]);
    expect(typeof mjerenje.generatedFromCommit).toBe('string');

    expect(attest(report, 'public-pdf-converted', join(dir, 'ovjera-pdf.json')).status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, 'ovjera-pdf.json'), 'utf8')).sourceKind).toBe('public-pdf-converted');
    const docx = attest(report, 'source-docx', join(dir, 'ovjera-docx.json'));
    expect(docx.status).toBe(1);
    expect(docx.stderr).toMatch(/ne smije u ovjeru izvornog DOCX-a/);

    // Rezultat bez PDF sidecara (npr. fixture ili izvorni DOCX u istom mjerenju) obara PDF ovjeru.
    const mijesano = { ...mjerenje, results: [...mjerenje.results, { ...mjerenje.results[0], documentId: 'fixture-bez-vrste', sourceKind: null }] };
    writeFileSync(report, JSON.stringify(mijesano));
    const mix = attest(report, 'public-pdf-converted', join(dir, 'ovjera-mix.json'));
    expect(mix.status).toBe(1);
    expect(mix.stderr).toMatch(/1 rezultata nema sourceKind public-pdf-converted/);
    expect(existsSync(join(dir, 'ovjera-mix.json'))).toBe(false);

    // Prazan mjerni korijen nije uspjeh.
    const prazno = join(dir, 'prazno');
    mkdirSync(prazno);
    const pr = viteNode('repair-real-corpus.mts', ['--only-root', prazno, '--report', join(dir, 'prazno.json')]);
    expect(pr.status).toBe(1);
    expect(pr.stderr).toMatch(/nema nijedan dokument/);
  }, 180_000);
});
