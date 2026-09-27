// Mjerenje za PR #168 nalaz #14: koliko xmldom 0.9.12 dijagnostika postoji nad stvarnim .docx
// datotekama. onError SAMO BROJI (ne baca). Ispis sadrzi samo brojeve, imena datoteka i poruke bez
// citiranog sadrzaja. Pokretanje iz korijena Lekta checkouta s node_modules:
//   node xmldom-mjerenje.cjs tests C:\Users\PC\Desktop\Lekta-korpus > rezultat.json
// Drugi node_modules: LEKTA_NM=D:/neki/checkout/node_modules
const path = require('path');
const fs = require('fs');
const NM = (process.env.LEKTA_NM || path.join(process.cwd(), 'node_modules')).replace(/\\/g, '/').replace(/\/?$/, '/');
const { DOMParser } = require(NM + '@xmldom/xmldom');
const yauzl = require(NM + 'yauzl');

const roots = process.argv.slice(2);
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(p); }
    else if (/\.docx$/i.test(e.name) && !e.name.startsWith('~$')) files.push(p);
  }
};
for (const r of roots) walk(r);

// Dijelovi koje analiza cita (analyze-docx, parser, quick-stats, app): fiksni + zaglavlja/podnozja iz rels.
const ANALYZED = /^(word\/(document|styles|numbering|footnotes|endnotes)\.xml|word\/theme\/theme1\.xml|word\/_rels\/document\.xml\.rels|docProps\/(core|app)\.xml|word\/(header|footer)\d*\.xml)$/;
const bucket = (n) => /^word\/(document|styles|footnotes)\.xml$/.test(n) ? n.slice(5) : 'ostalo';
// Pravilo parseXml iz PR #168 na 2a281acf (src/docx/parser.ts), prepisano doslovno:
// DTD se odbija; goli `&` (izvan CDATA i komentara) se odbija; xmldom dijagnostika odbija osim
// warninga za U+FFFD (xmlDiagnosticRejects).
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/;
const CDATA_OR_COMMENT = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g;
const xmlDiagnosticRejects = (level, message) => {
  if (level === 'error' || level === 'fatalError') return true;
  if (level === 'warning') return !/unicode replacement character/i.test(String(message ?? ''));
  return false;
};
/** Razlog odbijanja po pravilu 2a281acf, ili null. Redoslijed kao u parseXml. */
const prRazlog = (xml, hits) => {
  if (/<!DOCTYPE/i.test(xml)) return 'dtd';
  if (BARE_AMPERSAND.test(xml.replace(CDATA_OR_COMMENT, ''))) return 'goli-amp';
  if (hits.some(([l, m]) => xmlDiagnosticRejects(l, m))) return 'dijagnostika';
  return null;
};
// Poruka bez sadrzaja dokumenta: navodnici, brojevi i dugi tokeni se maskiraju.
const norm = (m) => String(m).split('\n')[0].replace(/"[^"]*"|'[^']*'/g, '"…"').replace(/\d+/g, 'N').replace(/@#\[line:N,col:N\]/g, '').slice(0, 110).trim();

const readZip = (f) => new Promise((res, rej) => {
  yauzl.open(f, { lazyEntries: true }, (err, zip) => {
    if (err) return rej(err);
    const parts = [];
    zip.readEntry();
    zip.on('entry', (e) => {
      if (!/\.(xml|rels)$/i.test(e.fileName)) return zip.readEntry();
      zip.openReadStream(e, (er, s) => {
        if (er) return rej(er);
        const ch = [];
        s.on('data', (c) => ch.push(c));
        s.on('end', () => { parts.push([e.fileName, Buffer.concat(ch).toString('utf8')]); zip.readEntry(); });
      });
    });
    zip.on('end', () => res(parts));
    zip.on('error', rej);
  });
});

(async () => {
  const perDoc = [];
  const byLevel = {}, byBucket = {}, byMsg = new Map(), prPoDijelu = {};
  let notZip = 0;
  for (const f of files) {
    let parts;
    try { parts = await readZip(f); } catch { notZip++; perDoc.push({ f, notZip: true }); continue; }
    const d = { f, analyzed: { warning: 0, error: 0, fatalError: 0 }, other: 0, pr: {} };
    for (const [name, xml] of parts) {
      const hits = [];
      try {
        new DOMParser({ onError: (level, msg) => hits.push([level, msg]) }).parseFromString(xml, 'application/xml');
      } catch (e) { if (!hits.some(([l]) => l === 'fatalError')) hits.push(['fatalError', e && e.message]); }
      if (ANALYZED.test(name)) {
        const r = prRazlog(xml, hits);
        if (r) {
          d.pr[r] = (d.pr[r] || 0) + 1;
          const key = `${r} | ${bucket(name)}`;
          prPoDijelu[key] = (prPoDijelu[key] || 0) + 1;
        }
      }
      for (const [level, msg] of hits) {
        byLevel[level] = (byLevel[level] || 0) + 1;
        const b = bucket(name); byBucket[b] = (byBucket[b] || 0) + 1;
        const k = `${level} | ${norm(msg)}`;
        const cur = byMsg.get(k) || { n: 0, docs: new Set(), parts: new Set() };
        cur.n++; cur.docs.add(path.basename(f)); cur.parts.add(name.replace(/\d+\.xml$/, 'N.xml'));
        byMsg.set(k, cur);
        if (ANALYZED.test(name)) d.analyzed[level] = (d.analyzed[level] || 0) + 1; else d.other++;
      }
    }
    perDoc.push(d);
  }
  const ok = perDoc.filter((d) => !d.notZip);
  const rejected = ok.filter((d) => d.analyzed.warning + d.analyzed.error + d.analyzed.fatalError > 0);
  const onlyWarn = rejected.filter((d) => d.analyzed.error === 0 && d.analyzed.fatalError === 0);
  const prOdbijeni = ok.filter((d) => Object.keys(d.pr).length > 0);
  const top = [...byMsg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10)
    .map(([k, v]) => ({ poruka: k, puta: v.n, dokumenata: v.docs.size, dijelovi: [...v.parts].slice(0, 4), primjeri: [...v.docs].slice(0, 3) }));
  console.log(JSON.stringify({
    ukupnoDatoteka: files.length, nisuZip: notZip, citljivo: ok.length,
    prOdbio: rejected.length, prOdbioSamoZbogWarninga: onlyWarn.length,
    dijagnostikePoRazini: byLevel, dijagnostikePoDijelu: byBucket,
    dokumentiSDijagnostikomSamoIzvanAnaliziranih: ok.filter((d) => d.other > 0 && !rejected.includes(d)).length,
    odbijeni: rejected.map((d) => ({ datoteka: path.relative(process.cwd(), d.f).replace(/\\/g, '/'), ...d.analyzed })),
    top10: top,
    // Pravilo parseXml na 2a281acf (DTD, goli &, dijagnostika osim U+FFFD), samo analizirani dijelovi.
    pr2a281acf: {
      odbio: prOdbijeni.length,
      odbioZbogGologAmp: prOdbijeni.filter((d) => d.pr['goli-amp']).length,
      odbioZbogDtd: prOdbijeni.filter((d) => d.pr.dtd).length,
      odbioZbogDijagnostike: prOdbijeni.filter((d) => d.pr.dijagnostika).length,
      dijeloviPoRazlogu: prPoDijelu,
      odbijeni: prOdbijeni.map((d) => ({ datoteka: path.relative(process.cwd(), d.f).replace(/\\/g, '/'), ...d.pr })),
    },
  }, null, 2));
})();
