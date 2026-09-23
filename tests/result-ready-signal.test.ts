import { describe, it, expect, beforeEach } from 'vitest';
import {
  RESULT_READY_ATTR,
  beginResultRender,
  settleResultRender,
  resultRenderSettled,
} from '../src/ui/result-ready-signal';

/**
 * SIGNAL SPREMNOSTI EKRANA REZULTATA.
 *
 * Ugovor koji se ovdje mjeri je jedina stvar zbog koje signal postoji: `data-result-ready="1"`
 * smije se pojaviti TEK kad je zadnji korak crtanja gotov, i to samo za crtanje koje je jos
 * aktualno. Bez druge tvrdnje bi prva bila vakuumska, jer bi je zadovoljio i kod koji atribut
 * postavi odmah.
 *
 * MUTACIJE (izvedene, ne opisane):
 *  1. u `settleResultRender` maknuta provjera `zeton !== _zadnjiZeton` -> pada tvrdnja da
 *     zastarjelo crtanje ne objavljuje spremnost;
 *  2. u `beginResultRender` maknuto gasenje atributa -> pada tvrdnja da drugo crtanje vraca
 *     ekran u stanje "nije spremno".
 */
function postaviEkran(): Document {
  document.body.innerHTML = '<div id="resultView"></div>';
  return document;
}

describe('signal spremnosti ekrana rezultata', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('pocetak crtanja gasi signal, a zavrsetak ga pali', () => {
    const doc = postaviEkran();
    const zeton = beginResultRender(doc);
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('0');
    expect(resultRenderSettled(doc), 'ekran ne smije biti spreman dok crtanje traje').toBe(false);

    expect(settleResultRender(doc, zeton)).toBe(true);
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('1');
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('zavrsetak ZASTARJELOG crtanja ne objavljuje spremnost', () => {
    const doc = postaviEkran();
    const stari = beginResultRender(doc);
    const novi = beginResultRender(doc);
    expect(novi).not.toBe(stari);

    // Sentinel: drugo crtanje je stvarno vratilo ekran u "nije spremno"; bez toga bi tvrdnja
    // ispod prolazila i nad ekranom koji nikad nije ni bio oznacen kao spreman.
    expect(doc.getElementById('resultView')?.getAttribute(RESULT_READY_ATTR)).toBe('0');

    expect(settleResultRender(doc, stari), 'zastarjelo crtanje ne smije objaviti spremnost').toBe(false);
    expect(resultRenderSettled(doc)).toBe(false);

    expect(settleResultRender(doc, novi)).toBe(true);
    expect(resultRenderSettled(doc)).toBe(true);
  });

  it('bez #resultView ne tvrdi nista', () => {
    document.body.innerHTML = '<div id="nesto-drugo"></div>';
    const zeton = beginResultRender(document);
    expect(settleResultRender(document, zeton)).toBe(false);
    expect(resultRenderSettled(document)).toBe(false);
  });

  it('nevaljan zeton ne pali signal', () => {
    const doc = postaviEkran();
    beginResultRender(doc);
    expect(settleResultRender(doc, 0)).toBe(false);
    expect(settleResultRender(doc, -1)).toBe(false);
    expect(resultRenderSettled(doc)).toBe(false);
  });
});
