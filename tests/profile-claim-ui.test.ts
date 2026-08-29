/**
 * SCOPE-01: razina dokaza u zivom sucelju.
 *
 * Dvije osi koje su se do sada mijesale:
 *   - `profile-status.json` mjeri IZVOR PRAVILA (verified/partial/research/generic),
 *   - `claim` iz completion ledgera mjeri DOKAZ POPRAVKA (A-E).
 * Profil s pravilima iz sluzbenog izvora, ali s popravkom dokazanim samo na generiranom dokumentu,
 * pripada u "pravila potvrdena" i "razina B". Do ovog zahvata sucelje je znalo samo prvu os i
 * pisalo "Potvrdeni profil", sto je citano kao da je dokazan i popravak. Razina A danas ima
 * nula profila od 410.
 */
import { describe, it, expect } from 'vitest';
import { profileClaimFor, claimSentence } from '../src/ui/profile-claim';
import artifact from '../data/profiles/profile-claims.json';
import status from '../data/profiles/profile-status.json';
import registry from '../data/profiles/verified-profiles.json';

const art = artifact as unknown as { ladder: Record<string, string>; byProfile: Record<string, string> };
const statusEntries = Object.entries(status as Record<string, { label: string; note?: string }>);

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
