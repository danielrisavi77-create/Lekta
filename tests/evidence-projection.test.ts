import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectEvidenceEntry, buildEvidenceIndex } from '../src/profiles/evidence-projection';
import type { SourceIndex } from '../src/profiles/profile-rules-contract';

/**
 * ISPORUKA DOKAZA. Do 2026-09-03 je vrijedila odredba "evidence (drafts/ledger) NIKAD nije u
 * artefaktu"; vlasnik ju je izricito promijenio. Ovi gardovi cuvaju da promjena ostane UZ ONO STO
 * je odobreno, a ne da s vremenom pojede i ono sto nije.
 *
 * Najvazniji je gard dopusnog popisa. Draft unos nosi potpise verifikatora, kanarince, modalitet i
 * autoritet; nijedno od toga nije dokaz i nijedno ne smije izaci. Zabrana bi propustila svako NOVO
 * polje koje netko sutra doda, i to tiho, pa se gradi NOV objekt sa sest poznatih polja.
 */

const ROOT = resolve(__dirname, '..');
const INDEX: SourceIndex = { 'test-upute': { title: 'Sluzbene upute', url: 'https://example.test/u.pdf' } };

function draftEntry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'x--font', checkId: 'font', sourceId: 'test-upute',
    quote: 'Tekst se pise fontom Times New Roman.', sourcePage: 'str. 9, odjeljak 2.4',
    ...over,
  };
}

describe('projekcija dokaza', () => {
  it('DOPUSNI POPIS: nepoznata polja iz drafta NE izlaze', () => {
    // Kljucni gard cijele isporuke. Da je zabrana umjesto popisa, svako novo polje bi procurilo.
    const got = projectEvidenceEntry(draftEntry({
      verifiedBy: 'daniel', reviewedBy: 'netko', confirmedVia: 'email',
      kanarinac: 'LEKTA-KANARINAC-PROPRIETARY-DATA-abc', modality: 'obligation',
      scope: 'body', authority: 'faculty', novoPoljeIzBuducnosti: 'tajna',
    }), INDEX);
    expect(got).toBeTruthy();
    expect(Object.keys(got!).sort()).toEqual(
      ['checkId', 'quote', 'ruleId', 'source', 'sourceId', 'sourcePage'],
    );
  });

  it('potpisi verifikatora se ne pojavljuju ni u ugnijezdjenom obliku', () => {
    const got = projectEvidenceEntry(draftEntry({ verifiedBy: 'daniel' }), INDEX);
    expect(JSON.stringify(got)).not.toMatch(/verifiedBy|reviewedBy|confirmedVia|kanarinac/i);
  });

  it('bez doslovnog citata nema dokaza', () => {
    for (const quote of [undefined, null, '', '   ']) {
      expect(projectEvidenceEntry(draftEntry({ quote }), INDEX)).toBeNull();
    }
  });

  it('bez RAZRIJESENOG izvora nema dokaza, makar citat postoji', () => {
    // Citat bez atribucije tvrdi vise nego sto zna: ne kaze iz kojeg dokumenta dolazi.
    expect(projectEvidenceEntry(draftEntry({ sourceId: 'nepoznat' }), INDEX)).toBeNull();
    expect(projectEvidenceEntry(draftEntry({ sourceId: '' }), INDEX)).toBeNull();
    expect(projectEvidenceEntry(draftEntry(), {})).toBeNull();
    expect(projectEvidenceEntry(draftEntry(), { 'test-upute': { title: '', url: 'https://a' } })).toBeNull();
    expect(projectEvidenceEntry(draftEntry(), { 'test-upute': { title: 'T', url: '' } })).toBeNull();
  });

  it('bez identiteta pravila nema dokaza', () => {
    expect(projectEvidenceEntry(draftEntry({ ruleId: '' }), INDEX)).toBeNull();
    expect(projectEvidenceEntry(draftEntry({ checkId: '' }), INDEX)).toBeNull();
  });

  it('stranica se prenosi kao PROZA, nikad kao izveden broj', () => {
    expect(projectEvidenceEntry(draftEntry(), INDEX)!.sourcePage).toBe('str. 9, odjeljak 2.4');
    expect(projectEvidenceEntry(draftEntry({ sourcePage: null }), INDEX)!.sourcePage).toBeNull();
    expect(JSON.stringify(projectEvidenceEntry(draftEntry(), INDEX))).not.toMatch(/"page"/);
  });

  it('smece na ulazu se odbija bez bacanja', () => {
    for (const bad of [null, undefined, 'niz', 42, [], [draftEntry()]]) {
      expect(projectEvidenceEntry(bad, INDEX)).toBeNull();
    }
  });

  it('profil BEZ ijednog potpunog dokaza se ne pojavljuje u indeksu', () => {
    // Prazan niz bi izgledao kao "provjereno pa nema dokaza", a istina je "nije bilo sto isporuciti".
    const idx = buildEvidenceIndex([{ profiles: { prazan: [draftEntry({ quote: '' })] } }], INDEX);
    expect(idx).toEqual({});
  });

  it('indeks cuva redoslijed iz drafta, pa je izlaz reproducibilan', () => {
    const a = draftEntry({ ruleId: 'x--a' });
    const b = draftEntry({ ruleId: 'x--b' });
    const idx = buildEvidenceIndex([{ profiles: { p: [a, b] } }], INDEX);
    expect(idx.p.map((e) => e.ruleId)).toEqual(['x--a', 'x--b']);
  });
});

describe('serveni artefakt nakon isporuke dokaza', () => {
  const artifactText = readFileSync(resolve(ROOT, 'data', 'generated', 'profile-rules-server.json'), 'utf8');
  const artifact = JSON.parse(artifactText) as {
    profiles: Record<string, { evidenceEntries?: Array<Record<string, unknown>> }>;
  };

  it('nijedan never-marker NE postoji kao KLJUC', () => {
    // Trazi se kljuc-oblik, ne goli niz: `reviewedBy` se legitimno pojavljuje u prozi `note`
    // polja i tamo nije curenje. Razlika je izmjerena, ne pretpostavljena.
    for (const marker of ['verifiedBy', 'reviewedBy', 'confirmedVia', 'kanarinac']) {
      expect(artifactText, `${marker} kao kljuc`).not.toContain(`"${marker}":`);
    }
  });

  it('dokazi nose TOCNO sest polja, kroz cijeli artefakt', () => {
    const keys = new Set<string>();
    for (const entry of Object.values(artifact.profiles)) {
      for (const row of entry.evidenceEntries || []) Object.keys(row).forEach((k) => keys.add(k));
    }
    expect([...keys].sort()).toEqual(['checkId', 'quote', 'ruleId', 'source', 'sourceId', 'sourcePage']);
  });

  it('pokrivenost je PRIKOVANA, pa se tihi gubitak dokaza vidi', () => {
    // Brojka koja se samo poveca je uredna; pad znaci da je dokaz negdje ispao, a to se inace ne
    // vidi jer sucelje bez dokaza izgleda isto kao sucelje koje ga nikad nije imalo.
    const withEvidence = Object.values(artifact.profiles).filter((p) => p.evidenceEntries?.length);
    const total = withEvidence.reduce((n, p) => n + (p.evidenceEntries?.length || 0), 0);
    expect(withEvidence.length).toBeGreaterThanOrEqual(76);
    expect(total).toBeGreaterThanOrEqual(687);
  });
});
