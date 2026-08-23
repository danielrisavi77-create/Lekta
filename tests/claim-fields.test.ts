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
 * 1555, a 652 ceka covjeka (ublazavanje u citatu, vise modalnih razina u istoj recenici, citat koji
 * imenuje drugi dio rada, LaTeX predlozak umjesto propisa). Broj smije samo PADATI: novo bodovano
 * pravilo bez modaliteta ga podize i gard pada.
 *
 * Brojka je 2026-08-23 prvo narasla s 530 na 805 jer je selekcija ISPRAVLJENA (prije se mjerilo
 * 1932 pravila umjesto 2207), pa pala na 652 kad je ISTI ispravak primijenjen i na predlagac: dok je
 * `propose_claim_modality.py` birao po pohranjenoj zastavici, 275 pravila koja vezu motor nikad nije
 * ni dobilo prijedlog. Rast pa pad iste brojke nije kolebanje nego dvije faze jednog ispravka.
 *
 * Pala je na 450 istog dana, presudom nad 202 pravila (109 profila) iz skupine "recenica imenuje X,
 * a os po naravi mjeri Y": specifikacija u istoj recenici nabroji i tijelo i fusnotu, pa predlagac
 * uzme krivu rijec kao opseg. Opseg je presudjen na PRIRODNI opseg osi, uz provjeru da je vrijednost
 * tvrdnje ona koja njemu pripada (52 od 52 font-size tvrdnje uzele su tjelesnu, nijedna fusnotnu).
 * Upisano s `modalitySource: "agent-read"`, ne `human`: nijedan od tih 202 ne nosi ublazen modalitet,
 * jer ublazavanje i dalje trazi potpis.
 *
 * Pala je dalje na 226 presudom nad jos 224 pravila (113 jedinica) iz skupine "recenica imenuje vise
 * dijelova rada": specifikacija nabroji naslovnicu, naslove, fusnote i literaturu u istoj recenici,
 * pa predlagac ne zna koju rijec uzeti. Isti postupak i ista provjera, ali u OBA smjera: tjelesna os
 * ne smije nositi fusnotnu vrijednost, a fusnotna mora. Pet oznacenih slucajeva procitano je rucno i
 * svih pet je ispravno (heuristika je hvatala redni broj stavka "(7)" i susjednu vrijednost).
 *
 * Ostatak od 120 jedinica vise nije ovaj razred: 66 nosi ublazavanje (samo `human`), 33 ima vise
 * modalnih biljega u istoj recenici, 13 nema nijedan, 6 su predlosci.
 */
const MISSING_MODALITY_CAP = 226;

/**
 * IZVEDENI `scored`, ne pohranjena zastavica. Razlika nije akademska: 275 pravila zadovoljava
 * `isRuleScored` (dakle VEZE MOTOR preko computePublishedRules, demotije i coverage matrice), a NE
 * nosi `scored: true` u podacima. Dok je selekcija isla po pohranjenoj zastavici, tih 275 pravila
 * bilo je nevidljivo svakoj tvrdnji u ovoj datoteci: vokabularu, ugovoru o ublazenom modalitetu,
 * pravilu o paru i ratchetu. Novo pravilo je moglo poceti bodovati bez ijedne provjere modaliteta.
 */
/** Prazna vrijednost: popis ili objekt bez ijednog clana. `false` i `0` su VRIJEDNOSTI, ne praznina. */
const isEmptyValue = (v: unknown): boolean =>
  (Array.isArray(v) && v.length === 0) ||
  (v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

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
  it('upis bez ljudskog potpisa NIKAD ne nosi ublazen modalitet', () => {
    // Prosireno 2026-08-23 s `mechanical` na SVAKI izvor osim `human`. Dotad je ugovor bio vezan uz
    // jednu vrijednost, pa je nova razina upisa (`agent-read`, citanje citata alatom
    // scripts/apply-claim-scope.mjs) prolazila pokraj njega bez ijedne tvrdnje. Granica nije "tko
    // je pokrenuo alat" nego "je li netko potpisao": ublazavanje se pripisuje CITANJEM, a citanje
    // koje nitko ne potpise nije dokaz.
    const bad = scored
      .filter((r) => r.entry.modalitySource !== 'human' && SOFT.has(String(r.entry.modality)))
      .map((r) => `${r.entry.ruleId}: ${r.entry.modality} (${r.entry.modalitySource})`);
    expect(bad).toEqual([]);
  });

  it('vokabular izvora upisa je zatvoren', () => {
    const sources = new Set(scored.map((r) => r.entry.modalitySource).filter(Boolean));
    expect([...sources].sort()).toEqual(['agent-read', 'mechanical']);
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

  /**
   * BODOVANA TVRDNJA S PRAZNOM VRIJEDNOSCU ne provodi nista, a broji se kao bodovana.
   *
   * Zatecено 2026-08-23: cetiri `required-sections` tvrdnje (`pravo-opci-pravni-akademski-rad`,
   * `pravo-socijalni-opci-akademski-rad`, `pravo-specijalisticki-pravni-opci`,
   * `pravo-doktorski-pravne-znanosti`) nose `value: []` uz citat koji sekcije NABRAJA
   * ("Rad mora imati uvodni dio, sredisnji dio (s vise poglavlja i/ili potpoglavlja)..."). Zrcalo
   * ima isto prazan popis, pa raskoraka NEMA i vezanje vrijednosti ih ne vidi; ta cetiri profila
   * jednostavno ne provjeravaju strukturu iako im je izvor propisuje.
   *
   * Ovo je zato RATCHET, ne pad: popunjavanje vrijednosti znaci da motor pocinje bodovati ono sto
   * dosad nije, a ukljucivanje bodovanja u ovom lancu trazi ljudski potpis (vidi
   * `scripts/apply-drift-decision.mjs`). Mehanika smije prijaviti i sprijeciti rast, ne odluciti.
   *
   * `value: false` se NE broji: kod booleove osi je `false` puna vrijednost, ne praznina
   * (`ffzg-psihologija-diplomski--justify`, citat "tekst se pise lijevo poravnato" - izvor
   * poravnanje izricito NE trazi, i to je tvrdnja, ne rupa).
   */
  it('ratchet: bodovana tvrdnja s praznom vrijednosti smije samo nestajati', () => {
    const EMPTY_VALUE_CAP = 4;
    const empty = scored.filter((r) => isEmptyValue(r.entry.value));
    expect(
      empty.length,
      `prazna vrijednost: ${empty.map((r) => `${r.entry.ruleId} (${r.entry.checkId})`).join(', ')}`,
    ).toBeLessThanOrEqual(EMPTY_VALUE_CAP);
    // Netrivijalnost se dokazuje nad PREDIKATOM, ne nad podacima: `value: false` danas ne postoji u
    // izvedenom bodovanom skupu (jedini takav, ffzg-psihologija justify, ne prolazi isRuleScored),
    // pa bi tvrdnja "postoji false u podacima" pala iz krivog razloga i tjerala na krivi popravak.
    expect([false, 0, '', ['x'], { a: 1 }].some(isEmptyValue)).toBe(false);
    expect([[], {}].every(isEmptyValue)).toBe(true);
  });
});

