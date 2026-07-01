// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';

import { initVerificationConsole } from '../src/ui/verification-console';

describe('verifikacijska konzola: render', () => {
  it('mountira i popisuje pravila na cekanju iz staginga', () => {
    const root = document.createElement('div');
    initVerificationConsole(root);

    const html = root.innerHTML;
    expect(html).toContain('Verifikacijska konzola');
    expect(html).toContain('Preuzmi ledger dodatak');
    // Barem jedno pravilo na cekanju (draft/needs-recheck) s akcijama; ne pinamo se na
    // konkretan profil jer se s verifikacijom mijenja koji su jos na cekanju.
    expect(root.querySelector('article.vc-rule')).not.toBeNull();
    expect(root.querySelector('button[data-act="confirm"]')).not.toBeNull();
    expect(root.querySelector('button[data-act="advisory"]')).not.toBeNull();
  });
});
