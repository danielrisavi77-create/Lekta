/**
 * MODALITET i OPSEG kao polja tvrdnje.
 *
 * Zasto postoje: FER pilot je oborio 4 od 5 tvrdnji, i nijedna nije pala na krivom prijepisu nego na
 * TUMACENJU (preporuka citana kao obveza, opis predloska kao propis). Opovrgavajuci prolaz je zatim
 * nasao krivo pripisan OPSEG na 12 od 20 tvrdnji. Ni jedno ni drugo dosad nije bilo zapisano nigdje,
 * pa se ta dva razreda kvara nisu mogla ni prijaviti ni sprijeciti.
 *
 * Ovaj gard cuva tri stvari:
 *  1. vokabular (vrijednost izvan popisa je tipfeler koji tiho ne znaci nista),
 *  2. UGOVOR STROJNOG UPISA: mehanika nikad ne upisuje ublazen modalitet,
 *  3. ratchet: broj bodovanih pravila BEZ modaliteta smije samo padati, pa novo pravilo ne moze uci
 *     bez toga.
 */
import { describe, it, expect } from 'vitest';
import { DRAFT_PROFILE_IDS, draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { isRuleScored } from '../src/verification/verification-gate';
import type { RuleEntry } from '../src/profiles/profile-schema';

const MODALITIES = new Set([
  'obligation',
  'directive',
  'prohibition',
  'recommendation',
  'permission',
  'condition',
]);
const SCOPES = new Set([
  'whole',
  'body',
  'heading',
  'caption',
  'table',
  'footnote',
  'bibliography',
  'code',
  'title-page',
]);
/** Modaliteti koji znace "ovo nije bezuvjetna obveza". Mehanika ih NIKAD ne smije upisati sama. */
const SOFT = new Set(['recommendation', 'permission', 'condition']);

/**
 * RATCHET nad IZVEDENIM skupom (2207 pravila), ne nad pohranjenim (1932). Strojni izvod je popunio
 * 1402, a 805 ceka covjeka (ublazavanje u citatu, vise modalnih razina u istoj recenici, citat koji
 * imenuje drugi dio rada, LaTeX predlozak umjesto propisa). Broj smije samo PADATI: novo bodovano
 * pravilo bez modaliteta ga podize i gard pada.
 *
 * Brojka je 2026-08-23 narasla s 530 na 805 jer je selekcija ISPRAVLJENA, ne jer je stanje gore:
 * prije se mjerilo 1932 pravila umjesto 2207.
 */
const MISSING_MODALITY_CAP = 805;

/**
 * IZVEDENI `scored`, ne pohranjena zastavica. Razlika nije akademska: 275 pravila zadovoljava
 * `isRuleScored` (dakle VEZE MOTOR preko computePublishedRules, demotije i coverage matrice), a NE
 * nosi `scored: true` u podacima. Dok je selekcija isla po pohranjenoj zastavici, tih 275 pravila
 * bilo je nevidljivo svakoj tvrdnji u ovoj datoteci: vokabularu, ugovoru o ublazenom modalitetu,
 * pravilu o paru i ratchetu. Novo pravilo je moglo poceti bodovati bez ijedne provjere modaliteta.
 */
const scored: Array<{ profileId: string; entry: RuleEntry }> = [];
for (const id of DRAFT_PROFILE_IDS) {
  for (const entry of draftRuleEntriesFor(id)) {
    if (isRuleScored(entry)) scored.push({ profileId: id, entry });
  }
}

describe('tvrdnja nosi modalitet i opseg', () => {
  it('mjerenje je netrivijalno (guard protiv vacuous-pass)', () => {
    expect(scored.length).toBeGreaterThan(2000);
    expect(scored.filter((r) => r.entry.modality).length).toBeGreaterThan(500);
  });

  it('vokabular: modality i scope su iz zatvorenog popisa', () => {
    const bad = scored
      .filter(
        (r) =>
          (r.entry.modality != null && !MODALITIES.has(r.entry.modality)) ||
          (r.entry.scope != null && !SCOPES.has(r.entry.scope)),
      )
      .map((r) => `${r.entry.ruleId}: ${r.entry.modality}/${r.entry.scope}`);
    expect(bad).toEqual([]);
  });

  it('modalitet i opseg dolaze u paru, uz zapis tko ih je upisao', () => {
    const bad = scored
      .filter((r) => r.entry.modality != null && (r.entry.scope == null || r.entry.modalitySource == null))
      .map((r) => r.entry.ruleId);
    expect(bad).toEqual([]);
  });

  /**
   * Ugovor koji je vazniji od svih brojki: pripisivanje ublazavanja pravoj osi je CITANJE, ne uzorak.
   * Izmjereno na tri slucaja koji su prvu izvedbu prosli kao "jednoznacni": `ferit-*` citat glasi
   * "Rad se pise na racunalu (preporuca se MS Word) uz prored od 1,5" - ublazavanje veze PROGRAM, ne
   * prored; `unizd-povijest` veze velicinu pisma, ne format papira; `vhzk` veze font, ne prored.
   * Zato mehanika smije upisati samo `obligation` i `directive`; sve ostalo ide covjeku.
   */
  it('mehanicki upis NIKAD ne nosi ublazen modalitet', () => {
    const bad = scored
      .filter((r) => r.entry.modalitySource === 'mechanical' && SOFT.has(String(r.entry.modality)))
      .map((r) => `${r.entry.ruleId}: ${r.entry.modality}`);
    expect(bad).toEqual([]);
  });

  it('ratchet: broj bodovanih pravila bez modaliteta smije samo padati', () => {
    const missing = scored.filter((r) => r.entry.modality == null);
    expect(missing.length, `bez modaliteta: ${missing.slice(0, 5).map((r) => r.entry.ruleId).join(', ')}`).toBeLessThanOrEqual(
      MISSING_MODALITY_CAP,
    );
  });

  /**
   * Zdrav razum nad opsegom: os koja po naravi mjeri fusnotu ne smije nositi opseg tijela rada i
   * obratno. Ne pokriva sve parove, nego onaj koji je stvarno napravio stetu (naslovnica kao tiha
   * druga vrijednost za velicinu slova).
   */
  it('os za fusnote nikad ne nosi opseg tijela rada', () => {
    const bad = scored
      .filter((r) => String(r.entry.checkId).startsWith('footnote-') && r.entry.scope === 'body')
      .map((r) => r.entry.ruleId);
    expect(bad).toEqual([]);
  });
});
