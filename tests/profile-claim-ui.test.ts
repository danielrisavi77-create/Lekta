/**
 * SCOPE-01: razina dokaza u zivom sucelju.
 *
 * Dvije osi koje su se do sada mijesale:
 *   - `profile-status.json` mjeri IZVOR PRAVILA (verified/partial/research/generic),
 *   - `claim` iz completion ledgera mjeri DOKAZ POPRAVKA (A-E).
 * Profil s pravilima iz sluzbenog izvora, ali s popravkom dokazanim samo na generiranom dokumentu,
 * pripada u "pravila potvrdena" i "razina B". Do ovog zahvata sucelje je znalo samo prvu os i
 * pisalo "Potvrdeni profil", sto je citano kao da je dokazan i popravak. Razina A danas ima
 * 32 profila od 418.
 */
import { describe, it, expect } from 'vitest';
import { profileClaimFor, projectProfileClaim, claimSentence, claimBadgeHtml } from '../src/ui/profile-claim';
import { buildVisualResultModel } from '../src/ui/results/visual-result-model';
import artifact from '../data/profiles/profile-claims.json';
import status from '../data/profiles/profile-status.json';
import registry from '../data/profiles/verified-profiles.json';
import completionLedger from '../docs/generated/completion-ledger.json';
import corpusAttestation from '../data/verification/real-corpus-attestation.json';

const art = artifact as unknown as {
  ladder: Record<string, string>;
  byProfile: Record<string, string>;
  proofNotes: Record<string, string>;
  inheritedA: string[];
};
const statusEntries = Object.entries(status as Record<string, { label: string; note?: string }>);
const completionRows = (completionLedger as unknown as {
  rows: Array<{
    profileId: string | null;
    unitId: string | null;
    workType: string | null;
    proof: string;
    proofSource: string | null;
  }>;
}).rows;
const attestationEntries = (corpusAttestation as unknown as {
  entries: Array<{
    unitId: string;
    workType: string;
    profileIds: string[];
    documentCount: number;
    cleanCount: number;
    regressedChecks: string[];
  }>;
}).entries;

/**
 * Masterova svjeza ovjera daje A profilima izravni ili naslijedjeni dokaz.
 * Produkcijski popis mora odgovarati ledgeru, a zasebni fixture cuva granicne slucajeve.
 */
describe('razina A: izmjeren i naslijedjen dokaz se razlikuju', () => {
  const aIds = Object.keys(art.byProfile).filter((id) => art.byProfile[id] === 'A');
  const inherited = new Set(art.inheritedA);
  const direct = aIds.filter((id) => !inherited.has(id));

  it('A profili zadrzavaju izravni i naslijedjeni dokaz masterove ovjere', () => {
    expect(aIds).toHaveLength(32);
    expect(direct.length).toBeGreaterThan(0);
    expect(art.inheritedA.length).toBeGreaterThan(0);
    expect(direct.length + art.inheritedA.length).toBe(aIds.length);
    expect(art.inheritedA.every((id) => art.byProfile[id] === 'A')).toBe(true);
  });

  it('naslijedjen dokaz nosi napomenu iz ledgera, doslovno', () => {
    const note = art.proofNotes['unit-work-type'];
    expect(note.length).toBeGreaterThan(20);
    for (const id of art.inheritedA) {
      const claim = profileClaimFor(id)!;
      expect(claim.proof, id).toBe('inherited');
      expect(claim.note, id).toBe(note);
      expect(claimSentence(claim), id).toContain(note);
    }
  });

  it('izmjeren dokaz NEMA napomenu o nasljedjivanju', () => {
    const note = art.proofNotes['unit-work-type'];
    for (const id of direct) {
      const claim = profileClaimFor(id)!;
      expect(claim.proof, id).toBe('direct');
      expect(claimSentence(claim), id).not.toContain(note);
    }
  });

  it('fixture pokriva izravni i naslijedjeni A bez oslanjanja na trenutno stanje populacije', () => {
    const fixture = {
      ladder: { A: 'dokazano na stvarnom radu' },
      byProfile: { direct: 'A', inherited: 'A' } as const,
      proofNotes: { 'unit-work-type': 'Dokaz je naslijedjen za istu ustanovu i vrstu rada.' },
      inheritedA: ['inherited'],
      inheritedFrom: { inherited: ['direct', 'inherited'] },
    };
    const directClaim = projectProfileClaim('direct', fixture)!;
    const inheritedClaim = projectProfileClaim('inherited', fixture)!;

    expect(directClaim.proof).toBe('direct');
    expect(directClaim.evidenceBasis).toBe('direct');
    expect(directClaim.testedProfileIds).toEqual(['direct']);
    expect(claimSentence(directClaim)).not.toContain(fixture.proofNotes['unit-work-type']);

    expect(inheritedClaim.proof).toBe('inherited');
    expect(inheritedClaim.evidenceBasis).toBe('inherited');
    expect(inheritedClaim.testedProfileIds).toEqual(['direct']);
    expect(inheritedClaim.testedProfileIds).not.toContain('inherited');
    expect(inheritedClaim.note).toBe(fixture.proofNotes['unit-work-type']);
    expect(claimSentence(inheritedClaim)).toContain(fixture.proofNotes['unit-work-type']);
  });

  it('T05: osnova dokaza je jedna os za sve razine, a testedProfileIds nikad ne sadrzi naslijedjeni profil', () => {
    const inheritedFrom = (art as unknown as { inheritedFrom: Record<string, string[]> }).inheritedFrom;
    expect(Object.keys(inheritedFrom).sort()).toEqual(art.inheritedA);
    for (const id of art.inheritedA) {
      const claim = profileClaimFor(id)!;
      expect(claim.evidenceBasis, id).toBe('inherited');
      expect(claim.testedProfileIds.length, id).toBeGreaterThan(0);
      expect(claim.testedProfileIds, id).not.toContain(id);
      const inheritedRows = completionRows.filter(
        (row) => row.profileId === id && row.claim === 'A' && row.proof === 'real-docx-pass' && row.proofSource === 'unit-work-type',
      );
      expect(inheritedRows.length, id).toBeGreaterThan(0);

      const directlyAttestedSources = new Set<string>();
      for (const row of inheritedRows) {
        const entries = attestationEntries.filter(
          (entry) =>
            entry.unitId === row.unitId &&
            entry.workType === row.workType &&
            entry.documentCount > 0 &&
            entry.cleanCount === entry.documentCount &&
            entry.regressedChecks.length === 0,
        );
        expect(entries.length, `${id}/${row.workType}: svjeza ovjera bez regresija`).toBeGreaterThan(0);
        for (const entry of entries) {
          for (const sourceId of entry.profileIds) {
            const directlyMeasured = completionRows.some(
              (sourceRow) =>
                sourceRow.profileId === sourceId &&
                sourceRow.unitId === row.unitId &&
                sourceRow.workType === row.workType &&
                sourceRow.proof === 'real-docx-pass' &&
                sourceRow.proofSource === 'profile',
            );
            if (directlyMeasured) directlyAttestedSources.add(sourceId);
          }
        }
      }
      // Ukupna ocjena izvornog profila moze biti niza zbog njegovih pravila; bitno je da DOCX
      // dokaz postoji izravno za istu ustanovu i vrstu rada, sto potvrduju ovjera i ledger.
      for (const tested of claim.testedProfileIds) expect(directlyAttestedSources.has(tested), `${id} -> ${tested}`).toBe(true);
    }
    for (const id of direct) {
      const claim = profileClaimFor(id)!;
      expect(claim.evidenceBasis, id).toBe('direct');
      expect(claim.testedProfileIds, id).toEqual([id]);
    }
    const basis = new Map<string, Set<string>>();
    for (const [id, letter] of Object.entries(art.byProfile)) {
      const claim = profileClaimFor(id)!;
      (basis.get(letter) ?? basis.set(letter, new Set()).get(letter)!).add(claim.evidenceBasis);
      if (letter !== 'A') expect(claim.testedProfileIds, id).toEqual([]);
    }
    expect([...(basis.get('B') ?? [])]).toEqual(['synthetic']);
    for (const letter of ['C', 'D', 'E']) if (basis.has(letter)) expect([...basis.get(letter)!]).toEqual(['not-demonstrated']);
    expect([...(basis.get('A') ?? [])].sort()).toEqual(
      [...new Set([...direct.map(() => 'direct'), ...art.inheritedA.map(() => 'inherited')])].sort(),
    );
  });

  it('razine ispod A nemaju izvor dokaza', () => {
    const b = Object.keys(art.byProfile).find((id) => art.byProfile[id] === 'B')!;
    expect(profileClaimFor(b)!.proof).toBeNull();
    expect(profileClaimFor(b)!.note).toBe('');
  });
});

describe('profileClaimFor', () => {
  it('vraca doslovan tekst ljestvice za svaki profil iz registra', () => {
    const ids = (registry as Array<{ id: string }>).map((p) => p.id);
    expect(ids.length).toBeGreaterThan(400);
    for (const id of ids) {
      const claim = profileClaimFor(id);
      expect(claim, `profil ${id}`).not.toBeNull();
      expect(claim!.label, `profil ${id}`).toBe(art.ladder[art.byProfile[id]]);
    }
  });

  it('sutljivo vraca null umjesto lazne razine', () => {
    expect(profileClaimFor(null)).toBeNull();
    expect(profileClaimFor(undefined)).toBeNull();
    expect(profileClaimFor('')).toBeNull();
    expect(profileClaimFor('profil-koji-ne-postoji')).toBeNull();
  });

  it('recenica sadrzi doslovan tekst ljestvice, ne parafrazu', () => {
    const claim = profileClaimFor('fpzg-politologija-zavrsni');
    expect(claim).not.toBeNull();
    expect(claimSentence(claim)).toContain(claim!.label);
    expect(claimSentence(null)).toBe('');
  });
});

describe('rjecnik statusa ne smije tvrditi dokazan popravak', () => {
  /**
   * Oznaka statusa govori o PRAVILIMA. Rijeci koje bi je pretvorile u tvrdnju o popravku su
   * zabranjene, jer je upravo takvo citanje bilo kvar: "Potvrdeni profil" na profilu razine B.
   * Popis je uzak i doslovan; siroka heuristika bi palila na prozu u `note`.
   */
  const ZABRANJENO = [/\bpotvr[đd]eni profil\b/i, /\bdokazan[oi]?\b/i, /\bpotpuno pokriven/i];

  function overclaims(labels: string[]): string[] {
    return labels.filter((l) => ZABRANJENO.some((re) => re.test(l)));
  }

  it('nijedna oznaka statusa ne tvrdi dokazan popravak', () => {
    expect(statusEntries.length).toBeGreaterThan(2);
    expect(overclaims(statusEntries.map(([, v]) => v.label))).toEqual([]);
  });

  it('gard stvarno grize', () => {
    const stvarne = statusEntries.map(([, v]) => v.label);
    expect(overclaims(stvarne), 'baseline: zatecene oznake su ciste').toEqual([]);
    expect(overclaims([...stvarne, 'Potvrđeni profil'])).toEqual(['Potvrđeni profil']);
  });
});

/**
 * T05, zadnja dva uvjeta iz plana: "za B prikazati generirani dokument; za C/D/E objasniti stvarne granice" i
 * "na kartici profila i u rezultatu prikazati istu projekciju". Kartica (app.ts) i zaglavlje rezultata
 * (results-cockpit.ts) zovu ISTU `claimBadgeHtml`, a zaglavlje rezultata dobiva projekciju iz istog izvora
 * (`profileClaimFor` nad `details.profileDefinitionId`). Ovdje se tvrdi da su te dvije projekcije jednake i da
 * recenica po osnovi kaze ono sto plan trazi.
 */
describe('T05: ista projekcija na kartici i u rezultatu, recenica po osnovi dokaza', () => {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const idFor = (letter: string) => Object.keys(art.byProfile).find((id) => art.byProfile[id] === letter);

  it('rezultat nosi istu razinu i osnovu kao kartica profila, za svaku razinu koja postoji', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E']) {
      const id = idFor(letter);
      if (!id) continue;
      const kartica = profileClaimFor(id);
      const model = buildVisualResultModel({ checks: [], issues: [], details: { profileDefinitionId: id } } as never);
      expect(model.header.evidenceClaim, `${letter} ${id}`).toEqual(kartica);
      expect(claimBadgeHtml(model.header.evidenceClaim, esc)).toBe(claimBadgeHtml(kartica, esc));
    }
  });

  it('bez profila rezultat ne izmislja razinu', () => {
    const model = buildVisualResultModel({ checks: [], issues: [], details: {} } as never);
    expect(model.header.evidenceClaim).toBeNull();
    expect(claimBadgeHtml(null, esc)).toBe('');
  });

  it('oznaka nosi slovo i osnovu strojno citljivo, a punu recenicu u title', () => {
    const id = idFor('B')!;
    const claim = profileClaimFor(id)!;
    const html = claimBadgeHtml(claim, esc);
    expect(html).toContain('data-evidence-claim="B"');
    expect(html).toContain('data-evidence-basis="synthetic"');
    expect(html).toContain(`title="${esc(claimSentence(claim))}"`);
  });

  it('B kaze da je dokument generiran; C, D i E kazu da popravak nije dokazan; A ne dodaje nista', () => {
    expect(claimSentence(profileClaimFor(idFor('B')!))).toMatch(/generiran/);
    for (const letter of ['C', 'D', 'E']) {
      const id = idFor(letter);
      if (!id) continue;
      const s = claimSentence(profileClaimFor(id));
      expect(s, letter).toMatch(/nije dokazan/);
      expect(s, letter).not.toMatch(/generiran/);
    }
    const a = projectProfileClaim('fixture-a', {
      ladder: { A: art.ladder.A },
      byProfile: { 'fixture-a': 'A' },
    })!;
    expect(claimSentence(a)).not.toMatch(/generiran|nije dokazan/);
    // Recenica ljestvice ostaje doslovna i prva; dodatak o osnovi je iza nje.
    expect(claimSentence(a).startsWith(`Razina dokaza A: ${a.label}.`)).toBe(true);
  });

  it('SENTINEL: objavljena ljestvica definira A-E neovisno o trenutno dokazanim profilima', () => {
    expect(art.ladder.A).toBeTruthy();
    expect(art.ladder.B).toBeTruthy();
    expect(art.ladder.C || art.ladder.D || art.ladder.E).toBeTruthy();
  });
});
