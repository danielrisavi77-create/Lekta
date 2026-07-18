// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { initVerificationConsole } from '../src/ui/verification-console';
import { pendingRules } from '../src/verification/verification-actions';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { ThesisProfile } from '../src/profiles/profile-schema';

describe('verifikacijska konzola: render', () => {
  it('mountira i prikazuje red cekanja iz staginga (ili prazno stanje kad je red prazan)', () => {
    const root = document.createElement('div');
    initVerificationConsole(root);

    const html = root.innerHTML;
    expect(html).toContain('Verifikacijska konzola');
    expect(html).toContain('Preuzmi ledger dodatak');

    // Konzola cita isti staging kao i ovaj test. Kad zivi red ima pravila na cekanju,
    // prikazuju se kartice s akcijama; kad je red ISPRAZNJEN (od 2026-07-18: 0 draft i
    // 0 needs-recheck u data/, ciljno stanje verifikacijske petlje, ne greska), prikazuje
    // se dizajnirano prazno stanje. Test pokriva oba svijeta umjesto da tvrdi da red
    // uvijek ima sadrzaja.
    const pend = pendingRules([
      ...VERIFIED_PROFILES_WITH_DRAFTS,
      ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
    ] as unknown as ThesisProfile[]);
    if (pend.length > 0) {
      expect(root.querySelector('article.vc-rule')).not.toBeNull();
      expect(root.querySelector('button[data-act="confirm"]')).not.toBeNull();
      expect(root.querySelector('button[data-act="advisory"]')).not.toBeNull();
    } else {
      expect(html).toContain('Nema pravila na cekanju.');
      expect(root.querySelector('article.vc-rule')).toBeNull();
    }
  });
});
