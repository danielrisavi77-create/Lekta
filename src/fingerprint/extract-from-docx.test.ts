import { describe, it, expect } from 'vitest';

import { extractFingerprintInputFromDocx } from './extract-from-docx';
import { computeFingerprint, fingerprintMatch } from './fingerprint';

function doc(paragraphs: string): string {
  return `<w:document><w:body>${paragraphs}</w:body></w:document>`;
}

function p(styleId: string | null, text: string): string {
  const pStyle = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
  return `<w:p>${pStyle}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const STYLES_LITERAL = `<w:styles>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/></w:style>
</w:styles>`;

describe('extractFingerprintInputFromDocx', () => {
  it('izvlaci H1/H2 po doslovnom styleId-u, ignorira H3+', () => {
    const xml = doc(
      p('Heading1', 'Uvod') + p(null, 'Obican tekst') + p('Heading2', 'Pozadina') + p('Heading3', 'Podpoglavlje'),
    );
    const out = extractFingerprintInputFromDocx(xml, STYLES_LITERAL);
    expect(out.title).toBeNull();
    expect(out.author).toBeNull();
    expect(out.headings).toEqual([
      { level: 1, text: 'Uvod' },
      { level: 2, text: 'Pozadina' },
    ]);
  });

  it('prepoznaje lokalizirani stil preko w:name kad styleId nije doslovno Heading/Naslov', () => {
    const styles = `<w:styles><w:style w:type="paragraph" w:styleId="Odlomak5"><w:name w:val="Naslov 1"/></w:style></w:styles>`;
    const xml = doc(p('Odlomak5', 'Zakljucak'));
    expect(extractFingerprintInputFromDocx(xml, styles).headings).toEqual([{ level: 1, text: 'Zakljucak' }]);
  });

  it('odlomak bez stila (obican tekst) se preskace', () => {
    const xml = doc(p(null, 'Samo tekst'));
    expect(extractFingerprintInputFromDocx(xml, STYLES_LITERAL).headings).toEqual([]);
  });

  it('naslov bez teksta (prazan <w:t>) se preskace', () => {
    const xml = doc(p('Heading1', ''));
    expect(extractFingerprintInputFromDocx(xml, STYLES_LITERAL).headings).toEqual([]);
  });

  it('P-B: samozatvarajuci prazan odlomak PRIJE naslova ne guta ga kroz lazy regex', () => {
    const xml = doc('<w:p/>' + p('Heading1', 'Uvod'));
    expect(extractFingerprintInputFromDocx(xml, STYLES_LITERAL).headings).toEqual([{ level: 1, text: 'Uvod' }]);
  });

  it('P-B: samozatvarajuci prazan STIL prije Heading stila ne guta ga kroz lazy regex', () => {
    const styles = `<w:styles>
      <w:style w:type="paragraph" w:styleId="Prazan"/>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
    </w:styles>`;
    const xml = doc(p('Heading1', 'Uvod'));
    expect(extractFingerprintInputFromDocx(xml, styles).headings).toEqual([{ level: 1, text: 'Uvod' }]);
  });

  it('isti stvarni sadrzaj uvijek daje isti rezultat (deterministicnost bitna za slot-match)', () => {
    const xml = doc(p('Heading1', 'Uvod') + p('Heading2', 'Metoda'));
    const a = extractFingerprintInputFromDocx(xml, STYLES_LITERAL);
    const b = extractFingerprintInputFromDocx(xml, STYLES_LITERAL);
    expect(a).toEqual(b);
  });

  it('prazan document.xml/styles.xml ne baca, vraca prazne naslove', () => {
    expect(extractFingerprintInputFromDocx('', '')).toEqual({ title: null, author: null, headings: [] });
  });

  describe('naslov iz naslovnica-zone (odlomci PRIJE prvog naslova)', () => {
    it('bira najduzi odlomak prije prvog naslova kao naslov (institucija/ime su krace linije)', () => {
      const xml = doc(
        p(null, 'Sveučilište u Zagrebu') +
        p(null, 'Utjecaj klimatskih promjena na obalne ekosustave Jadranskog mora') +
        p(null, 'Ivan Ivić') +
        p('Heading1', 'Sažetak'),
      );
      const out = extractFingerprintInputFromDocx(xml, STYLES_LITERAL);
      expect(out.title).toBe('Utjecaj klimatskih promjena na obalne ekosustave Jadranskog mora');
    });

    it('odlomci NAKON prvog naslova se ne racunaju u naslov (naslovnica-zona je zavrsila)', () => {
      const xml = doc(
        p(null, 'Kratak') +
        p('Heading1', 'Sažetak') +
        p(null, 'Ovo je puno duzi tekst sazetka koji NE smije postati naslov rada jer je vec u tijelu.'),
      );
      expect(extractFingerprintInputFromDocx(xml, STYLES_LITERAL).title).toBe('Kratak');
    });

    it('bez ijednog odlomka prije prvog naslova (nema naslovnice u fixturi) -> title null', () => {
      const xml = doc(p('Heading1', 'Sažetak') + p(null, 'Tekst'));
      expect(extractFingerprintInputFromDocx(xml, STYLES_LITERAL).title).toBeNull();
    });
  });

  describe('RE-18: integracija s computeFingerprint/fingerprintMatch (stvarni sigurnosni cilj)', () => {
    // Hrvatski diplomski/zavrsni radovi gotovo UVIJEK dijele identicnu pocetnu poglavlja
    // (Sažetak/Uvod/Zaključak/Literatura): bez razlikovnog naslova, sequenceSimilarity sama
    // kolabira DVA POSVE RAZLICITA rada u isti otisak (empirijski dokazano na pravim fixturama
    // prije ovog fixa). Naslov iz naslovnica-zone je ono sto ih razlikuje.
    const genericBody = (title: string) => doc(
      p(null, 'Sveučilište u Zagrebu') + p(null, title) + p(null, 'Student') +
      p('Heading1', 'Sažetak') + p('Heading1', 'Uvod') + p('Heading1', 'Zaključak') + p('Heading1', 'Literatura'),
    );

    it('dva razlicita rada s istim genericim poglavljima NE match-aju (razliciti naslovi)', () => {
      const a = computeFingerprint(extractFingerprintInputFromDocx(genericBody('Analiza tržišta rada u Hrvatskoj'), STYLES_LITERAL));
      const b = computeFingerprint(extractFingerprintInputFromDocx(genericBody('Utjecaj digitalizacije na malo poduzetništvo'), STYLES_LITERAL));
      expect(fingerprintMatch(a, b)).toBe(false);
    });

    it('isti rad (ponovna analiza) I DALJE match-a preko istog naslova', () => {
      const xml = genericBody('Analiza tržišta rada u Hrvatskoj');
      const a = computeFingerprint(extractFingerprintInputFromDocx(xml, STYLES_LITERAL));
      const b = computeFingerprint(extractFingerprintInputFromDocx(xml, STYLES_LITERAL));
      expect(fingerprintMatch(a, b)).toBe(true);
    });
  });
});
