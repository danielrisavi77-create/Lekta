/**
 * T84 R-01: otisak dokumenta mora biti linearan u duljini ulaza i ISTI kao regex izvedba koju
 * zamjenjuje (otisak veze placeni slot uz dokument, pa bi svaka razlika tiho promijenila koji
 * dokument slot pokriva).
 *
 * Jednakost: orakl je doslovna kopija stare regex izvedbe (tests/helpers/fingerprint-legacy.ts),
 * usporedba ide na svim commitanim .docx fixturama i na generiranom XML-u koji namjerno sadrzi
 * klase ulaza zbog kojih je regex bio kvadratan ili osjetljiv (tag bez `>`, element bez zatvaranja,
 * samozatvarajuci tag, ugnijezdjeni odlomak, stil bez styleId, prazne vrijednosti).
 *
 * Linearnost: dokaz je brojac rada koji skener sam vodi (deterministicki, neovisan o stroju); napad
 * od 2n smije trositi najvise 2,5x rad napada od n. Vrijeme ostaje samo grubi alarm s marginom od 1 s
 * (regex je na ~176 KB trebao 7,2 s, izmjereno 28. 9.), da spor CI ne pada lazno (Codex R2 na #230).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractFingerprintInputFromDocx } from '../src/fingerprint/extract-from-docx';
import { computeFingerprint } from '../src/fingerprint/fingerprint';
import { readZip } from '../src/repair/zip-codec';
import { adversarialInputs, legacyExtractFingerprintInputFromDocx, linearnostProblemi } from './helpers/fingerprint-legacy';

const dec = new TextDecoder();

function docxFixtures(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...docxFixtures(p));
    else if (name.endsWith('.docx')) out.push(p);
  }
  return out;
}

describe('otisak: linearni skener daje isto sto i regex', () => {
  // Codex R1 na #230: `>` unutar vrijednosti styleId. Regex vrijednost `[^"]*` prelazi `>`, pa je
  // prvi stil samozatvarajuci i Heading1 je zaseban stil; skener koji tag zavrsi prvim `>` spojio
  // bi ih i izgubio naslov. Provjerava se i KONACNI otisak, jer on veze placeni slot.
  it.each([
    ['> u styleId samozatvarajuceg stila', '<w:style w:styleId="Custom>Id"/><w:style w:styleId="Heading1"></w:style>'],
    ['> u styleId otvorenog stila', '<w:style w:styleId="A>B"><w:name w:val="x"/></w:style><w:style w:styleId="Heading1"/>'],
    ['> izvan navodnika iza styleId', '<w:style w:styleId="C" w:x="a>b"/><w:style w:styleId="Heading1"/>'],
    ['jednostruki navodnici (regex ih ne prepoznaje)', "<w:style w:styleId='Heading1'/><w:style w:styleId=\"Heading1\"/>"],
    ['> u vrijednosti w:name', '<w:style w:styleId="S1"><w:name w:val="heading>1"/><w:name w:val="heading 1"/></w:style>'],
  ])('%s', (_ime, styles) => {
    const doc = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>'
      + '<w:p w:x="a>b"><w:pPr><w:pStyle w:val="S1"/></w:pPr><w:r><w:t w:y="c>d">Metoda</w:t></w:r></w:p>';
    const novi = extractFingerprintInputFromDocx(doc, styles);
    const stari = legacyExtractFingerprintInputFromDocx(doc, styles);
    expect(novi).toEqual(stari);
    expect(computeFingerprint(novi)).toEqual(computeFingerprint(stari));
  });

  it('Codex R1 primjer: naslov Uvod ostaje u otisku', () => {
    const styles = '<w:style w:styleId="Custom>Id"/><w:style w:styleId="Heading1"></w:style>';
    const doc = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>';
    expect(extractFingerprintInputFromDocx(doc, styles).headings).toEqual([{ level: 1, text: 'Uvod' }]);
  });

  it('na svim commitanim .docx fixturama', async () => {
    const files = docxFixtures('tests/fixtures');
    let usporedjeno = 0;
    let sNaslovima = 0;
    for (const file of files) {
      let entries;
      try {
        entries = await readZip(new Uint8Array(readFileSync(file)));
      } catch {
        continue; // namjerno neispravne fixture (npr. CFB) nisu ZIP
      }
      const docXml = entries.find((e) => e.name === 'word/document.xml');
      if (!docXml) continue;
      const stylesXml = entries.find((e) => e.name === 'word/styles.xml');
      const d = dec.decode(docXml.data);
      const s = stylesXml ? dec.decode(stylesXml.data) : '';
      const novi = extractFingerprintInputFromDocx(d, s);
      const stari = legacyExtractFingerprintInputFromDocx(d, s);
      expect(novi, file).toEqual(stari);
      expect(computeFingerprint(novi), file).toEqual(computeFingerprint(stari));
      usporedjeno += 1;
      if (novi.headings.length > 0) sNaslovima += 1;
    }
    // Usporedba nije vakuumska: fixture postoje i dio njih stvarno ima naslove.
    expect(usporedjeno).toBeGreaterThan(30);
    expect(sNaslovima).toBeGreaterThan(5);
  });

  it('na generiranom XML-u koji pokriva rubne klase ulaza', () => {
    // Deterministicki PRNG (mulberry32), da je svaki pad ponovljiv.
    let seed = 0x5eed84;
    const rnd = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const docTokens = [
      '<w:p>', '<w:p/>', '<w:p ', '<w:p w:rsidR="1">', '</w:p>', '<w:pPr>', '</w:pPr>', '<w:pStyle w:val="Heading1"/>',
      '<w:pStyle w:val="Heading2"/>', '<w:pStyle w:val="Naslov3"/>', '<w:pStyle w:val=""/>', '<w:pStyle ', '<w:r>', '</w:r>',
      '<w:t>', '<w:t xml:space="preserve">', '<w:t ', '</w:t>', 'Uvod', 'Naslov rada o necemu', ' ', '>', '<', '"', '<w:tbl>',
      '<w:txbxContent>', '<w:pStyleX w:val="Heading1"/>', '<w:ps>', '<w:tab/>',
      // Cijeli valjani odlomci, da grana naslova i naslovnice stvarno radi (ne samo pokvareni tokeni).
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Metoda </w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="Odlomak5"/></w:pPr><w:r><w:t>Zakljucak</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Utjecaj digitalnih alata na akademsko pisanje</w:t></w:r></w:p>',
      // `>` unutar navodnika (Codex R1): regex ga u odlomku i w:t NE preskace, u w:val preskace.
      '<w:p w:x="a>b">', '<w:t w:y="c>d">', '<w:pStyle w:val="Head>ing1"/>', "<w:pStyle w:val='Heading1'/>",
    ];
    const styleTokens = [
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Odlomak5"><w:name w:val="Naslov 1"/></w:style>',
      '<w:style w:styleId="Heading2"/>',
      '<w:style w:styleId="Custom>Id"/>', '<w:style w:styleId="A>B">', '<w:style w:styleId="C" w:x="a>b"/>',
      "<w:style w:styleId='Heading1'/>", '<w:name w:val="heading>1"/>',
      '<w:style w:styleId="Heading1">', '<w:style w:styleId="Odlomak5">', '<w:style w:styleId="Prazan"/>', '<w:style w:styleId="">',
      '<w:style w:type="paragraph">', '<w:style ', '</w:style>', '<w:name w:val="heading 2"/>', '<w:name w:val="Naslov 1"/>',
      '<w:name ', '<w:styles>', '</w:styles>', '<w:styleX w:styleId="Heading1">', '>', '"', 'x',
    ];
    const klase = { pBezZatvaranja: 0, samozatvarajuci: 0, ugnijezdjeni: 0, stilBezStyleId: 0, tagBezVecegOd: 0, naslovi: 0, gtUNavodnicima: 0 };
    for (let i = 0; i < 3000; i++) {
      const d = Array.from({ length: 5 + Math.floor(rnd() * 60) }, () => pick(docTokens)).join('');
      const s = Array.from({ length: 3 + Math.floor(rnd() * 30) }, () => pick(styleTokens)).join('');
      const novi = extractFingerprintInputFromDocx(d, s);
      const stari = legacyExtractFingerprintInputFromDocx(d, s);
      expect(novi, JSON.stringify({ d, s })).toEqual(stari);
      expect(computeFingerprint(novi), JSON.stringify({ d, s })).toEqual(computeFingerprint(stari));
      if (d.includes('<w:p>') && d.lastIndexOf('</w:p>') < d.lastIndexOf('<w:p>')) klase.pBezZatvaranja += 1;
      if (d.includes('<w:p/>')) klase.samozatvarajuci += 1;
      if (/<w:p>(?:(?!<\/w:p>).)*<w:p>/.test(d)) klase.ugnijezdjeni += 1;
      if (s.includes('<w:style w:type="paragraph">')) klase.stilBezStyleId += 1;
      if (/<w:(?:p|t|style|pStyle|name) (?:(?!>).){0,40}</.test(d + s)) klase.tagBezVecegOd += 1;
      if (novi.headings.length > 0) klase.naslovi += 1;
      if (/="[^"]*>[^"]*"/.test(d + s)) klase.gtUNavodnicima += 1;
    }
    // Generator stvarno proizvodi ciljane klase, pa jednakost nije postignuta na trivijalnim ulazima.
    for (const [klasa, broj] of Object.entries(klase)) expect(broj, klasa).toBeGreaterThan(50);
  });
});

describe('otisak: napadacki ulazi su linearni (ratchet)', () => {
  it('brojac rada: udvostrucenje svakog napada najvise 2,5x rad i najvise 12 koraka po znaku', () => {
    expect(linearnostProblemi(extractFingerprintInputFromDocx, 20000)).toEqual([]);
  });

  it('generator napada pokriva sve ciljane oblike', () => {
    expect(adversarialInputs(1).length).toBe(11);
  });

  // Grubi alarm, ne dokaz: margina 1 s da spor CI ne pada lazno; regex je trebao 7,2 s na 176 KB.
  for (const { name, documentXml, stylesXml } of adversarialInputs(20000)) {
    it(`alarm vremena: ${name}, ~${Math.round((documentXml.length + stylesXml.length) / 1024)} KB ispod 1 s`, () => {
      const t0 = performance.now();
      extractFingerprintInputFromDocx(documentXml, stylesXml);
      expect(performance.now() - t0).toBeLessThan(1000);
    });
  }
});
